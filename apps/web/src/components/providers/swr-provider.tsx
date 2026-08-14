'use client';

import { SWRConfig } from 'swr';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api';

/**
 * Aviso global cuando falla una carga de datos.
 *
 * El problema que resuelve: ninguna de las 24 pantallas que usan `useApiSWR`
 * desestructuraba `error`. SWR lo devolvía y nadie lo miraba, así que una
 * petición fallida dejaba `data` indefinido y la pantalla se pintaba con
 * `data?.total ?? 0` — es decir, "0 clientes registrados" en lugar de "no
 * tienes permiso" o "no se pudo conectar".
 *
 * Comprobado en navegador: un cajero (sin acceso al taller) abría /clients, la
 * API respondía 403 y la pantalla mostraba una tabla vacía y un botón "Nuevo
 * cliente", sin ningún aviso. Parecía que el taller no tenía clientes.
 *
 * Se arregla aquí y no en cada pantalla a propósito: en un solo sitio quedan
 * cubiertas las 24 actuales y las que se añadan después, que es donde el
 * problema volvería a colarse.
 */
export function SwrProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        onError: (error: unknown) => {
          const status = error instanceof ApiError ? error.status : 0;

          // 401 no: `api.ts` ya limpia la sesión y lleva al login. Un aviso
          // aquí solo añadiría ruido encima de esa redirección.
          if (status === 401) return;

          if (status === 403) {
            toast.error('No tienes permiso para ver esta información', {
              description:
                'Si crees que deberías tenerlo, pídele acceso al administrador del taller.',
            });
            return;
          }

          if (status === 0) {
            // Sin status: la petición no llegó a completarse (backend caído,
            // sin red, DNS). Es el caso que más desconcierta al usuario.
            toast.error('No se pudo conectar con el servidor', {
              description:
                'Comprueba tu conexión. Si el problema sigue, puede que el servidor esté caído.',
            });
            return;
          }

          if (status >= 500) {
            toast.error('Error en el servidor', {
              description:
                'La información no se pudo cargar. Vuelve a intentarlo en unos momentos.',
            });
            return;
          }

          toast.error('No se pudo cargar la información', {
            description: error instanceof Error ? error.message : undefined,
          });
        },
        // Sin esto, un fallo permanente (403) se reintenta en bucle y repite el
        // aviso una y otra vez.
        shouldRetryOnError: (error: unknown) => {
          const status = error instanceof ApiError ? error.status : 0;
          return status !== 403 && status !== 404;
        },
        errorRetryCount: 2,
      }}
    >
      {children}
    </SWRConfig>
  );
}
