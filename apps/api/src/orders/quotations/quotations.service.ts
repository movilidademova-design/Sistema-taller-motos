import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders.service';
import { UpsertQuotationDto } from './dto/upsert-quotation.dto';
import {
  QuotationItemType,
  QuotationStatus,
  OrderStatus,
  InventoryMovementType,
} from '../../generated/prisma/enums';
import { WhatsappService } from '../../notifications/whatsapp.service';

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async findOne(tenantId: string, orderId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const quotation = await this.prisma.quotation.findUnique({
      where: { orderId },
      include: { items: true },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    return quotation;
  }

  async upsert(tenantId: string, orderId: string, dto: UpsertQuotationDto) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);

    const partsCost = sumByType(dto.items, [
      QuotationItemType.PART,
      QuotationItemType.OTHER,
    ]);
    const laborCost = sumByType(dto.items, [QuotationItemType.LABOR]);
    const discount = dto.discount ?? 0;
    const taxRate = dto.taxRate ?? 0;
    const taxable = partsCost + laborCost - discount;
    const taxAmount = Math.max(0, taxable) * (taxRate / 100);
    const total = Math.max(0, taxable) + taxAmount;

    await this.prisma.$transaction(async (tx) => {
      const record = await tx.quotation.upsert({
        where: { orderId },
        create: {
          orderId,
          partsCost,
          laborCost,
          discount,
          taxRate,
          taxAmount,
          total,
          notes: dto.notes,
          status: QuotationStatus.PENDING,
        },
        update: {
          partsCost,
          laborCost,
          discount,
          taxRate,
          taxAmount,
          total,
          notes: dto.notes,
          status: QuotationStatus.PENDING,
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
            changedById: order.receptionistId,
            notes: 'Cotización generada, esperando aprobación del cliente',
          },
        });
      }

      return record;
    });

    const client = await this.prisma.client.findUnique({
      where: { id: order.clientId },
    });
    if (client?.phone) {
      this.whatsapp
        .notifyQuotationReady(client.phone, order.orderNumber)
        .catch(() => undefined);
    }

    return this.findOne(tenantId, orderId);
  }

  async decide(tenantId: string, orderId: string, approve: boolean) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const quotation = await this.prisma.quotation.findUnique({
      where: { orderId },
      include: { items: true },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    if (quotation.status !== QuotationStatus.PENDING) {
      throw new BadRequestException('La cotización ya fue procesada');
    }

    if (!approve) {
      await this.prisma.quotation.update({
        where: { id: quotation.id },
        data: { status: QuotationStatus.REJECTED, rejectedAt: new Date() },
      });
      return this.findOne(tenantId, orderId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { status: QuotationStatus.APPROVED, approvedAt: new Date() },
      });

      let missingStock = false;
      for (const item of quotation.items) {
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
            orderId,
            type: InventoryMovementType.SALE_OUT,
            quantity,
            reason: `Cotización aprobada — orden #${order.orderNumber}`,
            createdById: order.receptionistId,
          },
        });
      }

      if (order.status === OrderStatus.WAITING_APPROVAL) {
        const nextStatus = missingStock
          ? OrderStatus.WAITING_PARTS
          : OrderStatus.IN_REPAIR;
        await tx.order.update({
          where: { id: orderId },
          data: { status: nextStatus },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: OrderStatus.WAITING_APPROVAL,
            toStatus: nextStatus,
            changedById: order.receptionistId,
            notes: 'Cotización aprobada por el cliente',
          },
        });
      }
    });

    return this.findOne(tenantId, orderId);
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
