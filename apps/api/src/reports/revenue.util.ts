import { toWorkshopLocal } from '../common/utils/export-filters.util';
import { RevenueGroupBy } from './dto/revenue-report-query.dto';

/**
 * Etiqueta del periodo al que cae una fecha, para agrupar facturas y órdenes en
 * el reporte de ingresos.
 *
 * Se calcula sobre el reloj del taller, no sobre UTC. Tiene que coincidir con
 * el criterio de `dateRangeFilter`, que ancla los límites del rango al día
 * local: si el rango se recorta en hora local y los grupos se arman en UTC, una
 * factura emitida a las 20:00 del 31 de julio entra en un reporte "hasta el 31
 * de julio" pero aparece etiquetada como agosto. Con el horario normal de un
 * taller eso no es un caso raro — pasa cada fin de mes, y cada noche cuando se
 * agrupa por día.
 */
export function periodKey(date: Date, groupBy: RevenueGroupBy): string {
  const local = toWorkshopLocal(date);
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  if (groupBy === RevenueGroupBy.MONTH) return `${year}-${month}`;
  const day = String(local.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
