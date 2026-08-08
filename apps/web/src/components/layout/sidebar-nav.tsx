'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bike } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_BY_SYSTEM } from './nav-config';
import { useAuth } from '@/components/providers/auth-provider';
import { useApiSWR } from '@/hooks/use-api-swr';
import { systemForPath, SYSTEM_LABELS } from '@/lib/active-system';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const activeSystem = systemForPath(pathname);
  const isStaff =
    activeSystem === 'TALLER' &&
    !!user?.role &&
    ['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user.role);
  // Cotizaciones esperando revisión en la sucursal activa.
  const { data: pendingQuotations } = useApiSWR<{ count: number }>(
    isStaff ? '/quotations/pending-count' : null,
  );
  // Mensajes al cliente que quedaron por enviar. Se aprovecha el `total` que la
  // lista paginada ya devuelve en vez de agregar un endpoint solo para contar.
  const { data: pendingNotifications } = useApiSWR<{ total: number }>(
    isStaff ? '/notifications?status=PENDING&pageSize=1' : null,
  );

  const badges: Record<string, number> = {
    '/quotations': pendingQuotations?.count ?? 0,
    '/notifications': pendingNotifications?.total ?? 0,
  };

  const items = NAV_BY_SYSTEM[activeSystem].filter(
    (item) => !item.roles || (!!user?.role && item.roles.includes(user.role)),
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 px-2 text-base font-semibold">
        <Bike className="size-5" />
        {SYSTEM_LABELS[activeSystem]}
      </div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-foreground/10 text-sidebar-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground',
              )}
            >
              <Icon className="size-4" />
              {item.label}
              {badges[item.href] > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                  {badges[item.href] > 99 ? '99+' : badges[item.href]}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
