import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { Prisma } from '../../generated/pos/client';
import { PosProductCategory } from '../../generated/pos/enums';
import { MAX_ROWS } from '../../common/excel/excel.service';

/**
 * Analiza el Excel de importación de inventario. Es una función pura: no
 * toca la base de datos, no sabe de sucursales ni de tenants — solo hoja de
 * cálculo adentro, filas validadas (o errores) afuera. El emparejado contra
 * lo que ya existe en la base vive en products.service.ts.
 */

export interface ParsedProductRow {
  /** Fila del Excel (1 = encabezado; los datos empiezan en la 2), para que
   * el usuario pueda ir a corregirla sin adivinar. */
  row: number;
  name: string;
  category: PosProductCategory;
  price: Prisma.Decimal;
  cost: Prisma.Decimal;
  stock: number;
  reference: string;
  color: string;
  supplier: string;
}

export interface ImportError {
  row: number;
  message: string;
}

export interface ParseImportResult {
  rows: ParsedProductRow[];
  errors: ImportError[];
}

type ColumnKey =
  | 'reference'
  | 'name'
  | 'category'
  | 'color'
  | 'supplier'
  | 'price'
  | 'cost'
  | 'stock';

// Encabezado (ya normalizado) -> clave interna. Son EXACTAMENTE las columnas
// de exportToExcel, menos "Valorización": esa es calculada y se ignora al
// leer, así que ni siquiera aparece en este mapa.
const HEADERS: { normalized: string; label: string; key: ColumnKey }[] = [
  { normalized: 'referencia', label: 'Referencia', key: 'reference' },
  { normalized: 'nombre', label: 'Nombre', key: 'name' },
  { normalized: 'categoria', label: 'Categoría', key: 'category' },
  { normalized: 'color', label: 'Color', key: 'color' },
  { normalized: 'proveedor', label: 'Proveedor', key: 'supplier' },
  { normalized: 'precio venta', label: 'Precio venta', key: 'price' },
  { normalized: 'costo', label: 'Costo', key: 'cost' },
  { normalized: 'stock', label: 'Stock', key: 'stock' },
];

const VALID_CATEGORIES = Object.values(PosProductCategory);

/** Sin tildes, sin mayúsculas, sin espacios de sobra — para comparar
 * encabezados y categorías sin que una tilde le arruine la tarde a nadie. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Extrae el valor "de verdad" de una celda: texto plano, texto enriquecido,
 * el resultado de una fórmula, o vacío si es un error de fórmula. Un usuario
 * que puso negrita en Excel no debería convertir su celda en "[object Object]". */
function cellRaw(
  cell: ExcelJS.Cell,
): string | number | boolean | Date | null | undefined {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('richText' in value) {
      return (value.richText as { text: string }[]).map((r) => r.text).join('');
    }
    if ('text' in value) return String((value as { text: unknown }).text);
    if ('result' in value) {
      const result = (value as { result: unknown }).result;
      return typeof result === 'object' ? undefined : (result as never);
    }
    // Fecha, o un error de fórmula (#DIV/0!, etc.) — se trata como vacío.
    return value instanceof Date ? value : undefined;
  }
  return value;
}

function cellText(cell: ExcelJS.Cell): string {
  const raw = cellRaw(cell);
  return raw === null || raw === undefined ? '' : String(raw).trim();
}

function isBlank(text: string): boolean {
  return text.trim() === '';
}

/** Nunca `parseFloat`: Decimal.js parsea la cadena tal cual llegó, sin pasar
 * por la coma flotante de JS. */
function parseDecimal(text: string): Prisma.Decimal | null {
  if (isBlank(text)) return null;
  try {
    const value = new Prisma.Decimal(text.trim());
    return value.isFinite() ? value : null;
  } catch {
    return null;
  }
}

export async function parseProductImportSheet(
  buffer: Buffer,
): Promise<ParseImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const sheet = workbook.worksheets[0];

  if (!sheet) {
    return {
      rows: [],
      errors: [{ row: 1, message: 'El archivo no tiene hojas' }],
    };
  }

  // Tope de filas antes de analizar entero — el mismo número que usan los
  // reportes que exportan, para no gastar tiempo en un archivo absurdo.
  if (sheet.rowCount - 1 > MAX_ROWS) {
    throw new BadRequestException(
      `El archivo tiene más de ${MAX_ROWS.toLocaleString('es-CO')} filas. Divídelo e intenta de nuevo.`,
    );
  }

  const headerRow = sheet.getRow(1);
  const columnIndex = new Map<ColumnKey, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const normalized = normalize(cellText(cell));
    const match = HEADERS.find((h) => h.normalized === normalized);
    if (match) columnIndex.set(match.key, colNumber);
  });

  const missing = HEADERS.filter((h) => !columnIndex.has(h.key));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: missing.map((h) => ({
        row: 1,
        message: `Falta la columna "${h.label}"`,
      })),
    };
  }

  const errors: ImportError[] = [];
  const rows: ParsedProductRow[] = [];
  const seenKeys = new Map<string, number>();

  const cellFor = (row: ExcelJS.Row, key: ColumnKey) =>
    row.getCell(columnIndex.get(key)!);

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);

    const nameText = cellText(cellFor(row, 'name'));
    const referenceText = cellText(cellFor(row, 'reference'));
    const categoryText = cellText(cellFor(row, 'category'));
    const colorText = cellText(cellFor(row, 'color'));
    const supplierText = cellText(cellFor(row, 'supplier'));
    const priceText = cellText(cellFor(row, 'price'));
    const costText = cellText(cellFor(row, 'cost'));
    const stockText = cellText(cellFor(row, 'stock'));

    // Excel siempre deja filas vacías colgando al final de la hoja — se
    // saltan sin quejarse, no son un error del usuario.
    const isEmptyRow =
      !nameText &&
      !referenceText &&
      !categoryText &&
      !colorText &&
      !supplierText &&
      !priceText &&
      !costText &&
      !stockText;
    if (isEmptyRow) continue;

    let hasError = false;

    if (!nameText) {
      errors.push({
        row: rowNumber,
        message: 'El nombre no puede estar vacío',
      });
      hasError = true;
    }

    const categoryMatch = VALID_CATEGORIES.find(
      (c) => normalize(c) === normalize(categoryText),
    );
    if (!categoryMatch) {
      errors.push({
        row: rowNumber,
        message: `Categoría inválida: "${categoryText}". Debe ser una de: ${VALID_CATEGORIES.join(', ')}`,
      });
      hasError = true;
    }

    const price = parseDecimal(priceText);
    if (price === null) {
      errors.push({
        row: rowNumber,
        message: `Precio de venta no numérico: "${priceText}"`,
      });
      hasError = true;
    } else if (price.isNegative()) {
      errors.push({
        row: rowNumber,
        message: 'El precio de venta no puede ser negativo',
      });
      hasError = true;
    }

    const cost = isBlank(costText)
      ? new Prisma.Decimal(0)
      : parseDecimal(costText);
    if (cost === null) {
      errors.push({
        row: rowNumber,
        message: `Costo no numérico: "${costText}"`,
      });
      hasError = true;
    } else if (cost.isNegative()) {
      errors.push({
        row: rowNumber,
        message: 'El costo no puede ser negativo',
      });
      hasError = true;
    }

    const stockDecimal = isBlank(stockText)
      ? new Prisma.Decimal(0)
      : parseDecimal(stockText);
    let stock = 0;
    if (stockDecimal === null) {
      errors.push({
        row: rowNumber,
        message: `Stock no numérico: "${stockText}"`,
      });
      hasError = true;
    } else if (stockDecimal.isNegative()) {
      errors.push({
        row: rowNumber,
        message: 'El stock no puede ser negativo',
      });
      hasError = true;
    } else {
      stock = stockDecimal.toNumber();
    }

    // Una fila sin referencia no tiene con qué emparejar: siempre crea, así
    // que dos filas sin referencia no son "duplicadas" entre sí.
    if (referenceText) {
      const key = `${normalize(referenceText)}|${normalize(colorText)}`;
      const firstRow = seenKeys.get(key);
      if (firstRow) {
        errors.push({
          row: rowNumber,
          message: `La referencia "${referenceText}" con color "${colorText}" ya aparece en la fila ${firstRow}`,
        });
        hasError = true;
      } else {
        seenKeys.set(key, rowNumber);
      }
    }

    if (hasError) continue;

    rows.push({
      row: rowNumber,
      name: nameText,
      category: categoryMatch!,
      price: price!,
      cost: cost!,
      stock,
      reference: referenceText,
      color: colorText,
      supplier: supplierText,
    });
  }

  return { rows, errors };
}
