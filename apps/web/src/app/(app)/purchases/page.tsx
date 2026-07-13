'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import type { Product, PurchaseOrder, Supplier } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'destructive'> = {
  DRAFT: 'secondary',
  ORDERED: 'default',
  RECEIVED: 'success',
  CANCELLED: 'destructive',
};

export default function PurchasesPage() {
  const [open, setOpen] = React.useState(false);
  const { data: purchases, mutate } = useApiSWR<PurchaseOrder[]>('/purchase-orders');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground">Órdenes de compra a proveedores</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nueva orden de compra
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-xl">
            <NewPurchaseForm
              onSuccess={() => {
                setOpen(false);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Proveedor</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases?.map((po) => (
              <PurchaseRow key={po.id} po={po} onUpdated={() => mutate()} />
            ))}
            {(!purchases || purchases.length === 0) && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Sin órdenes de compra
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PurchaseRow({ po, onUpdated }: { po: PurchaseOrder; onUpdated: () => void }) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleAction(action: 'mark-ordered' | 'receive' | 'cancel') {
    setIsSubmitting(true);
    try {
      await api.post(`/purchase-orders/${po.id}/${action}`);
      toast.success('Orden de compra actualizada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{po.supplier?.name ?? '—'}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[po.status]}>{po.status}</Badge>
      </TableCell>
      <TableCell className="text-right">${Number(po.total).toLocaleString('es-CO')}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          {po.status === 'DRAFT' && (
            <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => handleAction('mark-ordered')}>
              Marcar pedida
            </Button>
          )}
          {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
            <Button size="sm" disabled={isSubmitting} onClick={() => handleAction('receive')}>
              Recibir
            </Button>
          )}
          {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
            <Button size="sm" variant="ghost" disabled={isSubmitting} onClick={() => handleAction('cancel')}>
              Cancelar
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

interface ItemDraft {
  productId: string;
  quantity: number;
  unitCost: number;
}

function NewPurchaseForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: suppliers } = useApiSWR<Supplier[]>('/inventory/suppliers');
  const { data: products } = useApiSWR<{ items: Product[] }>('/inventory/products?pageSize=100');
  const [supplierId, setSupplierId] = React.useState('');
  const [items, setItems] = React.useState<ItemDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function addItem() {
    setItems((i) => [...i, { productId: '', quantity: 1, unitCost: 0 }]);
  }
  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((i) => i.map((item, idx) => (idx === index ? { ...item, ...patch } : item)));
  }
  function removeItem(index: number) {
    setItems((i) => i.filter((_, idx) => idx !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/purchase-orders', { supplierId, items: items.filter((i) => i.productId) });
      toast.success('Orden de compra creada');
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Nueva orden de compra</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Proveedor</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un proveedor" />
            </SelectTrigger>
            <SelectContent>
              {suppliers?.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between">
          <Label>Productos</Label>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus /> Agregar
          </Button>
        </div>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={item.productId} onValueChange={(v) => updateItem(i, { productId: v })}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Producto" />
              </SelectTrigger>
              <SelectContent>
                {products?.items.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Cant."
              className="w-20"
              value={item.quantity}
              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="Costo unit."
              className="w-28"
              value={item.unitCost}
              onChange={(e) => updateItem(i, { unitCost: Number(e.target.value) })}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !supplierId || items.length === 0}>
          {isSubmitting ? 'Creando...' : 'Crear orden de compra'}
        </Button>
      </DialogFooter>
    </form>
  );
}
