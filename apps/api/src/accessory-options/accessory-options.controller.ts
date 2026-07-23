import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessoryOptionsService } from './accessory-options.service';
import { CreateAccessoryOptionDto } from './dto/create-accessory-option.dto';
import { UpdateAccessoryOptionDto } from './dto/update-accessory-option.dto';
import { ReorderAccessoryOptionsDto } from './dto/reorder-accessory-options.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('accessory-options')
@Controller('accessory-options')
export class AccessoryOptionsController {
  constructor(private readonly accessoryOptionsService: AccessoryOptionsService) {}

  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.accessoryOptionsService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateAccessoryOptionDto,
  ) {
    return this.accessoryOptionsService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Patch('reorder')
  reorder(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: ReorderAccessoryOptionsDto,
  ) {
    return this.accessoryOptionsService.reorder(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccessoryOptionDto,
  ) {
    return this.accessoryOptionsService.update(tenantId, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Audit('AccessoryOption')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.accessoryOptionsService.remove(tenantId, id);
  }
}
