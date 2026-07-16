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
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('purchases')
@RequirePermission('purchases.create')
@Controller('purchase-orders')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.purchasesService.findAll(tenantId, storeId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.purchasesService.findOne(tenantId, storeId, id);
  }

  @Audit('PurchaseOrder')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreatePurchaseOrderDto,
  ) {
    return this.purchasesService.create(tenantId, storeId, dto);
  }

  @Audit('PurchaseOrder')
  @HttpCode(HttpStatus.OK)
  @Post(':id/mark-ordered')
  markOrdered(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.purchasesService.markOrdered(tenantId, storeId, id);
  }

  @RequirePermission('purchases.approve')
  @Audit('PurchaseOrder')
  @HttpCode(HttpStatus.OK)
  @Post(':id/receive')
  receive(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.purchasesService.receive(tenantId, storeId, id, userId);
  }

  @Audit('PurchaseOrder')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.purchasesService.cancel(tenantId, storeId, id);
  }
}
