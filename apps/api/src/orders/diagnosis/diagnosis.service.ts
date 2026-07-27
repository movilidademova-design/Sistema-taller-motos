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
}
