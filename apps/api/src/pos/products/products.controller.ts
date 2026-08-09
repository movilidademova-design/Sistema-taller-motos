import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PosProductsService } from './products.service';
import { CreatePosProductDto, UpdatePosProductDto } from './dto/product.dto';
import { PosRoles } from '../../common/decorators/pos-roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { PosRole } from '../../generated/prisma/enums';
import {
  EXCEL_CONTENT_TYPE,
  excelAttachment,
} from '../../common/excel/excel.service';
import { PosExportQueryDto } from '../reports/dto/pos-export-query.dto';

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

  // Solo ADMIN, y antes que cualquier ruta con ':id' para que Nest no la
  // confunda con un id literal "export".
  @PosRoles(PosRole.ADMIN)
  @Get('export')
  async exportToExcel(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @Query() query: PosExportQueryDto,
  ): Promise<StreamableFile> {
    const buffer = await this.productsService.exportToExcel(
      tenantId,
      branchId,
      query,
    );
    return new StreamableFile(buffer, {
      type: EXCEL_CONTENT_TYPE,
      disposition: excelAttachment('inventario'),
    });
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
