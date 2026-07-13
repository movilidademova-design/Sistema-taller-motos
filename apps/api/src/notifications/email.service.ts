import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get<string>('SMTP_PORT') ?? 587),
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: this.config.get<string>('SMTP_PASSWORD'),
        },
      });
    }
  }

  async send(options: SendMailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP no configurado — se omite envío de correo a ${options.to}: "${options.subject}"`,
      );
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM'),
      to: options.to,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments,
    });
  }

  async sendQuotationReady(to: string, orderNumber: number, pdfBuffer: Buffer) {
    return this.send({
      to,
      subject: `Cotización disponible — Orden #${orderNumber}`,
      html: `<p>Tu cotización para la orden <strong>#${orderNumber}</strong> ya está disponible. Revisa el PDF adjunto.</p>`,
      attachments: [
        { filename: `cotizacion-${orderNumber}.pdf`, content: pdfBuffer },
      ],
    });
  }

  async sendInvoice(to: string, invoiceNumber: string, pdfBuffer: Buffer) {
    return this.send({
      to,
      subject: `Factura ${invoiceNumber}`,
      html: `<p>Adjuntamos tu factura <strong>${invoiceNumber}</strong>. ¡Gracias por confiar en nosotros!</p>`,
      attachments: [
        { filename: `factura-${invoiceNumber}.pdf`, content: pdfBuffer },
      ],
    });
  }

  async sendOrderStatusUpdate(
    to: string,
    orderNumber: number,
    statusLabel: string,
  ) {
    return this.send({
      to,
      subject: `Actualización de tu orden #${orderNumber}`,
      html: `<p>Tu bicimoto (orden <strong>#${orderNumber}</strong>) ahora está: <strong>${statusLabel}</strong>.</p>`,
    });
  }
}
