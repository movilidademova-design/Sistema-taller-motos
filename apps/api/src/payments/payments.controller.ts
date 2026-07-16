import { Body, Controller, Get, Query, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @RequirePermission('payments.viewCashRegister')
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query('clientId') clientId?: string,
  ) {
    return this.paymentsService.findAll(tenantId, storeId, clientId);
  }

  @RequirePermission('payments.create')
  @Audit('Payment')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(tenantId, storeId, userId, dto);
  }
}
