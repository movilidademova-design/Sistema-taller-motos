import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';

@ApiBearerAuth()
@ApiTags('inventory')
@Controller('inventory/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @RequirePermission('inventory.view')
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.categoriesService.findAll(tenantId, storeId);
  }

  @RequirePermission('inventory.manage')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(tenantId, storeId, dto);
  }

  @RequirePermission('inventory.manage')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(tenantId, storeId, id, dto);
  }

  @RequirePermission('inventory.manage')
  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.categoriesService.remove(tenantId, storeId, id);
  }
}
