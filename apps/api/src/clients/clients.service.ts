import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, storeId: string | null, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      ...(storeId ? { storeId } : {}),
      isActive: true,
      ...(query.search
        ? {
            OR: [
              {
                firstName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                lastName: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                documentId: {
                  contains: query.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                phone: { contains: query.search, mode: 'insensitive' as const },
              },
              {
                email: { contains: query.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { motorcycles: true, orders: true } } },
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async lookupByDocument(tenantId: string, storeId: string | null, documentId: string) {
    const client = await this.prisma.client.findFirst({
      where: { tenantId, ...(storeId ? { storeId } : {}), documentId, isActive: true },
      include: { motorcycles: { orderBy: { createdAt: 'desc' } } },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async findOne(tenantId: string, storeId: string | null, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
      include: {
        motorcycles: { orderBy: { createdAt: 'desc' } },
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { motorcycle: true, invoice: true },
        },
        payments: { orderBy: { createdAt: 'desc' } },
        invoices: { orderBy: { issuedAt: 'desc' } },
        warranties: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async create(tenantId: string, storeId: string | null, dto: CreateClientDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para crear un cliente');
    }
    return this.prisma.client.create({
      data: {
        ...dto,
        tenantId,
        storeId,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
  }

  async update(tenantId: string, storeId: string | null, id: string, dto: UpdateClientDto) {
    await this.assertExists(tenantId, storeId, id);
    return this.prisma.client.update({
      where: { id },
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
  }

  async remove(tenantId: string, storeId: string | null, id: string) {
    await this.assertExists(tenantId, storeId, id);
    // Soft-delete only: client history must never be destroyed.
    return this.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertExists(tenantId: string, storeId: string | null, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }
}
