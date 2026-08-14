import { Prisma } from '../../generated/pos/client';
import { nextFreeNumber } from '../shared/next-free-number.util';
import { lockNumberSeries, NumberSeries } from '../shared/branch-lock.util';

// Reglas migradas de motopos/app.py: _next_factura_num (línea 369).
//
// ponytail: piso fijo por ahora — app.py lo lee de una tabla `configuracion`
// que todavía no se portó. Se vuelve configurable por tenant cuando alguien
// lo pida de verdad.
export const INVOICE_NUMBER_FLOOR = 3;

/**
 * Primer número de factura libre desde el piso, por sucursal. NO cuenta
 * hacia arriba: reutiliza el hueco que deja una venta anulada (app.py línea
 * 374), porque es la regla fiscal que el usuario ya decidió mantener.
 *
 * Compartida entre PosSalesService y PosLayawaysService: un separado
 * completado crea una PosSale real que saca número de la MISMA tabla que
 * las ventas normales, así que ambos deben competir por el mismo hueco.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
): Promise<number> {
  // Antes del SELECT, o la carrera sigue abierta: sin esto, dos ventas
  // simultáneas de la misma sucursal leían el mismo conjunto de números usados
  // y elegían el mismo hueco. La segunda moría con violación de unicidad y el
  // cajero perdía la venta.
  await lockNumberSeries(tx, tenantId, branchId, NumberSeries.INVOICE);

  const sales = await tx.posSale.findMany({
    where: { tenantId, branchId, invoiceNumber: { not: null } },
    select: { invoiceNumber: true },
  });
  const used = new Set(sales.map((s) => s.invoiceNumber as number));
  return nextFreeNumber(used, INVOICE_NUMBER_FLOOR, 4);
}
