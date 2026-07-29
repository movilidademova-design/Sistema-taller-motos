/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment */
import { ConflictException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Prisma } from '../generated/prisma/client';
import type { IntakeOrderDto } from './dto/intake-order.dto';

// createOrReactivateClient is private and has no PrismaService/RealtimeGateway/etc.
// dependency of its own — it only operates on the `tx` (transaction client) passed
// in as an argument — so the service's other constructor dependencies are unused
// stubs here, except where a specific test needs one (e.g. `prisma`/`storage` for
// the intake() pre-upload check below). Calling a private method through the
// PrivateOrdersService cast below is exactly what no-unsafe-call/-assignment exist
// to flag — disabled file-wide rather than suppressed line-by-line, since that's
// the whole point of this file.
type PrivateOrdersService = OrdersService & {
  createOrReactivateClient: (
    tx: unknown,
    tenantId: string,
    branchId: string,
    newClient: { documentId: string; firstName: string; lastName: string },
  ) => Promise<{ id: string; branchId: string }>;
};

function makeService(overrides?: {
  prisma?: unknown;
  storage?: unknown;
}): PrivateOrdersService {
  return new OrdersService(
    (overrides?.prisma ?? {}) as never,
    {} as never,
    {} as never,
    {} as never,
    (overrides?.storage ?? {}) as never,
  ) as PrivateOrdersService;
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

  it("rejects reactivating a different branch's inactive client instead of cross-linking it", async () => {
    const inactiveClient = {
      id: 'client-1',
      branchId: otherBranchId,
      isActive: false,
    };
    const tx = {
      client: {
        findFirst: jest.fn().mockResolvedValue(inactiveClient),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    const service = makeService();
    await expect(
      service.createOrReactivateClient(tx, tenantId, branchId, newClient),
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

  it('rejects a cross-branch P2002 conflict instead of silently attaching a foreign client', async () => {
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
    await expect(
      service.createOrReactivateClient(tx, tenantId, branchId, newClient),
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
      service.createOrReactivateClient(tx, tenantId, branchId, newClient),
    ).rejects.toBe(boom);
  });
});

describe('OrdersService.intake — pre-upload cross-branch newClient check', () => {
  const tenantId = 'tenant-1';
  const branchId = 'branch-a';
  const otherBranchId = 'branch-b';

  function makeFile(name: string): Express.Multer.File {
    return {
      originalname: name,
      buffer: Buffer.from(''),
      mimetype: 'image/png',
    } as Express.Multer.File;
  }

  it('rejects before uploading anything when newClient documentId conflicts with a different branch', async () => {
    const conflicting = { id: 'client-foreign', branchId: otherBranchId };
    const prisma = {
      client: {
        findFirst: jest.fn().mockResolvedValue(conflicting),
      },
    };
    const upload = jest.fn();
    const service = makeService({ prisma, storage: { upload } });

    const dto: Partial<IntakeOrderDto> = {
      newClient: {
        documentId: '999',
        firstName: 'A',
        lastName: 'B',
      },
      newMotorcycle: {
        vehicleType: 'MOTO',
        brand: 'X',
        model: 'Y',
      },
      description: 'test',
    };

    await expect(
      service.intake(
        tenantId,
        branchId,
        'receptionist-1',
        dto as IntakeOrderDto,
        {
          signature: [makeFile('sig.png')],
          photos: [makeFile('p1.png'), makeFile('p2.png')],
        },
      ),
    ).rejects.toThrow(ConflictException);

    // This is the fix: no file should ever reach storage for a conflict caught
    // by the pre-upload check.
    expect(upload).not.toHaveBeenCalled();
  });
});
