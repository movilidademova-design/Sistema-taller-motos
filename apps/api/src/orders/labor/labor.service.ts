import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersService } from '../orders.service';
import { CreateLaborEntryDto } from './dto/create-labor-entry.dto';

@Injectable()
export class LaborService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
  ) {}

  async findAll(tenantId: string, orderId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    return this.prisma.laborEntry.findMany({
      where: { orderId },
      orderBy: { startTime: 'desc' },
      include: { technician: { select: { firstName: true, lastName: true } } },
    });
  }

  async create(tenantId: string, orderId: string, dto: CreateLaborEntryDto) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const startTime = new Date(dto.startTime);
    const endTime = dto.endTime ? new Date(dto.endTime) : undefined;
    const hours = endTime
      ? (endTime.getTime() - startTime.getTime()) / 3_600_000
      : undefined;

    return this.prisma.laborEntry.create({
      data: {
        orderId,
        technicianId: dto.technicianId,
        activity: dto.activity,
        startTime,
        endTime,
        hours,
        cost: dto.cost ?? 0,
      },
    });
  }

  async remove(tenantId: string, orderId: string, entryId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    return this.prisma.laborEntry.delete({ where: { id: entryId } });
  }
}
