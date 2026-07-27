'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { InventoryPartSearch } from './inventory-part-search';
import type { DiagnosisPart, Product } from '@/lib/types';

export function DiagnosisParts({
  orderId,
  parts,
  onUpdated,
}: {
  orderId: string;
  parts: DiagnosisPart[];
  onUpdated: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = React.useState<Product | null>(null);
  const [inventoryQuantity, setInventoryQuantity] = React.useState('1');
  const [freeMode, setFreeMode] = React.useState(false);
  const [freeDescription, setFreeDescription] = React.useState('');
  const [freeQuantity, setFreeQuantity] = React.useState('1');
  const [freeObservations, setFreeObservations] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  async function handleAddInventoryPart() {
    if (!selectedProduct) return;
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/diagnosis/parts`, {
        productId: selectedProduct.id,
        description: selectedProduct.name,
        quantity: Number(inventoryQuantity),
      });
      toast.success('Repuesto agregado');
      setSelectedProduct(null);
      setInventoryQuantity('1');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddFreePart() {
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/diagnosis/parts`, {
        description: freeDescription,
        quantity: Number(freeQuantity),
        observations: freeObservations || undefined,
      });
      toast.success('Repuesto agregado');
      setFreeMode(false);
      setFreeDescription('');
      setFreeQuantity('1');
      setFreeObservations('');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemove(partId: string) {
    setRemovingId(partId);
    try {
      await api.delete(`/orders/${orderId}/diagnosis/parts/${partId}`);
      toast.success('Repuesto eliminado');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Repuestos requeridos</Label>

      {parts.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin repuestos agregados</p>
      )}
      {parts.map((part) => (
        <div key={part.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
          <div className="flex flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">{part.description}</span>
              <Badge variant={part.productId ? 'default' : 'secondary'}>
                {part.productId ? 'Inventario' : 'Repuesto libre'}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">Cantidad: {part.quantity}</span>
            {part.observations && (
              <span className="text-xs text-muted-foreground">{part.observations}</span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={removingId === part.id}
            onClick={() => handleRemove(part.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
        {!selectedProduct && !freeMode && (
          <div className="flex flex-wrap gap-2">
            <InventoryPartSearch onSelect={setSelectedProduct} />
            <Button type="button" variant="outline" size="sm" onClick={() => setFreeMode(true)}>
              <Plus className="size-4" /> Repuesto libre
            </Button>
          </div>
        )}

        {selectedProduct && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Repuesto</Label>
              <p className="text-sm font-medium">{selectedProduct.name}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Cantidad</Label>
              <Input
                type="number"
                min={1}
                className="w-24"
                value={inventoryQuantity}
                onChange={(e) => setInventoryQuantity(e.target.value)}
              />
            </div>
            <Button type="button" size="sm" disabled={isSubmitting} onClick={handleAddInventoryPart}>
              {isSubmitting ? 'Agregando...' : 'Agregar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>
              Cancelar
            </Button>
          </div>
        )}

        {freeMode && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Nombre</Label>
                <Input value={freeDescription} onChange={(e) => setFreeDescription(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Cantidad</Label>
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  value={freeQuantity}
                  onChange={(e) => setFreeQuantity(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Observaciones (opcional)</Label>
              <Input value={freeObservations} onChange={(e) => setFreeObservations(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isSubmitting || !freeDescription.trim()}
                onClick={handleAddFreePart}
              >
                {isSubmitting ? 'Agregando...' : 'Agregar'}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setFreeMode(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
