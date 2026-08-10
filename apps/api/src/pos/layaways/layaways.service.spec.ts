import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PosLayawaysService } from './layaways.service';
import { PosLayawayStatus } from '../../generated/pos/enums';
import { Prisma } from '../../generated/pos/client';
import type { CreateLayawayDto, AddLayawayPaymentDto } from './dto/layaway.dto';
import { whereOf } from '../../common/testing/export-test-utils';

const tenantId = 'tenant-1';
const branchId = 'branch-calle-80';
const userId = 'user-cajero';

/** Un `tx` de mentira que registra lo que el servicio intentó hacer. */
function makeTx() {
  return {
    posLayaway: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    posLayawayItem: {
      // Por omisión el ítem sí pertenece al separado (count 1); las pruebas
      // que comprueban el caso ajeno lo sobrescriben con count 0.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    posLayawayPayment: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    posProduct: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    posSale: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    },
  };
}
type Tx = ReturnType<typeof makeTx>;

function makeService(
  tx: Tx = makeTx(),
  overrides: { findMany?: jest.Mock; generate?: jest.Mock } = {},
) {
  const findMany = overrides.findMany ?? jest.fn().mockResolvedValue([]);
  const generate =
    overrides.generate ?? jest.fn().mockResolvedValue(Buffer.from(''));
  const prisma = {
    $transaction: jest.fn((cb: (t: Tx) => unknown) => cb(tx)),
    posLayaway: { findMany },
  };
  const excel = { generate };
  const service = new PosLayawaysService(prisma as never, excel as never);
  return { service, tx, findMany, generate };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'Moto XR',
    price: new Prisma.Decimal(500),
    cost: new Prisma.Decimal(300),
    reference: 'REF1',
    color: 'Roja',
    supplier: 'ACME',
    stock: 10,
    ...overrides,
  };
}

function makeActiveLayaway(overrides: Record<string, unknown> = {}) {
  return {
    id: 'layaway-1',
    tenantId,
    branchId,
    clientName: 'Juan Pérez',
    clientDoc: '',
    clientPhone: '',
    total: new Prisma.Decimal(1000),
    generalDiscount: new Prisma.Decimal(0),
    paid: new Prisma.Decimal(400),
    balance: new Prisma.Decimal(600),
    status: PosLayawayStatus.ACTIVE,
    createdById: 'user-creador',
    ...overrides,
  };
}

describe('PosLayawaysService.create', () => {
  it('descuenta stock de los ítems con producto', async () => {
    const tx = makeTx();
    tx.posProduct.findFirst.mockResolvedValue(makeProduct({ stock: 10 }));
    tx.posLayaway.create.mockResolvedValue({ id: 'layaway-1' });
    const { service } = makeService(tx);

    const dto: CreateLayawayDto = {
      clientName: 'Juan Pérez',
      items: [{ productId: 'prod-1', quantity: 2 }],
      payment: { method: 'efectivo', amount: 300 },
    };

    await service.create(tenantId, branchId, userId, dto);

    expect(tx.posProduct.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stock: { decrement: 2 } },
    });
  });

  it('un abono que cubre el total completo se rechaza (use una venta normal)', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    const dto: CreateLayawayDto = {
      clientName: 'Juan Pérez',
      items: [{ name: 'Servicio suelto', unitPrice: 1000, quantity: 1 }],
      payment: { method: 'efectivo', amount: 1000 },
    };

    await expect(
      service.create(tenantId, branchId, userId, dto),
    ).rejects.toThrow(BadRequestException);
    expect(tx.posLayaway.create).not.toHaveBeenCalled();
  });

  it('un abono que supera el total (no solo lo cubre) también se rechaza', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    const dto: CreateLayawayDto = {
      clientName: 'Juan Pérez',
      items: [{ name: 'Servicio suelto', unitPrice: 1000, quantity: 1 }],
      payment: { method: 'efectivo', amount: 1500 },
    };

    await expect(
      service.create(tenantId, branchId, userId, dto),
    ).rejects.toThrow(BadRequestException);
  });

  it('el abono inicial se guarda con un recibo numerado y el saldo correcto', async () => {
    const tx = makeTx();
    tx.posLayaway.create.mockResolvedValue({ id: 'layaway-1' });
    const { service } = makeService(tx);

    const dto: CreateLayawayDto = {
      clientName: 'Juan Pérez',
      items: [{ name: 'Servicio suelto', unitPrice: 1000, quantity: 1 }],
      payment: { method: 'efectivo', amount: 300 },
    };

    await service.create(tenantId, branchId, userId, dto);

    const [createArgs] = tx.posLayaway.create.mock.calls[0] as [
      {
        data: {
          balance: Prisma.Decimal;
          payments: {
            create: { amount: Prisma.Decimal; receiptNumber: number };
          };
        };
      },
    ];
    expect(createArgs.data.balance.toFixed(2)).toBe('700.00');
    expect(createArgs.data.payments.create.receiptNumber).toBe(1);
    expect(createArgs.data.payments.create.amount.toFixed(2)).toBe('300.00');
  });
});

describe('PosLayawaysService.addPayment', () => {
  it('rechaza abonar a un separado que no existe o no está activo', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(null);
    const { service } = makeService(tx);

    const dto: AddLayawayPaymentDto = { method: 'efectivo', amount: 100 };

    await expect(
      service.addPayment(tenantId, branchId, userId, 'layaway-1', dto),
    ).rejects.toThrow(NotFoundException);
  });

  it('un abono mayor que el saldo se recorta al saldo, no lo excede', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    tx.posLayaway.findUniqueOrThrow.mockResolvedValue({
      ...makeActiveLayaway(),
      items: [],
      payments: [{ method: 'efectivo', amount: new Prisma.Decimal(1000) }],
    });
    tx.posSale.create.mockResolvedValue({
      id: 'sale-1',
      items: [],
      payments: [],
    });
    const { service } = makeService(tx);

    // Saldo pendiente es 600; se pide abonar 900.
    const dto: AddLayawayPaymentDto = { method: 'efectivo', amount: 900 };
    await service.addPayment(tenantId, branchId, userId, 'layaway-1', dto);

    const [createArgs] = tx.posLayawayPayment.create.mock.calls[0] as [
      { data: { amount: Prisma.Decimal } },
    ];
    expect(createArgs.data.amount.toFixed(2)).toBe('600.00');
  });

  it('el saldo llegando a cero crea la venta y deja el separado COMPLETED con su saleId', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    tx.posLayaway.findUniqueOrThrow.mockResolvedValue({
      ...makeActiveLayaway(),
      items: [{ productId: 'prod-1', name: 'Moto XR', quantity: 2 }],
      payments: [{ method: 'efectivo', amount: new Prisma.Decimal(1000) }],
    });
    tx.posSale.create.mockResolvedValue({
      id: 'sale-99',
      items: [],
      payments: [],
    });
    const { service } = makeService(tx);

    // Saldo pendiente exacto de 600.
    const dto: AddLayawayPaymentDto = { method: 'efectivo', amount: 600 };
    const result = await service.addPayment(
      tenantId,
      branchId,
      userId,
      'layaway-1',
      dto,
    );

    expect(tx.posSale.create).toHaveBeenCalledTimes(1);
    expect(tx.posLayaway.update).toHaveBeenCalledWith({
      where: { id: 'layaway-1' },
      data: { status: PosLayawayStatus.COMPLETED, saleId: 'sale-99' },
    });
    expect(result.sale).toEqual(expect.objectContaining({ id: 'sale-99' }));
  });

  // El id del ítem llega del cuerpo de la petición. Sin atarlo al separado que
  // se está pagando, un cajero podía escribir motor y chasis sobre el ítem de
  // cualquier separado —de otra sucursal o de otra empresa— pagando uno propio.
  // Y esos dos campos acaban estampados en la factura al completarse.
  it('el motor y chasis solo se escriben en ítems del separado que se está pagando', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    tx.posLayaway.findUniqueOrThrow.mockResolvedValue({
      ...makeActiveLayaway(),
      items: [],
      payments: [{ method: 'efectivo', amount: new Prisma.Decimal(1000) }],
    });
    tx.posSale.create.mockResolvedValue({
      id: 'sale-99',
      items: [],
      payments: [],
    });
    const { service } = makeService(tx);

    await service.addPayment(tenantId, branchId, userId, 'layaway-1', {
      method: 'efectivo',
      amount: 600,
      items: [
        { layawayItemId: 'item-1', engineNumber: 'M-1', chassisNumber: 'C-1' },
      ],
    });

    expect(tx.posLayawayItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', layawayId: 'layaway-1' },
      data: { engineNumber: 'M-1', chassisNumber: 'C-1' },
    });
  });

  it('un ítem de otro separado se rechaza en vez de escribirse', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    // El where con layawayId no encuentra nada: el ítem es de otro separado.
    tx.posLayawayItem.updateMany.mockResolvedValue({ count: 0 });
    const { service } = makeService(tx);

    await expect(
      service.addPayment(tenantId, branchId, userId, 'layaway-1', {
        method: 'efectivo',
        amount: 600,
        items: [
          {
            layawayItemId: 'item-de-otra-empresa',
            engineNumber: 'FALSO',
            chassisNumber: 'FALSO',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    // Y la venta no llega a crearse: la transacción entera se deshace.
    expect(tx.posSale.create).not.toHaveBeenCalled();
  });

  it('al completarse NO se vuelve a descontar stock (ya se descontó al crear el separado)', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    tx.posLayaway.findUniqueOrThrow.mockResolvedValue({
      ...makeActiveLayaway(),
      items: [{ productId: 'prod-1', name: 'Moto XR', quantity: 2 }],
      payments: [{ method: 'efectivo', amount: new Prisma.Decimal(1000) }],
    });
    tx.posSale.create.mockResolvedValue({
      id: 'sale-99',
      items: [],
      payments: [],
    });
    const { service } = makeService(tx);

    const dto: AddLayawayPaymentDto = { method: 'efectivo', amount: 600 };
    await service.addPayment(tenantId, branchId, userId, 'layaway-1', dto);

    // La prueba más importante de esta fase: completar un separado no debe
    // tocar posProduct.update para nada — ni una sola vez.
    expect(tx.posProduct.update).not.toHaveBeenCalled();
  });

  it('agrupa los abonos por método: uno solo se conserva tal cual', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    tx.posLayaway.findUniqueOrThrow.mockResolvedValue({
      ...makeActiveLayaway(),
      items: [],
      payments: [{ method: 'efectivo', amount: new Prisma.Decimal(1000) }],
    });
    tx.posSale.create.mockResolvedValue({
      id: 'sale-1',
      items: [],
      payments: [],
    });
    const { service } = makeService(tx);

    await service.addPayment(tenantId, branchId, userId, 'layaway-1', {
      method: 'efectivo',
      amount: 600,
    });

    const [createArgs] = tx.posSale.create.mock.calls[0] as [
      { data: { paymentMethod: string } },
    ];
    expect(createArgs.data.paymentMethod).toBe('efectivo');
  });

  it('agrupa los abonos por método: dos o más métodos dan "dividido"', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    tx.posLayaway.findUniqueOrThrow.mockResolvedValue({
      ...makeActiveLayaway(),
      items: [],
      payments: [
        { method: 'efectivo', amount: new Prisma.Decimal(400) },
        { method: 'tarjeta', amount: new Prisma.Decimal(600) },
      ],
    });
    tx.posSale.create.mockResolvedValue({
      id: 'sale-1',
      items: [],
      payments: [],
    });
    const { service } = makeService(tx);

    await service.addPayment(tenantId, branchId, userId, 'layaway-1', {
      method: 'tarjeta',
      amount: 600,
    });

    const [createArgs] = tx.posSale.create.mock.calls[0] as [
      {
        data: {
          paymentMethod: string;
          payments: { create: { method: string; amount: Prisma.Decimal }[] };
        };
      },
    ];
    expect(createArgs.data.paymentMethod).toBe('dividido');
    const rows = createArgs.data.payments.create.map((p) => ({
      method: p.method,
      amount: p.amount.toFixed(2),
    }));
    expect(rows).toEqual(
      expect.arrayContaining([
        { method: 'efectivo', amount: '400.00' },
        { method: 'tarjeta', amount: '600.00' },
      ]),
    );
  });

  it('los números de recibo reutilizan huecos, por sucursal', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(makeActiveLayaway());
    tx.posLayawayPayment.findMany.mockResolvedValue([
      { receiptNumber: 1 },
      { receiptNumber: 2 },
    ]);
    const { service } = makeService(tx);

    await service.addPayment(tenantId, branchId, userId, 'layaway-1', {
      method: 'efectivo',
      amount: 100,
    });

    const [createArgs] = tx.posLayawayPayment.create.mock.calls[0] as [
      { data: { receiptNumber: number } },
    ];
    expect(createArgs.data.receiptNumber).toBe(3);
    const [findManyArgs] = tx.posLayawayPayment.findMany.mock.calls[0] as [
      { where: { layaway: { tenantId: string; branchId: string } } },
    ];
    expect(findManyArgs.where.layaway).toEqual({ tenantId, branchId });
  });
});

describe('PosLayawaysService.cancel', () => {
  it('devuelve el stock, deja CANCELLED y libera todos los números de recibo', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue({
      ...makeActiveLayaway(),
      items: [
        { productId: 'prod-1', quantity: 3 },
        { productId: null, quantity: 1 },
      ],
    });
    tx.posLayaway.findUniqueOrThrow.mockResolvedValue({
      ...makeActiveLayaway(),
      status: PosLayawayStatus.CANCELLED,
    });
    const { service } = makeService(tx);

    await service.cancel(tenantId, branchId, 'layaway-1');

    expect(tx.posProduct.update).toHaveBeenCalledTimes(1);
    expect(tx.posProduct.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stock: { increment: 3 } },
    });
    expect(tx.posLayaway.update).toHaveBeenCalledWith({
      where: { id: 'layaway-1' },
      data: { status: PosLayawayStatus.CANCELLED },
    });
    expect(tx.posLayawayPayment.updateMany).toHaveBeenCalledWith({
      where: { layawayId: 'layaway-1' },
      data: { receiptNumber: null },
    });
  });

  it('rechaza cancelar un separado que no existe o ya no está activo', async () => {
    const tx = makeTx();
    tx.posLayaway.findFirst.mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(
      service.cancel(tenantId, branchId, 'layaway-1'),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('PosLayawaysService.exportToExcel', () => {
  it('una fila por separado, con el número de abonos y el último', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        createdAt: new Date('2026-04-01'),
        clientName: 'Ana',
        clientDoc: '',
        clientPhone: '',
        total: new Prisma.Decimal(1000),
        paid: new Prisma.Decimal(400),
        balance: new Prisma.Decimal(600),
        status: PosLayawayStatus.ACTIVE,
        payments: [
          { paidAt: new Date('2026-04-01') },
          { paidAt: new Date('2026-04-10') },
        ],
      },
    ]);
    const generate = jest.fn().mockResolvedValue(Buffer.from(''));
    const { service } = makeService(makeTx(), { findMany, generate });

    await service.exportToExcel(tenantId, branchId, {});

    const [args] = generate.mock.calls[0] as [
      {
        columns: { header: string; value: (r: unknown) => unknown }[];
        rows: unknown[];
      },
    ];
    const countCol = args.columns.find((c) => c.header === 'Número de abonos')!;
    expect(countCol.value(args.rows[0])).toBe(2);
    const lastCol = args.columns.find((c) => c.header === 'Último abono')!;
    expect(lastCol.value(args.rows[0])).toEqual(new Date('2026-04-10'));
  });

  it('sin branchId explícito exporta todas las sucursales; con branchId, filtra', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService(makeTx(), { findMany });

    await service.exportToExcel(tenantId, branchId, {
      branchId: 'branch-otra',
    });

    expect(whereOf(findMany).branchId).toBe('branch-otra');
  });
});
