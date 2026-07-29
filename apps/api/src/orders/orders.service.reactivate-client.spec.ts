import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Prisma } from '../generated/prisma/client';

// createOrReactivateClient is private and has no PrismaService/RealtimeGateway/etc.
// dependency of its own — it only operates on the `tx` (transaction client) passed
// in as an argument — so the service's other constructor dependencies are unused
// stubs here.
function makeService() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new OrdersService({} as any, {} as any, {} as any, {} as any, {} as any);
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

describe('OrdersService.createOrReactivateClient', () => {
  const tenantId = 'tenant-1';
  const branchId = 'branch-a';
  const otherBranchId = 'branch-b';
  const newClient = {
    documentId: '12345',
    firstName: 'Nuevo',
    lastName: 'Cliente',
  };

  it('reactivates a same-branch inactive client in place', async () => {
    const inactiveClient = { id: 'client-1', branchId, isActive: false };
    const updated = { ...inactiveClient, ...newClient, isActive: true };
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(inactiveClient),
        update: jest.fn().mockResolvedValue(updated),
        create: jest.fn(),
      },
    };

    const service = makeService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (service as any).createOrReactivateClient(tx, tenantId, branchId, newClient);

    expect(result).toBe(updated);
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { ...newClient, isActive: true },
    });
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it('rejects reactivating a different branch\'s inactive client instead of cross-linking it', async () => {
    const inactiveClient = { id: 'client-1', branchId: otherBranchId, isActive: false };
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(inactiveClient),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    const service = makeService();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).createOrReactivateClient(tx, tenantId, branchId, newClient),
    ).rejects.toThrow(ConflictException);
    expect(tx.client.update).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it('creates a new client when none exists', async () => {
    const created = { id: 'client-new', branchId, ...newClient };
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(null), // no inactive match
        update: jest.fn(),
        create: jest.fn().mockResolvedValue(created),
      },
    };

    const service = makeService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (service as any).createOrReactivateClient(tx, tenantId, branchId, newClient);

    expect(result).toBe(created);
    expect(tx.client.create).toHaveBeenCalledWith({
      data: { tenantId, branchId, ...newClient },
    });
  });

  it('reuses the existing client on a same-branch P2002 race', async () => {
    const raceWinner = { id: 'client-race', branchId, ...newClient };
    const tx = {
      client: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null) // no inactive match up front
          .mockResolvedValueOnce(raceWinner), // found after the create() conflict
        update: jest.fn(),
        create: jest.fn().mockRejectedValue(p2002()),
      },
    };

    const service = makeService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (service as any).createOrReactivateClient(tx, tenantId, branchId, newClient);

    expect(result).toBe(raceWinner);
  });

  it('rejects a cross-branch P2002 conflict instead of silently attaching a foreign client', async () => {
    const foreignClient = { id: 'client-foreign', branchId: otherBranchId, ...newClient };
    const tx = {
      client: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(foreignClient),
        update: jest.fn(),
        create: jest.fn().mockRejectedValue(p2002()),
      },
    };

    const service = makeService();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).createOrReactivateClient(tx, tenantId, branchId, newClient),
    ).rejects.toThrow(ConflictException);
  });

  it('rethrows a non-P2002 error from create unchanged', async () => {
    const boom = new Error('database is on fire');
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn().mockRejectedValue(boom),
      },
    };

    const service = makeService();
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service as any).createOrReactivateClient(tx, tenantId, branchId, newClient),
    ).rejects.toBe(boom);
  });
});
