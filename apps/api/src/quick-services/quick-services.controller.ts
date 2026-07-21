import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { QuickServicesService } from './quick-services.service';
import { CreateQuickServiceDto } from './dto/create-quick-service.dto';
import { UpdateQuickServiceDto } from './dto/update-quick-service.dto';
import { ReorderQuickServicesDto } from './dto/reorder-quick-services.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('quick-services')
@Controller('quick-services')
export class QuickServicesController {
  constructor(private readonly quickServicesService: QuickServicesService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.quickServicesService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateQuickServiceDto,
  ) {
    return this.quickServicesService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Patch('reorder')
  reorder(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ReorderQuickServicesDto,
  ) {
    return this.quickServicesService.reorder(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuickServiceDto,
  ) {
    return this.quickServicesService.update(tenantId, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('QuickService')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.quickServicesService.remove(tenantId, id);
  }
}
