import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, storeId: string | null) {
    return this.prisma.supplier.findMany({
      where: { tenantId, ...(storeId ? { storeId } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, storeId: string | null, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    return supplier;
  }

  create(tenantId: string, storeId: string | null, dto: CreateSupplierDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para crear un proveedor');
    }
    return this.prisma.supplier.create({ data: { ...dto, tenantId, storeId } });
  }

  async update(tenantId: string, storeId: string | null, id: string, dto: UpdateSupplierDto) {
    await this.findOne(tenantId, storeId, id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }
}
