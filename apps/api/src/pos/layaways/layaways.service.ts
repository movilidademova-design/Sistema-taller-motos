import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/pos/client';
import { PosLayawayStatus } from '../../generated/pos/enums';
import { PosPrismaService } from '../pos-prisma.service';
import { computeSaleTotals, DiscountType } from '../sales/sale-pricing.util';
import { nextInvoiceNumber } from '../sales/invoice-number.util';
import { nextFreeNumber } from '../shared/next-free-number.util';
import {
  AddLayawayPaymentDto,
  CreateLayawayDto,
  CreateLayawayItemDto,
  ListLayawaysQueryDto,
} from './dto/layaway.dto';
import { ExcelService, MAX_ROWS } from '../../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../../common/utils/export-filters.util';
import { PosExportQueryDto } from '../reports/dto/pos-export-query.dto';
import { Role } from '../../generated/prisma/enums';

// Reglas migradas de motopos/app.py: crear_separado (línea 1418),
// agregar_pago_separado (línea 1523), cancelar_separado (línea 1568),
// _completar_separado (línea 1382), _next_recibo_num (línea 379).

// ponytail: piso fijo, igual que INVOICE_NUMBER_FLOOR en invoice-number.util.ts
// — app.py lo lee de `configuracion`, tabla que todavía no se portó.
const RECEIPT_NUMBER_FLOOR = 0;

const LAYAWAY_INCLUDE = {
  items: true,
  payments: { orderBy: { paidAt: 'asc' } },
} satisfies Prisma.PosLayawayInclude;

interface ResolvedLayawayItem {
  productId: string | null;
  name: string;
  unitPrice: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  reference: string;
  color: string;
  supplier: string;
  quantity: number;
  discount?: Prisma.Decimal;
  discountType?: DiscountType;
}

@Injectable()
export class PosLayawaysService {
  constructor(
    private readonly prisma: PosPrismaService,
    private readonly excel: ExcelService,
  ) {}

  async create(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateLayawayDto,
  ) {
    if (!dto.clientName.trim()) {
      throw new BadRequestException('El nombre del cliente es obligatorio');
    }

    return this.prisma.$transaction(async (tx) => {
      // Igual que en PosSalesService.create: toda la operación (leer
      // productos, calcular totales, crear el separado y descontar stock)
      // corre en una sola transacción — o todo, o nada.
      const resolvedItems: ResolvedLayawayItem[] = [];
      for (const item of dto.items) {
        resolvedItems.push(
          await this.resolveItem(tx, tenantId, branchId, item),
        );
      }

      const totals = computeSaleTotals({
        items: resolvedItems.map((r) => ({
          unitPrice: r.unitPrice,
          quantity: r.quantity,
          discount: r.discount,
          discountType: r.discountType,
        })),
        generalDiscount:
          dto.generalDiscount !== undefined
            ? new Prisma.Decimal(dto.generalDiscount)
            : undefined,
        generalDiscountType: dto.generalDiscountType,
      });

      const initialPayment = new Prisma.Decimal(dto.payment.amount);
      // app.py línea 1452: un abono que cubre el total completo no es un
      // separado, es una venta normal.
      if (initialPayment.gte(totals.total)) {
        throw new BadRequestException(
          'El abono cubre el total. Use una venta normal.',
        );
      }
      const balance = totals.total.sub(initialPayment);

      const receiptNumber = await this.nextReceiptNumber(
        tx,
        tenantId,
        branchId,
      );

      const layaway = await tx.posLayaway.create({
        data: {
          tenantId,
          branchId,
          clientName: dto.clientName.trim(),
          clientDoc: dto.clientDoc ?? '',
          clientPhone: dto.clientPhone ?? '',
          total: totals.total,
          generalDiscount: totals.generalDiscount,
          paid: initialPayment,
          balance,
          notes: dto.notes ?? '',
          createdById: userId,
          items: {
            create: resolvedItems.map((r, i) => ({
              productId: r.productId,
              name: r.name,
              unitPrice: r.unitPrice,
              unitCost: r.unitCost,
              finalPrice: totals.items[i].finalPrice,
              quantity: r.quantity,
              lineTotal: totals.items[i].lineTotal,
              reference: r.reference,
              color: r.color,
              supplier: r.supplier,
            })),
          },
          payments: {
            create: {
              amount: initialPayment,
              method: dto.payment.method,
              notes: 'Abono inicial',
              receiptNumber,
              createdById: userId,
            },
          },
        },
        include: LAYAWAY_INCLUDE,
      });

      // El stock sale del inventario AL CREAR el separado — la mercancía
      // queda apartada, fuera de lo disponible para vender. NO se vuelve a
      // descontar al completarse (ver completeLayaway más abajo).
      for (const r of resolvedItems) {
        if (r.productId) {
          await tx.posProduct.update({
            where: { id: r.productId },
            data: { stock: { decrement: r.quantity } },
          });
        }
      }

      return layaway;
    });
  }

  async findAll(
    tenantId: string,
    branchId: string,
    query: ListLayawaysQueryDto,
  ) {
    return this.prisma.posLayaway.findMany({
      where: {
        tenantId,
        branchId,
        status: query.status ?? PosLayawayStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
      include: LAYAWAY_INCLUDE,
    });
  }

  async findOne(tenantId: string, branchId: string, id: string) {
    const layaway = await this.prisma.posLayaway.findFirst({
      where: { id, tenantId, branchId },
      include: LAYAWAY_INCLUDE,
    });
    if (!layaway) throw new NotFoundException('Separado no encontrado');
    return layaway;
  }

  async addPayment(
    tenantId: string,
    branchId: string,
    userId: string,
    id: string,
    dto: AddLayawayPaymentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const layaway = await tx.posLayaway.findFirst({
        where: { id, tenantId, branchId, status: PosLayawayStatus.ACTIVE },
      });
      if (!layaway) {
        throw new NotFoundException(
          'Separado no encontrado o ya no está activo',
        );
      }

      // app.py línea 1538: el abono se recorta al saldo pendiente, nunca se
      // paga de más.
      const amount = Prisma.Decimal.min(
        new Prisma.Decimal(dto.amount),
        layaway.balance,
      );
      const newPaid = layaway.paid.plus(amount);
      const newBalance = Prisma.Decimal.max(
        layaway.total.sub(newPaid),
        new Prisma.Decimal(0),
      );

      const receiptNumber = await this.nextReceiptNumber(
        tx,
        tenantId,
        branchId,
      );
      await tx.posLayawayPayment.create({
        data: {
          layawayId: id,
          amount,
          method: dto.method,
          notes: dto.notes ?? '',
          receiptNumber,
          createdById: userId,
        },
      });
      await tx.posLayaway.update({
        where: { id },
        data: { paid: newPaid, balance: newBalance },
      });

      // El único paso automático de todo el módulo: si el saldo llega a
      // cero, el separado se convierte en venta solo (app.py línea 1552).
      let sale: Prisma.PosSaleGetPayload<{
        include: { items: true; payments: true };
      }> | null = null;
      if (newBalance.isZero()) {
        for (const delivery of dto.items ?? []) {
          await tx.posLayawayItem.update({
            where: { id: delivery.layawayItemId },
            data: {
              engineNumber: delivery.engineNumber ?? null,
              chassisNumber: delivery.chassisNumber ?? null,
            },
          });
        }
        sale = await this.completeLayaway(tx, tenantId, branchId, id);
      }

      const updated = await tx.posLayaway.findUniqueOrThrow({
        where: { id },
        include: LAYAWAY_INCLUDE,
      });
      return { ...updated, sale };
    });
  }

  async cancel(tenantId: string, branchId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const layaway = await tx.posLayaway.findFirst({
        where: { id, tenantId, branchId, status: PosLayawayStatus.ACTIVE },
        include: { items: true },
      });
      if (!layaway) {
        throw new NotFoundException('Separado no encontrado o ya no activo');
      }

      // Devuelve al inventario lo que se descontó al crear el separado.
      for (const item of layaway.items) {
        if (item.productId) {
          await tx.posProduct.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }
      }

      await tx.posLayaway.update({
        where: { id },
        data: { status: PosLayawayStatus.CANCELLED },
      });
      // app.py línea 1581: libera todos los números de recibo, igual que
      // anular una venta libera su número de factura. Misma decisión fiscal.
      await tx.posLayawayPayment.updateMany({
        where: { layawayId: id },
        data: { receiptNumber: null },
      });

      return tx.posLayaway.findUniqueOrThrow({
        where: { id },
        include: LAYAWAY_INCLUDE,
      });
    });
  }

  /** Una fila por separado, con saldo y resumen de abonos — no por abono individual. */
  async exportToExcel(
    tenantId: string,
    currentBranchId: string,
    query: PosExportQueryDto,
  ): Promise<Buffer> {
    const branchId = resolveExportBranchId(
      Role.ADMIN,
      currentBranchId,
      query.branchId,
    );
    const createdAt = dateRangeFilter(query.from, query.to);

    const layaways = await this.prisma.posLayaway.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS + 1,
      include: { payments: { orderBy: { paidAt: 'asc' } } },
    });

    const statusLabel: Record<PosLayawayStatus, string> = {
      [PosLayawayStatus.ACTIVE]: 'Activo',
      [PosLayawayStatus.COMPLETED]: 'Completado',
      [PosLayawayStatus.CANCELLED]: 'Cancelado',
    };

    type Row = (typeof layaways)[number];
    return this.excel.generate<Row>({
      sheetName: 'Separados',
      rows: layaways,
      columns: [
        {
          header: 'Fecha creación',
          key: 'createdAt',
          format: 'datetime',
          value: (l) => l.createdAt,
        },
        {
          header: 'Cliente',
          key: 'client',
          width: 24,
          value: (l) => l.clientName,
        },
        { header: 'Documento', key: 'doc', value: (l) => l.clientDoc },
        { header: 'Teléfono', key: 'phone', value: (l) => l.clientPhone },
        {
          header: 'Total',
          key: 'total',
          format: 'currency',
          value: (l) => Number(l.total),
        },
        {
          header: 'Abonado',
          key: 'paid',
          format: 'currency',
          value: (l) => Number(l.paid),
        },
        {
          header: 'Saldo',
          key: 'balance',
          format: 'currency',
          value: (l) => Number(l.balance),
        },
        {
          header: 'Estado',
          key: 'status',
          value: (l) => statusLabel[l.status],
        },
        {
          header: 'Número de abonos',
          key: 'paymentCount',
          format: 'number',
          value: (l) => l.payments.length,
        },
        {
          header: 'Último abono',
          key: 'lastPayment',
          format: 'datetime',
          value: (l) => l.payments.at(-1)?.paidAt,
        },
      ],
    });
  }

  /**
   * Convierte un separado en venta real cuando su saldo llega a cero. NO
   * toca stock — ya se descontó al crear el separado (app.py línea 1412
   * lo marca con un comentario expreso: "stock ya fue descontado al crear
   * el separado, NO descontar de nuevo"). Duplicarlo aquí sería el mismo
   * doble descuento que ya sufrió este proyecto con las cotizaciones.
   */
  private async completeLayaway(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    id: string,
  ) {
    const layaway = await tx.posLayaway.findUniqueOrThrow({
      where: { id },
      include: { items: true, payments: true },
    });

    // Método de pago de la venta: agrupar los abonos por método (app.py
    // línea 1386-1389). Uno solo -> ese método; varios -> "dividido" con
    // una fila de pago por método.
    const totalsByMethod = new Map<string, Prisma.Decimal>();
    for (const payment of layaway.payments) {
      const current =
        totalsByMethod.get(payment.method) ?? new Prisma.Decimal(0);
      totalsByMethod.set(payment.method, current.plus(payment.amount));
    }
    const methodTotals = [...totalsByMethod.entries()];
    const paymentMethod =
      methodTotals.length === 1 ? methodTotals[0][0] : 'dividido';

    const invoiceNumber = await nextInvoiceNumber(tx, tenantId, branchId);

    const sale = await tx.posSale.create({
      data: {
        tenantId,
        branchId,
        invoiceNumber,
        // app.py línea 1394: el nombre y documento del separado, no de quien
        // cobra el último abono.
        clientName: layaway.clientName,
        clientDoc: layaway.clientDoc || layaway.clientPhone || '',
        paymentMethod,
        // app.py línea 1395: el subtotal se reconstruye sumando el
        // descuento general de vuelta al total ya neto.
        subtotal: layaway.total.plus(layaway.generalDiscount),
        generalDiscount: layaway.generalDiscount,
        total: layaway.total,
        // app.py línea 1396: la venta queda a nombre de quien creó el
        // separado, no de quien recibió el último abono.
        createdById: layaway.createdById,
        items: {
          create: layaway.items.map((item) => ({
            productId: item.productId,
            name: item.name,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            itemDiscount: new Prisma.Decimal(0),
            finalPrice: item.finalPrice,
            quantity: item.quantity,
            lineTotal: item.lineTotal,
            reference: item.reference,
            color: item.color,
            supplier: item.supplier,
            engineNumber: item.engineNumber,
            chassisNumber: item.chassisNumber,
          })),
        },
        payments: {
          create: methodTotals.map(([method, amount]) => ({
            method,
            amount,
          })),
        },
      },
      include: { items: true, payments: true },
    });

    await tx.posLayaway.update({
      where: { id },
      data: { status: PosLayawayStatus.COMPLETED, saleId: sale.id },
    });

    return sale;
  }

  /**
   * Primer número de recibo libre desde el piso, por sucursal. Mismo
   * algoritmo que nextInvoiceNumber, pero sobre pos_layaway_payments: los
   * pagos no tienen branchId propio, así que se filtran por la sucursal del
   * separado dueño.
   */
  private async nextReceiptNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
  ): Promise<number> {
    const payments = await tx.posLayawayPayment.findMany({
      where: {
        receiptNumber: { not: null },
        layaway: { tenantId, branchId },
      },
      select: { receiptNumber: true },
    });
    const used = new Set(payments.map((p) => p.receiptNumber as number));
    return nextFreeNumber(used, RECEIPT_NUMBER_FLOOR, 1);
  }

  private async resolveItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    item: CreateLayawayItemDto,
  ): Promise<ResolvedLayawayItem> {
    const discount =
      item.discount !== undefined
        ? new Prisma.Decimal(item.discount)
        : undefined;

    if (!item.productId) {
      return {
        productId: null,
        name: item.name ?? '',
        unitPrice: new Prisma.Decimal(item.unitPrice ?? 0),
        unitCost: new Prisma.Decimal(0),
        reference: '',
        color: '',
        supplier: '',
        quantity: item.quantity,
        discount,
        discountType: item.discountType,
      };
    }

    const product = await tx.posProduct.findFirst({
      where: { id: item.productId, tenantId, branchId, isActive: true },
    });
    if (!product) {
      throw new NotFoundException(`Producto ${item.productId} no encontrado`);
    }
    if (product.stock < item.quantity) {
      throw new BadRequestException(
        `Stock insuficiente para ${product.name}: hay ${product.stock}, se pidieron ${item.quantity}`,
      );
    }

    return {
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      unitCost: product.cost,
      reference: product.reference,
      color: product.color,
      supplier: product.supplier,
      quantity: item.quantity,
      discount,
      discountType: item.discountType,
    };
  }
}
