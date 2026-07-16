import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../permissions/permission.constants';

export const PERMISSION_KEY = 'requiredPermission';
/** Basta con tener UNO de los permisos listados (OR) — útil cuando dos roles
 * distintos llegan al mismo endpoint por razones distintas (ver ProductsController). */
export const RequirePermission = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSION_KEY, permissions);
