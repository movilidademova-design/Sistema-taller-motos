'use client';

import { Building2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/components/providers/auth-provider';

const ALL_STORES = 'all';

export function StoreSwitcher() {
  const { user, activeStoreId, setActiveStore } = useAuth();
  if (!user) return null;

  // Nada que cambiar si solo tiene una sucursal (y no es Admin con la opción "Todas").
  if (user.stores.length <= 1 && user.role !== 'ADMIN') return null;

  return (
    <Select
      value={activeStoreId ?? ALL_STORES}
      onValueChange={(v) => setActiveStore(v === ALL_STORES ? null : v)}
    >
      <SelectTrigger className="w-auto max-w-48 gap-1.5 border-none bg-transparent shadow-none">
        <Building2 className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {user.role === 'ADMIN' && <SelectItem value={ALL_STORES}>Todas las tiendas</SelectItem>}
        {user.stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
