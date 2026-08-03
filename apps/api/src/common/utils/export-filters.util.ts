import { BadRequestException } from '@nestjs/common';
import { Role } from '../../generated/prisma/enums';

/**
 * El taller opera en Colombia (UTC-5), pero Prisma guarda las fechas en UTC.
 * Interpretar "2026-07-31" como medianoche UTC dejaría fuera todo lo registrado
 * entre las 19:00 y la medianoche hora local de ese día — justo las horas de
 * cierre — y metería cinco horas del día anterior por el otro extremo. Para un
 * reporte de caja eso son cifras equivocadas, no un detalle cosmético, así que
 * los límites se anclan al día local.
 *
 * Colombia no aplica horario de verano, de modo que el desfase es constante y
 * un valor fijo alcanza. El día que la aplicación soporte talleres en otros
 * países, esto tiene que salir de la configuración del tenant (que hoy solo
 * guarda `currency`), igual que el `es-CO` que ya está fijo en `PdfService`.
 */
const WORKSHOP_UTC_OFFSET = '-05:00';
const WORKSHOP_UTC_OFFSET_MS = -5 * 60 * 60 * 1000;

/**
 * Corre un instante UTC al reloj del taller, para poder leerle año/mes/día
 * locales con los getters `getUTC*`.
 *
 * Quien agrupe por periodo TIENE que usar esto: los límites de un rango se
 * anclan al día local (ver arriba), así que agrupar por día/mes en UTC mezcla
 * los dos criterios y una factura emitida a las 20:00 del 31 de julio —
 * dentro de un rango "hasta el 31 de julio"— caería en el grupo de agosto.
 */
export function toWorkshopLocal(date: Date): Date {
  return new Date(date.getTime() + WORKSHOP_UTC_OFFSET_MS);
}

function startOfLocalDay(isoDate: string): Date {
  const date = new Date(`${isoDate}T00:00:00${WORKSHOP_UTC_OFFSET}`);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(
      `Fecha inválida: "${isoDate}". Usa el formato AAAA-MM-DD.`,
    );
  }
  return date;
}

/**
 * Traduce un rango de fechas (formato YYYY-MM-DD) a un filtro de Prisma.
 * El límite superior se expresa como `lt` del día siguiente en vez de `lte` del
 * día elegido: quien pide "hasta el 31" espera incluir todo el 31, y un `lte` a
 * medianoche descartaría silenciosamente ese día completo.
 */
export function dateRangeFilter(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;

  const filter: { gte?: Date; lt?: Date } = {};
  if (from) filter.gte = startOfLocalDay(from);
  if (to) {
    const end = startOfLocalDay(to);
    // Sumar un día a una medianoche de desfase fijo da la medianoche del día
    // siguiente en ese mismo desfase, porque no hay cambio de horario que lo
    // corra.
    end.setUTCDate(end.getUTCDate() + 1);
    filter.lt = end;
  }
  return filter;
}

/**
 * Decide por qué sucursal se filtra un export.
 *
 * Solo un ADMIN puede elegir sucursal: con `branchId` acota a esa sede, sin él
 * exporta todas (y el reporte incluye la columna "Sucursal" para distinguirlas).
 * Cualquier otro rol queda anclado a la sucursal en la que está trabajando y el
 * `branchId` del query se ignora — si se respetara, bastaría con mandar el
 * parámetro a mano para leer datos de una sede ajena. Es la misma regla que ya
 * aplica `UsersService.create` al ignorar `dto.branchIds` cuando quien crea es
 * un gerente.
 *
 * Está escrito como lista blanca (solo ADMIN pasa) y no como lista negra (todos
 * menos MANAGER pasan) a propósito: `RolesGuard` deja pasar cualquier rol cuando
 * al endpoint le falta el decorador `@Roles`, así que si algún export futuro se
 * olvida de ponerlo, el peor caso es que alguien vea su propia sucursal, no que
 * un técnico se descargue los datos de todas.
 */
export function resolveExportBranchId(
  role: Role,
  currentBranchId: string,
  requestedBranchId?: string,
): string | undefined {
  if (role === Role.ADMIN) return requestedBranchId;
  return currentBranchId;
}
