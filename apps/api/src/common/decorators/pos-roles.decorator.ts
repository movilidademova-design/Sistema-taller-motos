import { SetMetadata } from '@nestjs/common';
import { PosRole } from '../../generated/prisma/enums';

// Clave separada de ROLES_KEY a propósito: Role.ADMIN y PosRole.ADMIN son la
// misma cadena 'ADMIN'. Si compartieran lista, exigir el ADMIN del taller
// dejaría entrar también al del POS.
export const POS_ROLES_KEY = 'posRoles';
export const PosRoles = (...roles: PosRole[]) =>
  SetMetadata(POS_ROLES_KEY, roles);
