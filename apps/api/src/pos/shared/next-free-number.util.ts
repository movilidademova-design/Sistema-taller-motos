// Reglas migradas de motopos/app.py: _next_factura_num (línea 369) y
// _next_recibo_num (línea 379) — el mismo algoritmo de "primer hueco libre"
// para dos series de números distintas (facturas, recibos de separados).
// Función pura: quien la llama arma el set de números ya usados con su
// propia consulta (las tablas y los filtros son distintos), esta parte sólo
// hace la aritmética de encontrar el hueco.

/**
 * Primer número >= `minStart` que no esté en `used`, respetando además el
 * piso configurado (`floor`): nunca se devuelve un número <= floor. Reutiliza
 * el hueco que deja un registro anulado/cancelado en vez de contar siempre
 * hacia arriba — es la regla fiscal que ya decidió mantener este proyecto.
 */
export function nextFreeNumber(
  used: ReadonlySet<number>,
  floor: number,
  minStart: number,
): number {
  let n = Math.max(minStart, floor + 1);
  while (used.has(n)) n++;
  return n;
}
