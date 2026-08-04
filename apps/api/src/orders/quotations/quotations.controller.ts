import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import { UpsertQuotationDto } from './dto/upsert-quotation.dto';
import { ChangeQuotationStatusDto } from './dto/change-quotation-status.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Role } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/quotation')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Get()
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.findOne(tenantId, orderId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
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
  @Patch('status')
  changeStatus(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: ChangeQuotationStatusDto,
  ) {
    return this.quotationsService.changeStatus(tenantId, orderId, userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Quotation')
  @Post('pdf')
  generatePdf(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.generatePdf(tenantId, orderId, userId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Quotation')
  @Post('send')
  send(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.quotationsService.prepareSend(tenantId, orderId, userId);
  }
}
