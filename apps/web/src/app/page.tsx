'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bike, Store } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';
import { SYSTEM_HOME, SYSTEM_LABELS, systemsForUser, type SystemId } from '@/lib/active-system';
import { Card } from '@/components/ui/card';

const SYSTEM_ICONS: Record<SystemId, typeof Bike> = {
  TALLER: Bike,
  POS: Store,
};

const SYSTEM_DESCRIPTIONS: Record<SystemId, string> = {
  TALLER: 'Órdenes de servicio, cotizaciones y clientes',
  POS: 'Ventas, inventario y separados',
};

export default function Home() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  // systemsForUser devuelve un array nuevo en cada render; se memoriza sobre
  // `user` para que el useEffect de abajo no se dispare en cada render.
  const systems = React.useMemo(() => systemsForUser(user), [user]);

  React.useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    // Con un solo acceso no tiene sentido mostrar una pantalla cuyo único
    // propósito sería hacer clic en el único botón que hay.
    if (systems.length === 1) router.replace(SYSTEM_HOME[systems[0]]);
  }, [isLoading, user, systems, router]);

  if (isLoading || !user || systems.length === 1) return null;

  // La base impide crear una cuenta sin ningún sistema, pero si un cambio de
  // roles deja a alguien así en plena sesión, es mejor decírselo que dejarlo
  // en una pantalla en blanco.
  if (systems.length === 0) {
    return (
      <main className="flex min-h-svh items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Tu cuenta no tiene acceso a ningún sistema. Pídele a un administrador que te
          asigne un rol.
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hola, {user.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">¿A dónde quieres entrar?</p>
      </div>
      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {systems.map((system) => {
          const Icon = SYSTEM_ICONS[system];
          return (
            <Card
              key={system}
              role="button"
              tabIndex={0}
              onClick={() => router.push(SYSTEM_HOME[system])}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  router.push(SYSTEM_HOME[system]);
                }
              }}
              className="flex cursor-pointer flex-col items-center gap-3 p-8 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Icon className="size-10 text-primary" />
              <span className="text-lg font-medium">{SYSTEM_LABELS[system]}</span>
              <span className="text-center text-sm text-muted-foreground">
                {SYSTEM_DESCRIPTIONS[system]}
              </span>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
