import {
  Body,
  Controller,
  Get,
  Query,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('clientId') clientId?: string,
  ) {
    return this.paymentsService.findAll(tenantId, clientId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('export')
  async export(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentBranch() branchId: string,
    @Query() query: ExportPaymentsQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.paymentsService.exportToExcel(
      tenantId,
      branchId,
      role,
      query,
    );
    return new StreamableFile(buffer, {
      type: EXCEL_CONTENT_TYPE,
      disposition: excelAttachment('pagos'),
    });
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Payment')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(tenantId, userId, dto);
  }
}
