import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ExcelService } from '../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../common/utils/export-filters.util';
import {
  RevenueGroupBy,
  RevenueReportQueryDto,
} from './dto/revenue-report-query.dto';
import { periodKey } from './revenue.util';
import { OrderStatus, Role } from '../generated/prisma/enums';

interface RevenueRow {
  period: string;
  branchName: string;
  deliveredOrders: number;
  invoiceCount: number;
  invoiced: number;
  collected: number;
}

/** Suma de decimales en punto flotante: 0.1+0.2 no da 0.3. Se redondea a centavos. */
const cents = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

  async exportRevenue(
    tenantId: string,
    currentBranchId: string,
    role: Role,
    query: RevenueReportQueryDto,
  ): Promise<Buffer> {
    const branchId = resolveExportBranchId(
      role,
      currentBranchId,
      query.branchId,
    );
    const groupBy = query.groupBy ?? RevenueGroupBy.MONTH;
    const range = dateRangeFilter(query.from, query.to);

    // A diferencia de los exports de detalle, aquí NO se usa `take: MAX_ROWS + 1`:
    // estas consultas alimentan una agregación, así que truncarlas devolvería
    // totales incorrectos en silencio — mucho peor que un reporte que tarda. El
    // riesgo de memoria es bajo porque el `select` trae solo cuatro campos
    // pequeños por fila, y lo que llega a ExcelService son los buckets ya
    // agregados (una fila por periodo y sucursal), no las facturas crudas.
    const [invoices, deliveredOrders] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          ...(range ? { issuedAt: range } : {}),
          ...(branchId ? { order: { branchId } } : {}),
        },
        select: {
          issuedAt: true,
          total: true,
          amountPaid: true,
          order: { select: { branch: { select: { name: true } } } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          tenantId,
          status: OrderStatus.DELIVERED,
          deliveredAt: range ? range : { not: null },
          ...(branchId ? { branchId } : {}),
        },
        select: { deliveredAt: true, branch: { select: { name: true } } },
      }),
    ]);

    const buckets = new Map<string, RevenueRow>();
    const bucketFor = (period: string, branchName: string): RevenueRow => {
      const key = `${period}|${branchName}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          period,
          branchName,
          deliveredOrders: 0,
          invoiceCount: 0,
          invoiced: 0,
          collected: 0,
        };
        buckets.set(key, bucket);
      }
      return bucket;
    };

    for (const invoice of invoices) {
      const bucket = bucketFor(
        periodKey(invoice.issuedAt, groupBy),
        invoice.order.branch.name,
      );
      bucket.invoiceCount += 1;
      bucket.invoiced += Number(invoice.total);
      bucket.collected += Number(invoice.amountPaid);
    }

    for (const order of deliveredOrders) {
      // deliveredAt no puede ser null aquí: el where lo exige explícitamente.
      const bucket = bucketFor(
        periodKey(order.deliveredAt!, groupBy),
        order.branch.name,
      );
      bucket.deliveredOrders += 1;
    }

    const rows = [...buckets.values()].sort(
      (a, b) =>
        a.period.localeCompare(b.period) ||
        a.branchName.localeCompare(b.branchName),
    );

    return this.excel.generate<RevenueRow>({
      sheetName: 'Ingresos',
      rows,
      columns: [
        { header: 'Periodo', key: 'period', value: (r) => r.period },
        {
          header: 'Sucursal',
          key: 'branchName',
          width: 22,
          value: (r) => r.branchName,
        },
        {
          header: 'Órdenes entregadas',
          key: 'deliveredOrders',
          format: 'number',
          value: (r) => r.deliveredOrders,
        },
        {
          header: 'Facturas',
          key: 'invoiceCount',
          format: 'number',
          value: (r) => r.invoiceCount,
        },
        {
          header: 'Total facturado',
          key: 'invoiced',
          format: 'currency',
          value: (r) => cents(r.invoiced),
        },
        {
          header: 'Total cobrado',
          key: 'collected',
          format: 'currency',
          value: (r) => cents(r.collected),
        },
        {
          header: 'Saldo pendiente',
          key: 'balance',
          format: 'currency',
          value: (r) => cents(r.invoiced - r.collected),
        },
      ],
    });
  }
}
