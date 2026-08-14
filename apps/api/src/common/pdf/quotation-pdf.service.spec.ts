import { QuotationPdfService, QuotationPdfData } from './quotation-pdf.service';

const BASE: QuotationPdfData = {
  tenant: {
    name: 'Mobulaa',
    primaryColor: '#ea580c',
    address: 'Calle 22 # 8-49',
    phone: '304 540 1050',
    currency: 'COP',
  },
  quotationNumber: '22590220',
  date: new Date('2026-07-18T12:00:00Z'),
  clientName: 'Carlos Ramírez',
  vehicle: 'Mobulaa Apolo',
  items: [
    {
      description: 'Cunas de dirección',
      quantity: 1,
      unitPrice: 70000,
      subtotal: 70000,
    },
    { description: 'Farola', quantity: 2, unitPrice: 140000, subtotal: 280000 },
  ],
  total: 350000,
  validityDays: 8,
};

describe('QuotationPdfService', () => {
  const service = new QuotationPdfService();

  it('produces a real PDF', async () => {
    const buffer = await service.render(BASE);

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('does not blow up when the logo is missing', async () => {
    // El logo del taller es opcional y su archivo puede no estar en disco;
    // eso no puede impedir que se genere la cotización.
    const buffer = await service.render({
      ...BASE,
      tenant: { ...BASE.tenant, logoUrl: '/uploads/no-existe.png' },
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('handles a quotation with no notes and a single item', async () => {
    const buffer = await service.render({
      ...BASE,
      items: [BASE.items[0]],
      total: 70000,
      notes: null,
    });

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
