import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { PosRole, Role } from '../generated/prisma/enums';

function makeService(prisma: Record<string, unknown>): UsersService {
  return new UsersService(prisma as never);
}

describe('UsersService — role/branch scoping', () => {
  const tenantId = 'tenant-1';
  const adminId = 'admin-1';
  const managerId = 'manager-1';
  const branchA = 'branch-a';
  const branchB = 'branch-b';

  describe('findAll', () => {
    it('returns every tenant user for ADMIN, unfiltered', async () => {
      const findMany = jest.fn().mockResolvedValue([{ id: 'u1' }]);
      const service = makeService({ user: { findMany } });

      await service.findAll(tenantId, adminId, Role.ADMIN);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } }),
      );
    });

    it('filters to users sharing a branch with the MANAGER', async () => {
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValue([{ branchId: branchA }]);
      const findManyUser = jest.fn().mockResolvedValue([]);
      const service = makeService({
        userBranch: { findMany: findManyUserBranch },
        user: { findMany: findManyUser },
      });

      await service.findAll(tenantId, managerId, Role.MANAGER);

      expect(findManyUserBranch).toHaveBeenCalledWith({
        where: { userId: managerId },
        select: { branchId: true },
      });
      expect(findManyUser).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId,
            branches: { some: { branchId: { in: [branchA] } } },
          },
        }),
      );
    });
  });

  describe('create', () => {
    it('rejects a MANAGER trying to create an ADMIN', async () => {
      const service = makeService({});
      await expect(
        service.create(tenantId, managerId, Role.MANAGER, {
          role: Role.ADMIN,
        } as never),
      ).rejects.toThrow(ForbiddenException);
    });

    it("auto-assigns the new user to the MANAGER's own branches, ignoring any branchIds in the dto", async () => {
      const findUnique = jest.fn().mockResolvedValue(null); // no email conflict
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValue([{ branchId: branchA }]);
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ id: 'new-user' }) },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({
        user: { findUnique },
        userBranch: { findMany: findManyUserBranch },
        $transaction,
      });

      await service.create(tenantId, managerId, Role.MANAGER, {
        email: 'a@b.com',
        password: 'password123',
        firstName: 'A',
        lastName: 'B',
        role: Role.RECEPTIONIST,
        branchIds: [branchB], // deliberately a DIFFERENT branch — must be ignored
      });

      expect(tx.userBranch.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'new-user', branchId: branchA }],
      });
    });

    it('requires branchIds from an ADMIN creating a non-ADMIN user', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = makeService({ user: { findUnique } });

      await expect(
        service.create(tenantId, adminId, Role.ADMIN, {
          email: 'a@b.com',
          password: 'password123',
          firstName: 'A',
          lastName: 'B',
          role: Role.RECEPTIONIST,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('does not crash on the raw password field (regression: Unknown argument `password`)', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const tx = {
        user: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            expect(data).not.toHaveProperty('password');
            expect(data).toHaveProperty('passwordHash');
            return { id: 'new-admin' };
          }),
        },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({ user: { findUnique }, $transaction });

      await service.create(tenantId, adminId, Role.ADMIN, {
        email: 'a@b.com',
        password: 'password123',
        firstName: 'A',
        lastName: 'B',
        role: Role.ADMIN,
      });
    });
  });

  describe('update / remove — MANAGER scope', () => {
    it('404s (not 403s) when a MANAGER targets an ADMIN user, hiding its existence', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'target', role: Role.ADMIN });
      const service = makeService({ user: { findFirst } });

      await expect(
        service.update(tenantId, managerId, Role.MANAGER, 'target', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('404s when the target does not share a branch with the MANAGER', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'target', role: Role.RECEPTIONIST });
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValueOnce([{ branchId: branchA }]) // manager's branches
        .mockResolvedValueOnce([{ branchId: branchB }]); // target's branches — no overlap
      const service = makeService({
        user: { findFirst },
        userBranch: { findMany: findManyUserBranch },
      });

      await expect(
        service.update(tenantId, managerId, Role.MANAGER, 'target', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a MANAGER trying to escalate a shared-branch user to ADMIN', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'target', role: Role.RECEPTIONIST });
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValueOnce([{ branchId: branchA }])
        .mockResolvedValueOnce([{ branchId: branchA }]);
      const service = makeService({
        user: { findFirst },
        userBranch: { findMany: findManyUserBranch },
      });

      await expect(
        service.update(tenantId, managerId, Role.MANAGER, 'target', {
          role: Role.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a MANAGER to update/deactivate a shared-branch, non-ADMIN user', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'target', role: Role.RECEPTIONIST });
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValueOnce([{ branchId: branchA }])
        .mockResolvedValueOnce([{ branchId: branchA }]);
      const update = jest
        .fn()
        .mockResolvedValue({ id: 'target', isActive: false });
      const service = makeService({
        user: { findFirst, update },
        userBranch: { findMany: findManyUserBranch },
      });

      await service.remove(tenantId, managerId, Role.MANAGER, 'target');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'target' },
          data: { isActive: false },
        }),
      );
    });
  });

  describe('acceso por sistema', () => {
    const baseDto = {
      email: 'nuevo@taller.com',
      password: 'password123',
      firstName: 'Nuevo',
      lastName: 'Usuario',
    };

    it('rechaza crear un usuario sin acceso a ningún sistema', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const service = makeService({ user: { findUnique } });

      await expect(
        service.create(tenantId, adminId, Role.ADMIN, {
          ...baseDto,
          branchIds: [branchA],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite crear un usuario que solo entra al POS', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const findManyBranch = jest.fn().mockResolvedValue([{ id: branchA }]);
      const tx = {
        user: {
          create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
            expect(data.role).toBeUndefined();
            expect(data.posRole).toBe(PosRole.CASHIER);
            return { id: 'cajero-1' };
          }),
        },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({
        user: { findUnique },
        branch: { findMany: findManyBranch },
        $transaction,
      });

      await service.create(tenantId, adminId, Role.ADMIN, {
        ...baseDto,
        posRole: PosRole.CASHIER,
        branchIds: [branchA],
      });

      // Un cajero no es administrador de ningún lado, así que necesita sucursal.
      expect(tx.userBranch.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'cajero-1', branchId: branchA }],
      });
    });

    it('no exige sucursales a un administrador del POS', async () => {
      const findUnique = jest.fn().mockResolvedValue(null);
      const tx = {
        user: { create: jest.fn().mockResolvedValue({ id: 'pos-admin' }) },
        userBranch: { createMany: jest.fn() },
      };
      const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(tx));
      const service = makeService({ user: { findUnique }, $transaction });

      await service.create(tenantId, adminId, Role.ADMIN, {
        ...baseDto,
        posRole: PosRole.ADMIN,
      });

      expect(tx.userBranch.createMany).not.toHaveBeenCalled();
    });

    it('rechaza que un GERENTE otorgue el rol de administrador del POS', async () => {
      const service = makeService({});
      await expect(
        service.create(tenantId, managerId, Role.MANAGER, {
          ...baseDto,
          posRole: PosRole.ADMIN,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza que una edición deje al usuario sin ningún sistema', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'target',
        role: Role.TECHNICIAN,
        posRole: null,
      });
      const service = makeService({ user: { findFirst } });

      await expect(
        service.update(tenantId, adminId, Role.ADMIN, 'target', { role: null }),
      ).rejects.toThrow(BadRequestException);
    });

    it('permite quitar el rol de taller si conserva el del POS', async () => {
      const findFirst = jest.fn().mockResolvedValue({
        id: 'target',
        role: Role.TECHNICIAN,
        posRole: PosRole.CASHIER,
      });
      const update = jest.fn().mockResolvedValue({ id: 'target' });
      const service = makeService({ user: { findFirst, update } });

      await service.update(tenantId, adminId, Role.ADMIN, 'target', {
        role: null,
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: null } }),
      );
    });

    it('muestra todas las sucursales a un administrador del POS sin rol de taller', async () => {
      const findManyBranch = jest.fn().mockResolvedValue([{ id: branchA }]);
      const service = makeService({ branch: { findMany: findManyBranch } });

      await service.findMyBranches(tenantId, 'pos-admin', null, PosRole.ADMIN);

      expect(findManyBranch).toHaveBeenCalledWith({
        where: { tenantId, isActive: true },
        orderBy: { name: 'asc' },
      });
    });

    it('limita a un cajero a las sucursales que tiene asignadas', async () => {
      const findManyUserBranch = jest
        .fn()
        .mockResolvedValue([{ branch: { id: branchA } }]);
      const service = makeService({
        userBranch: { findMany: findManyUserBranch },
      });

      const result = await service.findMyBranches(
        tenantId,
        'cajero-1',
        null,
        PosRole.CASHIER,
      );

      expect(result).toEqual([{ id: branchA }]);
    });
  });
});
