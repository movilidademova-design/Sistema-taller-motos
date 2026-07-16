import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, storeId: string | null, from?: string, to?: string) {
    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        ...(storeId ? { storeId } : {}),
        ...(from || to
          ? {
              scheduledAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { scheduledAt: 'asc' },
      include: {
        client: { select: { firstName: true, lastName: true } },
        motorcycle: { select: { brand: true, model: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
      },
    });
  }

  create(tenantId: string, storeId: string | null, dto: CreateAppointmentDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para crear una cita');
    }
    return this.prisma.appointment.create({
      data: {
        ...dto,
        tenantId,
        storeId,
        scheduledAt: new Date(dto.scheduledAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
      },
    });
  }

  async update(tenantId: string, storeId: string | null, id: string, dto: UpdateAppointmentDto) {
    const appointment = await this.prisma.appointment.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!appointment) throw new NotFoundException('Cita no encontrada');
    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...dto,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
      },
    });
  }
}
