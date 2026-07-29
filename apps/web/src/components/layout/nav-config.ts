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
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Panel', icon: LayoutDashboard },
  { href: '/orders', label: 'Órdenes', icon: ClipboardList },
  { href: '/clients', label: 'Clientes', icon: Users, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/motorcycles', label: 'Vehículos', icon: Bike, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/inventory', label: 'Inventario', icon: Package, roles: ['ADMIN', 'MANAGER'] },
  { href: '/purchases', label: 'Compras', icon: ShoppingCart, roles: ['ADMIN', 'MANAGER'] },
  { href: '/warranties', label: 'Garantías', icon: ShieldCheck, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/payments', label: 'Pagos', icon: Wallet, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/invoices', label: 'Facturas', icon: FileText, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/appointments', label: 'Agenda', icon: CalendarDays, roles: ['ADMIN', 'MANAGER', 'RECEPTIONIST'] },
  { href: '/settings', label: 'Configuración', icon: Settings, roles: ['ADMIN', 'MANAGER'] },
];
