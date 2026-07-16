import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('stores')
@Controller('stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  /** Sucursales del usuario actual — usado por el selector de tienda en la barra superior. */
  @Get('mine')
  findMine(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('storeIds') storeIds: string[],
  ) {
    return this.stores.findMine(tenantId, storeIds);
  }

  @Roles(Role.ADMIN, Role.MANAGER)
  @Get()
  findAll(@CurrentUser('tenantId') tenantId: string) {
    return this.stores.findAll(tenantId);
  }

  @Roles(Role.ADMIN)
  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.stores.findOne(tenantId, id);
  }

  @Roles(Role.ADMIN)
  @Audit('Store')
  @Post()
  create(@CurrentUser('tenantId') tenantId: string, @Body() dto: CreateStoreDto) {
    return this.stores.create(tenantId, dto);
  }

  @Roles(Role.ADMIN)
  @Audit('Store')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.stores.update(tenantId, id, dto);
  }

  @Roles(Role.ADMIN)
  @Audit('Store')
  @Delete(':id')
  remove(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.stores.remove(tenantId, id);
  }
}
