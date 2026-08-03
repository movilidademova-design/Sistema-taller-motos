import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { ExportInvoicesQueryDto } from './dto/export-invoices-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';

@ApiBearerAuth()
@ApiTags('invoices')
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.invoicesService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get('export')
  async export(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentBranch() branchId: string,
    @Query() query: ExportInvoicesQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.invoicesService.exportToExcel(
      tenantId,
      branchId,
      role,
      query,
    );
    return new StreamableFile(buffer, {
      type: EXCEL_CONTENT_TYPE,
      disposition: excelAttachment('facturas'),
    });
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.invoicesService.findOne(tenantId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Invoice')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.generateFromOrder(tenantId, dto);
  }

  @Get(':id/pdf')
  async downloadPdf(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.invoicesService.renderPdf(tenantId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="factura-${id}.pdf"`,
    );
    res.send(pdf);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Invoice')
  @HttpCode(HttpStatus.OK)
  @Post(':id/send-email')
  sendEmail(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.invoicesService.sendByEmail(tenantId, id);
  }
}
