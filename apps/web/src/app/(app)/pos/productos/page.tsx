'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search, AlertTriangle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { getErrorMessage } from '@/components/providers/auth-provider';
import type { PosProduct, PosProductCategory } from '@/lib/pos-types';

const PRODUCTS_KEY = '/pos/products';

// Rótulos calcados de motopos/templates/index.html: MOTO se llama "Bicimoto"
// en el negocio, no "Moto".
const CATEGORY_LABEL: Record<PosProductCategory, string> = {
  MOTO: 'Bicimoto',
  ACCESORIO: 'Accesorio',
  REPUESTO: 'Repuesto',
  TALLER: 'Taller',
};
const CATEGORIES: PosProductCategory[] = ['MOTO', 'ACCESORIO', 'REPUESTO', 'TALLER'];

function refresh() {
  mutate(PRODUCTS_KEY);
}

// Umbrales calcados de motopos: 999+ es "servicio" (no lleva stock real),
// 0 es agotado, 3 o menos es bajo.
function StockBadge({ stock }: { stock: number }) {
  if (stock >= 999) return <span className="text-muted-foreground">Servicio</span>;
  if (stock === 0) return <Badge variant="destructive">Agotado</Badge>;
  if (stock <= 3)
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant="warning">
          <AlertTriangle className="size-3" /> Bajo
        </Badge>
        {stock}
      </span>
    );
  return <span>{stock}</span>;
}

export default function PosProductosPage() {
  const { user } = useAuth();
  const isAdmin = user?.posRole === 'ADMIN';
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const { data: products, isLoading } = useApiSWR<PosProduct[]>(PRODUCTS_KEY);

  const filtered = React.useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.reference.toLowerCase().includes(q),
    );
  }, [products, search]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Productos</h1>
        <p className="text-sm text-muted-foreground">Catálogo del punto de venta de esta sucursal</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-xs">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o referencia..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Link href="/pos/productos/importar">
              <Button variant="outline">
                <Upload /> Importar
              </Button>
            </Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus /> Nuevo producto
                </Button>
              </DialogTrigger>
              <DialogContent>
                <ProductForm onSuccess={() => { setOpen(false); refresh(); }} />
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Referencia</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={9}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  Sin productos registrados
                </TableCell>
              </TableRow>
            )}
            {filtered.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{CATEGORY_LABEL[product.category]}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{product.reference || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{product.color || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{product.supplier || '—'}</TableCell>
                <TableCell className="text-right">${Number(product.cost).toLocaleString('es-CO')}</TableCell>
                <TableCell className="text-right">${Number(product.price).toLocaleString('es-CO')}</TableCell>
                <TableCell className="text-right">
                  <StockBadge stock={product.stock} />
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <EditProductDialog product={product} />
                      <DeactivateProductButton product={product} />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface ProductFormState {
  name: string;
  category: PosProductCategory;
  price: string;
  cost: string;
  stock: string;
  reference: string;
  color: string;
  supplier: string;
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  category: 'ACCESORIO',
  price: '',
  cost: '0',
  stock: '0',
  reference: '',
  color: '',
  supplier: '',
};

function ProductForm({
  initial,
  productId,
  onSuccess,
}: {
  initial?: ProductFormState;
  productId?: string;
  onSuccess: () => void;
}) {
  const [form, setForm] = React.useState<ProductFormState>(initial ?? EMPTY_FORM);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    const payload = {
      name: form.name,
      category: form.category,
      price: Number(form.price),
      cost: Number(form.cost),
      stock: Number(form.stock),
      reference: form.reference || undefined,
      color: form.color || undefined,
      supplier: form.supplier || undefined,
    };
    try {
      if (productId) {
        await api.patch(`/pos/products/${productId}`, payload);
        toast.success('Producto actualizado');
      } else {
        await api.post('/pos/products', payload);
        toast.success('Producto creado');
      }
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
        <DialogTitle>{productId ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Categoría</Label>
          <Select
            value={form.category}
            onValueChange={(v) => setForm({ ...form, category: v as PosProductCategory })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Referencia</Label>
          <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Precio de venta</Label>
          <Input
            type="number"
            min="0"
            required
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Costo</Label>
          <Input type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Stock</Label>
          <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Color</Label>
          <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Proveedor</Label>
          <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar producto'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditProductDialog({ product }: { product: PosProduct }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ProductForm
          productId={product.id}
          initial={{
            name: product.name,
            category: product.category,
            price: product.price,
            cost: product.cost,
            stock: String(product.stock),
            reference: product.reference,
            color: product.color,
            supplier: product.supplier,
          }}
          onSuccess={() => { setOpen(false); refresh(); }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DeactivateProductButton({ product }: { product: PosProduct }) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await api.delete(`/pos/products/${product.id}`);
      toast.success('Producto desactivado');
      setOpen(false);
      refresh();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Desactivar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desactivar {product.name}</DialogTitle>
          <DialogDescription>
            Deja de aparecer en el catálogo de venta. No borra las ventas ya hechas con este producto.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" disabled={isSubmitting} onClick={handleConfirm}>
            {isSubmitting ? 'Desactivando...' : 'Sí, desactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
