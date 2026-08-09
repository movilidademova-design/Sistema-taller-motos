import { Controller, Get, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PosReportsService } from './reports.service';
import { EXCEL_CONTENT_TYPE } from '../../common/excel/excel.service';
import { PosExportQueryDto } from './dto/pos-export-query.dto';
import { MonthlyCloseQueryDto } from './dto/monthly-close-query.dto';
import { PosRoles } from '../../common/decorators/pos-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { PosRole } from '../../generated/prisma/enums';

// Solo ADMIN: un cajero no ve la ganancia ni el cierre mensual.
@ApiBearerAuth()
@ApiTags('pos')
@PosRoles(PosRole.ADMIN)
@Controller('pos/reports')
export class PosReportsController {
  constructor(private readonly reportsService: PosReportsService) {}

  @Get('summary')
  summary(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: PosExportQueryDto,
  ) {
    return this.reportsService.summary(tenantId, branchId, query);
  }

  @Get('monthly-close')
  async monthlyClose(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: MonthlyCloseQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.reportsService.exportMonthlyClose(
      tenantId,
      branchId,
      query,
    );
    return new StreamableFile(buffer, {
      type: EXCEL_CONTENT_TYPE,
      // Nombre con el mes cerrado, no la fecha de hoy (a diferencia de
      // `excelAttachment`): es el nombre que ya usa app.py y el que el
      // contador espera para archivar el mes correcto.
      disposition: `attachment; filename="cierre-${query.month}.xlsx"`,
    });
  }
}
