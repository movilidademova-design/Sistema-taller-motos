import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

/** Escapes free-text values before interpolating them into an HTML email body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
      // Lanza, no avisa y sigue. Antes devolvía sin más, y como los dos únicos
      // sitios que llaman aquí son endpoints cuyo trabajo ES enviar el correo,
      // el resultado era que la notificación quedaba marcada como
      // «SENT / EMAIL» con su fecha de envío **sin que saliera ningún correo**.
      // El taller creía haber avisado al cliente y el cliente no recibía nada.
      // Comprobado en la base: status=SENT, sentVia=EMAIL, sentAt con fecha.
      this.logger.error(
        `SMTP no configurado — NO se envió el correo a ${options.to}: "${options.subject}"`,
      );
      throw new ServiceUnavailableException(
        'El envío de correo no está configurado en este servidor. ' +
          'Usa la opción de copiar el mensaje o de WhatsApp, o pide al administrador que configure el correo saliente.',
      );
    }
    try {
      await this.transporter.sendMail({
        from: this.config.get<string>('SMTP_FROM'),
        to: options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      });
    } catch (error) {
      // El detalle real (ECONNREFUSED, credenciales rechazadas, el host y el
      // puerto) va SÓLO al log: es justo donde hay que mirar, y justo lo que no
      // debe salir hacia el cliente.
      this.logger.error(
        `Fallo al enviar correo a ${options.to}: "${options.subject}"`,
        error instanceof Error ? error.stack : String(error),
      );
      // Sin este catch, un servidor SMTP caído devolvía «Error interno del
      // servidor» (500), que no le dice nada a quien sólo quiere avisar a un
      // cliente. Comprobado parando el servidor de correo a mitad de prueba.
      throw new ServiceUnavailableException(
        'No se pudo enviar el correo: el servidor de correo no respondió. ' +
          'Vuelve a intentarlo en unos minutos, o usa la opción de copiar el mensaje o de WhatsApp. ' +
          'Si sigue fallando, avisa al administrador.',
      );
    }
  }

  async sendQuotationReady(to: string, orderNumber: string, pdfBuffer: Buffer) {
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

  async sendNotificationMessage(
    to: string,
    orderNumber: string,
    message: string,
  ) {
    return this.send({
      to,
      subject: `Actualización de tu orden #${orderNumber}`,
      html: `<p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>`,
    });
  }

  async sendIntakeConfirmation(
    to: string,
    data: {
      clientFirstName: string;
      orderNumber: string;
      pickupCode: string;
      tenantName: string;
    },
  ) {
    return this.send({
      to,
      subject: `Hemos recibido tu vehículo — Orden #${data.orderNumber}`,
      html: `
        <p>Hola ${escapeHtml(data.clientFirstName)}.</p>
        <p>Hemos recibido correctamente tu vehículo en nuestro taller.</p>
        <p>📋 Número de Orden: <strong>${data.orderNumber}</strong><br/>
        🔐 Clave de salida: <strong>${data.pickupCode}</strong></p>
        <p>Esta clave será necesaria para retirar tu vehículo. Por favor, consérvala y no la compartas con terceros.</p>
        <p>Puedes utilizar el número de orden para realizar consultas sobre el estado de la reparación.</p>
        <p>Gracias por confiar en nosotros. Será un gusto atenderte.<br/>Equipo ${escapeHtml(data.tenantName)}</p>
      `,
    });
  }
}
