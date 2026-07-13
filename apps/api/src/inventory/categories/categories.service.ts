import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  create(tenantId: string, dto: CreateCategoryDto) {
    return this.prisma.category.create({ data: { ...dto, tenantId } });
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(tenantId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    return this.prisma.category.delete({ where: { id } });
  }
}
