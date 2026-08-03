import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ExcelService } from './excel.service';

describe('ExcelService', () => {
  const service = new ExcelService();

  interface Row {
    name: string;
    amount: number;
    when: Date;
  }

  const columns = [
    { header: 'Nombre', key: 'name', value: (r: Row) => r.name },
    {
      header: 'Monto',
      key: 'amount',
      format: 'currency' as const,
      value: (r: Row) => r.amount,
    },
    {
      header: 'Fecha',
      key: 'when',
      format: 'date' as const,
      value: (r: Row) => r.when,
    },
  ];

  async function readBack(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb;
  }

  it('writes a header row and one row per record', async () => {
    const rows: Row[] = [
      { name: 'Ana', amount: 1500.5, when: new Date('2026-07-15T10:00:00Z') },
      { name: 'Beto', amount: 320, when: new Date('2026-07-16T10:00:00Z') },
    ];

    const buffer = await service.generate({
      sheetName: 'Prueba',
      columns,
      rows,
    });
    const sheet = (await readBack(buffer)).getWorksheet('Prueba');

    expect(sheet).toBeDefined();
    expect(sheet!.rowCount).toBe(3); // encabezado + 2 filas
    expect(sheet!.getRow(1).getCell(1).value).toBe('Nombre');
    expect(sheet!.getRow(1).getCell(2).value).toBe('Monto');
    expect(sheet!.getRow(2).getCell(1).value).toBe('Ana');
    expect(sheet!.getRow(2).getCell(2).value).toBe(1500.5);
  });

  it('applies a currency number format so Excel shows it as money, not text', async () => {
    const buffer = await service.generate({
      sheetName: 'Prueba',
      columns,
      rows: [{ name: 'Ana', amount: 10, when: new Date() }],
    });
    const sheet = (await readBack(buffer)).getWorksheet('Prueba');

    expect(sheet!.getColumn(2).numFmt).toBe('#,##0.00');
    expect(sheet!.getColumn(3).numFmt).toBe('dd/mm/yyyy');
  });

  it('freezes the header row so it stays visible while scrolling', async () => {
    const buffer = await service.generate({
      sheetName: 'Prueba',
      columns,
      rows: [{ name: 'Ana', amount: 10, when: new Date() }],
    });
    const sheet = (await readBack(buffer)).getWorksheet('Prueba');

    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
  });

  it('still produces a valid file with a header when there are no rows', async () => {
    const buffer = await service.generate({
      sheetName: 'Vacio',
      columns,
      rows: [],
    });
    const sheet = (await readBack(buffer)).getWorksheet('Vacio');

    expect(sheet!.rowCount).toBe(1);
    expect(sheet!.getRow(1).getCell(1).value).toBe('Nombre');
  });

  it('rejects exports above the row cap instead of exhausting memory', async () => {
    const rows = Array.from({ length: 50_001 }, () => ({
      name: 'x',
      amount: 1,
      when: new Date(),
    }));

    await expect(
      service.generate({ sheetName: 'Grande', columns, rows }),
    ).rejects.toThrow(BadRequestException);
  });
});
