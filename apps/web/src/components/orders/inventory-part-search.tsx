'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useApiSWR } from '@/hooks/use-api-swr';
import type { PaginatedResult, Product } from '@/lib/types';

export function InventoryPartSearch({ onSelect }: { onSelect: (product: Product) => void }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [debouncedQuery, setDebouncedQuery] = React.useState('');

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const { data, isLoading } = useApiSWR<PaginatedResult<Product>>(
    open && debouncedQuery.trim()
      ? `/inventory/products?search=${encodeURIComponent(debouncedQuery)}&pageSize=10`
      : null,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Search className="size-4" /> Buscar en inventario
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          autoFocus
          placeholder="Nombre, SKU o código..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {isLoading && <p className="p-2 text-sm text-muted-foreground">Buscando...</p>}
          {!isLoading && debouncedQuery.trim() !== '' && data?.items.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">Sin resultados</p>
          )}
          {data?.items.map((product) => (
            <button
              key={product.id}
              type="button"
              className="flex flex-col rounded-md p-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onSelect(product);
                setOpen(false);
                setQuery('');
              }}
            >
              <span className="font-medium">{product.name}</span>
              <span className="text-xs text-muted-foreground">
                SKU: {product.sku} — Stock: {product.quantity}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
