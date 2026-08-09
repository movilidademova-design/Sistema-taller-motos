import { Injectable } from '@nestjs/common';
import { PosPrismaService } from '../pos-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/pos/client';
import { PosLayawayStatus, PosSaleStatus } from '../../generated/pos/enums';
import { dateRangeFilter } from '../../common/utils/export-filters.util';
import { PosExportQueryDto } from './dto/pos-export-query.dto';
import { MonthlyCloseQueryDto } from './dto/monthly-close-query.dto';
import {
  buildMonthlyCloseWorkbook,
  CompletedLayawayInfo,
  MonthlyCloseAbono,
  MonthlyCloseSale,
} from './monthly-close.util';

// Réplica de motopos/app.py: /api/reportes (línea 528, resumen en pantalla) y
// /api/exportar/cierre (línea 1003, cierre mensual). Solo PosRole.ADMIN llega
// aquí (ver el controlador): un cajero no ve la ganancia ni el cierre.

/** Primer y último día (AAAA-MM-DD) del mes AAAA-MM, para pasarle a `dateRangeFilter`. */
function monthRange(month: string): { from: string; to: string } {
  const [year, mm] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

export interface PosSummary {
  from?: string;
  to?: string;
  salesCount: number;
  totalInvoiced: number;
  totalProfit: number;
  byPaymentMethod: { method: string; total: number }[];
  topProducts: { name: string; quantity: number; total: number }[];
  activeLayaways: {
    id: string;
    clientName: string;
    total: number;
    paid: number;
    balance: number;
  }[];
}

@Injectable()
export class PosReportsService {
  constructor(
    private readonly prisma: PosPrismaService,
    private readonly workshopPrisma: PrismaService,
    // No usa ExcelService: el cierre necesita 3 hojas con celdas combinadas y
    // secciones de formato libre, algo que `ExcelService.generate` (una hoja,
    // una fila por registro) no está pensado para producir. Se usa ExcelJS
    // directo, la misma librería que ExcelService ya usa por debajo — no es
    // un segundo mecanismo, es la misma herramienta sin la capa que aquí no
    // alcanza.
  ) {}

  /**
   * Resumen en pantalla. Las ventas anuladas no cuentan (se excluyen de la
   * consulta); las notas crédito sí restan (entran con signo negativo, no se
   * excluyen) — es la regla que decide si estos números sirven o no.
   */
  async summary(
    tenantId: string,
    branchId: string,
    query: PosExportQueryDto,
  ): Promise<PosSummary> {
    const range = dateRangeFilter(query.from, query.to);

    const sales = await this.prisma.posSale.findMany({
      where: {
        tenantId,
        branchId,
        status: { not: PosSaleStatus.VOIDED },
        ...(range ? { soldAt: range } : {}),
      },
      include: { items: true, payments: true },
    });

    let salesCount = 0;
    let totalInvoiced = new Prisma.Decimal(0);
    let totalProfit = new Prisma.Decimal(0);
    const byMethod = new Map<string, Prisma.Decimal>();
    const byProduct = new Map<
      string,
      { quantity: number; total: Prisma.Decimal }
    >();

    for (const sale of sales) {
      const sign = sale.status === PosSaleStatus.CREDIT_NOTE ? -1 : 1;
      if (sale.status === PosSaleStatus.ACTIVE) salesCount += 1;

      totalInvoiced = totalInvoiced.plus(sale.total.mul(sign));

      for (const item of sale.items) {
        const margin = item.finalPrice
          .sub(item.unitCost)
          .mul(item.quantity)
          .mul(sign);
        totalProfit = totalProfit.plus(margin);

        const bucket = byProduct.get(item.name) ?? {
          quantity: 0,
          total: new Prisma.Decimal(0),
        };
        bucket.quantity += item.quantity * sign;
        bucket.total = bucket.total.plus(item.lineTotal.mul(sign));
        byProduct.set(item.name, bucket);
      }

      for (const payment of sale.payments) {
        const current = byMethod.get(payment.method) ?? new Prisma.Decimal(0);
        byMethod.set(payment.method, current.plus(payment.amount.mul(sign)));
      }
    }

    const activeLayawayRows = await this.prisma.posLayaway.findMany({
      where: { tenantId, branchId, status: PosLayawayStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });

    return {
      from: query.from,
      to: query.to,
      salesCount,
      totalInvoiced: Number(totalInvoiced),
      totalProfit: Number(totalProfit),
      byPaymentMethod: [...byMethod.entries()]
        .map(([method, total]) => ({ method, total: Number(total) }))
        .sort((a, b) => b.total - a.total),
      topProducts: [...byProduct.entries()]
        .map(([name, v]) => ({
          name,
          quantity: v.quantity,
          total: Number(v.total),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      activeLayaways: activeLayawayRows.map((l) => ({
        id: l.id,
        clientName: l.clientName,
        total: Number(l.total),
        paid: Number(l.paid),
        balance: Number(l.balance),
      })),
    };
  }

  /**
   * El cierre mensual. Réplica de app.py líneas 1003-1418 — ver
   * monthly-close.util.ts para la estructura exacta de cada hoja.
   *
   * A diferencia de `resolveExportBranchId` (que para un ADMIN sin
   * `branchId` explícito exporta TODAS las sucursales), el cierre siempre es
   * de UNA sola: el contador recibe un archivo por bodega (el nombre del
   * cierre real de referencia es literalmente "CIERRE ABRIL BODEGA GRIS"),
   * así que mezclar sucursales en un mismo archivo rompería justo lo que el
   * contador ya conoce.
   */
  async exportMonthlyClose(
    tenantId: string,
    currentBranchId: string,
    query: MonthlyCloseQueryDto,
  ): Promise<Buffer> {
    const branchId = query.branchId ?? currentBranchId;
    const { from, to } = monthRange(query.month);
    const range = dateRangeFilter(from, to)!;

    const [
      saleRows,
      abonoRows,
      completedLayawayRows,
      creditNoteRows,
      productRows,
    ] = await Promise.all([
      this.prisma.posSale.findMany({
        where: {
          tenantId,
          branchId,
          status: { not: PosSaleStatus.VOIDED },
          soldAt: range,
        },
        include: { items: true, payments: true },
        orderBy: { soldAt: 'asc' },
      }),
      this.prisma.posLayawayPayment.findMany({
        where: {
          receiptNumber: { not: null },
          paidAt: range,
          layaway: {
            tenantId,
            branchId,
            status: { not: PosLayawayStatus.CANCELLED },
          },
        },
        include: { layaway: { select: { clientName: true, status: true } } },
        orderBy: { paidAt: 'asc' },
      }),
      // No se filtra por fecha: un separado completado hoy puede tener
      // abonos de meses anteriores, y lo que importa para ligarlo con su
      // fila FACTURADO es que su venta (sí filtrada por fecha, arriba)
      // caiga en el periodo. Igual que app.py línea 1097.
      this.prisma.posLayaway.findMany({
        where: {
          tenantId,
          branchId,
          status: PosLayawayStatus.COMPLETED,
          saleId: { not: null },
        },
        include: { payments: { orderBy: { paidAt: 'asc' } } },
      }),
      // Filtrado por `statusChangedAt` (cuándo se hizo la nota crédito), NO
      // por `soldAt` (cuándo se vendió) — app.py línea 1320 usa
      // `nota_credito_fecha`, no `fecha`. Una venta de junio con nota
      // crédito en julio aparece en la sección NOTAS CRÉDITO del cierre de
      // julio, no en el de junio.
      this.prisma.posSale.findMany({
        where: {
          tenantId,
          branchId,
          status: PosSaleStatus.CREDIT_NOTE,
          statusChangedAt: range,
        },
        orderBy: { statusChangedAt: 'asc' },
      }),
      this.prisma.posProduct.findMany({
        where: { tenantId, branchId, isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      }),
    ]);

    const completedLayaways = new Map<string, CompletedLayawayInfo>();
    for (const layaway of completedLayawayRows) {
      if (!layaway.saleId || layaway.payments.length === 0) continue;
      const last = layaway.payments[layaway.payments.length - 1];
      const prevSum = layaway.payments
        .slice(0, -1)
        .reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
      completedLayaways.set(layaway.saleId, {
        lastMethod: last.method,
        lastAmount: Number(last.amount),
        prevSum: Number(prevSum),
      });
    }

    // Efectivo del mes: pagos en efectivo de ventas ACTIVAS (ni anuladas ni
    // con nota crédito) más abonos en efectivo de separados que SIGUEN
    // activos. Los abonos de separados ya completados no se suman aquí
    // porque, al completarse, PosLayawaysService.completeLayaway ya los
    // volcó como pagos de la venta resultante — sumarlos también aquí
    // contaría el mismo efectivo dos veces.
    let cashFromSales = new Prisma.Decimal(0);
    for (const sale of saleRows) {
      if (sale.status !== PosSaleStatus.ACTIVE) continue;
      for (const payment of sale.payments) {
        if (payment.method === 'efectivo')
          cashFromSales = cashFromSales.plus(payment.amount);
      }
    }
    let cashFromActiveLayawayPayments = new Prisma.Decimal(0);
    for (const abono of abonoRows) {
      if (
        abono.layaway.status === PosLayawayStatus.ACTIVE &&
        abono.method === 'efectivo'
      ) {
        cashFromActiveLayawayPayments = cashFromActiveLayawayPayments.plus(
          abono.amount,
        );
      }
    }

    const sellerIds = new Set<string>();
    for (const s of saleRows) sellerIds.add(s.createdById);
    for (const a of abonoRows) sellerIds.add(a.createdById);
    const sellerUsers =
      sellerIds.size > 0
        ? await this.workshopPrisma.user.findMany({
            where: { id: { in: [...sellerIds] } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const sellerNames = new Map(
      sellerUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );

    const closeSales: MonthlyCloseSale[] = saleRows.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      soldAt: s.soldAt,
      clientName: s.clientName,
      total: Number(s.total),
      status: s.status,
      createdById: s.createdById,
      items: s.items.map((i) => ({
        reference: i.reference,
        engineNumber: i.engineNumber,
        chassisNumber: i.chassisNumber,
      })),
      payments: s.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
    }));

    const closeAbonos: MonthlyCloseAbono[] = abonoRows.map((a) => ({
      paidAt: a.paidAt,
      amount: Number(a.amount),
      method: a.method,
      // El `where` ya exige receiptNumber != null; Prisma no lo refleja en el tipo.
      receiptNumber: a.receiptNumber as number,
      clientName: a.layaway.clientName,
      createdById: a.createdById,
    }));

    const workbook = buildMonthlyCloseWorkbook({
      month: query.month,
      sales: closeSales,
      abonos: closeAbonos,
      completedLayaways,
      creditNotesInPeriod: creditNoteRows.map((n) => ({
        fecha: n.statusChangedAt ?? n.soldAt,
        invoiceNumber: n.invoiceNumber,
        clientName: n.clientName,
        total: Number(n.total),
      })),
      cashFromSales: Number(cashFromSales),
      cashFromActiveLayawayPayments: Number(cashFromActiveLayawayPayments),
      products: productRows.map((p) => ({
        reference: p.reference,
        name: p.name,
        category: p.category,
        color: p.color,
        supplier: p.supplier,
        price: Number(p.price),
        cost: Number(p.cost),
        stock: p.stock,
      })),
      sellerNames,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
