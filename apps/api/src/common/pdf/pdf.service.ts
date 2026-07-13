import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

interface TenantHeader {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  currency: string;
}

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface DocumentData {
  title: string;
  documentNumber: string;
  date: Date;
  tenant: TenantHeader;
  clientName: string;
  clientDocument?: string | null;
  clientPhone?: string | null;
  items: LineItem[];
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  notes?: string | null;
}

/** Renders work orders, quotations and invoices as simple, print-ready PDFs. */
@Injectable()
export class PdfService {
  generateDocument(data: DocumentData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(data.tenant.name, { continued: false });
      doc.fontSize(9).fillColor('#555');
      if (data.tenant.address) doc.text(data.tenant.address);
      if (data.tenant.phone) doc.text(`Tel: ${data.tenant.phone}`);
      if (data.tenant.email) doc.text(data.tenant.email);
      if (data.tenant.taxId) doc.text(`NIT/RUC: ${data.tenant.taxId}`);
      doc.fillColor('#000');

      doc.moveDown();
      doc.fontSize(16).text(data.title, { align: 'right' });
      doc.fontSize(10).text(`No. ${data.documentNumber}`, { align: 'right' });
      doc.text(data.date.toLocaleDateString('es-CO'), { align: 'right' });

      doc.moveDown();
      doc.fontSize(11).text(`Cliente: ${data.clientName}`);
      if (data.clientDocument) doc.text(`Documento: ${data.clientDocument}`);
      if (data.clientPhone) doc.text(`Teléfono: ${data.clientPhone}`);

      doc.moveDown();
      const tableTop = doc.y;
      doc.fontSize(10).text('Descripción', 50, tableTop, { width: 250 });
      doc.text('Cant.', 300, tableTop, { width: 60, align: 'right' });
      doc.text('Precio', 360, tableTop, { width: 80, align: 'right' });
      doc.text('Subtotal', 450, tableTop, { width: 95, align: 'right' });
      doc
        .moveTo(50, tableTop + 15)
        .lineTo(545, tableTop + 15)
        .stroke();

      let y = tableTop + 22;
      for (const item of data.items) {
        doc.fontSize(9).text(item.description, 50, y, { width: 250 });
        doc.text(String(item.quantity), 300, y, { width: 60, align: 'right' });
        doc.text(formatMoney(item.unitPrice, data.tenant.currency), 360, y, {
          width: 80,
          align: 'right',
        });
        doc.text(formatMoney(item.subtotal, data.tenant.currency), 450, y, {
          width: 95,
          align: 'right',
        });
        y += 18;
      }

      doc
        .moveTo(50, y + 5)
        .lineTo(545, y + 5)
        .stroke();
      y += 15;
      doc.fontSize(10);
      doc.text(
        `Subtotal: ${formatMoney(data.subtotal, data.tenant.currency)}`,
        360,
        y,
        { width: 185, align: 'right' },
      );
      y += 15;
      if (data.discount) {
        doc.text(
          `Descuento: -${formatMoney(data.discount, data.tenant.currency)}`,
          360,
          y,
          {
            width: 185,
            align: 'right',
          },
        );
        y += 15;
      }
      doc.text(
        `Impuestos: ${formatMoney(data.taxAmount, data.tenant.currency)}`,
        360,
        y,
        {
          width: 185,
          align: 'right',
        },
      );
      y += 15;
      doc
        .fontSize(12)
        .text(
          `TOTAL: ${formatMoney(data.total, data.tenant.currency)}`,
          360,
          y,
          {
            width: 185,
            align: 'right',
          },
        );

      if (data.notes) {
        doc.moveDown(2);
        doc.fontSize(9).fillColor('#555').text(`Notas: ${data.notes}`);
      }

      doc.end();
    });
  }
}

function formatMoney(value: number, currency: string) {
  return `${currency} ${value.toFixed(2)}`;
}
