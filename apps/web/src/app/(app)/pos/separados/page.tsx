'use client';

import * as React from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { cn } from '@/lib/utils';
import type { PosProduct, PosLayaway, PosLayawayStatus, PosLayawayPaymentResult } from '@/lib/pos-types';

const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
];

const STATUS_LABEL: Record<PosLayawayStatus, string> = {
  ACTIVE: 'Activo',
  COMPLETED: 'Completado',
  CANCELLED: 'Cancelado',
};
const STATUS_VARIANT: Record<PosLayawayStatus, 'success' | 'destructive' | 'warning'> = {
  ACTIVE: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'destructive',
};

function money(v: string | number) {
  return `$${Number(v).toLocaleString('es-CO')}`;
}

function layawaysKey(status: string) {
  return `/pos/layaways?status=${status}`;
}

export default function PosSeparadosPage() {
  const { user } = useAuth();
  const isAdmin = user?.posRole === 'ADMIN';
  const [status, setStatus] = React.useState<PosLayawayStatus>('ACTIVE');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<PosLayaway | null>(null);

  const key = layawaysKey(status);
  const { data: layaways, isLoading } = useApiSWR<PosLayaway[]>(key);
  const { data: products } = useApiSWR<PosProduct[]>('/pos/products');
  const productsById = React.useMemo(() => {
    const map = new Map<string, PosProduct>();
    for (const p of products ?? []) map.set(p.id, p);
    return map;
  }, [products]);

  function refreshList() {
    mutate((k) => typeof k === 'string' && k.startsWith('/pos/layaways'));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Separados</h1>
          <p className="text-sm text-muted-foreground">Mercancía apartada con abono inicial</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nuevo separado
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl">
            <CreateLayawayForm
              products={products ?? []}
              onSuccess={() => {
                setCreateOpen(false);
                refreshList();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Select value={status} onValueChange={(v) => setStatus(v as PosLayawayStatus)}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ACTIVE">Activos</SelectItem>
          <SelectItem value="COMPLETED">Completados</SelectItem>
          <SelectItem value="CANCELLED">Cancelados</SelectItem>
        </SelectContent>
      </Select>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && layaways?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin separados en este estado
                </TableCell>
              </TableRow>
            )}
            {layaways?.map((l) => (
              <TableRow key={l.id} onClick={() => setSelected(l)} className="cursor-pointer hover:bg-muted/50">
                <TableCell className="font-medium">{l.clientName}</TableCell>
                <TableCell className="text-right">{money(l.total)}</TableCell>
                <TableCell className="text-right">{money(l.paid)}</TableCell>
                <TableCell className="text-right font-semibold">{money(l.balance)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected && (
            <LayawayDetail
              layaway={selected}
              isAdmin={isAdmin}
              productsById={productsById}
              onChanged={(updated) => {
                setSelected(updated);
                refreshList();
              }}
              onCancelled={() => {
                setSelected(null);
                refreshList();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface CartLine {
  key: string;
  productId?: string;
  name: string;
  unitPrice: number;
  stock: number;
  quantity: number;
  discount: number;
}

function CreateLayawayForm({ products, onSuccess }: { products: PosProduct[]; onSuccess: () => void }) {
  const [search, setSearch] = React.useState('');
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [clientName, setClientName] = React.useState('');
  const [clientDoc, setClientDoc] = React.useState('');
  const [clientPhone, setClientPhone] = React.useState('');
  const [generalDiscount, setGeneralDiscount] = React.useState('');
  const [paymentAmount, setPaymentAmount] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('efectivo');
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const filteredProducts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q));
  }, [products, search]);

  const subtotal = cart.reduce((sum, l) => sum + Math.max(l.unitPrice - l.discount, 0) * l.quantity, 0);
  const discountAmount = Math.min(Number(generalDiscount) || 0, subtotal);
  const total = Math.max(subtotal - discountAmount, 0);

  function addToCart(product: PosProduct) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          unitPrice: Number(product.price),
          stock: product.stock,
          quantity: 1,
          discount: 0,
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

  const canSubmit =
    cart.length > 0 &&
    clientName.trim().length > 0 &&
    Number(paymentAmount) > 0 &&
    !isSubmitting;

  async function handleSubmit() {
    setIsSubmitting(true);
    try {
      const layaway = await api.post<PosLayaway>('/pos/layaways', {
        clientName: clientName.trim(),
        clientDoc: clientDoc.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        notes: notes.trim() || undefined,
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          discount: l.discount || undefined,
          discountType: 'amount',
        })),
        generalDiscount: Number(generalDiscount) || undefined,
        generalDiscountType: 'amount',
        payment: { amount: Number(paymentAmount), method: paymentMethod },
      });
      toast.success(`Separado creado — saldo pendiente ${money(layaway.balance)}`);
      onSuccess();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Nuevo separado</DialogTitle>
        <DialogDescription>La mercancía se descuenta del inventario al crear el separado.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <Table>
              <TableBody>
                {filteredProducts.map((product) => {
                  const outOfStock = product.stock <= 0;
                  return (
                    <TableRow
                      key={product.id}
                      className={cn('cursor-pointer hover:bg-muted/50', outOfStock && 'opacity-50')}
                      onClick={() => !outOfStock && addToCart(product)}
                    >
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell className="text-right">{money(product.price)}</TableCell>
                      <TableCell className="text-right">{product.stock >= 999 ? '—' : product.stock}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-2">
            {cart.map((line) => (
              <div key={line.key} className="flex items-center gap-2 rounded-md border p-2">
                <span className="flex-1 text-sm font-medium">{line.name}</span>
                <Input
                  type="number"
                  min={1}
                  className="h-8 w-16"
                  value={line.quantity}
                  onChange={(e) => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                />
                <span className="w-20 text-right text-sm">{money(Math.max(line.unitPrice - line.discount, 0) * line.quantity)}</span>
                <Button variant="ghost" size="icon" className="size-6" onClick={() => removeLine(line.key)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            {cart.length === 0 && <p className="text-sm text-muted-foreground">Sin productos agregados</p>}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Cliente *</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Nombre del cliente" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Documento</Label>
              <Input value={clientDoc} onChange={(e) => setClientDoc(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Teléfono</Label>
              <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Descuento general ($)</Label>
            <Input type="number" min={0} value={generalDiscount} onChange={(e) => setGeneralDiscount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex flex-col gap-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Total</span>
              <span className="text-2xl font-bold tabular-nums">{money(total)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Abono inicial *</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0.01}
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Monto"
              />
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="w-36">
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
            </div>
            {total > 0 && Number(paymentAmount) >= total && (
              <p className="text-xs text-destructive">
                El abono cubre el total: use una venta normal en vez de un separado.
              </p>
            )}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button disabled={!canSubmit} onClick={handleSubmit}>
          {isSubmitting ? 'Creando...' : 'Crear separado'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function LayawayDetail({
  layaway,
  isAdmin,
  productsById,
  onChanged,
  onCancelled,
}: {
  layaway: PosLayaway;
  isAdmin: boolean;
  productsById: Map<string, PosProduct>;
  onChanged: (layaway: PosLayaway) => void;
  onCancelled: () => void;
}) {
  const [amount, setAmount] = React.useState('');
  const [method, setMethod] = React.useState('efectivo');
  const [delivery, setDelivery] = React.useState<Record<string, { engineNumber: string; chassisNumber: string }>>({});
  const [isPaying, setIsPaying] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);

  const balance = Number(layaway.balance);
  // Si lo que se va a abonar cubre (o supera) el saldo, este pago completa el
  // separado: si hay motos entre los ítems, se piden motor y chasis ANTES de
  // completar (app.py línea 1553 los captura justo en este momento).
  const willComplete = Number(amount) > 0 && Number(amount) >= balance;
  const motoItems = layaway.items.filter((i) => i.productId && productsById.get(i.productId)?.category === 'MOTO');

  async function handlePay() {
    setIsPaying(true);
    try {
      const items =
        willComplete && motoItems.length > 0
          ? motoItems.map((i) => ({
              layawayItemId: i.id,
              engineNumber: delivery[i.id]?.engineNumber || undefined,
              chassisNumber: delivery[i.id]?.chassisNumber || undefined,
            }))
          : undefined;
      const result = await api.post<PosLayawayPaymentResult>(`/pos/layaways/${layaway.id}/payments`, {
        amount: Number(amount),
        method,
        items,
      });
      const receipt = result.payments[result.payments.length - 1]?.receiptNumber;
      if (result.sale) {
        toast.success(`Separado completado — venta #${result.sale.invoiceNumber ?? '—'} (recibo #${receipt ?? '—'})`);
      } else {
        toast.success(`Abono registrado — recibo #${receipt ?? '—'}`);
      }
      setAmount('');
      onChanged(result);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsPaying(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm(`¿Cancelar el separado de ${layaway.clientName}? Devuelve el stock y libera los recibos.`)) {
      return;
    }
    setIsCancelling(true);
    try {
      await api.post(`/pos/layaways/${layaway.id}/cancel`);
      toast.success('Separado cancelado');
      onCancelled();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{layaway.clientName}</DialogTitle>
        <DialogDescription>
          <Badge variant={STATUS_VARIANT[layaway.status]}>{STATUS_LABEL[layaway.status]}</Badge>
        </DialogDescription>
      </DialogHeader>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Cant.</TableHead>
            <TableHead className="text-right">Total línea</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {layaway.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {item.name}
                {(item.engineNumber || item.chassisNumber) && (
                  <div className="text-xs text-muted-foreground">
                    {item.engineNumber && <>Motor: {item.engineNumber} </>}
                    {item.chassisNumber && <>Chasis: {item.chassisNumber}</>}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">{money(item.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div>Total: {money(layaway.total)}</div>
        <div>Pagado: {money(layaway.paid)}</div>
        <div className="text-base font-semibold">Saldo: {money(layaway.balance)}</div>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Historial de abonos</span>
        {layaway.payments.length === 0 && <span className="text-muted-foreground">Sin abonos</span>}
        {layaway.payments.map((p) => (
          <div key={p.id} className="flex justify-between text-muted-foreground">
            <span>
              Recibo #{p.receiptNumber ?? '—'} · {p.method} · {new Date(p.paidAt).toLocaleString('es-CO')}
            </span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
      </div>

      {layaway.status === 'ACTIVE' && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <Label>Registrar abono</Label>
          <div className="flex gap-2">
            <Input type="number" min={0.01} placeholder="Monto" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="w-36">
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
            <Button disabled={isPaying || !(Number(amount) > 0)} onClick={handlePay}>
              {isPaying ? 'Abonando...' : 'Abonar'}
            </Button>
          </div>

          {willComplete && motoItems.length > 0 && (
            <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Este abono completa el separado: indica motor y chasis de cada moto antes de entregar.
              </p>
              {motoItems.map((item) => (
                <div key={item.id} className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder={`N.º motor — ${item.name}`}
                    value={delivery[item.id]?.engineNumber ?? ''}
                    onChange={(e) =>
                      setDelivery((prev) => ({ ...prev, [item.id]: { ...prev[item.id], engineNumber: e.target.value, chassisNumber: prev[item.id]?.chassisNumber ?? '' } }))
                    }
                  />
                  <Input
                    placeholder={`N.º chasis — ${item.name}`}
                    value={delivery[item.id]?.chassisNumber ?? ''}
                    onChange={(e) =>
                      setDelivery((prev) => ({ ...prev, [item.id]: { ...prev[item.id], chassisNumber: e.target.value, engineNumber: prev[item.id]?.engineNumber ?? '' } }))
                    }
                  />
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <div className="flex justify-end border-t pt-3">
              <Button variant="destructive" disabled={isCancelling} onClick={handleCancel}>
                {isCancelling ? 'Cancelando...' : 'Cancelar separado'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
