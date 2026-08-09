'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';

// Guardia compartida por /pos, /pos/vender, /pos/productos y /pos/ventas:
// escribir cualquiera de esas rutas a mano no debe bastar para entrar sin
// posRole. Un único layout evita repetir el mismo useEffect en cada página.
export default function PosLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const hasPosAccess = !!user?.posRole;

  React.useEffect(() => {
    if (!isLoading && user && !hasPosAccess) router.replace('/dashboard');
  }, [isLoading, user, hasPosAccess, router]);

  if (!hasPosAccess) return null;

  return <>{children}</>;
}
