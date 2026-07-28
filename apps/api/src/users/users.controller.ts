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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.usersService.findAll(tenantId);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Get('technicians')
  findTechnicians(@CurrentUser('tenantId') tenantId: string) {
    return this.usersService.findTechnicians(tenantId);
  }

  @Get('me/branches')
  findMyBranches(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: Role,
  ) {
    return this.usersService.findMyBranches(tenantId, userId, role);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.usersService.findOne(tenantId, id);
  }

  @Roles(Role.ADMIN)
  @Audit('User')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN)
  @Audit('User')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(tenantId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Audit('User')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.usersService.remove(tenantId, id);
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
