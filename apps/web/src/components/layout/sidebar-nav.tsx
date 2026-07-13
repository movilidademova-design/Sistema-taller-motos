'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bike } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-config';
import { useAuth } from '@/components/providers/auth-provider';

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user } = useAuth();

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
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
