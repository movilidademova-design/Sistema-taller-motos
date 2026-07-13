import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders.service';
import { UpsertDiagnosisDto } from './dto/upsert-diagnosis.dto';

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
    const { requiredParts, ...diagnosisFields } = dto;

    return this.prisma.$transaction(async (tx) => {
      const diagnosis = await tx.diagnosis.upsert({
        where: { orderId },
        create: { orderId, technicianId, ...diagnosisFields },
        update: diagnosisFields,
      });

      if (requiredParts) {
        await tx.diagnosisPart.deleteMany({
          where: { diagnosisId: diagnosis.id },
        });
        if (requiredParts.length > 0) {
          await tx.diagnosisPart.createMany({
            data: requiredParts.map((part) => ({
              ...part,
              diagnosisId: diagnosis.id,
            })),
          });
        }
      }

      return tx.diagnosis.findUniqueOrThrow({
        where: { id: diagnosis.id },
        include: { requiredParts: true },
      });
    });
  }
}
