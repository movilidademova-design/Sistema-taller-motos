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
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Role } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/quotation')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Get()
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.findOne(tenantId, orderId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN, Role.RECEPTIONIST)
  @Audit('Quotation')
  @Put()
  upsert(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpsertQuotationDto,
  ) {
    return this.quotationsService.upsert(tenantId, orderId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Quotation')
  @HttpCode(HttpStatus.OK)
  @Post('approve')
  approve(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.decide(tenantId, orderId, true);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Quotation')
  @HttpCode(HttpStatus.OK)
  @Post('reject')
  reject(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.decide(tenantId, orderId, false);
  }
}
