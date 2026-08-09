import { Prisma } from '../../generated/pos/client';
import { computeSaleTotals } from './sale-pricing.util';

const d = (n: string) => new Prisma.Decimal(n);

describe('computeSaleTotals', () => {
  it('suma líneas sin descuento', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 2 },
        { unitPrice: d('500.50'), quantity: 1 },
      ],
    });
    expect(r.subtotal.toFixed(2)).toBe('2500.50');
    expect(r.total.toFixed(2)).toBe('2500.50');
  });

  it('aplica un descuento por ítem porcentual', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 2, discount: d('10'), discountType: 'pct' },
      ],
    });
    expect(r.items[0].finalPrice.toFixed(2)).toBe('900.00');
    expect(r.subtotal.toFixed(2)).toBe('1800.00');
  });

  it('aplica un descuento por ítem fijo', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 1, discount: d('150'), discountType: 'amount' },
      ],
    });
    expect(r.items[0].finalPrice.toFixed(2)).toBe('850.00');
  });

  // Sin esto, un descuento mal digitado convierte una venta en un regalo con
  // vuelto: el total sale negativo y el cierre del mes deja de cuadrar.
  it('un descuento por ítem mayor que el precio deja la línea en cero, no en negativo', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 1, discount: d('5000'), discountType: 'amount' },
      ],
    });
    expect(r.items[0].finalPrice.toFixed(2)).toBe('0.00');
    expect(r.total.toFixed(2)).toBe('0.00');
  });

  it('aplica un descuento general porcentual', () => {
    const r = computeSaleTotals({
      items: [{ unitPrice: d('1000'), quantity: 1 }],
      generalDiscount: d('20'),
      generalDiscountType: 'pct',
    });
    expect(r.generalDiscount.toFixed(2)).toBe('200.00');
    expect(r.total.toFixed(2)).toBe('800.00');
  });

  it('un descuento general fijo nunca supera el subtotal', () => {
    const r = computeSaleTotals({
      items: [{ unitPrice: d('1000'), quantity: 1 }],
      generalDiscount: d('99999'),
      generalDiscountType: 'amount',
    });
    expect(r.generalDiscount.toFixed(2)).toBe('1000.00');
    expect(r.total.toFixed(2)).toBe('0.00');
  });

  // La razón de usar Decimal y no números de coma flotante: con `number`,
  // 0.1 + 0.2 da 0.30000000000000004, y esos centavos se acumulan hasta que
  // el cierre mensual no cuadra.
  it('no arrastra error de coma flotante', () => {
    const r = computeSaleTotals({
      items: Array.from({ length: 3 }, () => ({ unitPrice: d('0.10'), quantity: 1 })),
    });
    expect(r.subtotal.toFixed(2)).toBe('0.30');
  });
});
