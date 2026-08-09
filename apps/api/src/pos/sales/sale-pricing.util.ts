import { Prisma } from '../../generated/pos/client';

// Reglas migradas de motopos/app.py líneas 398-421, el sistema que hoy corre en
// producción. Función pura: sin base de datos, sin reloj, sin nada que no sea
// aritmética — así se prueba sola y se reutiliza igual al crear una venta que al
// cotizarla antes de guardarla.
//
// Toda la aritmética usa métodos de Prisma.Decimal, nunca `number`: convertir a
// número de punto flotante en cualquier paso, aunque sea "solo para redondear",
// reintroduce el error que Decimal existe para evitar (0.1 + 0.2 !== 0.3).

const TWO_DECIMALS = 2;
const ZERO = new Prisma.Decimal(0);

export type DiscountType = 'pct' | 'amount';

export interface SaleItemInput {
  unitPrice: Prisma.Decimal;
  quantity: number;
  discount?: Prisma.Decimal;
  discountType?: DiscountType;
}

export interface SaleTotalsInput {
  items: SaleItemInput[];
  generalDiscount?: Prisma.Decimal;
  generalDiscountType?: DiscountType;
}

export interface SaleTotals {
  items: { finalPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[];
  subtotal: Prisma.Decimal;
  generalDiscount: Prisma.Decimal;
  total: Prisma.Decimal;
}

/** Precio final de una línea tras su descuento propio, nunca negativo. */
function itemFinalPrice(item: SaleItemInput): Prisma.Decimal {
  const discount = item.discount ?? ZERO;
  if (discount.isZero()) return item.unitPrice.toDecimalPlaces(TWO_DECIMALS);

  const finalPrice =
    item.discountType === 'amount'
      ? item.unitPrice.sub(discount)
      : item.unitPrice.mul(ZERO.plus(100).sub(discount).div(100));

  // El descuento fijo puede superar el precio (dato mal digitado); el
  // porcentual nunca debería, pero se protege igual por consistencia.
  return Prisma.Decimal.max(finalPrice, ZERO).toDecimalPlaces(TWO_DECIMALS);
}

export function computeSaleTotals(input: SaleTotalsInput): SaleTotals {
  const items = input.items.map((item) => {
    const finalPrice = itemFinalPrice(item);
    const lineTotal = finalPrice
      .mul(item.quantity)
      .toDecimalPlaces(TWO_DECIMALS);
    return { finalPrice, lineTotal };
  });

  const subtotal = items
    .reduce((sum, item) => sum.plus(item.lineTotal), ZERO)
    .toDecimalPlaces(TWO_DECIMALS);

  const generalDiscountInput = input.generalDiscount ?? ZERO;
  const generalDiscount = generalDiscountInput.isZero()
    ? ZERO
    : input.generalDiscountType === 'amount'
      ? // Un descuento general fijo nunca puede superar el subtotal: si lo
        // hiciera, la venta se volvería negativa.
        Prisma.Decimal.min(generalDiscountInput, subtotal).toDecimalPlaces(
          TWO_DECIMALS,
        )
      : subtotal.mul(generalDiscountInput).div(100).toDecimalPlaces(TWO_DECIMALS);

  const total = subtotal.sub(generalDiscount).toDecimalPlaces(TWO_DECIMALS);

  return { items, subtotal, generalDiscount, total };
}
