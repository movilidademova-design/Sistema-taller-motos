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
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  React.useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timeout);
  }, [query]);

  const { data, isLoading } = useApiSWR<PaginatedResult<Product>>(
    open && debouncedQuery.trim()
      ? `/inventory/products?search=${encodeURIComponent(debouncedQuery)}&pageSize=10`
      : null,
  );
  const items = data?.items ?? [];

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [items.length]);

  function selectProduct(product: Product) {
    onSelect(product);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectProduct(items[highlightedIndex]);
    }
  }

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
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-activedescendant={items[highlightedIndex] ? `inventory-part-option-${items[highlightedIndex].id}` : undefined}
        />
        <div role="listbox" className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {isLoading && <p className="p-2 text-sm text-muted-foreground">Buscando...</p>}
          {!isLoading && debouncedQuery.trim() !== '' && items.length === 0 && (
            <p className="p-2 text-sm text-muted-foreground">Sin resultados</p>
          )}
          {items.map((product, index) => (
            <button
              key={product.id}
              id={`inventory-part-option-${product.id}`}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              className={`flex flex-col rounded-md p-2 text-left text-sm hover:bg-muted ${
                index === highlightedIndex ? 'bg-muted' : ''
              }`}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => selectProduct(product)}
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
