import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import { UpsertQuotationDto } from './dto/upsert-quotation.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/quotation')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.findOne(tenantId, storeId, orderId);
  }

  @RequirePermission('quotations.manage')
  @Audit('Quotation')
  @Put()
  upsert(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
    @Body() dto: UpsertQuotationDto,
  ) {
    return this.quotationsService.upsert(tenantId, storeId, orderId, dto);
  }

  @RequirePermission('quotations.approve')
  @Audit('Quotation')
  @HttpCode(HttpStatus.OK)
  @Post('approve')
  approve(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.decide(tenantId, storeId, orderId, true);
  }

  @RequirePermission('quotations.approve')
  @Audit('Quotation')
  @HttpCode(HttpStatus.OK)
  @Post('reject')
  reject(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.decide(tenantId, storeId, orderId, false);
  }
}
