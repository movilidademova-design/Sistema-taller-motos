'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Topbar } from '@/components/layout/topbar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Cargando...
      </div>
    );
  }

  return (
    <div className="flex min-h-svh">
      <aside className="hidden w-64 shrink-0 border-r bg-sidebar p-4 text-sidebar-foreground md:block">
        <SidebarNav />
      </aside>
      {/*
        `min-w-0` no es decorativo: un elemento flex tiene `min-width: auto` por
        defecto, así que se niega a encoger por debajo del ancho de su contenido.
        Sin esto, una tabla ancha estiraba toda la columna y la página entera
        desbordaba en horizontal — comprobado en navegador: hasta 391 px de más
        a 390 px de ancho, en 8 pantallas. El `overflow-x-auto` que ya trae el
        componente Table no servía de nada porque su contenedor venía estirado
        desde aquí arriba.
      */}
      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
