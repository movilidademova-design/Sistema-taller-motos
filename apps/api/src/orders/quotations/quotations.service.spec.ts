import { BadRequestException } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import {
  OrderStatus,
  QuotationItemType,
  QuotationStatus,
} from '../../generated/prisma/enums';

const ORDER = {
  id: 'order-1',
  orderNumber: '00010001',
  status: OrderStatus.WAITING_APPROVAL,
};

/** Un `tx` de mentira que registra lo que el servicio intentó hacer. */
function makeTx() {
  return {
    quotation: {
      update: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 'q1' }),
    },
    quotationStatusHistory: { create: jest.fn() },
    quotationItem: { deleteMany: jest.fn(), createMany: jest.fn() },
    product: { findUnique: jest.fn(), update: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    order: { update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
  };
}

function makeService(quotation: unknown, tx = makeTx()) {
  const service = new QuotationsService(
    {
      quotation: {
        findUnique: jest.fn().mockResolvedValue(quotation),
      },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    } as never,
    {
      assertOrderExists: jest.fn().mockResolvedValue(ORDER),
    } as never,
  );
  // findOne se llama al final de cada mutación; devuelve lo mismo que ya tenemos.
  jest.spyOn(service, 'findOne').mockResolvedValue(quotation as never);
  return { service, tx };
}

const partItem = {
  type: QuotationItemType.PART,
  productId: 'prod-1',
  quantity: 2,
};

describe('QuotationsService.changeStatus', () => {
  it('records the change with who made it and where it came from', async () => {
    const { service, tx } = makeService({
      id: 'q1',
      status: QuotationStatus.SENT,
      items: [],
    });

    await service.changeStatus('t1', 'order-1', 'user-9', {
      status: QuotationStatus.REJECTED,
      notes: 'El cliente no autorizó',
    });

    expect(tx.quotationStatusHistory.create).toHaveBeenCalledWith({
      data: {
        quotationId: 'q1',
        fromStatus: QuotationStatus.SENT,
        toStatus: QuotationStatus.REJECTED,
        changedById: 'user-9',
        notes: 'El cliente no autorizó',
      },
    });
  });

  it('refuses a transition that is not allowed', async () => {
    // Aprobar sin haberla enviado saltaría la revisión y el envío al cliente.
    const { service, tx } = makeService({
      id: 'q1',
      status: QuotationStatus.PENDING_REVIEW,
      items: [],
    });

    await expect(
      service.changeStatus('t1', 'order-1', 'user-9', {
        status: QuotationStatus.APPROVED,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.quotation.update).not.toHaveBeenCalled();
  });

  it('takes the parts out of inventory when approved', async () => {
    const tx = makeTx();
    tx.product.findUnique.mockResolvedValue({ id: 'prod-1', quantity: 10 });
    const { service } = makeService(
      { id: 'q1', status: QuotationStatus.SENT, items: [partItem] },
      tx,
    );

    await service.changeStatus('t1', 'order-1', 'user-9', {
      status: QuotationStatus.APPROVED,
    });

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { quantity: { decrement: 2 } },
    });
    expect(tx.inventoryMovement.create).toHaveBeenCalled();
  });

  it('leaves inventory alone when rejected', async () => {
    // El diagnóstico ya no descuenta stock, así que rechazar no tiene nada que
    // devolver: los repuestos nunca salieron.
    const tx = makeTx();
    const { service } = makeService(
      { id: 'q1', status: QuotationStatus.SENT, items: [partItem] },
      tx,
    );

    await service.changeStatus('t1', 'order-1', 'user-9', {
      status: QuotationStatus.REJECTED,
    });

    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('moves the order forward once the client approves', async () => {
    const tx = makeTx();
    tx.product.findUnique.mockResolvedValue({ id: 'prod-1', quantity: 10 });
    const { service } = makeService(
      { id: 'q1', status: QuotationStatus.SENT, items: [partItem] },
      tx,
    );

    await service.changeStatus('t1', 'order-1', 'user-9', {
      status: QuotationStatus.APPROVED,
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: OrderStatus.IN_REPAIR },
    });
  });

  it('waits on parts when there is not enough stock', async () => {
    const tx = makeTx();
    tx.product.findUnique.mockResolvedValue({ id: 'prod-1', quantity: 1 });
    const { service } = makeService(
      { id: 'q1', status: QuotationStatus.SENT, items: [partItem] },
      tx,
    );

    await service.changeStatus('t1', 'order-1', 'user-9', {
      status: QuotationStatus.APPROVED,
    });

    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: OrderStatus.WAITING_PARTS },
    });
  });
});

describe('QuotationsService.createFromDiagnosis', () => {
  const parts = [
    {
      productId: 'prod-1',
      description: 'Farola',
      quantity: 1,
      unitCost: 140000 as never,
    },
  ];

  it('does not overwrite a quotation the client has already seen', async () => {
    // Tras enviarla, el técnico puede seguir tocando el diagnóstico; eso no
    // debe reescribir lo que el cliente ya tiene en la mano.
    const tx = makeTx();
    const { service } = makeService(
      { id: 'q1', status: QuotationStatus.SENT, items: [] },
      tx,
    );

    await service.createFromDiagnosis('t1', 'order-1', 'tech-1', parts);

    expect(tx.quotation.upsert).not.toHaveBeenCalled();
    expect(tx.quotationItem.createMany).not.toHaveBeenCalled();
  });

  it('replaces the items while it is still under review', async () => {
    const tx = makeTx();
    const { service } = makeService(
      { id: 'q1', status: QuotationStatus.PENDING_REVIEW, items: [] },
      tx,
    );

    await service.createFromDiagnosis('t1', 'order-1', 'tech-1', parts);

    expect(tx.quotationItem.deleteMany).toHaveBeenCalled();
    expect(tx.quotationItem.createMany).toHaveBeenCalled();
  });
});

function makeListService(findManyResult: unknown[] = []) {
  const findMany = jest.fn().mockResolvedValue(findManyResult);
  const service = new QuotationsService(
    { quotation: { findMany } } as never,
    {} as never,
  );
  return { service, findMany };
}

function listRow(id: string, status: QuotationStatus, updatedAt: string) {
  return {
    id,
    status,
    total: 100,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    pdfUrl: null,
    _count: { items: 2 },
    order: {
      id: `order-${id}`,
      orderNumber: '0001',
      client: { firstName: 'Ana', lastName: 'Perez' },
      motorcycle: { brand: 'Yamaha', model: 'XTZ' },
    },
  };
}

describe('QuotationsService.findAllForBranch', () => {
  it('scopes the query to the tenant and the active branch through the order', async () => {
    const { service, findMany } = makeListService([]);

    await service.findAllForBranch('t1', 'branch-1');

    const [args] = findMany.mock.calls[0] as [{ where: { order: unknown } }];
    expect(args.where.order).toEqual({ tenantId: 't1', branchId: 'branch-1' });
  });

  it('adds the status filter when one is given', async () => {
    const { service, findMany } = makeListService([]);

    await service.findAllForBranch('t1', 'branch-1', QuotationStatus.SENT);

    const [args] = findMany.mock.calls[0] as [
      { where: { status?: QuotationStatus } },
    ];
    expect(args.where.status).toBe(QuotationStatus.SENT);
  });

  it('omits the status filter when none is given', async () => {
    const { service, findMany } = makeListService([]);

    await service.findAllForBranch('t1', 'branch-1');

    const [args] = findMany.mock.calls[0] as [{ where: object }];
    expect(args.where).not.toHaveProperty('status');
  });

  it('sorts PENDING_REVIEW ahead of everything else, then by updatedAt desc', async () => {
    // "older-sent" y "newer-sent" no están por revisar, así que van después de
    // "pending" aunque sean más recientes.
    const rows = [
      listRow('older-sent', QuotationStatus.SENT, '2026-08-01T00:00:00Z'),
      listRow('newer-sent', QuotationStatus.SENT, '2026-08-03T00:00:00Z'),
      listRow(
        'pending',
        QuotationStatus.PENDING_REVIEW,
        '2026-07-01T00:00:00Z',
      ),
    ];
    const { service } = makeListService(rows);

    const result = await service.findAllForBranch('t1', 'branch-1');

    expect(result.map((r) => r.id)).toEqual([
      'pending',
      'newer-sent',
      'older-sent',
    ]);
  });

  it('flattens the item count and order details into each row', async () => {
    const { service } = makeListService([
      listRow('q1', QuotationStatus.PENDING_REVIEW, '2026-08-01T00:00:00Z'),
    ]);

    const [row] = await service.findAllForBranch('t1', 'branch-1');

    expect(row.itemCount).toBe(2);
    expect(row.order).toEqual({
      id: 'order-q1',
      orderNumber: '0001',
      client: { firstName: 'Ana', lastName: 'Perez' },
      motorcycle: { brand: 'Yamaha', model: 'XTZ' },
    });
  });
});

describe('QuotationsService.pendingCount', () => {
  it('counts only PENDING_REVIEW quotations, scoped to the tenant and branch', async () => {
    const count = jest.fn().mockResolvedValue(3);
    const service = new QuotationsService(
      { quotation: { count } } as never,
      {} as never,
    );

    const result = await service.pendingCount('t1', 'branch-1');

    expect(result).toEqual({ count: 3 });
    const [args] = count.mock.calls[0] as [
      { where: { order: unknown; status: QuotationStatus } },
    ];
    expect(args.where).toEqual({
      order: { tenantId: 't1', branchId: 'branch-1' },
      status: QuotationStatus.PENDING_REVIEW,
    });
  });
});

describe('QuotationsService.upsert — no se reescribe una cotización ya decidida', () => {
  /**
   * Regresión de un bug encontrado en la auditoría del 2026-08-13.
   *
   * `upsert` era el único de los tres caminos que modifican una cotización que
   * NO comprobaba `EDITABLE_STATUSES` (`syncFromDiagnosis` y `generatePdf` sí).
   * Se podían cambiar los importes de una cotización ya APROBADA y la API
   * respondía 200, dejando `status=APPROVED` con `approvedAt=null` — un estado
   * imposible — y el inventario, ya descontado al aprobar, contando otra cosa.
   */
  const dto = {
    items: [
      {
        type: QuotationItemType.OTHER,
        description: 'Mano de obra',
        quantity: 1,
        unitPrice: 100000,
      },
    ],
    discount: 0,
    taxRate: 19,
  };

  it.each([
    QuotationStatus.SENT,
    QuotationStatus.APPROVED,
    QuotationStatus.REJECTED,
  ])('rechaza modificar una cotización en estado %s', async (status) => {
    const { service, tx } = makeService({ id: 'q1', status });

    await expect(service.upsert('t1', 'order-1', dto as never)).rejects.toThrow(
      BadRequestException,
    );
    // Y no debe haber tocado nada.
    expect(tx.quotation.upsert).not.toHaveBeenCalled();
    expect(tx.quotationItem.deleteMany).not.toHaveBeenCalled();
  });

  it.each([
    QuotationStatus.DRAFT,
    QuotationStatus.PENDING_REVIEW,
    QuotationStatus.READY_TO_SEND,
    QuotationStatus.PARTIALLY_APPROVED,
  ])('permite modificar una cotización en estado %s', async (status) => {
    const { service, tx } = makeService({ id: 'q1', status });

    await service.upsert('t1', 'order-1', dto);

    expect(tx.quotation.upsert).toHaveBeenCalled();
  });

  it('permite crear la primera cotización cuando no existe ninguna', async () => {
    const { service, tx } = makeService(null);

    await service.upsert('t1', 'order-1', dto);

    expect(tx.quotation.upsert).toHaveBeenCalled();
  });
});
