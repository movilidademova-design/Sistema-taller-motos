import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LaborService } from './labor.service';
import { CreateLaborEntryDto } from './dto/create-labor-entry.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Role } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/labor')
export class LaborController {
  constructor(private readonly laborService: LaborService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.laborService.findAll(tenantId, orderId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
  @Audit('LaborEntry')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateLaborEntryDto,
  ) {
    return this.laborService.create(tenantId, orderId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('LaborEntry')
  @Delete(':entryId')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.laborService.remove(tenantId, orderId, entryId);
  }
}
