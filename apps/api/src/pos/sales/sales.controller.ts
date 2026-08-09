import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PosSalesService } from './sales.service';
import { CreateSaleDto, ListPosSalesQueryDto } from './dto/sale.dto';
import { PosRoles } from '../../common/decorators/pos-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { PosRole } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('pos')
@Controller('pos/sales')
export class PosSalesController {
  constructor(private readonly salesService: PosSalesService) {}

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentBranch() branchId: string,
    @Body() dto: CreateSaleDto,
  ) {
    return this.salesService.create(tenantId, branchId, userId, dto);
  }

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: ListPosSalesQueryDto,
  ) {
    return this.salesService.findAll(tenantId, branchId, query);
  }

  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
  ) {
    return this.salesService.findOne(tenantId, branchId, id);
  }

  // Anular y nota crédito solo para ADMIN: son operaciones que reescriben
  // dinero ya cobrado, un cajero no debería poder revertir su propia venta.
  @PosRoles(PosRole.ADMIN)
  @Post(':id/void')
  void(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
  ) {
    return this.salesService.void(tenantId, branchId, id);
  }

  @PosRoles(PosRole.ADMIN)
  @Post(':id/credit-note')
  creditNote(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
  ) {
    return this.salesService.creditNote(tenantId, branchId, id);
  }
}
