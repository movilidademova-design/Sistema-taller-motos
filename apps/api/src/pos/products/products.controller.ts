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
import { PosProductsService } from './products.service';
import { CreatePosProductDto, UpdatePosProductDto } from './dto/product.dto';
import { PosRoles } from '../../common/decorators/pos-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { PosRole } from '../../generated/prisma/enums';

@ApiBearerAuth()
@ApiTags('pos')
@Controller('pos/products')
export class PosProductsController {
  constructor(private readonly productsService: PosProductsService) {}

  // Un cajero necesita ver el catálogo para vender.
  @PosRoles(PosRole.ADMIN, PosRole.CASHIER)
  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
  ) {
    return this.productsService.findAll(tenantId, branchId);
  }

  @PosRoles(PosRole.ADMIN)
  @Post()
  create(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Body() dto: CreatePosProductDto,
  ) {
    return this.productsService.create(tenantId, branchId, dto);
  }

  @PosRoles(PosRole.ADMIN)
  @Patch(':id')
  update(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePosProductDto,
  ) {
    return this.productsService.update(tenantId, branchId, id, dto);
  }

  @PosRoles(PosRole.ADMIN)
  @Delete(':id')
  remove(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Param('id') id: string,
  ) {
    return this.productsService.remove(tenantId, branchId, id);
  }
}
