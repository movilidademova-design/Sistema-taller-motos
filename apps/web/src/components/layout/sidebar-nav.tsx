'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bike } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-config';
import { useAuth } from '@/components/providers/auth-provider';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { Order, PaginatedResult } from '@/lib/types';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const canReviewQuotations = !!user && ['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user.role);
  // Órdenes cuya cotización espera revisión — se aprovecha el `total` del listado
  // paginado que ya existe, sin endpoint nuevo.
  const { data: waitingApproval } = useApiSWR<PaginatedResult<Order>>(
    canReviewQuotations ? '/orders?status=WAITING_APPROVAL&pageSize=1' : null,
  );
  const waitingApprovalCount = waitingApproval?.total ?? 0;

  const items = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 px-2 text-base font-semibold">
        <Bike className="size-5" />
        Taller Bicimotos
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
              {item.href === '/orders' && waitingApprovalCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
                  {waitingApprovalCount > 99 ? '99+' : waitingApprovalCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
