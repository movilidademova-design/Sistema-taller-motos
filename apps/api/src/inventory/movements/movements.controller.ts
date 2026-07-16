import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MovementsService } from './movements.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';

@ApiBearerAuth()
@ApiTags('inventory')
@Controller('inventory/movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @RequirePermission('inventory.view')
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query() query: { productId?: string; page?: number; pageSize?: number },
  ) {
    return this.movementsService.findAll(tenantId, storeId, query);
  }
}
