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
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('warranties')
@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.warrantiesService.findAll(tenantId, storeId);
  }

  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.warrantiesService.findOne(tenantId, storeId, id);
  }

  @RequirePermission('warranties.manage')
  @Audit('Warranty')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreateWarrantyDto,
  ) {
    return this.warrantiesService.create(tenantId, storeId, dto);
  }

  @RequirePermission('warranties.manage')
  @Audit('Warranty')
  @HttpCode(HttpStatus.OK)
  @Post(':id/approve')
  approve(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.warrantiesService.approve(tenantId, storeId, id, userId);
  }

  @RequirePermission('warranties.manage')
  @Audit('Warranty')
  @HttpCode(HttpStatus.OK)
  @Post(':id/reject')
  reject(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.warrantiesService.reject(tenantId, storeId, id, userId);
  }

  @RequirePermission('warranties.manage')
  @Audit('Warranty')
  @HttpCode(HttpStatus.OK)
  @Post(':id/resolve')
  resolve(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: ResolveWarrantyDto,
  ) {
    return this.warrantiesService.resolve(tenantId, storeId, id, dto);
  }
}
