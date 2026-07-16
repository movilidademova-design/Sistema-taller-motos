import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(
    tenantId: string,
    storeId: string | null,
    query: { productId?: string; page?: number; pageSize?: number },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where = {
      tenantId,
      ...(storeId ? { storeId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
    };
    return this.prisma
      .$transaction([
        this.prisma.inventoryMovement.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { product: { select: { name: true, sku: true } } },
        }),
        this.prisma.inventoryMovement.count({ where }),
      ])
      .then(([items, total]) => ({
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      }));
  }
}
