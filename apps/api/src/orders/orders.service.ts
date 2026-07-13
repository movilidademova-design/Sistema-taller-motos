import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { OrderStatus } from '../generated/prisma/enums';
import { canTransition } from './order-status.util';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WhatsappService } from '../notifications/whatsapp.service';

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
    this.notifyStatusChange(updated).catch(() => undefined);
    return updated;
  }

  private async notifyStatusChange(
    order: Awaited<ReturnType<OrdersService['findOne']>>,
  ) {
    const phone = order.client.phone;
    if (!phone) return;
    switch (order.status) {
      case OrderStatus.IN_REPAIR:
        await this.whatsapp.notifyInRepair(phone, order.orderNumber);
        break;
      case OrderStatus.READY_FOR_DELIVERY:
        await this.whatsapp.notifyReadyForPickup(phone, order.orderNumber);
        break;
      case OrderStatus.DELIVERED:
        await this.whatsapp.sendThankYou(
          phone,
          `${order.client.firstName} ${order.client.lastName}`,
        );
        break;
      default:
        break;
    }
  }
}
