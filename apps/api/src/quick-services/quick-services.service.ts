import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuickServiceDto } from './dto/create-quick-service.dto';
import { UpdateQuickServiceDto } from './dto/update-quick-service.dto';
import { ReorderQuickServicesDto } from './dto/reorder-quick-services.dto';

@Injectable()
export class QuickServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.quickService.findMany({
      where: { tenantId, isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateQuickServiceDto) {
    const existing = await this.prisma.quickService.findFirst({
      where: { tenantId, label: dto.label },
    });
    if (existing) {
      throw new ConflictException('Ya existe una etiqueta con ese nombre');
    }
    const last = await this.prisma.quickService.findFirst({
      where: { tenantId },
      orderBy: { position: 'desc' },
    });
    return this.prisma.quickService.create({
      data: { tenantId, label: dto.label, position: (last?.position ?? -1) + 1 },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateQuickServiceDto) {
    await this.assertExists(tenantId, id);
    if (dto.label) {
      const existing = await this.prisma.quickService.findFirst({
        where: { tenantId, label: dto.label, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Ya existe una etiqueta con ese nombre');
      }
    }
    return this.prisma.quickService.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    return this.prisma.quickService.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async reorder(tenantId: string, dto: ReorderQuickServicesDto) {
    const owned = await this.prisma.quickService.findMany({
      where: { tenantId, id: { in: dto.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== dto.orderedIds.length) {
      throw new NotFoundException('Alguna etiqueta no pertenece a este taller');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.quickService.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );
    return this.findAll(tenantId);
  }

  private async assertExists(tenantId: string, id: string) {
    const service = await this.prisma.quickService.findFirst({
      where: { id, tenantId },
    });
    if (!service) throw new NotFoundException('Servicio rápido no encontrado');
    return service;
  }
}
