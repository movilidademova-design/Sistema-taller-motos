'use client';

import * as React from 'react';
import { Search, Plus, Trash2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import type { PosProduct, PosSale, DiscountType } from '@/lib/pos-types';

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
];

interface CartLine {
  key: string;
  productId: string;
  name: string;
  category: PosProduct['category'];
  unitPrice: number;
  stock: number;
  quantity: number;
  discount: number;
  discountType: DiscountType;
  engineNumber: string;
  chassisNumber: string;
}

interface SplitPayment {
  key: string;
  method: string;
  amount: string;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// Réplica en JS del cálculo de apps/api/src/pos/sales/sale-pricing.util.ts,
// solo para previsualizar el total en pantalla — el servidor es quien manda,
// esto nunca decide cuánto se cobra de verdad.
function lineFinalPrice(line: CartLine): number {
  if (!line.discount) return round2(line.unitPrice);
  const finalPrice =
    line.discountType === 'amount'
      ? line.unitPrice - line.discount
      : line.unitPrice * ((100 - line.discount) / 100);
  return round2(Math.max(finalPrice, 0));
}

function lineTotal(line: CartLine): number {
  return round2(lineFinalPrice(line) * line.quantity);
}

function computeTotals(cart: CartLine[], generalDiscount: number, generalDiscountType: DiscountType) {
  const subtotal = round2(cart.reduce((sum, l) => sum + lineTotal(l), 0));
  let generalDiscountAmount = 0;
  if (generalDiscount) {
    generalDiscountAmount =
      generalDiscountType === 'amount'
        ? Math.min(generalDiscount, subtotal)
        : round2((subtotal * generalDiscount) / 100);
  }
  const total = round2(Math.max(subtotal - generalDiscountAmount, 0));
  return { subtotal, generalDiscountAmount, total };
}

function money(n: number) {
  return `$${n.toLocaleString('es-CO')}`;
}

function DiscountTypeToggle({ value, onChange }: { value: DiscountType; onChange: (v: DiscountType) => void }) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
      <button
        type="button"
        className={cn('px-2 py-1.5', value === 'pct' ? 'bg-primary text-primary-foreground' : 'bg-background')}
        onClick={() => onChange('pct')}
      >
        %
      </button>
      <button
        type="button"
        className={cn('border-l px-2 py-1.5', value === 'amount' ? 'bg-primary text-primary-foreground' : 'bg-background')}
        onClick={() => onChange('amount')}
      >
        $
      </button>
    </div>
  );
}

export default function PosVenderPage() {
  const { data: products } = useApiSWR<PosProduct[]>('/pos/products');
  const [search, setSearch] = React.useState('');
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [clientName, setClientName] = React.useState('');
  const [clientDoc, setClientDoc] = React.useState('');
  const [generalDiscount, setGeneralDiscount] = React.useState('');
  const [generalDiscountType, setGeneralDiscountType] = React.useState<DiscountType>('pct');
  const [paymentMode, setPaymentMode] = React.useState<'single' | 'split'>('single');
  const [singleMethod, setSingleMethod] = React.useState('efectivo');
  const [splitPayments, setSplitPayments] = React.useState<SplitPayment[]>([
    { key: crypto.randomUUID(), method: 'efectivo', amount: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [lastInvoice, setLastInvoice] = React.useState<number | null>(null);

  const filteredProducts = React.useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q),
    );
  }, [products, search]);

  const { subtotal, generalDiscountAmount, total } = computeTotals(
    cart,
    Number(generalDiscount) || 0,
    generalDiscountType,
  );

  const splitSum = round2(splitPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0));
  const splitMismatch = paymentMode === 'split' && Math.round(splitSum * 100) !== Math.round(total * 100);

  function addToCart(product: PosProduct) {
    setLastInvoice(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          category: product.category,
          unitPrice: Number(product.price),
          stock: product.stock,
          quantity: 1,
          discount: 0,
          discountType: 'pct',
          engineNumber: '',
          chassisNumber: '',
        },
      ];
    });
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function addSplitRow() {
    setSplitPayments((prev) => [...prev, { key: crypto.randomUUID(), method: 'efectivo', amount: '' }]);
  }

  function updateSplitRow(key: string, patch: Partial<SplitPayment>) {
    setSplitPayments((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function removeSplitRow(key: string) {
    setSplitPayments((prev) => prev.filter((p) => p.key !== key));
  }

  function resetSale() {
    setCart([]);
    setClientName('');
    setClientDoc('');
    setGeneralDiscount('');
    setGeneralDiscountType('pct');
    setPaymentMode('single');
    setSingleMethod('efectivo');
    setSplitPayments([{ key: crypto.randomUUID(), method: 'efectivo', amount: '' }]);
  }

  const canSubmit =
    cart.length > 0 && clientName.trim().length > 0 && !isSubmitting && !(paymentMode === 'split' && (splitMismatch || splitPayments.length === 0));

  async function handleCheckout() {
    setIsSubmitting(true);
    try {
      const payments =
        paymentMode === 'single'
          ? [{ method: singleMethod, amount: total }]
          : splitPayments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }));

      const sale = await api.post<PosSale>('/pos/sales', {
        clientName: clientName.trim(),
        clientDoc: clientDoc.trim() || undefined,
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discount: l.discount || undefined,
          discountType: l.discountType,
          engineNumber: l.category === 'MOTO' && l.engineNumber ? l.engineNumber : undefined,
          chassisNumber: l.category === 'MOTO' && l.chassisNumber ? l.chassisNumber : undefined,
        })),
        generalDiscount: Number(generalDiscount) || undefined,
        generalDiscountType,
        payments,
      });

      toast.success(`Venta registrada — factura #${sale.invoiceNumber ?? '—'}`);
      setLastInvoice(sale.invoiceNumber);
      resetSale();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vender</h1>
          <p className="text-sm text-muted-foreground">Busca un producto y agrégalo al carrito</p>
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o referencia..."
            className="pl-8"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin resultados
                  </TableCell>
                </TableRow>
              )}
              {filteredProducts.map((product) => {
                // 999+ es la convención heredada de motopos para "servicio, no lleva stock real".
                const outOfStock = product.stock <= 0;
                return (
                  <TableRow
                    key={product.id}
                    className={cn('cursor-pointer hover:bg-muted/50', outOfStock && 'opacity-50')}
                    onClick={() => !outOfStock && addToCart(product)}
                  >
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell className="text-right">${Number(product.price).toLocaleString('es-CO')}</TableCell>
                    <TableCell className="text-right">{product.stock >= 999 ? '—' : product.stock}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" disabled={outOfStock} onClick={(e) => { e.stopPropagation(); addToCart(product); }}>
                        <Plus />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border p-4">
        {lastInvoice !== null && (
          <div className="rounded-md bg-success/15 px-3 py-2 text-sm text-success">
            Última venta cobrada — factura #{lastInvoice}
          </div>
        )}

        <div className="flex items-center gap-2 text-sm font-medium">
          <ShoppingCart className="size-4" /> Carrito
        </div>

        {cart.length === 0 && <p className="text-sm text-muted-foreground">Sin productos en el carrito</p>}

        <div className="flex flex-col gap-3">
          {cart.map((line) => (
            <div key={line.key} className="flex flex-col gap-2 rounded-md border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium">{line.name}</span>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => removeLine(line.key)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-16"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
                <span className="text-xs text-muted-foreground">Desc.:</span>
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-20"
                  value={line.discount || ''}
                  onChange={(e) => updateLine(line.key, { discount: Number(e.target.value) || 0 })}
                />
                <DiscountTypeToggle
                  value={line.discountType}
                  onChange={(v) => updateLine(line.key, { discountType: v })}
                />
                <span className="ml-auto text-sm font-semibold">{money(lineTotal(line))}</span>
              </div>
              {line.category === 'MOTO' && (
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="N.º motor"
                    className="h-8"
                    value={line.engineNumber}
                    onChange={(e) => updateLine(line.key, { engineNumber: e.target.value })}
                  />
                  <Input
                    placeholder="N.º chasis"
                    className="h-8"
                    value={line.chassisNumber}
                    onChange={(e) => updateLine(line.key, { chassisNumber: e.target.value })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cliente *</Label>
          <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Documento (opcional)</Label>
          <Input value={clientDoc} onChange={(e) => setClientDoc(e.target.value)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Descuento general</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              value={generalDiscount}
              onChange={(e) => setGeneralDiscount(e.target.value)}
            />
            <DiscountTypeToggle value={generalDiscountType} onChange={setGeneralDiscountType} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Método de pago</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={paymentMode === 'single' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPaymentMode('single')}
            >
              Único
            </Button>
            <Button
              type="button"
              variant={paymentMode === 'split' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPaymentMode('split')}
            >
              Dividido
            </Button>
          </div>

          {paymentMode === 'single' ? (
            <Select value={singleMethod} onValueChange={setSingleMethod}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex flex-col gap-2">
              {splitPayments.map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <Select value={p.method} onValueChange={(v) => updateSplitRow(p.key, { method: v })}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Monto"
                    value={p.amount}
                    onChange={(e) => updateSplitRow(p.key, { amount: e.target.value })}
                  />
                  <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => removeSplitRow(p.key)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addSplitRow}>
                <Plus /> Agregar método
              </Button>
              {splitMismatch && (
                <p className="text-xs text-destructive">
                  La suma de los pagos ({money(splitSum)}) no coincide con el total ({money(total)}).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 border-t pt-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{money(subtotal)}</span>
          </div>
          {generalDiscountAmount > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Descuento</span>
              <span>-{money(generalDiscountAmount)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="text-3xl font-bold tabular-nums">{money(total)}</span>
          </div>
        </div>

        <Button size="lg" variant="default" disabled={!canSubmit} onClick={handleCheckout}>
          {isSubmitting ? 'Cobrando...' : 'Cobrar'}
        </Button>
      </div>
    </div>
  );
}
