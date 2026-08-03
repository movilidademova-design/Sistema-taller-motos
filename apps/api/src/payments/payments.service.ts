import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoiceStatus, PaymentMethod, Role } from '../generated/prisma/enums';
import { ExcelService, MAX_ROWS } from '../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../common/utils/export-filters.util';
import { ExportPaymentsQueryDto } from './dto/export-payments-query.dto';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  QR: 'QR',
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly excel: ExcelService,
  ) {}

  findAll(tenantId: string, clientId?: string) {
    return this.prisma.payment.findMany({
      where: { tenantId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { firstName: true, lastName: true } },
        order: { select: { orderNumber: true } },
      },
    });
  }

  async create(tenantId: string, receivedById: string, dto: CreatePaymentDto) {
    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
    });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const receiptNumber = `REC-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          clientId: dto.clientId,
          orderId: dto.orderId,
          invoiceId: dto.invoiceId,
          method: dto.method,
          amount: dto.amount,
          reference: dto.reference,
          receiptNumber,
          receivedById,
        },
      });

      if (dto.invoiceId) {
        const invoice = await tx.invoice.findUniqueOrThrow({
          where: { id: dto.invoiceId },
        });
        const amountPaid = Number(invoice.amountPaid) + dto.amount;
        const status =
          amountPaid >= Number(invoice.total)
            ? InvoiceStatus.PAID
            : InvoiceStatus.PARTIALLY_PAID;
        await tx.invoice.update({
          where: { id: dto.invoiceId },
          data: { amountPaid, status },
        });
      }

      return payment;
    });
  }

  async exportToExcel(
    tenantId: string,
    currentBranchId: string,
    role: Role,
    query: ExportPaymentsQueryDto,
  ): Promise<Buffer> {
    const branchId = resolveExportBranchId(
      role,
      currentBranchId,
      query.branchId,
    );
    const createdAt = dateRangeFilter(query.from, query.to);

    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        ...(createdAt ? { createdAt } : {}),
        ...(query.method ? { method: query.method } : {}),
        // Payment no tiene branchId propio (ver sección 3.5 del spec de diseño):
        // la sucursal se deriva de la orden, y un pago sin orden (un abono
        // adelantado, por ejemplo) no se puede atribuir a ninguna sede.
        //
        // Esos pagos huérfanos quedan FUERA de un reporte por sucursal y solo
        // aparecen cuando un ADMIN exporta el taller completo, marcados como
        // "Sin sucursal". Repetirlos en el reporte de cada sede haría que sumar
        // los reportes de todas diera de más, y un pago contado dos veces no
        // salta a la vista al cuadrar caja; uno que falta, sí. La solución de
        // fondo es darle `branchId` propio a Payment — ver el spec.
        ...(branchId ? { order: { branchId } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_ROWS + 1, // ver la nota en el export de Órdenes
      include: {
        client: {
          select: { firstName: true, lastName: true, documentId: true },
        },
        order: {
          select: { orderNumber: true, branch: { select: { name: true } } },
        },
        invoice: { select: { invoiceNumber: true } },
        receivedBy: { select: { firstName: true, lastName: true } },
      },
    });

    type Row = (typeof payments)[number];

    return this.excel.generate<Row>({
      sheetName: 'Pagos',
      rows: payments,
      columns: [
        {
          header: 'Número de recibo',
          key: 'receiptNumber',
          value: (p) => p.receiptNumber,
        },
        {
          header: 'Fecha',
          key: 'createdAt',
          format: 'datetime',
          value: (p) => p.createdAt,
        },
        {
          header: 'Cliente',
          key: 'client',
          width: 26,
          value: (p) => `${p.client.firstName} ${p.client.lastName}`,
        },
        {
          header: 'Documento',
          key: 'document',
          value: (p) => p.client.documentId,
        },
        {
          header: 'Número de orden',
          key: 'order',
          value: (p) => p.order?.orderNumber,
        },
        {
          header: 'Número de factura',
          key: 'invoice',
          value: (p) => p.invoice?.invoiceNumber,
        },
        {
          header: 'Método',
          key: 'method',
          value: (p) => PAYMENT_METHOD_LABELS[p.method],
        },
        {
          header: 'Monto',
          key: 'amount',
          format: 'currency',
          value: (p) => Number(p.amount),
        },
        { header: 'Referencia', key: 'reference', value: (p) => p.reference },
        {
          header: 'Recibido por',
          key: 'receivedBy',
          width: 22,
          value: (p) => `${p.receivedBy.firstName} ${p.receivedBy.lastName}`,
        },
        {
          header: 'Sucursal',
          key: 'branch',
          value: (p) => p.order?.branch.name ?? 'Sin sucursal',
        },
      ],
    });
  }
}
