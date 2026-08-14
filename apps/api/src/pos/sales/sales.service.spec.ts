import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PosSalesService } from './sales.service';
import { PosSaleStatus } from '../../generated/pos/enums';
import { Prisma } from '../../generated/pos/client';
import type { CreateSaleDto } from './dto/sale.dto';
import { whereOf } from '../../common/testing/export-test-utils';

const tenantId = 'tenant-1';
const branchId = 'branch-calle-80';
const userId = 'user-cajero';

/** Un `tx` de mentira que registra lo que el servicio intentó hacer. */
function makeTx() {
  return {
    posSale: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    posProduct: {
      findFirst: jest.fn(),
      update: jest.fn(),
      // El descuento de stock es condicional (`where: { stock: { gte } }`) para
      // que la comprobación y la resta ocurran en la misma operación. `count`
      // es lo que distingue "descontado" de "otra caja se llevó las unidades".
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    // Bloqueo consultivo que serializa la asignación de número de factura.
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
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
    posSale: { findMany },
  };
  const excel = { generate };
  const service = new PosSalesService(prisma as never, excel as never);
  return { service, tx, findMany, generate };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'Casco MT',
    price: new Prisma.Decimal(100),
    cost: new Prisma.Decimal(60),
    reference: 'REF1',
    color: 'Negro',
    supplier: 'ACME',
    stock: 10,
    ...overrides,
  };
}

describe('PosSalesService.create', () => {
  it('descuenta stock de los ítems con productId, no de los sueltos', async () => {
    const tx = makeTx();
    tx.posProduct.findFirst.mockResolvedValue(makeProduct({ stock: 10 }));
    tx.posSale.create.mockResolvedValue({ id: 'sale-1' });
    const { service } = makeService(tx);

    const dto: CreateSaleDto = {
      clientName: 'Juan Pérez',
      items: [
        { productId: 'prod-1', quantity: 2 },
        { name: 'Mano de obra', unitPrice: 50, quantity: 1 },
      ],
      payments: [{ method: 'efectivo', amount: 250 }],
    };

    await service.create(tenantId, branchId, userId, dto);

    expect(tx.posProduct.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.posProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
  });

  it('aborta la venta si el stock desapareció entre la validación y el descuento', async () => {
    const tx = makeTx();
    tx.posProduct.findFirst.mockResolvedValue(makeProduct({ stock: 10 }));
    tx.posSale.create.mockResolvedValue({ id: 'sale-1' });
    // Otra caja se llevó las unidades: la actualización condicional no
    // encuentra fila que cumpla `stock >= 2` y no toca nada.
    tx.posProduct.updateMany.mockResolvedValue({ count: 0 });
    const { service } = makeService(tx);

    const dto: CreateSaleDto = {
      clientName: 'Juan Pérez',
      items: [{ productId: 'prod-1', quantity: 2 }],
      payments: [{ method: 'efectivo', amount: 200 }],
    };

    await expect(
      service.create(tenantId, branchId, userId, dto),
    ).rejects.toThrow(BadRequestException);
  });

  it('toma el bloqueo por sucursal antes de leer los números de factura usados', async () => {
    const tx = makeTx();
    tx.posProduct.findFirst.mockResolvedValue(makeProduct({ stock: 10 }));
    tx.posSale.create.mockResolvedValue({ id: 'sale-1' });
    const { service } = makeService(tx);

    await service.create(tenantId, branchId, userId, {
      clientName: 'Juan Pérez',
      items: [{ productId: 'prod-1', quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 100 }],
    });

    // Sin el bloqueo, dos ventas simultáneas eligen el mismo número y la
    // segunda muere con violación de unicidad.
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      `${tenantId}:${branchId}`,
      'pos:invoice',
    );
    const lockOrder = tx.$executeRawUnsafe.mock.invocationCallOrder[0];
    const readOrder = tx.posSale.findMany.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(readOrder);
  });

  it('reutiliza el primer hueco libre de número de factura (4 y 6 usados, piso 3 -> 5)', async () => {
    const tx = makeTx();
    tx.posSale.findMany.mockResolvedValue([
      { invoiceNumber: 4 },
      { invoiceNumber: 6 },
    ]);
    tx.posSale.create.mockResolvedValue({ id: 'sale-1' });
    const { service } = makeService(tx);

    const dto: CreateSaleDto = {
      clientName: 'Juan Pérez',
      items: [{ name: 'Mano de obra', unitPrice: 100, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 100 }],
    };

    await service.create(tenantId, branchId, userId, dto);

    const [createArgs] = tx.posSale.create.mock.calls[0] as [
      { data: { invoiceNumber: number } },
    ];
    expect(createArgs.data.invoiceNumber).toBe(5);
  });

  it('la consulta de números usados filtra por branchId (numeración por sucursal)', async () => {
    const tx = makeTx();
    tx.posSale.create.mockResolvedValue({ id: 'sale-1' });
    const { service } = makeService(tx);

    const dto: CreateSaleDto = {
      clientName: 'Juan Pérez',
      items: [{ name: 'Mano de obra', unitPrice: 100, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 100 }],
    };

    await service.create(tenantId, branchId, userId, dto);

    const [findManyArgs] = tx.posSale.findMany.mock.calls[0] as [
      { where: { tenantId: string; branchId: string } },
    ];
    expect(findManyArgs.where).toEqual(
      expect.objectContaining({ tenantId, branchId }),
    );
  });

  it('pago dividido válido crea una fila por método', async () => {
    const tx = makeTx();
    tx.posSale.create.mockResolvedValue({ id: 'sale-1' });
    const { service } = makeService(tx);

    const dto: CreateSaleDto = {
      clientName: 'Juan Pérez',
      items: [{ name: 'Mano de obra', unitPrice: 100, quantity: 1 }],
      payments: [
        { method: 'efectivo', amount: 60 },
        { method: 'tarjeta', amount: 40 },
      ],
    };

    await service.create(tenantId, branchId, userId, dto);

    const [createArgs] = tx.posSale.create.mock.calls[0] as [
      {
        data: {
          paymentMethod: string;
          payments: { create: { method: string; amount: Prisma.Decimal }[] };
        };
      },
    ];
    const payments = createArgs.data.payments.create.map((p) => ({
      method: p.method,
      amount: p.amount.toFixed(2),
    }));
    expect(payments).toEqual([
      { method: 'efectivo', amount: '60.00' },
      { method: 'tarjeta', amount: '40.00' },
    ]);
    expect(createArgs.data.paymentMethod).toBe('dividido');
  });

  it('rechaza un pago dividido que no cuadra con el total', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    const dto: CreateSaleDto = {
      clientName: 'Juan Pérez',
      items: [{ name: 'Mano de obra', unitPrice: 100, quantity: 1 }],
      payments: [
        { method: 'efectivo', amount: 60 },
        { method: 'tarjeta', amount: 30 },
      ],
    };

    await expect(
      service.create(tenantId, branchId, userId, dto),
    ).rejects.toThrow(BadRequestException);
    expect(tx.posSale.create).not.toHaveBeenCalled();
  });

  it('rechaza vender más unidades que el stock disponible', async () => {
    const tx = makeTx();
    tx.posProduct.findFirst.mockResolvedValue(makeProduct({ stock: 10 }));
    const { service } = makeService(tx);

    const dto: CreateSaleDto = {
      clientName: 'Juan Pérez',
      items: [{ productId: 'prod-1', quantity: 20 }],
      payments: [{ method: 'efectivo', amount: 2000 }],
    };

    await expect(
      service.create(tenantId, branchId, userId, dto),
    ).rejects.toThrow(BadRequestException);
    expect(tx.posSale.create).not.toHaveBeenCalled();
  });
});

describe('PosSalesService.void', () => {
  it('deja la venta VOIDED, libera el número de factura y devuelve stock', async () => {
    const tx = makeTx();
    tx.posSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      status: PosSaleStatus.ACTIVE,
      items: [
        { productId: 'prod-1', quantity: 3 },
        { productId: null, quantity: 1 },
      ],
    });
    const { service } = makeService(tx);

    await service.void(tenantId, branchId, 'sale-1');

    expect(tx.posSale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale-1' },
        // Nested expect.objectContaining() inside an object literal loses its type here.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: expect.objectContaining({
          status: PosSaleStatus.VOIDED,
          invoiceNumber: null,
        }),
      }),
    );
    // Desviación deliberada de app.py: aquí anular sí devuelve stock.
    expect(tx.posProduct.update).toHaveBeenCalledTimes(1);
    expect(tx.posProduct.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stock: { increment: 3 } },
    });
  });

  it('rechaza anular una venta ya anulada', async () => {
    const tx = makeTx();
    tx.posSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      status: PosSaleStatus.VOIDED,
      items: [],
    });
    const { service } = makeService(tx);

    await expect(service.void(tenantId, branchId, 'sale-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.posSale.update).not.toHaveBeenCalled();
  });

  it('rechaza anular una venta que no existe', async () => {
    const tx = makeTx();
    tx.posSale.findFirst.mockResolvedValue(null);
    const { service } = makeService(tx);

    await expect(service.void(tenantId, branchId, 'nope')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PosSalesService.creditNote', () => {
  it('deja la venta CREDIT_NOTE, conserva el número de factura y devuelve stock', async () => {
    const tx = makeTx();
    tx.posSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      status: PosSaleStatus.ACTIVE,
      invoiceNumber: 7,
      items: [{ productId: 'prod-1', quantity: 2 }],
    });
    const { service } = makeService(tx);

    await service.creditNote(tenantId, branchId, 'sale-1');

    const [updateArgs] = tx.posSale.update.mock.calls[0] as [
      { data: { status: PosSaleStatus; invoiceNumber?: number | null } },
    ];
    expect(updateArgs.data.status).toBe(PosSaleStatus.CREDIT_NOTE);
    expect(updateArgs.data.invoiceNumber).toBeUndefined();
    expect(tx.posProduct.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: { stock: { increment: 2 } },
    });
  });

  it('rechaza nota crédito sobre una venta anulada', async () => {
    const tx = makeTx();
    tx.posSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      status: PosSaleStatus.VOIDED,
      items: [],
    });
    const { service } = makeService(tx);

    await expect(
      service.creditNote(tenantId, branchId, 'sale-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rechaza nota crédito sobre una que ya es nota crédito', async () => {
    const tx = makeTx();
    tx.posSale.findFirst.mockResolvedValue({
      id: 'sale-1',
      status: PosSaleStatus.CREDIT_NOTE,
      items: [],
    });
    const { service } = makeService(tx);

    await expect(
      service.creditNote(tenantId, branchId, 'sale-1'),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PosSalesService.exportToExcel', () => {
  it('una fila por ítem, no por venta', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 's1',
        soldAt: new Date('2026-04-01'),
        invoiceNumber: 1,
        status: PosSaleStatus.ACTIVE,
        clientName: 'Cliente',
        clientDoc: '',
        paymentMethod: 'efectivo',
        total: new Prisma.Decimal(500),
        items: [
          {
            name: 'A',
            reference: '',
            quantity: 1,
            unitPrice: new Prisma.Decimal(200),
            lineTotal: new Prisma.Decimal(200),
            engineNumber: null,
            chassisNumber: null,
          },
          {
            name: 'B',
            reference: '',
            quantity: 1,
            unitPrice: new Prisma.Decimal(300),
            lineTotal: new Prisma.Decimal(300),
            engineNumber: null,
            chassisNumber: null,
          },
        ],
      },
    ]);
    const generate = jest.fn().mockResolvedValue(Buffer.from(''));
    const { service } = makeService(makeTx(), { findMany, generate });

    await service.exportToExcel(tenantId, branchId, {});

    expect(generate).toHaveBeenCalled();
    const [args] = generate.mock.calls[0] as [{ rows: unknown[] }];
    expect(args.rows).toHaveLength(2);
  });

  it('sin branchId explícito, ADMIN exporta todas las sucursales del tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService(makeTx(), { findMany });

    await service.exportToExcel(tenantId, branchId, {});

    expect(whereOf(findMany)).not.toHaveProperty('branchId');
  });

  it('con branchId explícito, filtra por esa sucursal', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const { service } = makeService(makeTx(), { findMany });

    await service.exportToExcel(tenantId, branchId, {
      branchId: 'branch-otra',
    });

    expect(whereOf(findMany).branchId).toBe('branch-otra');
  });
});
