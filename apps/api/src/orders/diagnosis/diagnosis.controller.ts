import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DiagnosisService } from './diagnosis.service';
import { UpsertDiagnosisDto } from './dto/upsert-diagnosis.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/diagnosis')
export class DiagnosisController {
  constructor(private readonly diagnosisService: DiagnosisService) {}

  @Get()
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('orderId') orderId: string,
  ) {
    return this.diagnosisService.findOne(tenantId, storeId, orderId);
  }

  @RequirePermission('diagnosis.manage')
  @Audit('Diagnosis')
  @Put()
  upsert(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpsertDiagnosisDto,
  ) {
    return this.diagnosisService.upsert(tenantId, storeId, orderId, userId, dto);
  }
}
