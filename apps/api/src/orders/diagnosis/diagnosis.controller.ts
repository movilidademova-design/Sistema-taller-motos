import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DiagnosisService } from './diagnosis.service';
import { UpsertDiagnosisDto } from './dto/upsert-diagnosis.dto';
import { AddDiagnosisPartDto } from './dto/add-diagnosis-part.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Audit } from '../../common/decorators/audit.decorator';
import { Role } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('orders/:orderId/diagnosis')
export class DiagnosisController {
  constructor(private readonly diagnosisService: DiagnosisService) {}

  @Get()
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.diagnosisService.findOne(tenantId, orderId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
  @Audit('Diagnosis')
  @Put()
  upsert(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpsertDiagnosisDto,
  ) {
    return this.diagnosisService.upsert(tenantId, orderId, userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
  @Audit('Diagnosis')
  @Post('parts')
  addPart(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AddDiagnosisPartDto,
  ) {
    return this.diagnosisService.addPart(tenantId, orderId, userId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
  @Audit('Diagnosis')
  @Delete('parts/:partId')
  removePart(
    @CurrentUser('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Param('partId') partId: string,
  ) {
    return this.diagnosisService.removePart(tenantId, orderId, partId);
  }
}
