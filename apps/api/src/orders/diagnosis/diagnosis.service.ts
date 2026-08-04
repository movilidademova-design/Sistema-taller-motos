import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders.service';
import { QuotationsService } from '../quotations/quotations.service';
import { UpsertDiagnosisDto } from './dto/upsert-diagnosis.dto';
import { AddDiagnosisPartDto } from './dto/add-diagnosis-part.dto';

@Injectable()
export class DiagnosisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly quotations: QuotationsService,
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

    const parts = await this.prisma.diagnosisPart.findMany({
      where: { diagnosisId: diagnosis.id },
    });

    // Sin repuestos no hay nada que cotizar: la orden sigue su curso normal.
    if (parts.length > 0) {
      await this.quotations.createFromDiagnosis(
        tenantId,
        orderId,
        technicianId,
        parts,
      );
    }

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
          data: { orderId, technicianId, description: '' },
        });
      }

      let unitCost = 0;

      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, tenantId },
        });
        if (!product) throw new NotFoundException('Producto no encontrado');
        // El stock NO se mueve aquí: el técnico solo está listando lo que hace
        // falta. Sale del inventario cuando el cliente aprueba la cotización
        // (ver QuotationsService.changeStatus) — si rechaza, nunca salió nada.
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

  async removePart(tenantId: string, orderId: string, partId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const part = await this.prisma.diagnosisPart.findFirst({
      where: { id: partId, diagnosis: { orderId } },
    });
    if (!part) throw new NotFoundException('Repuesto no encontrado');

    // Nada que reponer: agregar el repuesto nunca descontó stock.
    return this.prisma.diagnosisPart.delete({ where: { id: partId } });
  }
}
