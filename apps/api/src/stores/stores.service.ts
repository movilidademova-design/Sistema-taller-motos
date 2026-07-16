import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.store.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findMine(tenantId: string, storeIds: string[]) {
    return this.prisma.store.findMany({
      where: { tenantId, id: { in: storeIds } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const store = await this.prisma.store.findFirst({ where: { id, tenantId } });
    if (!store) throw new NotFoundException('Sucursal no encontrada');
    return store;
  }

  async create(tenantId: string, dto: CreateStoreDto) {
    const existing = await this.prisma.store.findFirst({
      where: { tenantId, code: dto.code },
    });
    if (existing) throw new ConflictException('Ya existe una sucursal con ese código');
    return this.prisma.store.create({ data: { ...dto, tenantId } });
  }

  async update(tenantId: string, id: string, dto: UpdateStoreDto) {
    await this.findOne(tenantId, id);
    if (dto.code) {
      const existing = await this.prisma.store.findFirst({
        where: { tenantId, code: dto.code, id: { not: id } },
      });
      if (existing) throw new ConflictException('Ya existe una sucursal con ese código');
    }
    return this.prisma.store.update({ where: { id }, data: dto });
  }

  /** No se elimina físicamente: muchos registros (órdenes, clientes, etc.) la referencian con onDelete: Restrict. */
  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.store.update({ where: { id }, data: { isActive: false } });
  }
}
