import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChecklistService } from './checklist.service';
import { SetChecklistDto } from './dto/set-checklist.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/checklist')
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
  ) {
    return this.checklistService.findAll(tenantId, storeId, orderId);
  }

  @RequirePermission('orders.documentation')
  @Audit('ChecklistItem')
  @Put()
  setItems(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
    @Body() dto: SetChecklistDto,
  ) {
    return this.checklistService.setItems(tenantId, storeId, orderId, dto);
  }
}
