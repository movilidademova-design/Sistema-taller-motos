'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Store } from 'lucide-react';
import { useAuth } from '@/components/providers/auth-provider';

export default function PosPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const hasPosAccess = !!user?.posRole;

  React.useEffect(() => {
    // Escribir /pos en la barra de direcciones no debe bastar para entrar.
    if (!isLoading && user && !hasPosAccess) router.replace('/dashboard');
  }, [isLoading, user, hasPosAccess, router]);

  if (!hasPosAccess) return null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Store className="size-10 text-primary" />
      <h1 className="text-xl font-semibold tracking-tight">Punto de venta</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ventas, productos y separados llegan en la siguiente entrega. Mientras tanto,
        el sistema anterior sigue disponible en tu computador.
      </p>
    </div>
  );
}
