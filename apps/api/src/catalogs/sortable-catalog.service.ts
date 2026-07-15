import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './dto/catalog-item.dto';

export type CatalogModel = 'quickService' | 'accessoryOption';

export interface CatalogRecord {
  id: string;
  tenantId: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
}

/**
 * QuickService and AccessoryOption are two admin-managed catalogs with an
 * identical shape (label/sortOrder/isActive). Shared here so CRUD + reorder
 * logic isn't duplicated between them.
 *
 * Prisma's generated delegate types don't resolve through a union of two
 * models (each has its own generic overloaded methods), so this narrows to a
 * plain call surface instead — safe because both tables share the same columns.
 */
@Injectable()
export class SortableCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(
    model: CatalogModel,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    return client[model] as unknown as {
      findMany(args: unknown): Promise<CatalogRecord[]>;
      findFirst(args: unknown): Promise<CatalogRecord | null>;
      create(args: unknown): Promise<CatalogRecord>;
      update(args: unknown): Promise<CatalogRecord>;
      delete(args: unknown): Promise<CatalogRecord>;
      count(args: unknown): Promise<number>;
    };
  }

  findAll(model: CatalogModel, tenantId: string, includeInactive = false) {
    return this.delegate(model).findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(model: CatalogModel, tenantId: string, dto: CreateCatalogItemDto) {
    const sortOrder = await this.delegate(model).count({ where: { tenantId } });
    return this.delegate(model).create({
      data: { tenantId, label: dto.label, sortOrder },
    });
  }

  async update(
    model: CatalogModel,
    tenantId: string,
    id: string,
    dto: UpdateCatalogItemDto,
  ) {
    await this.assertExists(model, tenantId, id);
    return this.delegate(model).update({ where: { id }, data: dto });
  }

  async remove(model: CatalogModel, tenantId: string, id: string) {
    await this.assertExists(model, tenantId, id);
    return this.delegate(model).delete({ where: { id } });
  }

  async reorder(model: CatalogModel, tenantId: string, orderedIds: string[]) {
    const items = await this.delegate(model).findMany({ where: { tenantId } });
    const validIds = new Set(items.map((item) => item.id));
    const idsToUpdate = orderedIds.filter((id) => validIds.has(id));
    await this.prisma.$transaction(async (tx) => {
      for (const [index, id] of idsToUpdate.entries()) {
        await this.delegate(model, tx).update({
          where: { id },
          data: { sortOrder: index },
        });
      }
    });
    return this.findAll(model, tenantId, true);
  }

  private async assertExists(model: CatalogModel, tenantId: string, id: string) {
    const item = await this.delegate(model).findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('Elemento no encontrado');
    return item;
  }
}
