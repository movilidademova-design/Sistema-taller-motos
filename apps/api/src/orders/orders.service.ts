import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../notifications/email.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { CreateOrderIntakeDto } from './dto/create-order-intake.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { OrderStatus, PhotoCategory } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { canTransition } from './order-status.util';
import {
  formatOrderNumber,
  buildIntakeMessage,
  buildStatusUpdateMessage,
  ORDER_STATUS_LABELS,
} from './order-message.util';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WhatsappService } from '../notifications/whatsapp.service';
import { OrderNotificationsService } from '../order-notifications/order-notifications.service';

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
  quickServices: true,
  accessories: true,
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    private readonly whatsapp: WhatsappService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly orderNotifications: OrderNotificationsService,
  ) {}

  async findAll(
    tenantId: string,
    query: PaginationQueryDto & {
      status?: OrderStatus;
      technicianId?: string;
      clientId?: string;
    },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
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

  async create(tenantId: string, receptionistId: string, dto: CreateOrderDto) {
    const [client, motorcycle] = await Promise.all([
      this.prisma.client.findFirst({ where: { id: dto.clientId, tenantId } }),
      this.prisma.motorcycle.findFirst({
        where: { id: dto.motorcycleId, tenantId },
      }),
    ]);
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (!motorcycle) throw new NotFoundException('Bicimoto no encontrada');
    if (motorcycle.clientId !== client.id) {
      throw new BadRequestException('La bicimoto no pertenece a ese cliente');
    }

    const order = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextOrderNumber: { increment: 1 } },
      });
      const orderNumber = tenant.nextOrderNumber - 1;
      const exitCode = await this.generateUniqueExitCode(tx, tenantId);

      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber,
          clientId: dto.clientId,
          motorcycleId: dto.motorcycleId,
          receptionistId,
          technicianId: dto.technicianId,
          reason: dto.reason,
          accessoriesDelivered: dto.accessoriesDelivered,
          exitCode,
          trackingToken: randomUUID(),
          status: OrderStatus.RECEIVED,
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

  /**
   * Recepción móvil de un vehículo: resuelve o crea cliente y vehículo,
   * genera número de orden + clave de salida + enlace de seguimiento, y crea
   * la orden — todo en una sola transacción. Fotos y firma se suben después
   * (el almacenamiento de archivos no participa de la transacción de BD).
   */
  async createIntake(
    tenantId: string,
    receptionistId: string,
    dto: CreateOrderIntakeDto,
    photos: Express.Multer.File[],
    signature: Express.Multer.File | undefined,
  ) {
    if (!signature) {
      throw new BadRequestException('La firma del cliente es obligatoria');
    }
    if (!dto.termsAccepted) {
      throw new BadRequestException(
        'El cliente debe aceptar los términos y condiciones',
      );
    }

    const { order, client } = await this.prisma.$transaction(async (tx) => {
      const resolvedClient = dto.clientId
        ? await tx.client.findFirst({ where: { id: dto.clientId, tenantId } })
        : await tx.client.create({ data: { ...dto.newClient!, tenantId } });
      if (!resolvedClient) throw new NotFoundException('Cliente no encontrado');

      const resolvedMotorcycle = dto.motorcycleId
        ? await tx.motorcycle.findFirst({
            where: { id: dto.motorcycleId, tenantId },
          })
        : await tx.motorcycle.create({
            data: {
              ...dto.newVehicle!,
              tenantId,
              clientId: resolvedClient.id,
              purchaseDate: dto.newVehicle!.purchaseDate
                ? new Date(dto.newVehicle!.purchaseDate)
                : undefined,
            },
          });
      if (!resolvedMotorcycle) {
        throw new NotFoundException('Vehículo no encontrado');
      }
      if (resolvedMotorcycle.clientId !== resolvedClient.id) {
        throw new BadRequestException('El vehículo no pertenece a ese cliente');
      }

      if (dto.quickServiceIds.length) {
        const count = await tx.quickService.count({
          where: { tenantId, id: { in: dto.quickServiceIds } },
        });
        if (count !== dto.quickServiceIds.length) {
          throw new BadRequestException('Uno de los servicios rápidos no es válido');
        }
      }
      if (dto.accessoryIds.length) {
        const count = await tx.accessoryOption.count({
          where: { tenantId, id: { in: dto.accessoryIds } },
        });
        if (count !== dto.accessoryIds.length) {
          throw new BadRequestException('Uno de los accesorios no es válido');
        }
      }

      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextOrderNumber: { increment: 1 } },
      });
      const orderNumber = tenant.nextOrderNumber - 1;
      const exitCode = await this.generateUniqueExitCode(tx, tenantId);

      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber,
          clientId: resolvedClient.id,
          motorcycleId: resolvedMotorcycle.id,
          receptionistId,
          reason: dto.reason,
          otherAccessories: dto.otherAccessories,
          exitCode,
          trackingToken: randomUUID(),
          termsAcceptedAt: new Date(),
          status: OrderStatus.RECEIVED,
          quickServices: { connect: dto.quickServiceIds.map((id) => ({ id })) },
          accessories: { connect: dto.accessoryIds.map((id) => ({ id })) },
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

      return { order: created, client: resolvedClient };
    });

    const [signatureUrl, ...photoUrls] = await Promise.all([
      this.storage.upload(
        signature.buffer,
        signature.originalname,
        signature.mimetype,
        'signatures',
      ),
      ...photos.map((photo) =>
        this.storage.upload(
          photo.buffer,
          photo.originalname,
          photo.mimetype,
          'orders',
        ),
      ),
    ]);

    await this.prisma.order.update({
      where: { id: order.id },
      data: { signatureUrl },
    });
    if (photoUrls.length) {
      await this.prisma.orderPhoto.createMany({
        data: photoUrls.map((url) => ({
          orderId: order.id,
          url,
          category: PhotoCategory.GENERAL,
        })),
      });
    }

    if (client.phone) {
      this.whatsapp
        .notifyOrderReceived(client.phone, order.orderNumber)
        .catch(() => undefined);
    }

    return this.findOne(tenantId, order.id);
  }

  private async generateUniqueExitCode(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const existing = await tx.order.findFirst({
        where: { tenantId, exitCode: code },
      });
      if (!existing) return code;
    }
    throw new Error('No se pudo generar una clave de salida única');
  }

  /** Reenvía el mensaje de confirmación de recepción (usado por el paso final del wizard). */
  async notify(tenantId: string, id: string, channel: 'EMAIL') {
    const order = await this.findOne(tenantId, id);
    if (channel === 'EMAIL') {
      if (!order.client.email) {
        throw new BadRequestException('El cliente no tiene correo registrado');
      }
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
      });
      const message = buildIntakeMessage({
        clientName: `${order.client.firstName} ${order.client.lastName}`,
        tenantName: tenant.name,
        formattedOrderNumber: formatOrderNumber(tenant.orderPrefix, order.orderNumber),
        exitCode: order.exitCode,
        trackingUrl: this.buildTrackingUrl(order.trackingToken),
      });
      await this.email.send({
        to: order.client.email,
        subject: `Recibimos tu vehículo — Orden ${formatOrderNumber(tenant.orderPrefix, order.orderNumber)}`,
        html: message.replace(/\n/g, '<br/>'),
      });
    }
    return { sent: true };
  }

  private buildTrackingUrl(trackingToken: string): string {
    const origin =
      this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() ??
      'http://localhost:3000';
    return `${origin}/track/${trackingToken}`;
  }

  /** Datos de solo lectura para el enlace público de seguimiento (sin login). */
  async findByTrackingToken(trackingToken: string) {
    const order = await this.prisma.order.findUnique({
      where: { trackingToken },
      include: {
        motorcycle: { select: { brand: true, model: true, vehicleType: true } },
        tenant: { select: { name: true, orderPrefix: true } },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: { toStatus: true, createdAt: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Enlace no válido');
    return {
      orderNumber: formatOrderNumber(order.tenant.orderPrefix, order.orderNumber),
      tenantName: order.tenant.name,
      status: order.status,
      vehicle: order.motorcycle,
      statusHistory: order.statusHistory,
      receivedAt: order.receivedAt,
    };
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

  async updateStatus(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.assertOrderExists(tenantId, id);

    if (!canTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${order.status} a ${dto.status}`,
      );
    }

    if (dto.status === OrderStatus.DELIVERED) {
      if (!dto.exitCode || dto.exitCode !== order.exitCode) {
        throw new BadRequestException(
          'La clave de salida no coincide. Verifícala con el cliente antes de entregar el vehículo.',
        );
      }
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

  /**
   * El técnico decide, después de cambiar el estado, si quiere avisarle al
   * cliente — no se envía nada automáticamente. Esto solo crea la
   * notificación interna pendiente que ve el personal de mostrador
   * (Admin/Recepción), quienes son los que realmente contactan al cliente.
   */
  async requestClientNotification(tenantId: string, id: string, userId: string) {
    const order = await this.findOne(tenantId, id);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const message = buildStatusUpdateMessage({
      clientName: `${order.client.firstName} ${order.client.lastName}`,
      tenantName: tenant.name,
      formattedOrderNumber: formatOrderNumber(tenant.orderPrefix, order.orderNumber),
      statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
      trackingUrl: this.buildTrackingUrl(order.trackingToken),
    });
    const notification = await this.orderNotifications.create(
      tenantId,
      order.id,
      order.status,
      message,
      userId,
    );
    this.realtime.emitOrderNotificationCreated(tenantId, notification);
    return notification;
  }
}
