import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMotorcycleDto } from './dto/create-motorcycle.dto';
import { UpdateMotorcycleDto } from './dto/update-motorcycle.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class MotorcyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    query: PaginationQueryDto & { clientId?: string; branchId?: string },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.search
        ? {
            OR: [
              {
                brand: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                model: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                serialNumber: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                motorNumber: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.motorcycle.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.motorcycle.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(tenantId: string, id: string) {
    const motorcycle = await this.prisma.motorcycle.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        orders: { orderBy: { createdAt: 'desc' }, include: { invoice: true } },
        warranties: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!motorcycle) throw new NotFoundException('Bicimoto no encontrada');
    return motorcycle;
  }

  async create(tenantId: string, branchId: string, dto: CreateMotorcycleDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.motorcycle.create({
      data: {
        ...dto,
        tenantId,
        branchId,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        warrantyUntil: dto.warrantyUntil
          ? new Date(dto.warrantyUntil)
          : undefined,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateMotorcycleDto) {
    await this.assertExists(tenantId, id);
    return this.prisma.motorcycle.update({
      where: { id },
      data: {
        ...dto,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        warrantyUntil: dto.warrantyUntil
          ? new Date(dto.warrantyUntil)
          : undefined,
      },
    });
  }

  private async assertExists(tenantId: string, id: string) {
    const motorcycle = await this.prisma.motorcycle.findFirst({
      where: { id, tenantId },
    });
    if (!motorcycle) throw new NotFoundException('Bicimoto no encontrada');
    return motorcycle;
  }
}
