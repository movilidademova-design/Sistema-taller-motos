import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface QuotationPdfData {
  tenant: {
    name: string;
    logoUrl?: string | null;
    primaryColor: string;
    address?: string | null;
    phone?: string | null;
    currency: string;
  };
  quotationNumber: string;
  date: Date;
  clientName: string;
  vehicle: string;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
  total: number;
  notes?: string | null;
  validityDays: number;
}

const INK = '#27272a';
const MUTED = '#71717a';
const ROW_ALT = '#f4f4f5';
const TEAL = '#0f766e';

/**
 * Cotización en el formato del taller. Es un renderizador aparte del
 * `PdfService` genérico a propósito: ese arma facturas con una plantilla
 * neutra, y esto es el documento que ve el cliente.
 */
@Injectable()
export class QuotationPdfService {
  private readonly logger = new Logger(QuotationPdfService.name);

  async render(data: QuotationPdfData): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const brand = data.tenant.primaryColor || '#ea580c';
    const money = (n: number) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: data.tenant.currency || 'COP',
        maximumFractionDigits: 0,
      }).format(n);
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // ── Encabezado ────────────────────────────────────────────────────────
    const logo = await this.loadLogo(data.tenant.logoUrl);
    if (logo) {
      try {
        doc.image(logo, left, 45, { fit: [70, 70] });
      } catch {
        // Un logo corrupto no puede tumbar la cotización.
      }
    }
    const titleX = left + (logo ? 85 : 0);
    doc
      .fillColor(brand)
      .fontSize(22)
      .font('Helvetica-Bold')
      .text(data.tenant.name.toUpperCase(), titleX, 55);
    doc
      .fillColor(INK)
      .fontSize(9)
      .font('Helvetica')
      .text(
        data.date.toLocaleDateString('es-CO', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
        left,
        55,
        { width, align: 'right' },
      )
      .font('Helvetica-Bold')
      .text(`Cotización N.º ${data.quotationNumber}`, left, 69, {
        width,
        align: 'right',
      });

    doc
      .moveTo(left, 130)
      .lineTo(right, 130)
      .lineWidth(2)
      .strokeColor(brand)
      .stroke();

    // ── Saludo e introducción ─────────────────────────────────────────────
    doc
      .fillColor(INK)
      .fontSize(15)
      .font('Helvetica-Bold')
      .text(`Estimado ${data.clientName},`, left, 155);
    doc.fontSize(9.5).font('Helvetica').fillColor(INK).moveDown(0.8);
    doc.text(
      `Reciba un cordial saludo de parte del equipo de ${data.tenant.name}. A continuación ponemos a su disposición la cotización correspondiente a la orden N.º ${data.quotationNumber}, para su vehículo ${data.vehicle}, con el detalle de los repuestos, sus valores individuales y el total a pagar.`,
      { width, align: 'left' },
    );

    doc.moveDown(1.2);
    doc.fontSize(12).font('Helvetica-Bold').text('Detalle de la cotización');
    doc.moveDown(0.5);

    // ── Tabla ─────────────────────────────────────────────────────────────
    // Cuatro columnas: el formato de referencia trae solo Ítem|Valor, pero el
    // pedido exige cantidad y valor unitario.
    const cols = [width - 240, 50, 95, 95];
    const x = [
      left,
      left + cols[0],
      left + cols[0] + cols[1],
      left + cols[0] + cols[1] + cols[2],
    ];
    const rowH = 26;
    let y = doc.y;

    const row = (
      cells: string[],
      opts: { fill?: string; color?: string; bold?: boolean },
    ) => {
      if (opts.fill) doc.rect(left, y, width, rowH).fill(opts.fill);
      doc
        .fillColor(opts.color ?? INK)
        .fontSize(9)
        .font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      cells.forEach((cell, i) => {
        doc.text(cell, x[i] + 8, y + 8, {
          width: cols[i] - 16,
          align: i === 0 ? 'left' : 'right',
          lineBreak: false,
        });
      });
      y += rowH;
    };

    row(['Ítem', 'Cant.', 'V. unitario', 'V. total'], {
      fill: INK,
      color: '#ffffff',
      bold: true,
    });
    data.items.forEach((item, i) => {
      row(
        [
          item.description,
          String(item.quantity),
          money(item.unitPrice),
          money(item.subtotal),
        ],
        { fill: i % 2 === 1 ? ROW_ALT : undefined },
      );
    });
    row(['TOTAL', '', '', money(data.total)], {
      fill: brand,
      color: '#ffffff',
      bold: true,
    });

    doc.y = y + 20;

    // ── Cajas de aviso ────────────────────────────────────────────────────
    const callout = (
      title: string,
      body: string,
      accent: string,
      bg: string,
    ) => {
      const boxY = doc.y;
      const h = 52;
      doc.rect(left, boxY, width, h).fill(bg);
      doc.rect(left, boxY, 4, h).fill(accent);
      doc
        .fillColor(accent)
        .fontSize(9.5)
        .font('Helvetica-Bold')
        .text(title, left + 16, boxY + 9, { width: width - 32 });
      doc
        .fillColor(INK)
        .fontSize(8.5)
        .font('Helvetica')
        .text(body, left + 16, boxY + 24, { width: width - 32 });
      doc.y = boxY + h + 12;
    };

    callout(
      'Validez de la cotización',
      `Esta cotización tiene una validez de ${data.validityDays} días calendario a partir de la fecha de emisión. Pasado este periodo, los precios y la disponibilidad de los productos podrán estar sujetos a cambios.`,
      TEAL,
      '#ecfdf5',
    );
    callout(
      'Recordatorio de pago',
      'El pago puede realizarse de manera anticipada, o en el momento en que recoja el vehículo en nuestras instalaciones.',
      brand,
      '#fff7ed',
    );

    doc
      .fillColor(MUTED)
      .fontSize(8.5)
      .font('Helvetica-Oblique')
      .text(
        'Nota: esta cotización ya incluye el valor de la mano de obra correspondiente a la instalación de los ítems detallados.',
        left,
        doc.y,
        { width },
      );

    if (data.notes) {
      doc
        .moveDown(0.8)
        .fillColor(INK)
        .fontSize(9)
        .font('Helvetica')
        .text(data.notes, { width });
    }

    doc
      .moveDown(1)
      .fillColor(INK)
      .fontSize(9)
      .font('Helvetica')
      .text(
        'Quedamos atentos a cualquier duda, comentario o ajuste que desee realizar sobre esta cotización.',
        { width },
      );
    doc.moveDown(0.8).text('Atentamente,');
    doc
      .fillColor(brand)
      .font('Helvetica-Bold')
      .text(`El equipo de ${data.tenant.name}`);

    // ── Pie ───────────────────────────────────────────────────────────────
    const footY = doc.page.height - doc.page.margins.bottom - 46;
    doc.rect(left, footY, width, 46).fill(INK);
    doc
      .fillColor('#ffffff')
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(data.tenant.name, left, footY + 10, { width, align: 'center' });
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#d4d4d8')
      .text(
        [data.tenant.address, data.tenant.phone && `Tel: ${data.tenant.phone}`]
          .filter(Boolean)
          .join('  ·  '),
        left,
        footY + 25,
        { width, align: 'center' },
      );

    doc.end();
    return done;
  }

  /** Lee el logo del disco. Solo rutas locales de /uploads; una URL externa se ignora. */
  private async loadLogo(logoUrl?: string | null): Promise<Buffer | null> {
    if (!logoUrl?.startsWith('/uploads/')) return null;
    try {
      return await fs.readFile(
        path.join(process.cwd(), logoUrl.replace('/uploads/', 'uploads/')),
      );
    } catch {
      this.logger.warn(`No se pudo leer el logo ${logoUrl}; se omite`);
      return null;
    }
  }
}
