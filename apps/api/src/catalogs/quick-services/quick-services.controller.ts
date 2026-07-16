import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SortableCatalogService } from '../sortable-catalog.service';
import {
  CreateCatalogItemDto,
  ReorderCatalogDto,
  UpdateCatalogItemDto,
} from '../dto/catalog-item.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

const MODEL = 'quickService' as const;

@ApiBearerAuth()
@ApiTags('catalogs')
@Controller('quick-services')
export class QuickServicesController {
  constructor(private readonly catalog: SortableCatalogService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalog.findAll(MODEL, tenantId, storeId, includeInactive === 'true');
  }

  @RequirePermission('catalogs.manage')
  @Audit('QuickService')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreateCatalogItemDto,
  ) {
    return this.catalog.create(MODEL, tenantId, storeId, dto);
  }

  @RequirePermission('catalogs.manage')
  @Audit('QuickService')
  @Patch('reorder')
  reorder(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: ReorderCatalogDto,
  ) {
    return this.catalog.reorder(MODEL, tenantId, storeId, dto.orderedIds);
  }

  @RequirePermission('catalogs.manage')
  @Audit('QuickService')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalog.update(MODEL, tenantId, storeId, id, dto);
  }

  @RequirePermission('catalogs.manage')
  @Audit('QuickService')
  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.catalog.remove(MODEL, tenantId, storeId, id);
  }
}
