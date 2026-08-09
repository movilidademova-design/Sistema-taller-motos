import { ConflictException, NotFoundException } from '@nestjs/common';
import { PosListsService } from './lists.service';

function makeService(prisma: Record<string, unknown>): PosListsService {
  return new PosListsService(prisma as never);
}

describe('PosListsService — branch scoping', () => {
  const tenantId = 'tenant-1';
  const branchA = 'branch-calle-80';
  const branchB = 'branch-ciudadela';

  describe('findAll', () => {
    it('filtra por tenantId y branchId; el tipo es opcional', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = makeService({ posList: { findMany } });

      await service.findAll(tenantId, branchA);

      expect(findMany).toHaveBeenCalledWith({
        where: { tenantId, branchId: branchA },
        orderBy: { value: 'asc' },
      });
    });

    it('añade el tipo al where cuando se pasa', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = makeService({ posList: { findMany } });

      await service.findAll(tenantId, branchB, 'proveedores');

      // Confirma que el filtro de sucursal se aplica de verdad: dos
      // sucursales piden el mismo tipo y cada una recibe su propio where.
      expect(findMany).toHaveBeenCalledWith({
        where: { tenantId, branchId: branchB, type: 'proveedores' },
        orderBy: { value: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('devuelve 409 si el valor ya existe para ese tipo y sucursal', async () => {
      const findUnique = jest.fn().mockResolvedValue({ id: 'existing' });
      const create = jest.fn();
      const service = makeService({ posList: { findUnique, create } });

      await expect(
        service.create(tenantId, branchA, { type: 'colores', value: 'Rojo' }),
      ).rejects.toThrow(ConflictException);

      expect(findUnique).toHaveBeenCalledWith({
        where: {
          tenantId_branchId_type_value: {
            tenantId,
            branchId: branchA,
            type: 'colores',
            value: 'Rojo',
          },
        },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('crea el valor scoped a tenant y sucursal cuando no existe', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const create = jest.fn().mockResolvedValue({ id: 'new' });
      const service = makeService({ posList: { findUnique, create } });

      await service.create(tenantId, branchA, {
        type: 'colores',
        value: 'Rojo',
      });

      expect(create).toHaveBeenCalledWith({
        data: { type: 'colores', value: 'Rojo', tenantId, branchId: branchA },
      });
    });
  });

  describe('remove', () => {
    it('no borra un valor que pertenece a otra sucursal', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const del = jest.fn();
      const service = makeService({ posList: { findFirst, delete: del } });

      await expect(service.remove(tenantId, branchB, 'l1')).rejects.toThrow(
        NotFoundException,
      );
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'l1', tenantId, branchId: branchB },
      });
      expect(del).not.toHaveBeenCalled();
    });
  });
});
