import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PosLayawaysService } from './layaways.service';
import {
  AddLayawayPaymentDto,
  CreateLayawayDto,
  ListLayawaysQueryDto,
} from './dto/layaway.dto';
import { PosRoles } from '../../common/decorators/pos-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { PosRole } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('pos')
@Controller('pos/layaways')
export class PosLayawaysController {
  constructor(private readonly layawaysService: PosLayawaysService) {}

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentBranch() branchId: string,
    @Body() dto: CreateLayawayDto,
  ) {
    return this.layawaysService.create(tenantId, branchId, userId, dto);
  }

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: ListLayawaysQueryDto,
  ) {
    return this.layawaysService.findAll(tenantId, branchId, query);
  }

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
  ) {
    return this.layawaysService.findOne(tenantId, branchId, id);
  }

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Post(':id/payments')
  addPayment(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
    @Body() dto: AddLayawayPaymentDto,
  ) {
    return this.layawaysService.addPayment(tenantId, branchId, userId, id, dto);
  }

  // Solo ADMIN: cancelar devuelve stock y revierte dinero ya cobrado, un
  // cajero no debería poder revertir su propio separado.
  @PosRoles(PosRole.ADMIN)
  @Post(':id/cancel')
  cancel(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
  ) {
    return this.layawaysService.cancel(tenantId, branchId, id);
  }
}
