import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('purchases')
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('purchase-orders')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.purchasesService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.purchasesService.findOne(tenantId, id);
  }

  @Audit('PurchaseOrder')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchasesService.create(tenantId, dto);
  }

  @Audit('PurchaseOrder')
  @HttpCode(HttpStatus.OK)
  @Post(':id/mark-ordered')
  markOrdered(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.markOrdered(tenantId, id);
  }

  @Audit('PurchaseOrder')
  @HttpCode(HttpStatus.OK)
  @Post(':id/receive')
  receive(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.purchasesService.receive(tenantId, id, userId);
  }

  @Audit('PurchaseOrder')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.purchasesService.cancel(tenantId, id);
  }
}
