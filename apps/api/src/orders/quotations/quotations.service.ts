import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { OrdersService } from '../orders.service';
import { UpsertQuotationDto } from './dto/upsert-quotation.dto';
import { ChangeQuotationStatusDto } from './dto/change-quotation-status.dto';
import {
  QuotationItemType,
  QuotationStatus,
  OrderStatus,
  InventoryMovementType,
} from '../../generated/prisma/enums';

/** Etiquetas en español, espejo de packages/shared. El backend no depende de @taller/shared. */
const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Esperando revisión',
  READY_TO_SEND: 'Lista para enviar',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  PARTIALLY_APPROVED: 'Aprobada parcialmente',
  REJECTED: 'Rechazada',
};

/**
 * Qué estados puede elegir una persona desde cada estado. Tras una aprobación
 * parcial se ajusta la cotización y se vuelve a enviar, las veces que haga falta.
 */
const QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: [QuotationStatus.PENDING_REVIEW],
  PENDING_REVIEW: [QuotationStatus.READY_TO_SEND],
  READY_TO_SEND: [QuotationStatus.SENT, QuotationStatus.PENDING_REVIEW],
  SENT: [
    QuotationStatus.APPROVED,
    QuotationStatus.PARTIALLY_APPROVED,
    QuotationStatus.REJECTED,
  ],
  PARTIALLY_APPROVED: [
    QuotationStatus.READY_TO_SEND,
    QuotationStatus.APPROVED,
    QuotationStatus.REJECTED,
  ],
  APPROVED: [],
  REJECTED: [],
};

/** Estados en los que la cotización todavía se puede editar libremente. */
export const EDITABLE_STATUSES: QuotationStatus[] = [
  QuotationStatus.DRAFT,
  QuotationStatus.PENDING_REVIEW,
  QuotationStatus.READY_TO_SEND,
  QuotationStatus.PARTIALLY_APPROVED,
];

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async findOne(tenantId: string, orderId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const quotation = await this.prisma.quotation.findUnique({
      where: { orderId },
      include: {
        items: true,
        history: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    return quotation;
  }

  /**
   * Convierte los repuestos del diagnóstico en una cotización por revisar.
   * Es el único cambio de estado automático del módulo: todo lo demás lo decide
   * una persona. Reemplaza los ítems cada vez, porque el técnico puede guardar
   * el diagnóstico varias veces mientras trabaja.
   */
  async createFromDiagnosis(
    tenantId: string,
    orderId: string,
    technicianId: string,
    parts: {
      productId: string | null;
      description: string;
      quantity: number;
      unitCost: Prisma.Decimal;
    }[],
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const existing = await this.prisma.quotation.findUnique({
      where: { orderId },
    });

    // Una vez enviada o decidida, el diagnóstico ya no la puede pisar: el
    // cliente vio esa versión y quien manda a partir de ahí es el personal.
    if (existing && !EDITABLE_STATUSES.includes(existing.status)) return existing;

    const items = parts.map((p) => ({
      type: QuotationItemType.PART,
      productId: p.productId,
      description: p.description,
      quantity: new Prisma.Decimal(p.quantity),
      unitPrice: p.unitCost,
      subtotal: new Prisma.Decimal(Number(p.unitCost) * p.quantity),
    }));
    const partsCost = items.reduce((acc, i) => acc + Number(i.subtotal), 0);
    const totals = {
      partsCost,
      discount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: partsCost,
    };

    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.upsert({
        where: { orderId },
        create: { orderId, status: QuotationStatus.PENDING_REVIEW, ...totals },
        update: { status: QuotationStatus.PENDING_REVIEW, ...totals },
      });
      await tx.quotationItem.deleteMany({ where: { quotationId: quotation.id } });
      await tx.quotationItem.createMany({
        data: items.map((i) => ({ ...i, quotationId: quotation.id })),
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: existing?.status ?? null,
          toStatus: QuotationStatus.PENDING_REVIEW,
          changedById: technicianId,
          notes: 'Generada desde el diagnóstico',
        },
      });

      if (order.status === OrderStatus.DIAGNOSING) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.WAITING_APPROVAL },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: OrderStatus.DIAGNOSING,
            toStatus: OrderStatus.WAITING_APPROVAL,
            changedById: technicianId,
            notes: 'Diagnóstico con repuestos: cotización por revisar',
          },
        });
      }
      return quotation;
    });
  }

  async upsert(tenantId: string, orderId: string, dto: UpsertQuotationDto) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);

    const partsCost = sumByType(dto.items, [
      QuotationItemType.PART,
      QuotationItemType.OTHER,
    ]);
    const discount = dto.discount ?? 0;
    const taxRate = dto.taxRate ?? 0;
    const taxable = partsCost - discount;
    const taxAmount = Math.max(0, taxable) * (taxRate / 100);
    const total = Math.max(0, taxable) + taxAmount;

    await this.prisma.$transaction(async (tx) => {
      const record = await tx.quotation.upsert({
        where: { orderId },
        create: {
          orderId,
          partsCost,
          discount,
          taxRate,
          taxAmount,
          total,
          notes: dto.notes,
          status: QuotationStatus.PENDING_REVIEW,
        },
        update: {
          partsCost,
          discount,
          taxRate,
          taxAmount,
          total,
          notes: dto.notes,
          approvedAt: null,
          rejectedAt: null,
        },
      });

      await tx.quotationItem.deleteMany({ where: { quotationId: record.id } });
      await tx.quotationItem.createMany({
        data: dto.items.map((item) => ({
          quotationId: record.id,
          type: item.type,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
        })),
      });

      return record;
    });

    return this.findOne(tenantId, orderId);
  }

  /**
   * Todo cambio de estado pasa por aquí y lo dispara una persona. La única
   * transición automática del módulo es la creación en PENDING_REVIEW desde el
   * diagnóstico (ver createFromDiagnosis).
   */
  async changeStatus(
    tenantId: string,
    orderId: string,
    userId: string,
    dto: ChangeQuotationStatusDto,
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const quotation = await this.prisma.quotation.findUnique({
      where: { orderId },
      include: { items: true },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');

    if (!QUOTATION_TRANSITIONS[quotation.status].includes(dto.status)) {
      throw new BadRequestException(
        `No se puede pasar de ${QUOTATION_STATUS_LABELS[quotation.status]} a ${QUOTATION_STATUS_LABELS[dto.status]}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: dto.status,
          approvedAt:
            dto.status === QuotationStatus.APPROVED ? new Date() : undefined,
          rejectedAt:
            dto.status === QuotationStatus.REJECTED ? new Date() : undefined,
        },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: quotation.status,
          toStatus: dto.status,
          changedById: userId,
          notes: dto.notes,
        },
      });

      // El inventario se mueve una sola vez, aquí: el diagnóstico ya no
      // descuenta nada. Una cotización rechazada no toca el stock.
      if (dto.status === QuotationStatus.APPROVED) {
        await this.consumeStock(tx, tenantId, order, quotation.items, userId);
      }
    });

    return this.findOne(tenantId, orderId);
  }

  /** Descuenta del inventario los repuestos aprobados y adelanta la orden. */
  private async consumeStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    order: { id: string; orderNumber: string; status: OrderStatus },
    items: { type: QuotationItemType; productId: string | null; quantity: Prisma.Decimal }[],
    userId: string,
  ) {
    let missingStock = false;
    for (const item of items) {
      if (item.type !== QuotationItemType.PART || !item.productId) continue;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product) continue;
      const quantity = Number(item.quantity);
      if (product.quantity < quantity) missingStock = true;

      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          orderId: order.id,
          type: InventoryMovementType.SALE_OUT,
          quantity,
          reason: `Cotización aprobada — orden #${order.orderNumber}`,
          createdById: userId,
        },
      });
    }

    if (order.status === OrderStatus.WAITING_APPROVAL) {
      const nextStatus = missingStock
        ? OrderStatus.WAITING_PARTS
        : OrderStatus.IN_REPAIR;
      await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: OrderStatus.WAITING_APPROVAL,
          toStatus: nextStatus,
          changedById: userId,
          notes: 'Cotización aprobada por el cliente',
        },
      });
    }
  }
}

function sumByType(
  items: UpsertQuotationDto['items'],
  types: QuotationItemType[],
) {
  return items
    .filter((item) => types.includes(item.type))
    .reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
}
