import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
} from './dto/appointment.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.appointmentsService.findAll(tenantId, from, to);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Appointment')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAppointmentDto,
  ) {
    return this.appointmentsService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Appointment')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAppointmentDto,
  ) {
    return this.appointmentsService.update(tenantId, id, dto);
  }
}
