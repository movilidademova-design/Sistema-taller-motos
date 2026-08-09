import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PosPrismaService } from '../pos-prisma.service';
import { CreatePosProductDto, UpdatePosProductDto } from './dto/product.dto';
import { ExcelService, MAX_ROWS } from '../../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../../common/utils/export-filters.util';
import { PosExportQueryDto } from '../reports/dto/pos-export-query.dto';
import { Role } from '../../generated/prisma/enums';
import {
  ImportError,
  ParsedProductRow,
  parseProductImportSheet,
} from './product-import.util';

export interface ImportPreview {
  toCreate: number;
  toUpdate: number;
  errors: ImportError[];
  rows: ParsedProductRow[];
}

export interface ImportResult {
  created: number;
  updated: number;
}

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

  /**
   * Un producto se identifica por referencia + color, normalizados (sin
   * mayúsculas, sin espacios de sobra) — la referencia sola no alcanza:
   * en los datos reales `EB-11U` es a la vez la Apolo negra y la gris.
   *
   * Sin referencia se cae a nombre + color. Antes esas filas creaban siempre
   * un producto nuevo, y reimportar el mismo archivo iba acumulando copias:
   * el `CORRECION` de MotoPos no tiene referencia, así que tres importaciones
   * dejaban tres CORRECION. Duplicar en silencio es peor que emparejar por un
   * nombre que el usuario controla.
   */
  private matchKey(reference: string, name: string, color: string): string {
    const norm = (s: string) => s.trim().toLowerCase();
    const id = reference.trim()
      ? `ref:${norm(reference)}`
      : `nom:${norm(name)}`;
    return `${id}|${norm(color)}`;
  }

  /** Indexa los productos existentes por su clave de emparejado. */
  private indexByKey(
    existing: { id: string; reference: string; name: string; color: string }[],
  ): Map<string, string> {
    const byKey = new Map<string, string>();
    for (const p of existing) {
      byKey.set(this.matchKey(p.reference, p.name, p.color), p.id);
    }
    return byKey;
  }

  /**
   * Analiza el archivo y dice qué pasaría al aplicarlo, sin escribir nada:
   * el usuario tiene que poder revisar antes de comprometerse.
   */
  async previewImport(
    tenantId: string,
    branchId: string,
    buffer: Buffer,
  ): Promise<ImportPreview> {
    const { rows, errors } = await parseProductImportSheet(buffer);
    const existing = await this.prisma.posProduct.findMany({
      where: { tenantId, branchId, isActive: true },
      select: { id: true, reference: true, name: true, color: true },
    });
    const existingByKey = this.indexByKey(existing);

    let toCreate = 0;
    let toUpdate = 0;
    for (const row of rows) {
      const isUpdate = existingByKey.has(
        this.matchKey(row.reference, row.name, row.color),
      );
      if (isUpdate) toUpdate++;
      else toCreate++;
    }

    return { toCreate, toUpdate, errors, rows };
  }

  /**
   * Aplica el archivo: crea lo nuevo, actualiza lo existente. Todo o nada —
   * un solo error en el archivo lo rechaza completo, y toda la escritura
   * corre dentro de una transacción.
   */
  async applyImport(
    tenantId: string,
    branchId: string,
    buffer: Buffer,
  ): Promise<ImportResult> {
    const { rows, errors } = await parseProductImportSheet(buffer);
    if (errors.length > 0) {
      throw new BadRequestException({
        message:
          'El archivo tiene errores y no se aplicó ningún cambio. Corrígelos e inténtalo de nuevo.',
        errors,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.posProduct.findMany({
        where: { tenantId, branchId, isActive: true },
        select: { id: true, reference: true, name: true, color: true },
      });
      const existingByKey = this.indexByKey(existing);

      let created = 0;
      let updated = 0;
      for (const row of rows) {
        // El stock del archivo REEMPLAZA al del sistema: es una hoja de
        // inventario, no un movimiento de entrada que se suma.
        const data = {
          name: row.name,
          category: row.category,
          price: row.price,
          cost: row.cost,
          stock: row.stock,
          reference: row.reference,
          color: row.color,
          supplier: row.supplier,
        };
        const existingId = existingByKey.get(
          this.matchKey(row.reference, row.name, row.color),
        );

        if (existingId) {
          await tx.posProduct.update({ where: { id: existingId }, data });
          updated++;
        } else {
          await tx.posProduct.create({ data: { ...data, tenantId, branchId } });
          created++;
        }
      }

      return { created, updated };
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
