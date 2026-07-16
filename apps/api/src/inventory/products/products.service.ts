import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  AdjustStockDto,
} from './dto/product.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { InventoryMovementType } from '../../generated/prisma/enums';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    storeId: string | null,
    query: PaginationQueryDto & { categoryId?: string; lowStock?: boolean },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(storeId ? { storeId } : {}),
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                name: { contains: query.search, mode: 'insensitive' as const },
              },
              { sku: { contains: query.search, mode: 'insensitive' as const } },
              {
                code: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const [allMatching] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        include: { category: true, supplier: true },
      }),
    ]);

    const filtered = query.lowStock
      ? allMatching.filter((p) => p.quantity <= p.minStock)
      : allMatching;

    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(tenantId: string, storeId: string | null, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
      include: { category: true, supplier: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async create(tenantId: string, storeId: string | null, dto: CreateProductDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para crear un producto');
    }
    const existing = await this.prisma.product.findUnique({
      where: { tenantId_storeId_sku: { tenantId, storeId, sku: dto.sku } },
    });
    if (existing)
      throw new ConflictException('Ya existe un producto con ese SKU');
    return this.prisma.product.create({ data: { ...dto, tenantId, storeId } });
  }

  async update(tenantId: string, storeId: string | null, id: string, dto: UpdateProductDto) {
    await this.assertExists(tenantId, storeId, id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }

  async adjustStock(
    tenantId: string,
    storeId: string | null,
    id: string,
    userId: string,
    dto: AdjustStockDto,
  ) {
    const product = await this.assertExists(tenantId, storeId, id);
    const newQuantity = product.quantity + dto.delta;
    if (newQuantity < 0) {
      throw new BadRequestException(
        'El ajuste dejaría el inventario en negativo',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: { quantity: newQuantity },
      });
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          storeId: product.storeId,
          productId: id,
          type:
            dto.delta >= 0
              ? InventoryMovementType.ADJUSTMENT_IN
              : InventoryMovementType.ADJUSTMENT_OUT,
          quantity: Math.abs(dto.delta),
          reason: dto.reason,
          createdById: userId,
        },
      });
      return updated;
    });
  }

  private async assertExists(tenantId: string, storeId: string | null, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }
}
