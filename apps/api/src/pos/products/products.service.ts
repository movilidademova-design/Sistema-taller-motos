import { Injectable, NotFoundException } from '@nestjs/common';
import { PosPrismaService } from '../pos-prisma.service';
import { CreatePosProductDto, UpdatePosProductDto } from './dto/product.dto';
import { ExcelService, MAX_ROWS } from '../../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../../common/utils/export-filters.util';
import { PosExportQueryDto } from '../reports/dto/pos-export-query.dto';
import { Role } from '../../generated/prisma/enums';

@Injectable()
export class PosProductsService {
  constructor(
    private readonly prisma: PosPrismaService,
    private readonly excel: ExcelService,
  ) {}

  // Calle 80 y Ciudadela tienen inventarios separados: todo va filtrado por
  // tenantId Y branchId, siempre.
  findAll(tenantId: string, branchId: string) {
    return this.prisma.posProduct.findMany({
      where: { tenantId, branchId, isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  create(tenantId: string, branchId: string, dto: CreatePosProductDto) {
    return this.prisma.posProduct.create({
      data: { ...dto, tenantId, branchId },
    });
  }

  async update(
    tenantId: string,
    branchId: string,
    id: string,
    dto: UpdatePosProductDto,
  ) {
    await this.assertExists(tenantId, branchId, id);
    return this.prisma.posProduct.update({ where: { id }, data: dto });
  }

  // Borrado suave: ventas viejas siguen apuntando a este producto por id, así
  // que borrarlo de verdad las dejaría con una referencia rota.
  async remove(tenantId: string, branchId: string, id: string) {
    await this.assertExists(tenantId, branchId, id);
    return this.prisma.posProduct.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Inventario con stock y valorización (stock × costo). A diferencia de los
   * demás exports, `from`/`to` filtran por `entryDate` (fecha de ingreso) y
   * no por fecha de venta — un producto no tiene "fecha de venta" propia. Sin
   * rango, salen todos los productos activos, igual que la hoja INVENTARIO
   * del cierre mensual.
   */
  async exportToExcel(
    tenantId: string,
    currentBranchId: string,
    query: PosExportQueryDto,
  ): Promise<Buffer> {
    const branchId = resolveExportBranchId(
      Role.ADMIN,
      currentBranchId,
      query.branchId,
    );
    const entryDate = dateRangeFilter(query.from, query.to);

    const products = await this.prisma.posProduct.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(branchId ? { branchId } : {}),
        ...(entryDate ? { entryDate } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      take: MAX_ROWS + 1,
    });

    type Row = (typeof products)[number];
    return this.excel.generate<Row>({
      sheetName: 'Inventario',
      rows: products,
      columns: [
        { header: 'Referencia', key: 'reference', value: (p) => p.reference },
        { header: 'Nombre', key: 'name', width: 26, value: (p) => p.name },
        { header: 'Categoría', key: 'category', value: (p) => p.category },
        { header: 'Color', key: 'color', value: (p) => p.color },
        {
          header: 'Proveedor',
          key: 'supplier',
          width: 20,
          value: (p) => p.supplier,
        },
        {
          header: 'Precio venta',
          key: 'price',
          format: 'currency',
          value: (p) => Number(p.price),
        },
        {
          header: 'Costo',
          key: 'cost',
          format: 'currency',
          value: (p) => Number(p.cost),
        },
        {
          header: 'Stock',
          key: 'stock',
          format: 'number',
          value: (p) => p.stock,
        },
        {
          header: 'Valorización',
          key: 'valuation',
          format: 'currency',
          value: (p) => Number(p.cost) * p.stock,
        },
      ],
    });
  }

  private async assertExists(tenantId: string, branchId: string, id: string) {
    const product = await this.prisma.posProduct.findFirst({
      where: { id, tenantId, branchId },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }
}
