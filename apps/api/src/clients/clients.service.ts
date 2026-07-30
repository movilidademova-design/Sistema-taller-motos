import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  // Clients are shared across every branch of the tenant (a person's cédula is
  // the same person no matter which branch they walk into), so this is
  // intentionally NOT scoped by branch — see the "Nota de diseño" amendment in
  // docs/superpowers/specs/2026-07-28-sucursales-fase1-design.md.
  async findAll(tenantId: string, query: PaginationQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
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

  // Tenant-wide, not scoped to the current branch: a client registered at any
  // branch of this tenant should be found from any other branch too (see
  // findAll's comment above).
  async findByDocumentId(tenantId: string, documentId: string) {
    const client = await this.prisma.client.findFirst({
      where: { tenantId, documentId, isActive: true },
      include: { motorcycles: { orderBy: { createdAt: 'desc' } } },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    return client;
  }

  // documentId is unique per tenant, not per branch. If it collides with an
  // existing client — whether created moments ago in a concurrent request, or
  // long ago at a different branch — that's the same person, so this reuses
  // their existing record instead of erroring.
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
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.client.findFirst({
          where: { tenantId, documentId: dto.documentId },
        });
        if (existing && !existing.isActive) {
          // Reactivate rather than hand back a soft-deleted record as if
          // creation had succeeded — it wouldn't show up in findAll otherwise.
          return this.prisma.client.update({
            where: { id: existing.id },
            data: {
              ...dto,
              birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
              isActive: true,
            },
          });
        }
        if (existing) return existing;
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
