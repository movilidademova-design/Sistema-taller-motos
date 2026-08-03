import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';

export type ExcelColumnFormat =
  | 'text'
  | 'date'
  | 'datetime'
  | 'currency'
  | 'number';

export interface ExcelColumn<T> {
  /** Encabezado visible, en español. */
  header: string;
  key: string;
  width?: number;
  format?: ExcelColumnFormat;
  value: (row: T) => unknown;
}

export interface GenerateOptions<T> {
  sheetName: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

/**
 * exceljs arma el libro completo en memoria antes de devolver el Buffer, así que
 * un export sin tope podría tumbar el proceso. Con el volumen real de un taller
 * (miles de filas al año) nunca se llega a este número; el tope existe para que
 * un rango de fechas mal elegido devuelva un error claro en vez de un crash.
 */
const MAX_ROWS = 50_000;

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
