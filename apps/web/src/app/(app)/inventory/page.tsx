'use client';

import * as React from 'react';
import { Plus, Search, AlertTriangle } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import type { Category, InventoryMovement, PaginatedResult, Product, Supplier } from '@/lib/types';

export default function InventoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
        <p className="text-sm text-muted-foreground">Productos, categorías, proveedores y movimientos</p>
      </div>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="categories">Categorías</TabsTrigger>
          <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <ProductsPanel />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersPanel />
        </TabsContent>
        <TabsContent value="movements">
          <MovementsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductsPanel() {
  const [search, setSearch] = React.useState('');
  const [lowStockOnly, setLowStockOnly] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (lowStockOnly) params.set('lowStock', 'true');
  const key = `/inventory/products?${params.toString()}`;
  const { data, isLoading } = useApiSWR<PaginatedResult<Product>>(key);

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs">
            <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o SKU..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={lowStockOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLowStockOnly((v) => !v)}
          >
            <AlertTriangle /> Bajo stock
          </Button>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nuevo producto
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewProductForm
              onSuccess={() => {
                setOpen(false);
                mutate((k) => typeof k === 'string' && k.startsWith('/inventory/products'));
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Ajustar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin productos registrados
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.category?.name ?? '—'}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {product.quantity <= product.minStock && (
                      <AlertTriangle className="size-3.5 text-warning" />
                    )}
                    {product.quantity}
                  </div>
                </TableCell>
                <TableCell className="text-right">${Number(product.unitCost).toLocaleString('es-CO')}</TableCell>
                <TableCell className="text-right">${Number(product.unitPrice).toLocaleString('es-CO')}</TableCell>
                <TableCell className="text-right">
                  <AdjustStockDialog product={product} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdjustStockDialog({ product }: { product: Product }) {
  const [open, setOpen] = React.useState(false);
  const [delta, setDelta] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.patch(`/inventory/products/${product.id}/adjust-stock`, { delta: Number(delta), reason });
      toast.success('Stock ajustado');
      setOpen(false);
      setDelta('');
      setReason('');
      mutate((k) => typeof k === 'string' && k.startsWith('/inventory/products'));
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
          Ajustar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Ajustar stock — {product.name}</DialogTitle>
            <DialogDescription>Stock actual: {product.quantity}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <div className="flex flex-col gap-1.5">
              <Label>Cantidad (+/-)</Label>
              <Input type="number" required value={delta} onChange={(e) => setDelta(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Motivo</Label>
              <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : 'Aplicar ajuste'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewProductForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: categories } = useApiSWR<Category[]>('/inventory/categories');
  const { data: suppliers } = useApiSWR<Supplier[]>('/inventory/suppliers');
  const [form, setForm] = React.useState({
    sku: '',
    code: '',
    name: '',
    categoryId: '',
    supplierId: '',
    unitCost: '0',
    unitPrice: '0',
    quantity: '0',
    minStock: '0',
    location: '',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/inventory/products', {
        ...form,
        categoryId: form.categoryId || undefined,
        supplierId: form.supplierId || undefined,
        unitCost: Number(form.unitCost),
        unitPrice: Number(form.unitPrice),
        quantity: Number(form.quantity),
        minStock: Number(form.minStock),
      });
      toast.success('Producto creado');
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
        <DialogTitle>Nuevo producto</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>SKU</Label>
          <Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Código</Label>
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Categoría</Label>
          <Select value={form.categoryId} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Proveedor</Label>
          <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin proveedor" />
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
        <div className="flex flex-col gap-1.5">
          <Label>Costo unitario</Label>
          <Input
            type="number"
            value={form.unitCost}
            onChange={(e) => setForm({ ...form, unitCost: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Precio de venta</Label>
          <Input
            type="number"
            value={form.unitPrice}
            onChange={(e) => setForm({ ...form, unitPrice: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Cantidad inicial</Label>
          <Input
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Stock mínimo</Label>
          <Input
            type="number"
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Ubicación</Label>
          <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
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

function CategoriesPanel() {
  const { data: categories, mutate: mutateCategories } = useApiSWR<Category[]>('/inventory/categories');
  const [name, setName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/inventory/categories', { name });
      setName('');
      mutateCategories();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <form onSubmit={handleSubmit} className="flex max-w-sm gap-2">
        <Input placeholder="Nueva categoría" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" disabled={isSubmitting}>
          <Plus />
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {categories?.map((c) => (
          <Badge key={c.id} variant="secondary">
            {c.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function SuppliersPanel() {
  const { data: suppliers, mutate: mutateSuppliers } = useApiSWR<Supplier[]>('/inventory/suppliers');
  const [form, setForm] = React.useState({ name: '', contactName: '', phone: '', email: '' });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/inventory/suppliers', form);
      setForm({ name: '', contactName: '', phone: '', email: '' });
      mutateSuppliers();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <form onSubmit={handleSubmit} className="grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-5">
        <Input
          placeholder="Nombre"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <Input
          placeholder="Contacto"
          value={form.contactName}
          onChange={(e) => setForm({ ...form, contactName: e.target.value })}
        />
        <Input
          placeholder="Teléfono"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <Input
          placeholder="Correo"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Button type="submit" disabled={isSubmitting}>
          <Plus /> Agregar
        </Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Correo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {suppliers?.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>{s.contactName ?? '—'}</TableCell>
              <TableCell>{s.phone ?? '—'}</TableCell>
              <TableCell>{s.email ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MovementsPanel() {
  const { data } = useApiSWR<{ items: InventoryMovement[] }>('/inventory/movements');
  return (
    <div className="pt-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Cantidad</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Fecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.items.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.product?.name ?? '—'}</TableCell>
              <TableCell>
                <Badge variant="secondary">{m.type}</Badge>
              </TableCell>
              <TableCell className="text-right">{m.quantity}</TableCell>
              <TableCell className="max-w-64 truncate">{m.reason ?? '—'}</TableCell>
              <TableCell>{new Date(m.createdAt).toLocaleString('es-CO')}</TableCell>
            </TableRow>
          ))}
          {(!data || data.items.length === 0) && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Sin movimientos registrados
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
