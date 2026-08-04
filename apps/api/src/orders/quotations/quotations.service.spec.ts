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
    quotation: { update: jest.fn(), upsert: jest.fn().mockResolvedValue({ id: 'q1' }) },
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
