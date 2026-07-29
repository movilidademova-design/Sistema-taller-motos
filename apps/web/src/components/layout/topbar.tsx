'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, Building2, Menu, LogOut, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from './theme-toggle';
import { SidebarNav } from './sidebar-nav';
import { useAuth } from '@/components/providers/auth-provider';
import { useApiSWR } from '@/hooks/use-api-swr';
import { NotificationActions } from '@/components/notifications/notification-actions';
import type { Notification, PaginatedResult } from '@/lib/types';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepcionista',
  TECHNICIAN: 'Técnico',
  CLIENT: 'Cliente',
};

function NotificationBell() {
  const { user } = useAuth();
  const canSeeInbox = user && ['ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(user.role);
  const { data, mutate } = useApiSWR<PaginatedResult<Notification>>(
    canSeeInbox ? '/notifications?status=PENDING&pageSize=5' : null,
    { refreshInterval: 30_000 },
  );

  if (!canSeeInbox) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notificaciones${data?.total ? `, ${data.total} pendientes` : ''}`}
        >
          <Bell className="size-5" />
          {!!data?.total && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
              {data.total > 9 ? '9+' : data.total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificaciones pendientes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(!data || data.items.length === 0) && (
          <p className="px-2 py-3 text-sm text-muted-foreground">Sin notificaciones pendientes</p>
        )}
        {data?.items.map((n) => (
          <div key={n.id} className="flex flex-col gap-1.5 border-b p-2 text-sm last:border-b-0">
            <p className="font-medium">Orden #{n.order.orderNumber}</p>
            <p className="text-muted-foreground">{n.message}</p>
            <NotificationActions notification={n} onSent={() => mutate()} />
          </div>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications">Ver todas</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BranchSwitcher() {
  const { branches, currentBranchId, setCurrentBranchId } = useAuth();

  if (branches.length <= 1) return null;

  const current = branches.find((b) => b.id === currentBranchId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          aria-label={`Sucursal actual: ${current?.name ?? 'ninguna seleccionada'}`}
        >
          <Building2 className="size-4" />
          <span className="hidden text-sm font-medium sm:inline">{current?.name ?? 'Sucursal'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Cambiar de sucursal</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.map((branch) => (
          <DropdownMenuCheckboxItem
            key={branch.id}
            checked={branch.id === currentBranchId}
            onSelect={() => setCurrentBranchId(branch.id)}
          >
            {branch.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : '';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)}>
          <Menu className="size-5" />
        </Button>
        <SheetContent side="left" className="w-64 bg-sidebar p-4 text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Menú</SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1" />

      <BranchSwitcher />
      <NotificationBell />
      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="gap-2 px-2">
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden text-sm font-medium sm:inline">
              {user?.firstName} {user?.lastName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{user?.email}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {user ? ROLE_LABELS[user.role] : ''}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <UserIcon /> Mi perfil
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => logout()}>
            <LogOut /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
