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
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { Role } from '../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('motorcycles')
@Controller('motorcycles')
export class MotorcyclesController {
  constructor(private readonly motorcyclesService: MotorcyclesService) {}

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: PaginationQueryDto & { clientId?: string },
  ) {
    return this.motorcyclesService.findAll(tenantId, query);
  }

  @Get(':id')
  findOne(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.motorcyclesService.findOne(tenantId, id);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Motorcycle')
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @Body() dto: CreateMotorcycleDto,
  ) {
    return this.motorcyclesService.create(tenantId, dto);
  }

  @Roles(Role.ADMIN, Role.MANAGER, Role.RECEPTIONIST)
  @Audit('Motorcycle')
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMotorcycleDto,
  ) {
    return this.motorcyclesService.update(tenantId, id, dto);
  }
}
