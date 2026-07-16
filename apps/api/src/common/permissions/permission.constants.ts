import { Role } from '../../generated/prisma/enums';

/**
 * Catálogo cerrado de permisos togglables. Todo lo que NO está aquí (CRUD de
 * tiendas, parámetros generales del tenant, administrar permisos de otros
 * usuarios) es exclusivo de Role.ADMIN vía @Roles(...) y nunca es override-able
 * — son capacidades estructurales de "Super Administrador", no de negocio.
 */
export const PERMISSIONS = [
  'clients.view',
  'clients.create',
  'clients.update',
  'clients.delete',
  'motorcycles.view',
  'motorcycles.manage',
  'orders.create',
  'orders.update',
  'orders.changeStatus',
  'orders.cancel',
  'orders.deliver',
  'orders.documentation',
  'diagnosis.manage',
  'quotations.manage',
  'quotations.approve',
  'labor.manage',
  'notifications.send',
  // inventory.view: acceso a la pantalla/lista completa de inventario.
  // inventory.lookup: solo buscar UN producto para vincularlo a una línea de
  // diagnóstico/cotización (ProductPicker) — Recepción y Técnico lo necesitan
  // sin que eso les abra el módulo de Inventario completo.
  'inventory.view',
  'inventory.lookup',
  'inventory.manage',
  'inventory.viewCosts',
  'purchases.create',
  'purchases.approve',
  'payments.create',
  'payments.viewCashRegister',
  'invoices.create',
  'expenses.manage',
  'reports.view',
  'reports.viewProfitability',
  'reports.export',
  'appointments.manage',
  'warranties.manage',
  'catalogs.manage',
  'users.manage',
  'settings.manageStore',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const ALL_PERMISSIONS = [...PERMISSIONS];

/** Permisos por defecto de cada rol — el admin puede otorgar/quitar por usuario (ver UserPermissionOverride). */
export const ROLE_DEFAULT_PERMISSIONS: Record<Role, PermissionKey[]> = {
  // Super Administrador: sin restricciones (ver computeEffectivePermissions — ni los overrides lo tocan).
  ADMIN: ALL_PERMISSIONS,
  // Administrador de Tienda: todo lo togglable del catálogo.
  MANAGER: ALL_PERMISSIONS,
  // Recepción: atiende cliente, crea/gestiona órdenes, cobra (incluye lo que antes sería "Cajero").
  RECEPTIONIST: [
    'clients.view',
    'clients.create',
    'clients.update',
    'motorcycles.view',
    'motorcycles.manage',
    'orders.create',
    'orders.update',
    'orders.changeStatus',
    'orders.deliver',
    'orders.documentation',
    'inventory.lookup',
    'quotations.manage',
    'quotations.approve',
    'notifications.send',
    'payments.create',
    'payments.viewCashRegister',
    'invoices.create',
    'appointments.manage',
    'warranties.manage',
  ],
  // Técnico: solo su trabajo sobre el vehículo (el filtro a "sus" órdenes ya existe vía technicianId).
  TECHNICIAN: [
    'orders.changeStatus',
    'orders.documentation',
    'inventory.lookup',
    'diagnosis.manage',
    'quotations.manage',
    'labor.manage',
    'warranties.manage', // resuelve garantías ya aprobadas (repara el vehículo)
  ],
  // Visualizador: solo lectura de lo que el admin le autorice.
  VIEWER: ['clients.view', 'motorcycles.view', 'inventory.view', 'reports.view'],
};

export function computeEffectivePermissions(
  role: Role,
  overrides: { permission: string; granted: boolean }[],
): Record<PermissionKey, boolean> {
  if (role === Role.ADMIN) {
    return Object.fromEntries(PERMISSIONS.map((p) => [p, true])) as Record<
      PermissionKey,
      boolean
    >;
  }
  const effective = new Set<string>(ROLE_DEFAULT_PERMISSIONS[role]);
  for (const override of overrides) {
    if (override.granted) {
      effective.add(override.permission);
    } else {
      effective.delete(override.permission);
    }
  }
  return Object.fromEntries(
    PERMISSIONS.map((p) => [p, effective.has(p)]),
  ) as Record<PermissionKey, boolean>;
}
