import type { Role } from '@taller/shared';
import {
  LayoutDashboard,
  Users,
  Bike,
  ClipboardList,
  ClipboardCheck,
  Package,
  ShoppingCart,
  FileText,
  CalendarDays,
  Bell,
  Settings,
  FileSpreadsheet,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import type { SystemId } from '@/lib/active-system';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

export const TALLER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { href: '/orders', label: 'Órdenes', icon: ClipboardList },
  { href: '/quotations', label: 'Cotizaciones', icon: ClipboardCheck, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/clients', label: 'Clientes', icon: Users, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/motorcycles', label: 'Vehículos', icon: Bike, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/inventory', label: 'Inventario', icon: Package, roles: ['ADMIN', 'MANAGER'] },
  { href: '/purchases', label: 'Compras', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER'] },
  { href: '/invoices', label: 'Facturas', icon: FileText, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/notifications', label: 'Notificaciones', icon: Bell, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/appointments', label: 'Agenda', icon: CalendarDays, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/reports', label: 'Reportes', icon: FileSpreadsheet, roles: ['ADMIN', 'MANAGER'] },
  { href: '/settings', label: 'Configuración', icon: Settings, roles: ['ADMIN', 'MANAGER'] },
];

export const POS_NAV: NavItem[] = [
  { href: '/pos/vender', label: 'Vender', icon: ShoppingCart },
  { href: '/pos/productos', label: 'Productos', icon: Package },
  { href: '/pos/ventas', label: 'Ventas', icon: Receipt },
];

export const NAV_BY_SYSTEM: Record<SystemId, NavItem[]> = {
  TALLER: TALLER_NAV,
  POS: POS_NAV,
};
