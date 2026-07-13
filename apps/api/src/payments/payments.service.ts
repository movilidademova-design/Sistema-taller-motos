import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { InvoiceStatus } from '../generated/prisma/enums';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
