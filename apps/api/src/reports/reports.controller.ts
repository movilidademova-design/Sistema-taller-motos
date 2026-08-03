import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../common/excel/excel.service';
import { RevenueReportQueryDto } from './dto/revenue-report-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentBranch } from '../common/decorators/current-branch.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('reports')
@Roles(Role.ADMIN, Role.MANAGER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue/export')
  async exportRevenue(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentBranch() branchId: string,
    @Query() query: RevenueReportQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.reportsService.exportRevenue(
      tenantId,
      branchId,
      role,
      query,
    );
    return new StreamableFile(buffer, {
      type: EXCEL_CONTENT_TYPE,
      disposition: excelAttachment('ingresos'),
    });
  }
}
