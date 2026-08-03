import { RevenueGroupBy } from './dto/revenue-report-query.dto';

/**
 * Etiqueta del periodo al que cae una fecha. Se usa como clave para agrupar
 * facturas y órdenes en el reporte de ingresos. Se calcula sobre UTC para que
 * el mismo dato produzca siempre el mismo bucket, sin importar la zona horaria
 * del servidor que genere el reporte.
 */
export function periodKey(date: Date, groupBy: RevenueGroupBy): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  if (groupBy === RevenueGroupBy.MONTH) return `${year}-${month}`;
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
