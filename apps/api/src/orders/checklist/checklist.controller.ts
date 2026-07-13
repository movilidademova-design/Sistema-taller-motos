import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ChecklistService } from './checklist.service';
import { SetChecklistDto } from './dto/set-checklist.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Role } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/checklist')
export class ChecklistController {
  constructor(private readonly checklistService: ChecklistService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.checklistService.findAll(tenantId, orderId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST, Role.TECHNICIAN)
  @Audit('ChecklistItem')
  @Put()
  setItems(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: SetChecklistDto,
  ) {
    return this.checklistService.setItems(tenantId, orderId, dto);
  }
}
