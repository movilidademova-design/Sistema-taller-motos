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
import { MotorcyclesService } from './motorcycles.service';
import { CreateMotorcycleDto } from './dto/create-motorcycle.dto';
import { UpdateMotorcycleDto } from './dto/update-motorcycle.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentStore } from '../common/decorators/current-store.decorator';
import { Audit } from '../common/decorators/audit.decorator';

@ApiBearerAuth()
@ApiTags('motorcycles')
@Controller('motorcycles')
export class MotorcyclesController {
  constructor(private readonly motorcyclesService: MotorcyclesService) {}

  @RequirePermission('motorcycles.view')
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Query() query: PaginationQueryDto & { clientId?: string },
  ) {
    return this.motorcyclesService.findAll(tenantId, storeId, query);
  }

  @RequirePermission('motorcycles.view')
  @Get(':id')
  findOne(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
  ) {
    return this.motorcyclesService.findOne(tenantId, storeId, id);
  }

  @RequirePermission('motorcycles.manage')
  @Audit('Motorcycle')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Body() dto: CreateMotorcycleDto,
  ) {
    return this.motorcyclesService.create(tenantId, storeId, dto);
  }

  @RequirePermission('motorcycles.manage')
  @Audit('Motorcycle')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentStore() storeId: string | null,
    @Param('id') id: string,
    @Body() dto: UpdateMotorcycleDto,
  ) {
    return this.motorcyclesService.update(tenantId, storeId, id, dto);
  }
}
