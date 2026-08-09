'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

// /pos ya no muestra nada por sí mismo: Vender es la pantalla del día a día.
// El control de acceso vive en el layout compartido de /pos/*.
export default function PosPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace('/pos/vender');
  }, [router]);

  return null;
}
