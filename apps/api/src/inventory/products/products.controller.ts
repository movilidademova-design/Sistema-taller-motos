import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  AdjustStockDto,
} from './dto/product.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('inventory')
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermission('inventory.view', 'inventory.lookup')
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query()
    query: PaginationQueryDto & { categoryId?: string; lowStock?: boolean },
  ) {
    return this.productsService.findAll(tenantId, storeId, query);
  }

  @RequirePermission('inventory.view', 'inventory.lookup')
  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.productsService.findOne(tenantId, storeId, id);
  }

  @RequirePermission('inventory.manage')
  @Audit('Product')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(tenantId, storeId, dto);
  }

  @RequirePermission('inventory.manage')
  @Audit('Product')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(tenantId, storeId, id, dto);
  }

  @RequirePermission('inventory.manage')
  @Audit('Product')
  @Patch(':id/adjust-stock')
  adjustStock(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(tenantId, storeId, id, userId, dto);
  }
}
