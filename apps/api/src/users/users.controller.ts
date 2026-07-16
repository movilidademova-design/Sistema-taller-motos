import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermission('users.manage')
  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Get('technicians')
  findTechnicians(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
  ) {
    return this.usersService.findTechnicians(tenantId, storeId);
  }

  @RequirePermission('users.manage')
  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.usersService.findOne(tenantId, id);
  }

  @RequirePermission('users.manage')
  @Audit('User')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('storeIds') storeIds: string[],
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, { role, storeIds }, dto);
  }

  @RequirePermission('users.manage')
  @Audit('User')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: Role,
    @CurrentUser('storeIds') storeIds: string[],
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, { role, storeIds }, id, dto);
  }

  @RequirePermission('users.manage')
  @Audit('User')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.usersService.remove(tenantId, id);
  }

  /**
   * Solo Super Administrador administra permisos de otros usuarios — es
   * justamente la capacidad que decide cuánto puede hacer cada quien, así
   * que no es en sí misma un permiso togglable (ver permission.constants.ts).
   */
  @Roles(Role.ADMIN)
  @Get(':id/permissions')
  getPermissions(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.usersService.getPermissions(tenantId, id);
  }

  @Roles(Role.ADMIN)
  @Audit('User')
  @Put(':id/permissions')
  updatePermissions(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.usersService.updatePermissions(tenantId, id, dto.overrides);
  }
}
