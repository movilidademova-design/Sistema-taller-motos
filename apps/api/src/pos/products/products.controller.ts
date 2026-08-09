import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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

// Mismo tope que orders.controller.ts usa para fotos: generoso para el
// archivo pero no ilimitado. Un .xlsx de 50 productos pesa unos pocos KB.
const IMPORT_FILE_LIMITS = { limits: { fileSize: 8 * 1024 * 1024 } };

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

  // Cargar inventario en bloque no es tarea de un cajero: mismo rol que
  // crear o borrar productos uno por uno.
  @PosRoles(PosRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_LIMITS))
  @Post('import/preview')
  previewImport(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    return this.productsService.previewImport(tenantId, branchId, file.buffer);
  }

  @PosRoles(PosRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', IMPORT_FILE_LIMITS))
  @Post('import')
  applyImport(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentBranch() branchId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Debes adjuntar un archivo');
    return this.productsService.applyImport(tenantId, branchId, file.buffer);
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
