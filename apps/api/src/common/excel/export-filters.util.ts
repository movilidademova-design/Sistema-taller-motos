import { Role } from '../../generated/prisma/enums';

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
  if (from) filter.gte = new Date(from);
  if (to) {
    const end = new Date(to);
    end.setUTCDate(end.getUTCDate() + 1);
    filter.lt = end;
  }
  return filter;
}

/**
 * Decide por qué sucursal se filtra un export.
 *
 * Un MANAGER queda anclado a la sucursal en la que está trabajando y el
 * `branchId` que venga en el query se ignora — si se respetara, bastaría con
 * mandar el parámetro a mano para leer datos de una sede ajena. Es la misma
 * regla que ya aplica `UsersService.create` al ignorar `dto.branchIds` cuando
 * quien crea es un gerente.
 *
 * Un ADMIN sí puede elegir: con `branchId` acota a esa sucursal, sin él exporta
 * todas (y el reporte incluye la columna "Sucursal" para distinguirlas).
 */
export function resolveExportBranchId(
  role: Role,
  currentBranchId: string,
  requestedBranchId?: string,
): string | undefined {
  if (role === Role.MANAGER) return currentBranchId;
  return requestedBranchId;
}
