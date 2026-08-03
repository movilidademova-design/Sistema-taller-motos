import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export type ExcelColumnFormat =
  | 'text'
  | 'date'
  | 'datetime'
  | 'currency'
  | 'number';

interface ExcelColumnBase {
  /** Encabezado visible, en español. */
  header: string;
  key: string;
  width?: number;
}

/**
 * El tipo que devuelve `value` está atado al `format` declarado. Sin esa
 * restricción, declarar `format: 'currency'` y devolver un `Decimal` de Prisma
 * (en vez de `Number(...)`) o una cadena compila sin problema y solo se detecta
 * abriendo el archivo — y entre los reportes de esta fase hay decenas de
 * columnas de dinero y de fecha donde ese descuido es fácil.
 *
 * `null`/`undefined` se aceptan en todos los casos: la mayoría de las columnas
 * mapean campos opcionales de Prisma y exceljs los escribe como celda vacía.
 */
export type ExcelColumn<T> = ExcelColumnBase &
  (
    | { format?: 'text'; value: (row: T) => string | null | undefined }
    | {
        format: 'number' | 'currency';
        value: (row: T) => number | null | undefined;
      }
    | {
        format: 'date' | 'datetime';
        value: (row: T) => Date | null | undefined;
      }
  );

export interface GenerateOptions<T> {
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

/**
 * Tope de filas por reporte.
 *
 * No evita por sí solo un problema de memoria: para cuando `generate` corre, el
 * llamador ya trajo todas las filas de la base de datos. Por eso los servicios
 * que exportan una fila por registro limitan su consulta con
 * `take: MAX_ROWS + 1`, de modo que la consulta se corta temprano y este chequeo
 * convierte ese exceso en un 400 con instrucciones, en vez de intentar armar el
 * libro. Se exporta justamente para que esos servicios usen el mismo número.
 */
export const MAX_ROWS = 50_000;

/** Content-Type de un .xlsx. Es largo y fácil de escribir mal, y lo usan los cinco endpoints que exportan. */
export const EXCEL_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Arma el `Content-Disposition` de una descarga, p. ej. `ordenes-2026-08-03.xlsx`. */
export function excelAttachment(prefix: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `attachment; filename="${prefix}-${today}.xlsx"`;
}

const NUMBER_FORMATS: Record<ExcelColumnFormat, string | undefined> = {
  text: undefined,
  number: '#,##0',
  currency: '#,##0.00',
  date: 'dd/mm/yyyy',
  datetime: 'dd/mm/yyyy hh:mm',
};

/** Genera hojas de cálculo tabulares para los reportes exportables. */
@Injectable()
export class ExcelService {
  async generate<T>({
    sheetName,
    columns,
    rows,
  }: GenerateOptions<T>): Promise<Buffer> {
    if (rows.length > MAX_ROWS) {
      throw new BadRequestException(
        `El reporte tiene ${rows.length.toLocaleString('es-CO')} filas y el máximo es ${MAX_ROWS.toLocaleString('es-CO')}. Acota el rango de fechas e intenta de nuevo.`,
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(sheetName);

    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? Math.max(12, column.header.length + 4),
      style: { numFmt: NUMBER_FORMATS[column.format ?? 'text'] },
    }));

    for (const row of rows) {
      sheet.addRow(
        Object.fromEntries(
          columns.map((column) => [column.key, column.value(row)]),
        ),
      );
    }

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };
    // Deja el encabezado fijo al hacer scroll — un reporte de cientos de filas
    // es ilegible si se pierden los títulos de columna.
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
