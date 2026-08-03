/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { OrdersService } from './orders.service';
import { Prisma } from '../generated/prisma/client';

// createOrReactivateClient is private and has no PrismaService/RealtimeGateway/etc.
// dependency of its own — it only operates on the `tx` (transaction client) passed
// in as an argument — so the service's other constructor dependencies are unused
// stubs here. Calling a private method through the PrivateOrdersService cast below
// is exactly what no-unsafe-call/-assignment exist to flag — disabled file-wide
// rather than suppressed line-by-line, since that's the whole point of this file.
type PrivateOrdersService = OrdersService & {
  createOrReactivateClient: (
    tx: unknown,
    tenantId: string,
    branchId: string,
    newClient: { documentId: string; firstName: string; lastName: string },
  ) => Promise<{ id: string; branchId: string }>;
};

function makeService(): PrivateOrdersService {
  return new OrdersService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  ) as PrivateOrdersService;
}

function p2002() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

// documentId is unique per tenant, not per branch — a client is the same person
// no matter which branch registered them, so createOrReactivateClient reuses their
// existing record regardless of which branch it lives in (see the comment on the
// method itself, and clients.service.ts's findAll/findByDocumentId).
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
    const result = await service.createOrReactivateClient(
      tx,
      tenantId,
      branchId,
      newClient,
    );

    expect(result).toBe(updated);
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { ...newClient, isActive: true },
    });
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it("reactivates a different branch's inactive client too", async () => {
    const inactiveClient = {
      id: 'client-1',
      branchId: otherBranchId,
      isActive: false,
    };
    const updated = { ...inactiveClient, ...newClient, isActive: true };
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(inactiveClient),
        update: jest.fn().mockResolvedValue(updated),
        create: jest.fn(),
      },
    };

    const service = makeService();
    const result = await service.createOrReactivateClient(
      tx,
      tenantId,
      branchId,
      newClient,
    );

    expect(result).toBe(updated);
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { ...newClient, isActive: true },
    });
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
    const result = await service.createOrReactivateClient(
      tx,
      tenantId,
      branchId,
      newClient,
    );

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
    const result = await service.createOrReactivateClient(
      tx,
      tenantId,
      branchId,
      newClient,
    );

    expect(result).toBe(raceWinner);
  });

  it('reuses the existing client on a cross-branch P2002 conflict too', async () => {
    const foreignClient = {
      id: 'client-foreign',
      branchId: otherBranchId,
      ...newClient,
    };
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
    const result = await service.createOrReactivateClient(
      tx,
      tenantId,
      branchId,
      newClient,
    );

    expect(result).toBe(foreignClient);
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
      service.createOrReactivateClient(tx, tenantId, branchId, newClient),
    ).rejects.toBe(boom);
  });
});
