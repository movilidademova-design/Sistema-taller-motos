import { NotFoundException } from '@nestjs/common';
import { PosProductsService } from './products.service';

function makeService(prisma: Record<string, unknown>): PosProductsService {
  return new PosProductsService(prisma as never);
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
});
