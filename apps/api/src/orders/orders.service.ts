import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { IntakeOrderDto } from './dto/intake-order.dto';
import { DeliverOrderDto } from './dto/deliver-order.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { OrderStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { canTransition } from './order-status.util';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WhatsappService } from '../notifications/whatsapp.service';
import { EmailService } from '../notifications/email.service';
import { StorageService } from '../storage/storage.service';
import { generatePickupCode } from '../common/utils/pickup-code.util';
import { buildIntakeReason } from './intake-reason.util';
import { buildAccessoriesText } from './intake-accessories.util';
import { buildStatusChangeMessage } from './notification-message.util';

export const ORDER_DETAIL_INCLUDE = {
  client: true,
  motorcycle: true,
  receptionist: { select: { id: true, firstName: true, lastName: true } },
  technician: { select: { id: true, firstName: true, lastName: true } },
  checklistItems: true,
  photos: { orderBy: { uploadedAt: 'desc' as const } },
  diagnosis: { include: { requiredParts: true } },
  quotation: { include: { items: true } },
  statusHistory: {
    orderBy: { createdAt: 'desc' as const },
    include: { changedBy: { select: { firstName: true, lastName: true } } },
  },
  laborEntries: { orderBy: { startTime: 'desc' as const } },
  invoice: true,
  payments: true,
  warranties: true,
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly whatsapp: WhatsappService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
  ) {}

  async findAll(
    tenantId: string,
    query: PaginationQueryDto & {
      status?: OrderStatus;
      technicianId?: string;
      clientId?: string;
      branchId?: string;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                reason: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                client: {
                  firstName: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                client: {
                  lastName: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
              {
                motorcycle: {
                  serialNumber: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
          motorcycle: { select: { id: true, brand: true, model: true } },
          technician: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: ORDER_DETAIL_INCLUDE,
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    return order;
  }

  /** Used internally by sub-resource services (checklist, photos, diagnosis, quotation, labor). */
  async assertOrderExists(tenantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    return order;
  }

  /**
   * Only safe to call AFTER `tx.branch.update({ data: { nextOrderNumber: { increment: 1 } } })`
   * in the same transaction, for that same branch — that update takes a row lock on the branch
   * that serializes concurrent order-creating transactions FOR THAT BRANCH, which is what makes
   * this uniqueness check race-free. Uniqueness is therefore scoped per branch, not per tenant:
   * two branches of the same tenant may hand out the same pickup code concurrently, which is fine
   * since a vehicle is always picked up at the branch that received it. Calling this before the
   * branch-row update (or in a transaction that doesn't touch that branch's row) would not be
   * safe under Postgres's default READ COMMITTED isolation.
   */
  private async generateUniquePickupCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePickupCode();
      const clash = await tx.order.findFirst({
        where: {
          tenantId,
          branchId,
          pickupCode: code,
          status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
        },
      });
      if (!clash) return code;
    }
    throw new InternalServerErrorException(
      'No se pudo generar una clave de retiro única, intenta de nuevo',
    );
  }

  /**
   * Only safe to call AFTER `tx.branch.update({ data: { nextOrderNumber: { increment: 1 } } })`
   * in the same transaction — mirrors generateUniquePickupCode's locking rationale, now scoped
   * to the branch row instead of the tenant row.
   */
  private async nextOrderNumber(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<string> {
    const branch = await tx.branch.update({
      where: { id: branchId },
      data: { nextOrderNumber: { increment: 1 } },
    });
    const sequence = String(branch.nextOrderNumber - 1).padStart(4, '0');
    return `${branch.code}${sequence}`;
  }

  private async createOrReactivateClient(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    newClient: {
      documentId: string;
      firstName: string;
      lastName: string;
      phone?: string;
      email?: string;
      address?: string;
    },
  ) {
    const inactive = await tx.client.findFirst({
      where: { tenantId, documentId: newClient.documentId, isActive: false },
    });
    if (inactive) {
      // documentId is unique per tenant, not per branch — same reasoning as the P2002
      // case below. Reactivating a same-branch client is fine (keeps its branchId as-is,
      // no need to touch it). Reactivating a DIFFERENT branch's client instead of creating
      // a new one at this branch would cross-link an order to a client this branch can't
      // otherwise find or see, so reject it the same way a cross-branch P2002 is rejected.
      if (inactive.branchId !== branchId) {
        throw new ConflictException(
          'Ya existe un cliente con esa cédula en otra sucursal',
        );
      }
      return tx.client.update({
        where: { id: inactive.id },
        data: { ...newClient, isActive: true },
      });
    }
    try {
      return await tx.client.create({
        data: { tenantId, branchId, ...newClient },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // documentId is unique per tenant, not per branch, so this can only mean a client
        // with that documentId already exists somewhere in the tenant. If it's in THIS
        // branch, it's a genuine concurrent-request race — safe to reuse. If it's in a
        // DIFFERENT branch, silently attaching it would cross-link an order to a client
        // reception at this branch can't otherwise find or see — reject instead. (Unlike
        // ClientsService.create, which 409s on ANY conflict including a same-branch race —
        // that path has no reuse concept since it isn't trying to attach the client to
        // anything, so there's nothing to safely reuse.)
        const existing = await tx.client.findFirst({
          where: { tenantId, documentId: newClient.documentId },
        });
        if (existing?.branchId === branchId) return existing;
        if (existing) {
          throw new ConflictException(
            'Ya existe un cliente con esa cédula en otra sucursal',
          );
        }
      }
      throw error;
    }
  }

  private async mustFindTenantClient(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    clientId: string,
  ) {
    const client = await tx.client.findFirst({
      where: { id: clientId, tenantId, branchId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  private async mustFindTenantMotorcycle(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    motorcycleId: string,
    clientId: string,
  ) {
    const motorcycle = await tx.motorcycle.findFirst({
      where: { id: motorcycleId, tenantId, branchId, clientId },
    });
    if (!motorcycle) throw new NotFoundException('Vehículo no encontrado');
    return motorcycle;
  }

  async create(
    tenantId: string,
    branchId: string,
    receptionistId: string,
    dto: CreateOrderDto,
  ) {
    const [client, motorcycle] = await Promise.all([
      this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId, branchId },
      }),
      this.prisma.motorcycle.findFirst({
        where: { id: dto.motorcycleId, tenantId, branchId },
      }),
    ]);
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (!motorcycle) throw new NotFoundException('Bicimoto no encontrada');
    if (motorcycle.clientId !== client.id) {
      throw new BadRequestException('La bicimoto no pertenece a ese cliente');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const orderNumber = await this.nextOrderNumber(tx, branchId);
      const pickupCode = await this.generateUniquePickupCode(
        tx,
        tenantId,
        branchId,
      );

      const created = await tx.order.create({
        data: {
          tenantId,
          branchId,
          orderNumber,
          clientId: dto.clientId,
          motorcycleId: dto.motorcycleId,
          receptionistId,
          technicianId: dto.technicianId,
          reason: dto.reason,
          accessoriesDelivered: dto.accessoriesDelivered,
          status: OrderStatus.RECEIVED,
          pickupCode,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          toStatus: OrderStatus.RECEIVED,
          changedById: receptionistId,
          notes: 'Orden creada en recepción',
        },
      });

      return created;
    });

    if (client.phone) {
      this.whatsapp
        .notifyOrderReceived(client.phone, order.orderNumber)
        .catch(() => undefined);
    }

    return this.findOne(tenantId, order.id);
  }

  async update(tenantId: string, id: string, dto: UpdateOrderDto) {
    await this.assertOrderExists(tenantId, id);
    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        technicianId: dto.technicianId,
        estimatedDeliveryAt: dto.estimatedDeliveryAt
          ? new Date(dto.estimatedDeliveryAt)
          : undefined,
      },
    });
    this.realtime.emitOrderUpdated(tenantId, updated);
    return this.findOne(tenantId, id);
  }

  async intake(
    tenantId: string,
    branchId: string,
    receptionistId: string,
    dto: IntakeOrderDto,
    files: {
      photos?: Express.Multer.File[];
      signature?: Express.Multer.File[];
    },
  ) {
    const signatureFile = files.signature?.[0];
    if (!signatureFile) {
      throw new BadRequestException('La firma del cliente es obligatoria');
    }
    if (!dto.clientId && !dto.newClient) {
      throw new BadRequestException(
        'Debes indicar un cliente existente o los datos de un cliente nuevo',
      );
    }
    if (!dto.motorcycleId && !dto.newMotorcycle) {
      throw new BadRequestException(
        'Debes indicar un vehículo existente o los datos de un vehículo nuevo',
      );
    }
    if (dto.clientId) {
      const client = await this.prisma.client.findFirst({
        where: { id: dto.clientId, tenantId, branchId },
      });
      if (!client) throw new NotFoundException('Cliente no encontrado');
    }
    if (dto.motorcycleId) {
      const motorcycle = await this.prisma.motorcycle.findFirst({
        where: { id: dto.motorcycleId, tenantId, branchId },
      });
      if (!motorcycle) throw new NotFoundException('Vehículo no encontrado');
      if (dto.clientId && motorcycle.clientId !== dto.clientId) {
        throw new BadRequestException('El vehículo no pertenece a ese cliente');
      }
    }
    if (dto.newClient) {
      // Mirrors the same-branch/different-branch check createOrReactivateClient does
      // inside the transaction below — done here too, before any files are uploaded,
      // so a cross-branch documentId conflict fails fast instead of orphaning an
      // uploaded signature and photos when the transaction later rejects it.
      const conflicting = await this.prisma.client.findFirst({
        where: { tenantId, documentId: dto.newClient.documentId },
      });
      if (conflicting && conflicting.branchId !== branchId) {
        throw new ConflictException(
          'Ya existe un cliente con esa cédula en otra sucursal',
        );
      }
    }

    const photoUrls = await Promise.all(
      (files.photos ?? []).map((file) =>
        this.storage.upload(
          file.buffer,
          file.originalname,
          file.mimetype,
          'orders',
        ),
      ),
    );
    const signatureUrl = await this.storage.upload(
      signatureFile.buffer,
      signatureFile.originalname,
      signatureFile.mimetype,
      'signatures',
    );

    const order = await this.prisma.$transaction(async (tx) => {
      const client = dto.clientId
        ? await this.mustFindTenantClient(tx, tenantId, branchId, dto.clientId)
        : await this.createOrReactivateClient(
            tx,
            tenantId,
            branchId,
            dto.newClient!,
          );

      const motorcycle = dto.motorcycleId
        ? await this.mustFindTenantMotorcycle(
            tx,
            tenantId,
            branchId,
            dto.motorcycleId,
            client.id,
          )
        : await tx.motorcycle.create({
            data: {
              tenantId,
              branchId,
              clientId: client.id,
              vehicleType: dto.newMotorcycle!.vehicleType,
              brand: dto.newMotorcycle!.brand,
              model: dto.newMotorcycle!.model,
              color: dto.newMotorcycle!.color,
              serialNumber: dto.newMotorcycle!.serialNumber,
              purchaseDate: dto.newMotorcycle!.purchaseDate
                ? new Date(dto.newMotorcycle!.purchaseDate)
                : undefined,
            },
          });

      const quickServices = dto.quickServiceIds?.length
        ? await tx.quickService.findMany({
            where: { id: { in: dto.quickServiceIds }, tenantId, branchId },
          })
        : [];
      const reason = buildIntakeReason(
        quickServices.map((s) => s.label),
        dto.description,
      );

      const accessoryOptions = dto.accessoryOptionIds?.length
        ? await tx.accessoryOption.findMany({
            where: { id: { in: dto.accessoryOptionIds }, tenantId, branchId },
          })
        : [];
      const accessoriesDelivered = buildAccessoriesText(
        accessoryOptions.map((a) => a.label),
        dto.otherAccessoryText ?? '',
      );

      const orderNumber = await this.nextOrderNumber(tx, branchId);
      const pickupCode = await this.generateUniquePickupCode(
        tx,
        tenantId,
        branchId,
      );

      const created = await tx.order.create({
        data: {
          tenantId,
          branchId,
          orderNumber,
          clientId: client.id,
          motorcycleId: motorcycle.id,
          receptionistId,
          reason,
          accessoriesDelivered,
          status: OrderStatus.RECEIVED,
          pickupCode,
          signatureUrl,
          signedAt: new Date(),
          photos: { create: photoUrls.map((url) => ({ url })) },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: created.id,
          toStatus: OrderStatus.RECEIVED,
          changedById: receptionistId,
          notes: 'Orden creada desde recepción móvil',
        },
      });

      return created;
    });

    return this.findOne(tenantId, order.id);
  }

  async deliver(
    tenantId: string,
    id: string,
    userId: string,
    dto: DeliverOrderDto,
  ) {
    const order = await this.assertOrderExists(tenantId, id);
    if (order.status !== OrderStatus.READY_FOR_DELIVERY) {
      throw new BadRequestException(
        'La orden debe estar en estado "Lista para entrega" para poder entregarse',
      );
    }
    if (!order.pickupCode || order.pickupCode !== dto.pickupCode) {
      throw new BadRequestException('La clave de retiro no es correcta');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.DELIVERED,
          deliveredAt: new Date(),
          pickupCodeVerifiedAt: new Date(),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: OrderStatus.DELIVERED,
          changedById: userId,
          notes: 'Entregado tras verificar clave de retiro',
        },
      });
    });

    const updated = await this.findOne(tenantId, id);
    this.realtime.emitOrderUpdated(tenantId, updated);
    return updated;
  }

  async sendIntakeConfirmationEmail(tenantId: string, id: string) {
    const order = await this.findOne(tenantId, id);
    if (!order.client.email) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    await this.email.sendIntakeConfirmation(order.client.email, {
      clientFirstName: order.client.firstName,
      orderNumber: order.orderNumber,
      pickupCode: order.pickupCode ?? '',
      tenantName: tenant.name,
    });
    return { success: true };
  }

  async notify(tenantId: string, id: string, userId: string) {
    const order = await this.findOne(tenantId, id);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const message = buildStatusChangeMessage({
      clientFirstName: order.client.firstName,
      orderNumber: order.orderNumber,
      status: order.status,
      tenantName: tenant.name,
    });
    return this.prisma.notification.create({
      data: {
        tenantId,
        orderId: id,
        toStatus: order.status,
        message,
        createdById: userId,
      },
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.assertOrderExists(tenantId, id);

    if (dto.status === OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Para marcar la orden como entregada, usa la verificación de clave de retiro (POST /orders/:id/deliver).',
      );
    }

    if (!canTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${order.status} a ${dto.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          deliveredAt:
            dto.status === OrderStatus.DELIVERED ? new Date() : undefined,
          cancelReason:
            dto.status === OrderStatus.CANCELLED ? dto.notes : undefined,
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.status,
          toStatus: dto.status,
          changedById: userId,
          notes: dto.notes,
        },
      });
    });

    const updated = await this.findOne(tenantId, id);
    this.realtime.emitOrderUpdated(tenantId, updated);
    return updated;
  }
}
