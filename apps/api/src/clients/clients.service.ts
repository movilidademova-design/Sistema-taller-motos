import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ExcelService, MAX_ROWS } from '../common/excel/excel.service';
import { dateRangeFilter } from '../common/utils/export-filters.util';
import { ExportQueryDto } from '../common/dto/export-query.dto';

/**
 * Campos de búsqueda de Clientes, compartidos por `findAll` y `exportToExcel`.
 *
 * Lo comparten a propósito, por la misma razón que dejó el export de Órdenes:
 * el botón de exportar manda el mismo `search` que la lista tiene en pantalla,
 * así que si cada uno mirara campos distintos, exportar devolvería un conjunto
 * de filas diferente al que el usuario está viendo — sin error ni aviso.
 */
export function clientSearchFilter(search?: string) {
  if (!search) return undefined;
  const contains = { contains: search, mode: 'insensitive' as const };
  return {
    OR: [
      { firstName: contains },
      { lastName: contains },
      { documentId: contains },
      { phone: contains },
      { email: contains },
    ],
  };
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

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
      ...(clientSearchFilter(query.search) ?? {}),
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

  async exportToExcel(tenantId: string, query: ExportQueryDto): Promise<Buffer> {
    const createdAt = dateRangeFilter(query.from, query.to);

    // A diferencia de `findAll`, esto NO filtra `isActive: true`: un export es
    // para analizar el histórico completo, y por eso lleva la columna "Estado"
    // que distingue activos de inactivos. Es la única diferencia deliberada con
    // la lista; el resto de los filtros son los mismos.
    const clients = await this.prisma.client.findMany({
      where: {
        tenantId,
        ...(createdAt ? { createdAt } : {}),
        ...(clientSearchFilter(query.search) ?? {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS + 1, // ver la nota en el export de Órdenes
      include: { _count: { select: { motorcycles: true, orders: true } } },
    });

    type Row = (typeof clients)[number];

    return this.excel.generate<Row>({
      sheetName: 'Clientes',
      rows: clients,
      columns: [
        { header: 'Nombre', key: 'firstName', width: 20, value: (c) => c.firstName },
        { header: 'Apellido', key: 'lastName', width: 20, value: (c) => c.lastName },
        { header: 'Documento', key: 'documentId', value: (c) => c.documentId },
        { header: 'Teléfono', key: 'phone', value: (c) => c.phone },
        { header: 'Correo', key: 'email', width: 28, value: (c) => c.email },
        { header: 'Dirección', key: 'address', width: 32, value: (c) => c.address },
        {
          header: 'Fecha de nacimiento',
          key: 'birthDate',
          format: 'date',
          value: (c) => c.birthDate,
        },
        { header: 'Notas', key: 'notes', width: 32, value: (c) => c.notes },
        {
          header: 'Vehículos',
          key: 'motorcycles',
          format: 'number',
          value: (c) => c._count.motorcycles,
        },
        {
          header: 'Órdenes',
          key: 'orders',
          format: 'number',
          value: (c) => c._count.orders,
        },
        { header: 'Estado', key: 'isActive', value: (c) => (c.isActive ? 'Activo' : 'Inactivo') },
        {
          header: 'Fecha de registro',
          key: 'createdAt',
          format: 'datetime',
          value: (c) => c.createdAt,
        },
      ],
    });
  }
}
