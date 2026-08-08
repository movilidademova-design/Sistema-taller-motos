'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/components/providers/auth-provider';
import {
  SYSTEM_HOME,
  SYSTEM_LABELS,
  systemForPath,
  systemsForUser,
} from '@/lib/active-system';

export function SystemSwitcher() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const systems = systemsForUser(user);

  // Con acceso a un solo sistema no hay nada entre qué cambiar.
  if (systems.length < 2) return null;

  const active = systemForPath(pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <ArrowLeftRight className="size-4" />
          <span className="hidden text-sm font-medium sm:inline">
            {SYSTEM_LABELS[active]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Cambiar de sistema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {systems.map((system) => (
          <DropdownMenuCheckboxItem
            key={system}
            checked={system === active}
            onSelect={() => router.push(SYSTEM_HOME[system])}
          >
            {SYSTEM_LABELS[system]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
