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
import { InvoiceStatus, QuotationStatus } from '../generated/prisma/enums';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly emailService: EmailService,
  ) {}

  findAll(tenantId: string, storeId: string | null) {
    return this.prisma.invoice.findMany({
      where: { tenantId, ...(storeId ? { storeId } : {}) },
      orderBy: { issuedAt: 'desc' },
      include: { client: true, order: { select: { orderNumber: true } } },
    });
  }

  async findOne(tenantId: string, storeId: string | null, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId, ...(storeId ? { storeId } : {}) },
      include: {
        client: true,
        order: { include: { quotation: { include: { items: true } } } },
        payments: true,
      },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  async generateFromOrder(tenantId: string, storeId: string | null, dto: CreateInvoiceDto) {
    if (!storeId) {
      throw new BadRequestException('Selecciona una sucursal específica para generar una factura');
    }
    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId, storeId },
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
          storeId,
          orderId: order.id,
          clientId: order.clientId,
          invoiceNumber,
          subtotal:
            Number(order.quotation!.partsCost) +
            Number(order.quotation!.laborCost),
          taxAmount: order.quotation!.taxAmount,
          discount: order.quotation!.discount,
          total: order.quotation!.total,
          status: InvoiceStatus.ISSUED,
        },
      });
    });

    return this.findOne(tenantId, storeId, invoice.id);
  }

  async renderPdf(tenantId: string, storeId: string | null, id: string): Promise<Buffer> {
    const invoice = await this.findOne(tenantId, storeId, id);
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

  async sendByEmail(tenantId: string, storeId: string | null, id: string) {
    const invoice = await this.findOne(tenantId, storeId, id);
    if (!invoice.client.email) {
      throw new BadRequestException('El cliente no tiene correo registrado');
    }
    const pdf = await this.renderPdf(tenantId, storeId, id);
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
}
