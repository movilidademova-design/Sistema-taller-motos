import useSWR, { SWRConfiguration } from 'swr';
import { api } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';

export function useApiSWR<T>(path: string | null, config?: SWRConfiguration) {
  const { activeStoreId } = useAuth();
  // La key incluye la tienda activa para que SWR revalide solo al cambiar de
  // tienda — el header real (X-Store-Id) ya lo agrega api.ts en cada request.
  const key = path ? ([path, activeStoreId] as const) : null;
  return useSWR<T>(key, ([p]: readonly [string, string | null]) => api.get<T>(p), config);
}
