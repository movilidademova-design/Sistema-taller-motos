/**
 * Serializa la asignación de números de documento por sucursal.
 *
 * El problema que resuelve: `nextFreeNumber` lee los números usados y elige el
 * primer hueco. Dos transacciones simultáneas leen el mismo estado —en READ
 * COMMITTED, que es el nivel por defecto, ninguna ve la escritura de la otra
 * hasta el commit— y eligen el MISMO número. Se reprodujo contra PostgreSQL
 * real: dos abonos a separados distintos guardaron los dos el recibo nº 1, y
 * dos ventas simultáneas colisionaron en el número de factura.
 *
 * Estar dentro de una transacción NO evita esto: `$transaction` da atomicidad
 * (todo o nada), no serialización. Hace falta un bloqueo explícito.
 *
 * `pg_advisory_xact_lock` lo toma hasta el final de la transacción y lo suelta
 * solo, tanto en commit como en rollback — no hay forma de dejarlo colgado. El
 * bloqueo es por (sucursal, serie), así que dos cajas de sucursales distintas,
 * o una venta y un abono de separado, no se estorban entre sí.
 */

/** Cada serie de numeración independiente lleva su propio bloqueo. */
export enum NumberSeries {
  INVOICE = 'pos:invoice',
  RECEIPT = 'pos:receipt',
}

interface RawExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

/**
 * Debe llamarse DENTRO de una transacción y ANTES de calcular el número.
 * Las transacciones que compitan por la misma sucursal y serie esperan aquí,
 * y así cada una ve los números que ya escribió la anterior.
 */
export async function lockNumberSeries(
  tx: RawExecutor,
  tenantId: string,
  branchId: string,
  series: NumberSeries,
): Promise<void> {
  // Forma de dos enteros de pg_advisory_xact_lock: hashtext() devuelve int4.
  // Une tenant+sucursal en una clave y la serie en la otra.
  await tx.$executeRawUnsafe(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    `${tenantId}:${branchId}`,
    series,
  );
}
