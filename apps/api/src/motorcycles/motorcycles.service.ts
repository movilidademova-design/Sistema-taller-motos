import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMotorcycleDto } from './dto/create-motorcycle.dto';
import { UpdateMotorcycleDto } from './dto/update-motorcycle.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class MotorcyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    storeId: string | null,
    query: PaginationQueryDto & { clientId?: string },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(storeId ? { storeId } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
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

  async findOne(tenantId: string, storeId: string | null, id: string) {
    const motorcycle = await this.prisma.motorcycle.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
      include: {
        client: true,
        orders: { orderBy: { createdAt: 'desc' }, include: { invoice: true } },
        warranties: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!motorcycle) throw new NotFoundException('Bicimoto no encontrada');
    return motorcycle;
  }

  async create(tenantId: string, storeId: string | null, dto: CreateMotorcycleDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para crear un vehículo');
    }
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId, storeId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    return this.prisma.motorcycle.create({
      data: {
        ...dto,
        tenantId,
        storeId,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        warrantyUntil: dto.warrantyUntil
          ? new Date(dto.warrantyUntil)
          : undefined,
      },
    });
  }

  async update(tenantId: string, storeId: string | null, id: string, dto: UpdateMotorcycleDto) {
    await this.assertExists(tenantId, storeId, id);
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

  private async assertExists(tenantId: string, storeId: string | null, id: string) {
    const motorcycle = await this.prisma.motorcycle.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!motorcycle) throw new NotFoundException('Bicimoto no encontrada');
    return motorcycle;
  }
}
