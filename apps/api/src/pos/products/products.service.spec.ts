import { NotFoundException } from '@nestjs/common';
import { PosProductsService } from './products.service';
import { whereOf } from '../../common/testing/export-test-utils';

function makeService(
  prisma: Record<string, unknown>,
  generate: jest.Mock = jest.fn().mockResolvedValue(Buffer.from('')),
): PosProductsService {
  return new PosProductsService(prisma as never, { generate } as never);
}

describe('PosProductsService — branch scoping', () => {
  const tenantId = 'tenant-1';
  const branchA = 'branch-calle-80';
  const branchB = 'branch-ciudadela';

  describe('findAll', () => {
    it('filtra por tenantId, branchId e isActive, ordenado por categoría y nombre', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = makeService({ posProduct: { findMany } });

      await service.findAll(tenantId, branchA);

      // Es la garantía central de la Task 4: el inventario de una sucursal no
      // se cuela en el de la otra. Si el where no llevara branchId, este test
      // pasaría igual con las dos sucursales mezcladas — por eso comprobamos
      // el objeto completo, no solo que se llamó findMany.
      expect(findMany).toHaveBeenCalledWith({
        where: { tenantId, branchId: branchA, isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
    });

    it('branchId distinto produce un where distinto', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = makeService({ posProduct: { findMany } });

      await service.findAll(tenantId, branchB);

      const [{ where }] = findMany.mock.calls[0] as [
        { where: { branchId: string } },
      ];
      expect(where.branchId).toBe(branchB);
    });
  });

  describe('create', () => {
    it('adjunta tenantId y branchId al crear', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'p1' });
      const service = makeService({ posProduct: { create } });

      await service.create(tenantId, branchA, {
        name: 'Casco',
        category: 'ACCESORIO',
        price: 100,
      } as never);

      expect(create).toHaveBeenCalledWith({
        data: {
          name: 'Casco',
          category: 'ACCESORIO',
          price: 100,
          tenantId,
          branchId: branchA,
        },
      });
    });
  });

  describe('remove', () => {
    it('borra en modo suave: isActive=false, no delete real', async () => {
      const findFirst = jest.fn().mockResolvedValue({ id: 'p1' });
      const update = jest.fn().mockResolvedValue({ id: 'p1', isActive: false });
      const service = makeService({ posProduct: { findFirst, update } });

      await service.remove(tenantId, branchA, 'p1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'p1', tenantId, branchId: branchA },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isActive: false },
      });
    });

    it('rechaza borrar un producto de otra sucursal (404, no encontrado en el where con branchId)', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const update = jest.fn();
      const service = makeService({ posProduct: { findFirst, update } });

      await expect(service.remove(tenantId, branchB, 'p1')).rejects.toThrow(
        NotFoundException,
      );
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe('exportToExcel', () => {
    it('siempre filtra isActive: true, y por branch cuando se pide', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const generate = jest.fn().mockResolvedValue(Buffer.from(''));
      const service = makeService({ posProduct: { findMany } }, generate);

      await service.exportToExcel(tenantId, branchA, { branchId: branchB });

      expect(whereOf(findMany)).toMatchObject({
        tenantId,
        isActive: true,
        branchId: branchB,
      });
    });

    it('la valorización es costo × stock', async () => {
      const findMany = jest.fn().mockResolvedValue([
        {
          reference: 'R1',
          name: 'Casco',
          category: 'ACCESORIO',
          color: '',
          supplier: '',
          price: 100,
          cost: 40,
          stock: 5,
        },
      ]);
      const generate = jest.fn().mockResolvedValue(Buffer.from(''));
      const service = makeService({ posProduct: { findMany } }, generate);

      await service.exportToExcel(tenantId, branchA, {});

      const [args] = generate.mock.calls[0] as [
        {
          columns: { header: string; value: (r: unknown) => unknown }[];
          rows: unknown[];
        },
      ];
      const valuationCol = args.columns.find(
        (c) => c.header === 'Valorización',
      )!;
      expect(valuationCol.value(args.rows[0])).toBe(200);
    });
  });
});
