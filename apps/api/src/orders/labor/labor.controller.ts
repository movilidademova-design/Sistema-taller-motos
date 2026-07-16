import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LaborService } from './labor.service';
import { CreateLaborEntryDto } from './dto/create-labor-entry.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/labor')
export class LaborController {
  constructor(private readonly laborService: LaborService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
  ) {
    return this.laborService.findAll(tenantId, storeId, orderId);
  }

  @RequirePermission('labor.manage')
  @Audit('LaborEntry')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
    @Body() dto: CreateLaborEntryDto,
  ) {
    return this.laborService.create(tenantId, storeId, orderId, dto);
  }

  @RequirePermission('labor.manage')
  @Audit('LaborEntry')
  @Delete(':entryId')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.laborService.remove(tenantId, storeId, orderId, entryId);
  }
}
