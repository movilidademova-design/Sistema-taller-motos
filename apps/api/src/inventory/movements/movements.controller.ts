import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MovementsService } from './movements.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('inventory')
@Controller('inventory/movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: { productId?: string; page?: number; pageSize?: number },
  ) {
    return this.movementsService.findAll(tenantId, query);
  }
}
