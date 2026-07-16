import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, storeId: string | null) {
    return this.prisma.category.findMany({
      where: { tenantId, ...(storeId ? { storeId } : {}) },
      orderBy: { name: 'asc' },
    });
  }

  create(tenantId: string, storeId: string | null, dto: CreateCategoryDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para crear una categoría');
    }
    return this.prisma.category.create({ data: { ...dto, tenantId, storeId } });
  }

  async update(tenantId: string, storeId: string | null, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, storeId: string | null, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return this.prisma.category.delete({ where: { id } });
  }
}
