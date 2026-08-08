import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignBranchesDto } from './dto/assign-branches.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { PosRoles } from '../common/decorators/pos-roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { PosRole, Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @PosRoles(PosRole.ADMIN)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role | null,
  ) {
    return this.usersService.findAll(tenantId, userId, role);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Get('technicians')
  findTechnicians(@CurrentUser('tenantId') tenantId: string) {
    return this.usersService.findTechnicians(tenantId);
  }

  // "Mis sucursales" lo necesita cualquiera de los dos sistemas: sin él, una
  // cuenta solo-POS no puede elegir sucursal, y sin sucursal no puede vender.
  // Se enumeran los roles a partir del enum en vez de a mano para que un rol
  // nuevo no se quede fuera por olvido.
  @Roles(...Object.values(Role))
  @PosRoles(...Object.values(PosRole))
  @Get('me/branches')
  findMyBranches(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role | null,
    @CurrentUser('posRole') posRole: PosRole | null,
  ) {
    return this.usersService.findMyBranches(tenantId, userId, role, posRole);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @PosRoles(PosRole.ADMIN)
  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.usersService.findOne(tenantId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @PosRoles(PosRole.ADMIN)
  @Audit('User')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role | null,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, userId, role, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @PosRoles(PosRole.ADMIN)
  @Audit('User')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role | null,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, userId, role, id, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @PosRoles(PosRole.ADMIN)
  @Audit('User')
  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role | null,
    @Param('id') id: string,
  ) {
    return this.usersService.remove(tenantId, userId, role, id);
  }

  @Roles(Role.ADMIN)
  @Audit('User')
  @Post(':id/branches')
  assignBranches(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: AssignBranchesDto,
  ) {
    return this.usersService.assignBranches(tenantId, id, dto.branchIds);
  }

  @Roles(Role.ADMIN)
  @Get(':id/branches')
  getUserBranches(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.usersService.findUserBranches(tenantId, id);
  }
}
