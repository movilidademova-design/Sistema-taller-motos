'use client';

import * as React from 'react';
import { Package, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProductPicker } from '@/components/shared/product-picker';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { QuotationItemType } from '@taller/shared';
import type { Product, Quotation } from '@/lib/types';

interface ItemDraft {
  type: QuotationItemType;
  productId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

const TYPE_LABELS: Record<QuotationItemType, string> = {
  PART: 'Repuesto',
  LABOR: 'Mano de obra',
  OTHER: 'Otro',
};

export function QuotationTab({
  orderId,
  quotation,
  onUpdated,
}: {
  orderId: string;
  quotation: Quotation | null | undefined;
  onUpdated: () => void;
}) {
  const [items, setItems] = React.useState<ItemDraft[]>(
    quotation?.items.map((i) => ({
      type: i.type,
      productId: i.productId ?? undefined,
      description: i.description,
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
    })) ?? [],
  );
  const [discount, setDiscount] = React.useState(quotation?.discount ?? '0');
  const [taxRate, setTaxRate] = React.useState(quotation?.taxRate ?? '0');
  const [notes, setNotes] = React.useState(quotation?.notes ?? '');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeciding, setIsDeciding] = React.useState(false);

  const subtotal = items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0);
  const taxable = Math.max(0, subtotal - Number(discount || 0));
  const taxAmount = taxable * (Number(taxRate || 0) / 100);
  const total = taxable + taxAmount;

  function addInventoryItem(product: Product) {
    setItems((i) => [
      ...i,
      {
        type: QuotationItemType.PART,
        productId: product.id,
        description: product.name,
        quantity: 1,
        unitPrice: Number(product.unitPrice),
      },
    ]);
  }
  function addFreeItem() {
    setItems((i) => [...i, { type: QuotationItemType.PART, description: '', quantity: 1, unitPrice: 0 }]);
  }
  function addLaborItem() {
    setItems((i) => [...i, { type: QuotationItemType.LABOR, description: '', quantity: 1, unitPrice: 0 }]);
  }
  function updateItem(index: number, patch: Partial<ItemDraft>) {
    setItems((i) =>
      i.map((item, idx) => {
        if (idx !== index) return item;
        const next = { ...item, ...patch };
        // Un repuesto de inventario deja de estar vinculado si deja de ser tipo Repuesto.
        if (patch.type && patch.type !== QuotationItemType.PART) {
          next.productId = undefined;
        }
        return next;
      }),
    );
  }
  function removeItem(index: number) {
    setItems((i) => i.filter((_, idx) => idx !== index));
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await api.put(`/orders/${orderId}/quotation`, {
        items,
        discount: Number(discount || 0),
        taxRate: Number(taxRate || 0),
        notes: notes || undefined,
      });
      toast.success('Cotización guardada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDecide(approve: boolean) {
    setIsDeciding(true);
    try {
      await api.post(`/orders/${orderId}/quotation/${approve ? 'approve' : 'reject'}`);
      toast.success(approve ? 'Cotización aprobada' : 'Cotización rechazada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsDeciding(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {quotation && (
        <div>
          <Badge
            variant={
              quotation.status === 'APPROVED' ? 'success' : quotation.status === 'REJECTED' ? 'destructive' : 'warning'
            }
          >
            {quotation.status === 'APPROVED' ? 'Aprobada' : quotation.status === 'REJECTED' ? 'Rechazada' : 'Pendiente'}
          </Badge>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Ítems</Label>
          <div className="flex flex-wrap gap-2">
            <ProductPicker
              onSelect={addInventoryItem}
              trigger={
                <Button type="button" variant="outline" size="sm">
                  <Package /> Repuesto del inventario
                </Button>
              }
            />
            <Button type="button" variant="outline" size="sm" onClick={addFreeItem}>
              <Plus /> Repuesto libre
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={addLaborItem}>
              <Plus /> Mano de obra / Otro
            </Button>
          </div>
        </div>
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={item.type} onValueChange={(v) => updateItem(i, { type: v as QuotationItemType })}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.productId && (
              <span title="Vinculado a inventario" className="text-muted-foreground">
                <Package className="size-4" />
              </span>
            )}
            <Input
              placeholder="Descripción"
              className="flex-1"
              value={item.description}
              onChange={(e) => updateItem(i, { description: e.target.value })}
            />
            <Input
              type="number"
              placeholder="Cant."
              className="w-20"
              value={item.quantity}
              onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
            />
            <Input
              type="number"
              placeholder="Precio unit."
              className="w-28"
              value={item.unitPrice}
              onChange={(e) => updateItem(i, { unitPrice: Number(e.target.value) })}
            />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(i)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Sin ítems agregados</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label>Descuento</Label>
          <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Impuesto (%)</Label>
          <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Notas</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="ml-auto flex w-full max-w-xs flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>${subtotal.toLocaleString('es-CO')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Descuento</span>
          <span>-${Number(discount || 0).toLocaleString('es-CO')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Impuestos</span>
          <span>${taxAmount.toLocaleString('es-CO')}</span>
        </div>
        <div className="flex justify-between text-base font-semibold">
          <span>Total</span>
          <span>${total.toLocaleString('es-CO')}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} disabled={isSaving || items.length === 0}>
          {isSaving ? 'Guardando...' : 'Guardar cotización'}
        </Button>
        {quotation?.status === 'PENDING' && (
          <>
            <Button variant="outline" disabled={isDeciding} onClick={() => handleDecide(true)}>
              Aprobar
            </Button>
            <Button variant="outline" disabled={isDeciding} onClick={() => handleDecide(false)}>
              Rechazar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
