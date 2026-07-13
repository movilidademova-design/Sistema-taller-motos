import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import {
  PurchaseOrderStatus,
  InventoryMovementType,
} from '../generated/prisma/enums';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { supplier: true, items: { include: { product: true } } },
    });
  }

  async findOne(tenantId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { supplier: true, items: { include: { product: true } } },
    });
    if (!po) throw new NotFoundException('Orden de compra no encontrada');
    return po;
  }

  async create(tenantId: string, dto: CreatePurchaseOrderDto) {
    const total = dto.items.reduce(
      (acc, item) => acc + item.quantity * item.unitCost,
      0,
    );
    const po = await this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        supplierId: dto.supplierId,
        status: PurchaseOrderStatus.DRAFT,
        notes: dto.notes,
        total,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            subtotal: item.quantity * item.unitCost,
          })),
        },
      },
      include: { items: true },
    });
    return po;
  }

  async markOrdered(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.ORDERED, orderedAt: new Date() },
    });
  }

  async receive(tenantId: string, id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Orden de compra no encontrada');
    if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new BadRequestException('Esta orden de compra ya fue recibida');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of po.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            quantity: { increment: item.quantity },
            unitCost: item.unitCost,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            purchaseOrderId: po.id,
            type: InventoryMovementType.PURCHASE_IN,
            quantity: item.quantity,
            reason: `Recepción de compra ${po.id}`,
            createdById: userId,
          },
        });
      }
      return tx.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.RECEIVED, receivedAt: new Date() },
        include: { items: { include: { product: true } } },
      });
    });
  }

  async cancel(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
    });
  }

  private async assertExists(tenantId: string, id: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });
    if (!po) throw new NotFoundException('Orden de compra no encontrada');
    return po;
  }
}
