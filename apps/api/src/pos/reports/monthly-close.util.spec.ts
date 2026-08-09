import {
  buildMonthlyCloseWorkbook,
  MonthlyCloseInput,
  MonthlyCloseSale,
} from './monthly-close.util';

function baseSale(overrides: Partial<MonthlyCloseSale> = {}): MonthlyCloseSale {
  return {
    id: 'sale-1',
    invoiceNumber: 100,
    soldAt: new Date('2026-04-11T15:00:00.000Z'),
    clientName: 'Cliente Uno',
    total: 1000,
    status: 'ACTIVE',
    createdById: 'user-1',
    items: [{ reference: 'REF1', engineNumber: null, chassisNumber: null }],
    payments: [{ method: 'efectivo', amount: 1000 }],
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<MonthlyCloseInput> = {},
): MonthlyCloseInput {
  return {
    month: '2026-04',
    sales: [],
    abonos: [],
    completedLayaways: new Map(),
    creditNotesInPeriod: [],
    cashFromSales: 0,
    cashFromActiveLayawayPayments: 0,
    products: [],
    sellerNames: new Map([['user-1', 'Joseph Beltrán']]),
    ...overrides,
  };
}

function informe(wb: ReturnType<typeof buildMonthlyCloseWorkbook>) {
  return wb.getWorksheet('INFORME')!;
}
function gastos(wb: ReturnType<typeof buildMonthlyCloseWorkbook>) {
  return wb.getWorksheet('GASTOS')!;
}
function inventario(wb: ReturnType<typeof buildMonthlyCloseWorkbook>) {
  return wb.getWorksheet('INVENTARIO')!;
}

describe('buildMonthlyCloseWorkbook — hojas y encabezados', () => {
  it('crea exactamente INFORME, GASTOS e INVENTARIO en ese orden', () => {
    const wb = buildMonthlyCloseWorkbook(baseInput());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'INFORME',
      'GASTOS',
      'INVENTARIO',
    ]);
  });

  it('el título de INFORME lleva el mes', () => {
    const wb = buildMonthlyCloseWorkbook(baseInput({ month: '2026-04' }));
    expect(informe(wb).getCell('A1').value).toBe('INFORME DE VENTAS 2026-04');
  });

  it('los encabezados de INFORME coinciden con el modelo del contador', () => {
    const wb = buildMonthlyCloseWorkbook(baseInput());
    const ws = informe(wb);
    const headerRow = [
      'FECHA',
      'FACTURADO /\nSEPARADO',
      'MANUAL /\nSISTEMA',
      'FACTURA No.',
      'REFERENCIA',
      'MOTOR-CHASIS',
      'NOMBRE DE CLIENTE',
      'VALOR SEPARADO $',
      'VALOR VENTA\nIVA INCLUIDO $',
      'EFECTIVO',
      'TARJETA\nDEBITO/CREDITO',
      'QR',
      'TRANSFERENCIA\nCTA BANCOLOMBIA',
      'SISTECREDITO',
      'ADDI',
      'VANTI',
      'LEGALIZACION\nSEPARADOS',
      'VENDEDOR',
      'OBSERVACIONES',
    ];
    headerRow.forEach((h, i) => {
      expect(ws.getCell(2, i + 1).value).toBe(h);
    });
  });
});

describe('buildMonthlyCloseWorkbook — reglas de negocio (INFORME)', () => {
  it('una venta activa en efectivo cae en la columna EFECTIVO (10) con el total en col 9', () => {
    const wb = buildMonthlyCloseWorkbook(baseInput({ sales: [baseSale()] }));
    const ws = informe(wb);
    expect(ws.getCell(3, 9).value).toBe(1000); // VALOR VENTA IVA INCLUIDO
    expect(ws.getCell(3, 10).value).toBe(1000); // EFECTIVO
    expect(ws.getCell(3, 11).value).toBe(''); // TARJETA vacío
    expect(ws.getCell(3, 18).value).toBe('Joseph Beltrán'); // VENDEDOR
  });

  it('una venta con nota crédito deja las columnas 8-19 en blanco y se resalta', () => {
    const sale = baseSale({ status: 'CREDIT_NOTE', total: 500 });
    const wb = buildMonthlyCloseWorkbook(baseInput({ sales: [sale] }));
    const ws = informe(wb);
    expect(ws.getCell(3, 3).value).toBe('NOTA CRÉDITO');
    expect(ws.getCell(3, 9).value).toBeNull();
    expect(ws.getCell(3, 10).value).toBeNull();
    const fill = ws.getCell(3, 1).fill as { fgColor?: { argb?: string } };
    expect(fill.fgColor?.argb).toBe('FFFFF9C4');
  });

  it('no recibe ventas anuladas (responsabilidad de quien arma el input): si no vienen, no aparecen', () => {
    // El util confía en que el servicio ya excluyó las VOIDED — se prueba
    // aquí que simplemente no imprime filas de más cuando `sales` está vacío.
    const wb = buildMonthlyCloseWorkbook(baseInput({ sales: [] }));
    const ws = informe(wb);
    expect(ws.getCell(3, 1).value).toBeNull();
  });

  it('un abono numerado de separado genera una fila SEPARADO con el método correcto', () => {
    const wb = buildMonthlyCloseWorkbook(
      baseInput({
        abonos: [
          {
            paidAt: new Date('2026-04-05T12:00:00.000Z'),
            amount: 300000,
            method: 'tarjeta',
            receiptNumber: 7,
            clientName: 'Ana',
            createdById: 'user-1',
          },
        ],
      }),
    );
    const ws = informe(wb);
    expect(ws.getCell(3, 2).value).toBe('SEPARADO');
    expect(ws.getCell(3, 4).value).toBe('SEP 7');
    expect(ws.getCell(3, 8).value).toBe(300000); // VALOR SEPARADO
    expect(ws.getCell(3, 11).value).toBe(300000); // TARJETA
    expect(ws.getCell(3, 10).value).toBe(''); // EFECTIVO vacío
  });

  it('un separado completado muestra solo el último abono y la suma previa en LEGALIZACION', () => {
    const sale = baseSale({
      id: 'sale-legalizado',
      total: 2000000,
      payments: [],
    });
    const wb = buildMonthlyCloseWorkbook(
      baseInput({
        sales: [sale],
        completedLayaways: new Map([
          [
            'sale-legalizado',
            { lastMethod: 'qr', lastAmount: 500000, prevSum: 1500000 },
          ],
        ]),
      }),
    );
    const ws = informe(wb);
    expect(ws.getCell(3, 12).value).toBe(500000); // QR = último abono
    expect(ws.getCell(3, 17).value).toBe(1500000); // LEGALIZACION SEPARADOS
  });

  it('una venta con dos motos genera dos filas; la segunda no repite el total ni los pagos', () => {
    const sale = baseSale({
      items: [
        { reference: 'M1', engineNumber: 'ENG1', chassisNumber: 'CHA1' },
        { reference: 'M2', engineNumber: 'ENG2', chassisNumber: 'CHA2' },
      ],
    });
    const wb = buildMonthlyCloseWorkbook(baseInput({ sales: [sale] }));
    const ws = informe(wb);
    expect(ws.getCell(3, 6).value).toBe('ENG1 / CHA1');
    expect(ws.getCell(4, 6).value).toBe('ENG2 / CHA2');
    expect(ws.getCell(3, 9).value).toBe(1000);
    expect(ws.getCell(4, 9).value).toBe(''); // segunda fila sin total
    expect(ws.getCell(4, 10).value).toBe(''); // ni pago
    // Vendedor sí se repite en cada fila, igual que app.py.
    expect(ws.getCell(4, 18).value).toBe('Joseph Beltrán');
  });

  it('un pago dividido queda documentado en OBSERVACIONES', () => {
    const sale = baseSale({
      payments: [
        { method: 'efectivo', amount: 400 },
        { method: 'tarjeta', amount: 600 },
      ],
    });
    const wb = buildMonthlyCloseWorkbook(baseInput({ sales: [sale] }));
    const ws = informe(wb);
    expect(ws.getCell(3, 19).value).toBe('efectivo:400,tarjeta:600');
    expect(ws.getCell(3, 10).value).toBe(400);
    expect(ws.getCell(3, 11).value).toBe(600);
  });

  it('ordena eventos SEP y FVBB por fecha, sin importar el orden de entrada', () => {
    const early = baseSale({
      id: 'a',
      soldAt: new Date('2026-04-01T00:00:00.000Z'),
      clientName: 'Primero',
    });
    const late = baseSale({
      id: 'b',
      soldAt: new Date('2026-04-20T00:00:00.000Z'),
      clientName: 'Segundo',
    });
    const wb = buildMonthlyCloseWorkbook(baseInput({ sales: [late, early] }));
    const ws = informe(wb);
    expect(ws.getCell(3, 7).value).toBe('Primero');
    expect(ws.getCell(4, 7).value).toBe('Segundo');
  });
});

describe('buildMonthlyCloseWorkbook — GASTOS (conciliación de efectivo)', () => {
  it('el saldo de efectivo suma ventas + abonos activos', () => {
    const wb = buildMonthlyCloseWorkbook(
      baseInput({
        cashFromSales: 5_000_000,
        cashFromActiveLayawayPayments: 1_200_000,
      }),
    );
    expect(gastos(wb).getCell(4, 2).value).toBe(6_200_000);
  });

  it('lista legalizaciones de separados completados cuya venta cae en el periodo', () => {
    const sale = baseSale({
      id: 'sale-leg',
      invoiceNumber: 55,
      clientName: 'Cristian',
      total: 2500000,
    });
    const wb = buildMonthlyCloseWorkbook(
      baseInput({
        sales: [sale],
        completedLayaways: new Map([
          [
            'sale-leg',
            { lastMethod: 'efectivo', lastAmount: 2500000, prevSum: 0 },
          ],
        ]),
      }),
    );
    const ws = gastos(wb);
    // GASTOS(2 filas título+cabecera) + 3 vacías + fila en blanco = 6; ENTREGAS EFECTIVO 2+5+1=8 -> total 14 filas antes de LEGALIZACIONES; título en fila 6+6=... en vez de recalcular a mano, se busca el texto.
    const found = ws
      .getRows(1, ws.rowCount)!
      .flatMap((r) => r.values as unknown[])
      .some((v) => typeof v === 'string' && v.includes('FVBB 55 - Cristian'));
    expect(found).toBe(true);
  });

  it('lista notas crédito del periodo (filtradas por statusChangedAt, no por fecha de venta)', () => {
    const wb = buildMonthlyCloseWorkbook(
      baseInput({
        creditNotesInPeriod: [
          {
            fecha: new Date('2026-04-25T00:00:00.000Z'),
            invoiceNumber: 17,
            clientName: 'Luis Angel',
            total: 4700000,
          },
        ],
      }),
    );
    const ws = gastos(wb);
    const found = ws
      .getRows(1, ws.rowCount)!
      .flatMap((r) => r.values as unknown[])
      .some((v) => typeof v === 'string' && v.includes('FVBB 17 - Luis Angel'));
    expect(found).toBe(true);
  });
});

describe('buildMonthlyCloseWorkbook — INVENTARIO', () => {
  it('lista productos con la categoría en minúscula', () => {
    const wb = buildMonthlyCloseWorkbook(
      baseInput({
        products: [
          {
            reference: 'EB-20',
            name: 'Amor Verde',
            category: 'MOTO',
            color: 'Verde',
            supplier: 'Dideco',
            price: 3437500,
            cost: 2000000,
            stock: 3,
          },
        ],
      }),
    );
    const ws = inventario(wb);
    expect(ws.getCell(2, 3).value).toBe('moto');
    expect(ws.getCell(2, 6).value).toBe(3437500);
    expect(ws.getCell(2, 8).value).toBe(3);
  });
});
