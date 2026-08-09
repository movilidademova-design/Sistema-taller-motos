import { Injectable, NotFoundException } from '@nestjs/common';
import { PosPrismaService } from '../pos-prisma.service';
import { CreatePosProductDto, UpdatePosProductDto } from './dto/product.dto';

@Injectable()
export class PosProductsService {
  constructor(private readonly prisma: PosPrismaService) {}

  // Calle 80 y Ciudadela tienen inventarios separados: todo va filtrado por
  // tenantId Y branchId, siempre.
  findAll(tenantId: string, branchId: string) {
    return this.prisma.posProduct.findMany({
      where: { tenantId, branchId, isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  create(tenantId: string, branchId: string, dto: CreatePosProductDto) {
    return this.prisma.posProduct.create({
      data: { ...dto, tenantId, branchId },
    });
  }

  async update(
    tenantId: string,
    branchId: string,
    id: string,
    dto: UpdatePosProductDto,
  ) {
    await this.assertExists(tenantId, branchId, id);
    return this.prisma.posProduct.update({ where: { id }, data: dto });
  }

  // Borrado suave: ventas viejas siguen apuntando a este producto por id, así
  // que borrarlo de verdad las dejaría con una referencia rota.
  async remove(tenantId: string, branchId: string, id: string) {
    await this.assertExists(tenantId, branchId, id);
    return this.prisma.posProduct.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertExists(tenantId: string, branchId: string, id: string) {
    const product = await this.prisma.posProduct.findFirst({
      where: { id, tenantId, branchId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }
}
