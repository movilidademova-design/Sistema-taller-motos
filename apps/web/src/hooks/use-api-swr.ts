import useSWR, { SWRConfiguration } from 'swr';
import { api } from '@/lib/api';

export function useApiSWR<T>(path: string | null, config?: SWRConfiguration) {
  return useSWR<T>(path, (p: string) => api.get<T>(p), config);
}
