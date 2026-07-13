import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WarrantiesService } from './warranties.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { ResolveWarrantyDto } from './dto/resolve-warranty.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('warranties')
@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.warrantiesService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.warrantiesService.findOne(tenantId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Warranty')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateWarrantyDto,
  ) {
    return this.warrantiesService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('Warranty')
  @HttpCode(HttpStatus.OK)
  @Post(':id/approve')
  approve(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.warrantiesService.approve(tenantId, id, userId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('Warranty')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reject')
  reject(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ) {
    return this.warrantiesService.reject(tenantId, id, userId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.TECHNICIAN)
  @Audit('Warranty')
  @HttpCode(HttpStatus.OK)
  @Post(':id/resolve')
  resolve(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResolveWarrantyDto,
  ) {
    return this.warrantiesService.resolve(tenantId, id, dto);
  }
}
