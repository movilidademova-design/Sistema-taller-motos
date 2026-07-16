'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { PaginatedResult, Product } from '@/lib/types';

/** Buscador reutilizable de productos de inventario (Popover + búsqueda por nombre/SKU). */
export function ProductPicker({
  trigger,
  onSelect,
}: {
  trigger: React.ReactNode;
  onSelect: (product: Product) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const { data, isLoading } = useApiSWR<PaginatedResult<Product>>(
    open ? `/inventory/products?search=${encodeURIComponent(search)}&pageSize=20` : null,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative mb-2">
          <Search className="absolute top-2.5 left-2 size-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Buscar por nombre o SKU..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading && <p className="p-2 text-center text-sm text-muted-foreground">Buscando...</p>}
          {!isLoading && data?.items.length === 0 && (
            <p className="p-2 text-center text-sm text-muted-foreground">Sin resultados</p>
          )}
          {data?.items.map((product) => (
            <button
              key={product.id}
              type="button"
              className="flex w-full flex-col items-start rounded-md p-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onSelect(product);
                setOpen(false);
                setSearch('');
              }}
            >
              <span className="font-medium">{product.name}</span>
              <span className="text-xs text-muted-foreground">
                SKU {product.sku} · Stock {product.quantity}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
