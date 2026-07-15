import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SortableCatalogService } from '../sortable-catalog.service';
import {
  CreateCatalogItemDto,
  ReorderCatalogDto,
  UpdateCatalogItemDto,
} from '../dto/catalog-item.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Role } from '../../generated/prisma/enums';

const MODEL = 'quickService' as const;

@ApiBearerAuth()
@ApiTags('catalogs')
@Controller('quick-services')
export class QuickServicesController {
  constructor(private readonly catalog: SortableCatalogService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.catalog.findAll(MODEL, tenantId, includeInactive === 'true');
  }

  @Roles(Role.ADMIN)
  @Audit('QuickService')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateCatalogItemDto,
  ) {
    return this.catalog.create(MODEL, tenantId, dto);
  }

  @Roles(Role.ADMIN)
  @Audit('QuickService')
  @Patch('reorder')
  reorder(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ReorderCatalogDto,
  ) {
    return this.catalog.reorder(MODEL, tenantId, dto.orderedIds);
  }

  @Roles(Role.ADMIN)
  @Audit('QuickService')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalog.update(MODEL, tenantId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Audit('QuickService')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.catalog.remove(MODEL, tenantId, id);
  }
}
