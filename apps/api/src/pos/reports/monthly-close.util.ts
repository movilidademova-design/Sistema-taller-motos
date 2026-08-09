import * as ExcelJS from 'exceljs';

// Réplica de motopos/app.py líneas 1003-1418 (`/api/exportar/cierre`), la
// pieza más delicada de toda la integración: es el archivo que recibe el
// contador. La estructura (hojas, encabezados, orden de columnas, qué queda
// en blanco) sale de leer con openpyxl `motopos/MODELO CIERRE.xlsx` y
// `motopos/04.CIERRE ABRIL BODEGA GRIS.xlsx` (un cierre real ya entregado),
// no de la memoria del código Python. Ver el reporte de la tarea para el
// detalle hoja por hoja.
//
// Esta función es pura a propósito (no toca Prisma): construye el workbook a
// partir de datos ya resueltos, para poder probarla con fixtures de mentira
// sin base de datos, igual que revenue.util.ts o sale-pricing.util.ts.

export interface MonthlyCloseSaleItem {
  reference: string;
  engineNumber: string | null;
  chassisNumber: string | null;
}

export interface MonthlyCloseSalePayment {
  method: string;
  amount: number;
}

export type MonthlyCloseSaleStatus = 'ACTIVE' | 'VOIDED' | 'CREDIT_NOTE';

export interface MonthlyCloseSale {
  id: string;
  invoiceNumber: number | null;
  soldAt: Date;
  clientName: string;
  total: number;
  status: MonthlyCloseSaleStatus;
  createdById: string;
  items: MonthlyCloseSaleItem[];
  payments: MonthlyCloseSalePayment[];
}

export interface MonthlyCloseAbono {
  paidAt: Date;
  amount: number;
  method: string;
  receiptNumber: number;
  clientName: string;
  createdById: string;
}

/** Un separado completado cuya venta cae en el periodo: venta_id -> info del último abono / suma de previos. */
export interface CompletedLayawayInfo {
  lastMethod: string | null;
  lastAmount: number;
  prevSum: number;
}

export interface MonthlyCloseCreditNote {
  fecha: Date;
  invoiceNumber: number | null;
  clientName: string;
  total: number;
}

export interface MonthlyCloseProduct {
  reference: string;
  name: string;
  category: string;
  color: string;
  supplier: string;
  price: number;
  cost: number;
  stock: number;
}

export interface MonthlyCloseInput {
  /** AAAA-MM, para el título de las hojas 1 y 2. */
  month: string;
  /** Ventas del periodo con estado != VOIDED (las anuladas no cuentan), orden ascendente por soldAt. */
  sales: MonthlyCloseSale[];
  /** Abonos numerados del periodo cuyo separado no está cancelado (activos + completados). */
  abonos: MonthlyCloseAbono[];
  /** saleId -> info del separado completado que originó esa venta. */
  completedLayaways: Map<string, CompletedLayawayInfo>;
  /** Ventas con nota crédito cuyo `statusChangedAt` (no la fecha de venta) cae en el periodo. */
  creditNotesInPeriod: MonthlyCloseCreditNote[];
  /** Suma de pagos en efectivo de ventas ACTIVAS del periodo. */
  cashFromSales: number;
  /** Suma de abonos en efectivo de separados ACTIVOS (no completados: ese efectivo ya se cuenta en la venta que los completó). */
  cashFromActiveLayawayPayments: number;
  /** Inventario activo, ya ordenado por categoría y nombre. */
  products: MonthlyCloseProduct[];
  /** createdById (venta o abono) -> nombre para mostrar. */
  sellerNames: Map<string, string>;
}

const CURRENCY_FMT = '$#,##0';

const NAVY = 'FF1B3E8C';
const WHITE = 'FFFFFFFF';
const BORDER_GRAY = 'FFCCCCCC';
const NC_YELLOW = 'FFFFF9C4';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: BORDER_GRAY } },
  bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
  left: { style: 'thin', color: { argb: BORDER_GRAY } },
  right: { style: 'thin', color: { argb: BORDER_GRAY } },
};

const METHOD_COLUMN: Record<string, number> = {
  efectivo: 10,
  tarjeta: 11,
  qr: 12,
  transferencia: 13,
  sistecredito: 14,
  addi: 15,
  vanti: 16,
};

const INFORME_HEADERS = [
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
const INFORME_WIDTHS = [
  12, 14, 12, 13, 15, 18, 24, 14, 14, 12, 14, 10, 16, 13, 10, 10, 14, 18, 22,
];

function sellerName(map: Map<string, string>, id: string): string {
  return map.get(id) ?? '';
}

function setCurrency(cell: ExcelJS.Cell, value: number | ''): void {
  cell.value = value;
  if (value !== '') {
    cell.numFmt = CURRENCY_FMT;
    cell.alignment = { horizontal: 'right' };
  }
  cell.border = thinBorder;
}

function setPlain(cell: ExcelJS.Cell, value: string, center = false): void {
  cell.value = value;
  if (center) cell.alignment = { horizontal: 'center' };
  cell.border = thinBorder;
}

/** Hoja 1: INFORME. Devuelve la fila siguiente disponible (por si se necesitara en el futuro). */
function buildInformeSheet(
  wb: ExcelJS.Workbook,
  input: MonthlyCloseInput,
): void {
  const ws = wb.addWorksheet('INFORME');
  ws.mergeCells('A1:S1');
  const title = ws.getCell('A1');
  title.value = `INFORME DE VENTAS ${input.month}`;
  title.font = { bold: true, size: 13, color: { argb: NAVY } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 22;

  INFORME_HEADERS.forEach((h, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = thinBorder;
    ws.getColumn(i + 1).width = INFORME_WIDTHS[i];
  });
  ws.getRow(2).height = 30;

  type Event =
    | { type: 'SEP'; date: Date; abono: MonthlyCloseAbono }
    | { type: 'FVBB'; date: Date; sale: MonthlyCloseSale };
  const events: Event[] = [
    ...input.abonos.map((a): Event => ({
      type: 'SEP',
      date: a.paidAt,
      abono: a,
    })),
    ...input.sales.map((s): Event => ({
      type: 'FVBB',
      date: s.soldAt,
      sale: s,
    })),
  ];
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  let row = 3;
  for (const event of events) {
    if (event.type === 'SEP') {
      const a = event.abono;
      setPlain(ws.getCell(row, 1), a.paidAt.toISOString().slice(0, 10));
      setPlain(ws.getCell(row, 2), 'SEPARADO', true);
      setPlain(ws.getCell(row, 3), 'SISTEMA', true);
      setPlain(ws.getCell(row, 4), `SEP ${a.receiptNumber}`);
      setPlain(ws.getCell(row, 5), '');
      setPlain(ws.getCell(row, 6), '');
      setPlain(ws.getCell(row, 7), a.clientName || '');
      setCurrency(ws.getCell(row, 8), a.amount);
      setCurrency(ws.getCell(row, 9), '');
      const payCol = METHOD_COLUMN[a.method] ?? METHOD_COLUMN.efectivo;
      for (const col of Object.values(METHOD_COLUMN)) {
        setCurrency(ws.getCell(row, col), col === payCol ? a.amount : '');
      }
      setCurrency(ws.getCell(row, 17), '');
      setPlain(
        ws.getCell(row, 18),
        sellerName(input.sellerNames, a.createdById),
      );
      setPlain(ws.getCell(row, 19), '');
      row += 1;
      continue;
    }

    const sale = event.sale;
    const inf = input.completedLayaways.get(sale.id) ?? null;
    const payDict = new Map<string, number>();
    if (inf) {
      if (inf.lastMethod) payDict.set(inf.lastMethod, inf.lastAmount);
    } else {
      for (const p of sale.payments) {
        payDict.set(p.method, (payDict.get(p.method) ?? 0) + p.amount);
      }
    }
    const prevSumValue = inf && inf.prevSum ? inf.prevSum : undefined;

    const refs = [
      ...new Set(sale.items.map((i) => i.reference).filter(Boolean)),
    ];
    const referenciaStr = refs.join(' / ');
    const biciItems = sale.items.filter(
      (i) => i.engineNumber || i.chassisNumber,
    );
    const isNc = sale.status === 'CREDIT_NOTE';

    const dividedObservacion =
      sale.payments.length > 1
        ? sale.payments.map((p) => `${p.method}:${p.amount}`).join(',')
        : '';

    const writeRow = (
      motorChasis: string,
      currentRow: number,
      firstRow: boolean,
    ) => {
      setPlain(
        ws.getCell(currentRow, 1),
        sale.soldAt.toISOString().slice(0, 10),
      );
      setPlain(ws.getCell(currentRow, 2), 'FACTURADO', true);
      setPlain(
        ws.getCell(currentRow, 3),
        isNc ? 'NOTA CRÉDITO' : 'SISTEMA',
        true,
      );
      setPlain(
        ws.getCell(currentRow, 4),
        `FVBB ${sale.invoiceNumber ?? sale.id}`,
      );
      setPlain(ws.getCell(currentRow, 5), referenciaStr);
      setPlain(ws.getCell(currentRow, 6), motorChasis);
      setPlain(ws.getCell(currentRow, 7), sale.clientName || '');

      if (isNc) {
        for (let ci = 8; ci <= 19; ci++)
          ws.getCell(currentRow, ci).border = thinBorder;
        return;
      }

      setCurrency(ws.getCell(currentRow, 8), ''); // siempre vacío en FACTURADO
      if (firstRow) {
        setCurrency(ws.getCell(currentRow, 9), sale.total);
        for (const [method, col] of Object.entries(METHOD_COLUMN)) {
          setCurrency(ws.getCell(currentRow, col), payDict.get(method) ?? '');
        }
      } else {
        setCurrency(ws.getCell(currentRow, 9), '');
        for (const col of Object.values(METHOD_COLUMN)) {
          setCurrency(ws.getCell(currentRow, col), '');
        }
      }
      setCurrency(
        ws.getCell(currentRow, 17),
        firstRow && prevSumValue !== undefined ? prevSumValue : '',
      );
      // Vendedor y observaciones se repiten en cada fila (una por moto), igual que app.py.
      setPlain(
        ws.getCell(currentRow, 18),
        sellerName(input.sellerNames, sale.createdById),
      );
      setPlain(ws.getCell(currentRow, 19), dividedObservacion);
    };

    const applyNcFill = (r: number) => {
      if (!isNc) return;
      for (let ci = 1; ci <= 19; ci++) {
        ws.getCell(r, ci).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: NC_YELLOW },
        };
      }
    };

    if (biciItems.length === 0) {
      writeRow('', row, true);
      applyNcFill(row);
      row += 1;
    } else {
      biciItems.forEach((bi, idx) => {
        const mc =
          `${bi.engineNumber ?? ''} / ${bi.chassisNumber ?? ''}`.replace(
            /^[\s/]+|[\s/]+$/g,
            '',
          );
        writeRow(mc, row, idx === 0);
        applyNcFill(row);
        row += 1;
      });
    }
  }

  ws.views = [{ state: 'frozen', ySplit: 2 }];
}

/** Escribe una sección de la hoja GASTOS. Devuelve la fila siguiente disponible. */
function writeGastosSection(
  ws: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  rows: { fecha: string; detalle: string; monto: number }[],
  emptyRows: number,
): number {
  let r = startRow;
  const titleCell = ws.getCell(r, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: WHITE }, size: 11 };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: NAVY },
  };
  ws.mergeCells(r, 1, r, 3);
  r += 1;

  ws.getCell(r, 1).value = 'FECHA';
  ws.getCell(r, 1).font = { bold: true, size: 10 };
  ws.getCell(r, 2).value = 'DETALLE';
  ws.getCell(r, 2).font = { bold: true, size: 10 };
  ws.getCell(r, 3).value = 'VALOR';
  ws.getCell(r, 3).font = { bold: true, size: 10 };
  r += 1;

  if (rows.length > 0) {
    for (const row of rows) {
      ws.getCell(r, 1).value = row.fecha;
      ws.getCell(r, 2).value = row.detalle;
      const c = ws.getCell(r, 3);
      c.value = row.monto;
      c.numFmt = CURRENCY_FMT;
      c.alignment = { horizontal: 'right' };
      r += 1;
    }
  } else {
    r += emptyRows;
  }
  return r + 1; // fila en blanco entre secciones
}

/** Hoja 2: GASTOS. En realidad es la conciliación de efectivo; la sección de gastos queda en blanco (ver nota del módulo). */
function buildGastosSheet(
  wb: ExcelJS.Workbook,
  input: MonthlyCloseInput,
): void {
  const ws = wb.addWorksheet('GASTOS');
  ws.getCell(1, 1).value = `CIERRE MENSUAL ${input.month}`;
  ws.getCell(1, 1).font = { bold: true, size: 13, color: { argb: NAVY } };
  ws.mergeCells(1, 1, 1, 3);

  ws.getCell(3, 1).value = 'SALDO EFECTIVO A CIERRE DE MES';
  ws.getCell(3, 1).font = { bold: true, size: 11 };
  ws.getCell(3, 2).value = 'VALOR';
  ws.getCell(3, 2).font = { bold: true, size: 11 };

  ws.getCell(4, 1).value = 'Valor contado en billetes y monedas';
  const cashCell = ws.getCell(4, 2);
  cashCell.value = input.cashFromSales + input.cashFromActiveLayawayPayments;
  cashCell.numFmt = CURRENCY_FMT;
  cashCell.alignment = { horizontal: 'right' };

  const legalizaciones = input.sales
    .filter((s) => input.completedLayaways.has(s.id))
    .map((s) => ({
      fecha: s.soldAt.toISOString().slice(0, 10),
      detalle: `FVBB ${s.invoiceNumber ?? s.id} - ${s.clientName || ''}`,
      monto: s.total,
    }));

  const notasCredito = input.creditNotesInPeriod.map((n) => ({
    fecha: n.fecha.toISOString().slice(0, 10),
    detalle: `FVBB ${n.invoiceNumber ?? ''} - ${n.clientName || ''}`,
    monto: n.total,
  }));

  let r = 6;
  r = writeGastosSection(ws, r, 'GASTOS', [], 3);
  r = writeGastosSection(ws, r, 'ENTREGAS EFECTIVO', [], 5);
  r = writeGastosSection(ws, r, 'LEGALIZACIONES', legalizaciones, 3);
  r = writeGastosSection(ws, r, 'NOTAS CRÉDITO', notasCredito, 3);
  r = writeGastosSection(ws, r, 'CONSIGNACIONES', [], 5);
  r = writeGastosSection(ws, r, 'ABONOS SISTECREDITO', [], 3);
  writeGastosSection(ws, r, 'VALES', [], 3);

  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 16;
}

const INVENTARIO_HEADERS = [
  'REFERENCIA',
  'NOMBRE',
  'CATEGORIA',
  'COLOR',
  'PROVEEDOR',
  'PRECIO VENTA',
  'COSTO',
  'STOCK ACTUAL',
];
const INVENTARIO_WIDTHS = [14, 30, 15, 12, 22, 14, 14, 13];

/** Hoja 3: INVENTARIO. Foto del stock activo al momento de generar el cierre. */
function buildInventarioSheet(
  wb: ExcelJS.Workbook,
  input: MonthlyCloseInput,
): void {
  const ws = wb.addWorksheet('INVENTARIO');
  INVENTARIO_HEADERS.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    cell.border = thinBorder;
    ws.getColumn(i + 1).width = INVENTARIO_WIDTHS[i];
  });

  input.products.forEach((p, idx) => {
    const r = idx + 2;
    setPlain(ws.getCell(r, 1), p.reference || '');
    setPlain(ws.getCell(r, 2), p.name);
    // Minúscula: así lo mostraba app.py (la categoría venía de un catálogo en
    // español todo en minúscula), y es lo que el contador ya conoce.
    setPlain(ws.getCell(r, 3), p.category.toLowerCase());
    setPlain(ws.getCell(r, 4), p.color || '');
    setPlain(ws.getCell(r, 5), p.supplier || '');
    setCurrency(ws.getCell(r, 6), p.price);
    setCurrency(ws.getCell(r, 7), p.cost);
    const stockCell = ws.getCell(r, 8);
    stockCell.value = p.stock;
    stockCell.alignment = { horizontal: 'center' };
    stockCell.border = thinBorder;
  });

  ws.views = [{ state: 'frozen', ySplit: 1 }];
}

export function buildMonthlyCloseWorkbook(
  input: MonthlyCloseInput,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  buildInformeSheet(wb, input);
  buildGastosSheet(wb, input);
  buildInventarioSheet(wb, input);
  return wb;
}
