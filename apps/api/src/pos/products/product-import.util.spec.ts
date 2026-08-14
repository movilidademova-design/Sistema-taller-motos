import { BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { parseProductImportSheet } from './product-import.util';

const STANDARD_HEADERS = [
  'Referencia',
  'Nombre',
  'Categoría',
  'Color',
  'Proveedor',
  'Precio venta',
  'Costo',
  'Stock',
];

/** Arma un .xlsx en memoria, igual al que produce exportToExcel, para
 * probar el analizador sin tocar disco. */
async function buildSheet(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventario');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('parseProductImportSheet', () => {
  it('una hoja bien formada devuelve las filas con sus tipos correctos', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      [
        'EB-11U',
        'Apolo Negro Plomo',
        'MOTO',
        'Negro',
        'Proveedor X',
        1500000,
        900000,
        5,
      ],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      row: 2,
      name: 'Apolo Negro Plomo',
      category: 'MOTO',
      reference: 'EB-11U',
      color: 'Negro',
      supplier: 'Proveedor X',
      stock: 5,
    });
    expect(rows[0].price.toString()).toBe('1500000');
    expect(rows[0].cost.toString()).toBe('900000');
  });

  it('reconoce los encabezados sin distinguir mayúsculas ni tildes', async () => {
    const buffer = await buildSheet(
      [
        'referencia',
        'NOMBRE',
        'categoria',
        'Color',
        'proveedor',
        'PRECIO VENTA',
        'Costo',
        'stock',
      ],
      [['R1', 'Casco', 'ACCESORIO', 'Rojo', 'ACME', 50000, 20000, 3]],
    );

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Casco');
  });

  it('falta una columna obligatoria -> error que la nombra', async () => {
    const headers = STANDARD_HEADERS.filter((h) => h !== 'Costo');
    const buffer = await buildSheet(headers, [
      ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'ACME', 50000, 3],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Costo');
  });

  it('precio no numérico -> error con el número de fila del Excel', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'ACME', 'no-es-un-precio', 0, 3],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(rows).toEqual([]);
    expect(errors).toEqual([
      expect.objectContaining({
        row: 2,
        // Nested expect.stringContaining() inside an object literal loses its type here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        message: expect.stringContaining('Precio'),
      }),
    ]);
  });

  it('categoría inexistente -> error que lista las válidas, y acepta minúsculas', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      ['R1', 'Casco', 'INVENTADA', 'Rojo', 'ACME', 50000, 0, 3],
      ['R2', 'Casco 2', 'accesorio', 'Azul', 'ACME', 50000, 0, 3],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
    expect(errors[0].message).toContain('MOTO');
    expect(errors[0].message).toContain('ACCESORIO');
    expect(errors[0].message).toContain('REPUESTO');
    expect(errors[0].message).toContain('TALLER');
    // La fila 3, en minúsculas, sí es válida.
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('ACCESORIO');
  });

  it('nombre vacío -> error', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      ['R1', '', 'ACCESORIO', 'Rojo', 'ACME', 50000, 0, 3],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(rows).toEqual([]);
    expect(errors[0].message).toContain('nombre');
  });

  it('precio o stock negativo -> error', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'ACME', -50000, 0, 3],
      ['R2', 'Guante', 'ACCESORIO', 'Rojo', 'ACME', 50000, 0, -1],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(rows).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[0].row).toBe(2);
    expect(errors[1].row).toBe(3);
  });

  it('ignora la columna Valorización, calculada en la exportación', async () => {
    const headers = [...STANDARD_HEADERS, 'Valorización'];
    const buffer = await buildSheet(headers, [
      ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'ACME', 50000, 20000, 3, 60000],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('filas totalmente vacías se saltan sin quejarse', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'ACME', 50000, 20000, 3],
      [null, null, null, null, null, null, null, null],
      ['R2', 'Guante', 'ACCESORIO', 'Rojo', 'ACME', 30000, 10000, 2],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    // La fila vacía no corre la numeración de las siguientes: sigue siendo
    // el número real de fila del Excel.
    expect(rows[1].row).toBe(4);
  });

  it('dos filas con la misma referencia y color en el mismo archivo -> error', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      [
        'EB-11U',
        'Apolo Negro',
        'MOTO',
        'Negro',
        'Proveedor X',
        1500000,
        900000,
        5,
      ],
      [
        'eb-11u ',
        'Apolo Negro (duplicada)',
        'MOTO',
        ' negro',
        'Proveedor X',
        1500000,
        900000,
        2,
      ],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(3);
    expect(errors[0].message).toContain('fila 2');
    // La primera fila sí es válida; la segunda, al tener error, no entra en rows.
    expect(rows).toHaveLength(1);
    expect(rows[0].reference).toBe('EB-11U');
  });

  it('dos filas sin referencia no se consideran duplicadas entre sí', async () => {
    const buffer = await buildSheet(STANDARD_HEADERS, [
      ['', 'Producto suelto A', 'ACCESORIO', '', '', 10000, 0, 1],
      ['', 'Producto suelto B', 'ACCESORIO', '', '', 12000, 0, 1],
    ]);

    const { rows, errors } = await parseProductImportSheet(buffer);

    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
  });
});

describe('parseProductImportSheet — archivos que no son Excel', () => {
  /**
   * Regresión: un fichero que no es un .xlsx hacía reventar a ExcelJS con un
   * error suyo, que salía al usuario como 500 «Error interno del servidor».
   * Quien sube un .csv por error merece que se lo digan, no un fallo de servidor.
   */
  it('devuelve 400 con explicación, no un error de servidor', async () => {
    await expect(
      parseProductImportSheet(
        Buffer.from('esto no es un excel, es texto plano'),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('el mensaje dice qué hacer', async () => {
    await expect(
      parseProductImportSheet(Buffer.from('a,b,c\n1,2,3')),
    ).rejects.toThrow(/no se pudo leer como Excel/i);
  });

  it('un archivo vacío tampoco revienta con 500', async () => {
    await expect(parseProductImportSheet(Buffer.alloc(0))).rejects.toThrow(
      BadRequestException,
    );
  });
});
