import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders.service';
import { UpsertDiagnosisDto } from './dto/upsert-diagnosis.dto';
import { AddDiagnosisPartDto } from './dto/add-diagnosis-part.dto';
import { InventoryMovementType } from '../../generated/prisma/enums';

@Injectable()
export class DiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async findOne(tenantId: string, orderId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const diagnosis = await this.prisma.diagnosis.findUnique({
      where: { orderId },
      include: { requiredParts: true },
    });
    if (!diagnosis) throw new NotFoundException('Diagnóstico no encontrado');
    return diagnosis;
  }

  async upsert(
    tenantId: string,
    orderId: string,
    technicianId: string,
    dto: UpsertDiagnosisDto,
  ) {
    await this.ordersService.assertOrderExists(tenantId, orderId);

    const diagnosis = await this.prisma.diagnosis.upsert({
      where: { orderId },
      create: { orderId, technicianId, ...dto },
      update: dto,
    });

    return this.prisma.diagnosis.findUniqueOrThrow({
      where: { id: diagnosis.id },
      include: { requiredParts: true },
    });
  }

  async addPart(
    tenantId: string,
    orderId: string,
    technicianId: string,
    dto: AddDiagnosisPartDto,
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);

    return this.prisma.$transaction(async (tx) => {
      let diagnosis = await tx.diagnosis.findUnique({ where: { orderId } });
      if (!diagnosis) {
        diagnosis = await tx.diagnosis.create({
          data: { orderId, technicianId, description: '', faultFound: '' },
        });
      }

      let unitCost = 0;

      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, tenantId },
        });
        if (!product) throw new NotFoundException('Producto no encontrado');
        const newQuantity = product.quantity - dto.quantity;
        if (newQuantity < 0) {
          throw new BadRequestException('No hay suficiente stock disponible');
        }
        await tx.product.update({
          where: { id: product.id },
          data: { quantity: newQuantity },
        });
        await tx.inventoryMovement.create({
          data: {
            tenantId,
            productId: product.id,
            orderId,
            type: InventoryMovementType.SALE_OUT,
            quantity: dto.quantity,
            reason: `Usado en diagnóstico — orden #${order.orderNumber}`,
            createdById: technicianId,
          },
        });
        unitCost = Number(product.unitCost);
      }

      return tx.diagnosisPart.create({
        data: {
          diagnosisId: diagnosis.id,
          productId: dto.productId,
          description: dto.description,
          quantity: dto.quantity,
          unitCost,
          observations: dto.observations,
        },
      });
    });
  }

  async removePart(
    tenantId: string,
    orderId: string,
    partId: string,
    userId: string,
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const part = await this.prisma.diagnosisPart.findFirst({
      where: { id: partId, diagnosis: { orderId } },
    });
    if (!part) throw new NotFoundException('Repuesto no encontrado');

    await this.prisma.$transaction(async (tx) => {
      if (part.productId) {
        const product = await tx.product.findFirst({
          where: { id: part.productId, tenantId },
        });
        if (product) {
          await tx.product.update({
            where: { id: product.id },
            data: { quantity: product.quantity + part.quantity },
          });
          await tx.inventoryMovement.create({
            data: {
              tenantId,
              productId: part.productId,
              orderId,
              type: InventoryMovementType.ADJUSTMENT_IN,
              quantity: part.quantity,
              reason: `Reversión — repuesto eliminado de orden #${order.orderNumber}`,
              createdById: userId,
            },
          });
        }
      }
      await tx.diagnosisPart.delete({ where: { id: partId } });
    });

    return { success: true };
  }
}
