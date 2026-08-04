import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PdfService } from '../common/pdf/pdf.service';
import { EmailService } from '../notifications/email.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import {
  InvoiceStatus,
  QuotationStatus,
  Role,
} from '../generated/prisma/enums';
import { ExcelService, MAX_ROWS } from '../common/excel/excel.service';
import {
  dateRangeFilter,
  resolveExportBranchId,
} from '../common/utils/export-filters.util';
import { ExportInvoicesQueryDto } from './dto/export-invoices-query.dto';

const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: 'Borrador',
  ISSUED: 'Emitida',
  PARTIALLY_PAID: 'Pago parcial',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService,
    private readonly excel: ExcelService,
  ) {}

  findAll(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { issuedAt: 'desc' },
      include: { client: true, order: { select: { orderNumber: true } } },
    });
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        client: true,
        order: { include: { quotation: { include: { items: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  async generateFromOrder(tenantId: string, dto: CreateInvoiceDto) {
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId },
      include: { quotation: { include: { items: true } }, client: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (
      !order.quotation ||
      order.quotation.status !== QuotationStatus.APPROVED
    ) {
      throw new BadRequestException(
        'La orden no tiene una cotización aprobada',
      );
    }
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId: order.id },
    });
    if (existing)
      throw new ConflictException('Esta orden ya tiene una factura');

    const invoice = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { nextInvoiceNo: { increment: 1 } },
      });
      const invoiceNumber = `${tenant.invoicePrefix}-${String(tenant.nextInvoiceNo - 1).padStart(6, '0')}`;

      return tx.invoice.create({
        data: {
          tenantId,
          orderId: order.id,
          clientId: order.clientId,
          invoiceNumber,
          // partsCost ya es el total de los ítems: la mano de obra dejó de ser
          // un concepto aparte y va incluida en el precio de cada repuesto.
          subtotal: order.quotation!.partsCost,
          taxAmount: order.quotation!.taxAmount,
          discount: order.quotation!.discount,
          total: order.quotation!.total,
          status: InvoiceStatus.ISSUED,
        },
      });
    });

    return this.findOne(tenantId, invoice.id);
  }

  async renderPdf(tenantId: string, id: string): Promise<Buffer> {
    const invoice = await this.findOne(tenantId, id);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const items = invoice.order.quotation?.items ?? [];

    return this.pdfService.generateDocument({
      title: 'FACTURA',
      documentNumber: invoice.invoiceNumber,
      date: invoice.issuedAt,
      tenant: {
        name: tenant.name,
        address: tenant.address,
        phone: tenant.phone,
        email: tenant.email,
        taxId: tenant.taxId,
        currency: tenant.currency,
      },
      clientName: `${invoice.client.firstName} ${invoice.client.lastName}`,
      clientDocument: invoice.client.documentId,
      clientPhone: invoice.client.phone,
      items: items.map((item) => ({
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      })),
      subtotal: Number(invoice.subtotal),
      discount: Number(invoice.discount),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
    });
  }

  async sendByEmail(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (!invoice.client.email) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }
    const pdf = await this.renderPdf(tenantId, id);
    await this.emailService.sendInvoice(
      invoice.client.email,
      invoice.invoiceNumber,
      pdf,
    );
    await this.prisma.invoice.update({
      where: { id },
      data: { sentAt: new Date() },
    });
    return { success: true };
  }

  async exportToExcel(
    tenantId: string,
    currentBranchId: string,
    role: Role,
    query: ExportInvoicesQueryDto,
  ): Promise<Buffer> {
    const branchId = resolveExportBranchId(
      role,
      currentBranchId,
      query.branchId,
    );
    const issuedAt = dateRangeFilter(query.from, query.to);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        ...(issuedAt ? { issuedAt } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(branchId ? { order: { branchId } } : {}),
        ...(query.search
          ? {
              OR: [
                {
                  invoiceNumber: {
                    contains: query.search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  client: {
                    firstName: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
                {
                  client: {
                    lastName: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { issuedAt: 'desc' },
      take: MAX_ROWS + 1, // ver la nota en el export de Órdenes
      include: {
        client: {
          select: { firstName: true, lastName: true, documentId: true },
        },
        order: {
          select: { orderNumber: true, branch: { select: { name: true } } },
        },
      },
    });

    type Row = (typeof invoices)[number];

    return this.excel.generate<Row>({
      sheetName: 'Facturas',
      rows: invoices,
      columns: [
        {
          header: 'Número de factura',
          key: 'invoiceNumber',
          value: (i) => i.invoiceNumber,
        },
        {
          header: 'Fecha de emisión',
          key: 'issuedAt',
          format: 'datetime',
          value: (i) => i.issuedAt,
        },
        {
          header: 'Cliente',
          key: 'client',
          width: 26,
          value: (i) => `${i.client.firstName} ${i.client.lastName}`,
        },
        {
          header: 'Documento',
          key: 'document',
          value: (i) => i.client.documentId,
        },
        {
          header: 'Número de orden',
          key: 'order',
          value: (i) => i.order.orderNumber,
        },
        {
          header: 'Sucursal',
          key: 'branch',
          value: (i) => i.order.branch.name,
        },
        {
          header: 'Subtotal',
          key: 'subtotal',
          format: 'currency',
          value: (i) => Number(i.subtotal),
        },
        {
          header: 'Impuesto',
          key: 'taxAmount',
          format: 'currency',
          value: (i) => Number(i.taxAmount),
        },
        {
          header: 'Descuento',
          key: 'discount',
          format: 'currency',
          value: (i) => Number(i.discount),
        },
        {
          header: 'Total',
          key: 'total',
          format: 'currency',
          value: (i) => Number(i.total),
        },
        {
          header: 'Pagado',
          key: 'amountPaid',
          format: 'currency',
          value: (i) => Number(i.amountPaid),
        },
        {
          header: 'Saldo pendiente',
          key: 'balance',
          format: 'currency',
          value: (i) => Number(i.total) - Number(i.amountPaid),
        },
        {
          header: 'Estado',
          key: 'status',
          value: (i) => INVOICE_STATUS_LABELS[i.status],
        },
        {
          header: 'Vencimiento',
          key: 'dueAt',
          format: 'date',
          value: (i) => i.dueAt,
        },
      ],
    });
  }
}
