import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAccessoryOptionDto } from './dto/create-accessory-option.dto';
import { UpdateAccessoryOptionDto } from './dto/update-accessory-option.dto';
import { ReorderAccessoryOptionsDto } from './dto/reorder-accessory-options.dto';

@Injectable()
export class AccessoryOptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, branchId: string) {
    return this.prisma.accessoryOption.findMany({
      where: { tenantId, branchId, isActive: true },
      orderBy: { position: 'asc' },
    });
  }

  async create(tenantId: string, branchId: string, dto: CreateAccessoryOptionDto) {
    const existing = await this.prisma.accessoryOption.findFirst({
      where: { tenantId, branchId, label: dto.label },
    });
    if (existing) {
      throw new ConflictException('Ya existe un accesorio con ese nombre');
    }
    const last = await this.prisma.accessoryOption.findFirst({
      where: { tenantId, branchId },
      orderBy: { position: 'desc' },
    });
    return this.prisma.accessoryOption.create({
      data: { tenantId, branchId, label: dto.label, position: (last?.position ?? -1) + 1 },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateAccessoryOptionDto) {
    const accessoryOption = await this.assertExists(tenantId, id);
    if (dto.label) {
      const existing = await this.prisma.accessoryOption.findFirst({
        where: { tenantId, branchId: accessoryOption.branchId, label: dto.label, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Ya existe un accesorio con ese nombre');
      }
    }
    return this.prisma.accessoryOption.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    return this.prisma.accessoryOption.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async reorder(tenantId: string, branchId: string, dto: ReorderAccessoryOptionsDto) {
    const owned = await this.prisma.accessoryOption.findMany({
      where: { tenantId, branchId, id: { in: dto.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== dto.orderedIds.length) {
      throw new NotFoundException('Algún accesorio no pertenece a esta sucursal');
    }
    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.accessoryOption.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );
    return this.findAll(tenantId, branchId);
  }

  private async assertExists(tenantId: string, id: string) {
    const option = await this.prisma.accessoryOption.findFirst({
      where: { id, tenantId },
    });
    if (!option) throw new NotFoundException('Accesorio no encontrado');
    return option;
  }
}
