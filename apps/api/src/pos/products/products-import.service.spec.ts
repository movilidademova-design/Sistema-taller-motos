import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { PosProductsService } from './products.service';

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

async function buildSheet(
  rows: (string | number | null | undefined)[][],
  headers: string[] = STANDARD_HEADERS,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventario');
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Un `tx`/`prisma` de mentira: mismo objeto sirve para ambos porque
 * previewImport usa `this.prisma` directo y applyImport lo hace dentro de
 * `$transaction`, cuyo callback recibe este mismo doble. */
function makeService(
  existing: { id: string; reference: string; color: string }[] = [],
) {
  const findMany = jest.fn().mockResolvedValue(existing);
  const create = jest
    .fn()
    .mockImplementation(({ data }) =>
      Promise.resolve({ id: 'new-id', ...data }),
    );
  const update = jest
    .fn()
    .mockImplementation(({ data }) =>
      Promise.resolve({ id: 'existing-id', ...data }),
    );
  const posProduct = { findMany, create, update };
  const prisma = {
    posProduct,
    $transaction: jest.fn(
      (cb: (tx: { posProduct: typeof posProduct }) => unknown) =>
        cb({ posProduct }),
    ),
  };
  const service = new PosProductsService(
    prisma as never,
    { generate: jest.fn() } as never,
  );
  return { service, posProduct, prisma };
}

const tenantId = 'tenant-1';
const branchA = 'branch-calle-80';
const branchB = 'branch-ciudadela';

describe('PosProductsService — importación de inventario', () => {
  describe('previewImport', () => {
    it('no escribe nada: solo cuenta cuántos crearía y cuántos actualizaría', async () => {
      const { service, posProduct } = makeService([
        { id: 'p1', reference: 'EB-11U', color: 'Negro' },
      ]);
      const buffer = await buildSheet([
        ['EB-11U', 'Apolo Negro', 'MOTO', 'Negro', 'Prov', 1000000, 500000, 5],
        ['EB-12X', 'Casco', 'ACCESORIO', 'Rojo', 'Prov', 50000, 20000, 3],
      ]);

      const result = await service.previewImport(tenantId, branchA, buffer);

      expect(result).toMatchObject({ toCreate: 1, toUpdate: 1, errors: [] });
      expect(posProduct.create).not.toHaveBeenCalled();
      expect(posProduct.update).not.toHaveBeenCalled();
    });

    it('reporta errores sin lanzar, para que la pantalla los muestre', async () => {
      const { service } = makeService();
      const buffer = await buildSheet([
        ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'Prov', 'no-numero', 0, 3],
      ]);

      const result = await service.previewImport(tenantId, branchA, buffer);

      expect(result.errors).toHaveLength(1);
      expect(result.toCreate).toBe(0);
      expect(result.toUpdate).toBe(0);
    });

    it('respeta el branchId: solo empareja contra los productos de esa sucursal', async () => {
      const { service, posProduct } = makeService([
        { id: 'p1', reference: 'EB-11U', color: 'Negro' },
      ]);
      const buffer = await buildSheet([
        ['EB-11U', 'Apolo Negro', 'MOTO', 'Negro', 'Prov', 1000000, 500000, 5],
      ]);

      await service.previewImport(tenantId, branchB, buffer);

      expect(posProduct.findMany).toHaveBeenCalledWith({
        where: { tenantId, branchId: branchB, isActive: true },
        select: { id: true, reference: true, color: true },
      });
    });
  });

  describe('applyImport', () => {
    it('empareja por referencia+color normalizados (espacios y mayúsculas no importan)', async () => {
      const { service, posProduct } = makeService([
        { id: 'existing-id', reference: 'EB-11U', color: 'Negro' },
      ]);
      const buffer = await buildSheet([
        [
          'eb-11u ',
          'Apolo Negro',
          'MOTO',
          ' NEGRO',
          'Prov',
          1000000,
          500000,
          7,
        ],
      ]);

      const result = await service.applyImport(tenantId, branchA, buffer);

      expect(result).toEqual({ created: 0, updated: 1 });
      expect(posProduct.update).toHaveBeenCalledWith({
        where: { id: 'existing-id' },
        // Nested expect.objectContaining() inside an object literal loses its type here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ stock: 7 }),
      });
      expect(posProduct.create).not.toHaveBeenCalled();
    });

    it('una fila sin referencia siempre crea, nunca actualiza', async () => {
      const { service, posProduct } = makeService([
        { id: 'existing-id', reference: '', color: '' },
      ]);
      const buffer = await buildSheet([
        ['', 'Producto suelto', 'ACCESORIO', '', 'Prov', 10000, 0, 1],
      ]);

      const result = await service.applyImport(tenantId, branchA, buffer);

      expect(result).toEqual({ created: 1, updated: 0 });
      expect(posProduct.create).toHaveBeenCalledTimes(1);
      expect(posProduct.update).not.toHaveBeenCalled();
    });

    it('un archivo con errores no escribe nada: se rechaza entero con 400', async () => {
      const { service, posProduct, prisma } = makeService();
      const buffer = await buildSheet([
        ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'Prov', 'no-numero', 0, 3],
      ]);

      await expect(
        service.applyImport(tenantId, branchA, buffer),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(posProduct.create).not.toHaveBeenCalled();
      expect(posProduct.update).not.toHaveBeenCalled();
    });

    it('respeta el branchId al buscar con qué emparejar', async () => {
      const { service, posProduct } = makeService([]);
      const buffer = await buildSheet([
        ['R1', 'Casco', 'ACCESORIO', 'Rojo', 'Prov', 50000, 20000, 3],
      ]);

      await service.applyImport(tenantId, branchB, buffer);

      expect(posProduct.findMany).toHaveBeenCalledWith({
        where: { tenantId, branchId: branchB, isActive: true },
        select: { id: true, reference: true, color: true },
      });
      expect(posProduct.create).toHaveBeenCalledWith({
        // Nested expect.objectContaining() inside an object literal loses its type here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ tenantId, branchId: branchB }),
      });
    });

    it('el stock del archivo reemplaza al del sistema, no se suma', async () => {
      const { service, posProduct } = makeService([
        { id: 'existing-id', reference: 'R1', color: '' },
      ]);
      const buffer = await buildSheet([
        ['R1', 'Casco', 'ACCESORIO', '', 'Prov', 50000, 20000, 2],
      ]);

      await service.applyImport(tenantId, branchA, buffer);

      expect(posProduct.update).toHaveBeenCalledWith({
        where: { id: 'existing-id' },
        // Nested expect.objectContaining() inside an object literal loses its type here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({ stock: 2 }),
      });
    });
  });
});
