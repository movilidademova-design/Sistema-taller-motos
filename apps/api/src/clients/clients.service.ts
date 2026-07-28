import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    query: PaginationQueryDto & { branchId?: string },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      isActive: true,
      ...(query.branchId ? { branchId: query.branchId } : {}),
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

  async findOne(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId },
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

  // Scoped to the current branch, not just the tenant: a client search during
  // intake should only surface people already served at this branch, per this
  // phase's design (see docs/superpowers/specs/2026-07-28-sucursales-fase1-design.md).
  // A client with the same documentId in another branch of the same tenant won't
  // be found here — see the P2002 handling in `create` for what happens next.
  async findByDocumentId(
    tenantId: string,
    branchId: string,
    documentId: string,
  ) {
    const client = await this.prisma.client.findFirst({
      where: { tenantId, branchId, documentId, isActive: true },
      include: { motorcycles: { orderBy: { createdAt: 'desc' } } },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  async create(tenantId: string, branchId: string, dto: CreateClientDto) {
    try {
      return await this.prisma.client.create({
        data: {
          ...dto,
          tenantId,
          branchId,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'Ya existe un cliente con esa cédula, posiblemente en otra sucursal',
        );
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateClientDto) {
    await this.assertExists(tenantId, id);
    return this.prisma.client.update({
      where: { id },
      data: {
        ...dto,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.assertExists(tenantId, id);
    // Soft-delete only: client history must never be destroyed.
    return this.prisma.client.update({
      where: { id },
      data: { isActive: false },
    });
  }

  private async assertExists(tenantId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, tenantId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }
}
