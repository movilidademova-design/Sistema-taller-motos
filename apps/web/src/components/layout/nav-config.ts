import type { Role } from '@taller/shared';
import {
  LayoutDashboard,
  Users,
  Bike,
  ClipboardList,
  Package,
  ShoppingCart,
  ShieldCheck,
  Wallet,
  FileText,
  CalendarDays,
  Receipt,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Rol adicional requerido, cuando el permiso solo no basta (p. ej. Configuración general). */
  roles?: Role[];
  /** El módulo se muestra si el usuario tiene este permiso — ver apps/api/.../permission.constants.ts. */
  permission?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { href: '/orders', label: 'Órdenes', icon: ClipboardList },
  { href: '/clients', label: 'Clientes', icon: Users, permission: 'clients.view' },
  { href: '/motorcycles', label: 'Vehículos', icon: Bike, permission: 'motorcycles.view' },
  { href: '/inventory', label: 'Inventario', icon: Package, permission: 'inventory.view' },
  { href: '/purchases', label: 'Compras', icon: ShoppingCart, permission: 'purchases.create' },
  // Técnico también tiene warranties.manage (para resolver una garantía asignada),
  // pero su nav se mantiene reducido a "Mis órdenes/Diagnóstico/Reparaciones" —
  // por eso este ítem se restringe por rol, no por el permiso.
  { href: '/warranties', label: 'Garantías', icon: ShieldCheck, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/payments', label: 'Pagos', icon: Wallet, permission: 'payments.viewCashRegister' },
  { href: '/invoices', label: 'Facturas', icon: FileText, permission: 'invoices.create' },
  { href: '/expenses', label: 'Gastos', icon: Receipt, permission: 'expenses.manage' },
  { href: '/appointments', label: 'Agenda', icon: CalendarDays, permission: 'appointments.manage' },
  { href: '/settings', label: 'Configuración', icon: Settings, roles: ['ADMIN', 'MANAGER'] },
];
