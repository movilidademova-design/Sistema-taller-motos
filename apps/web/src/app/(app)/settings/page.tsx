'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Plus, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';
import { Role, ROLE_LABELS } from '@taller/shared';
import type { AccessoryOption, PermissionEntry, QuickService, Store, UserSummary } from '@/lib/types';

interface TenantSettings {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  taxRatePercent: string;
  currency: string;
  invoicePrefix: string;
  orderPrefix: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Datos del taller y gestión de usuarios</p>
      </div>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          {isAdmin && <TabsTrigger value="stores">Sucursales</TabsTrigger>}
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="quick-services">Servicios rápidos</TabsTrigger>
          <TabsTrigger value="accessory-options">Accesorios</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="stores">
            <StoresSettings />
          </TabsContent>
        )}
        <TabsContent value="users">
          <UsersSettings />
        </TabsContent>
        <TabsContent value="quick-services">
          <CatalogSettings endpoint="/quick-services" title="Servicios rápidos" placeholder="Ej: Cambio de batería" />
        </TabsContent>
        <TabsContent value="accessory-options">
          <CatalogSettings endpoint="/accessory-options" title="Accesorios" placeholder="Ej: Casco" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettings() {
  const { data: tenant, mutate } = useApiSWR<TenantSettings>('/tenant/settings');
  const [form, setForm] = React.useState<TenantSettings | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    // Seeds the editable copy once the SWR fetch resolves; the form then owns its own state.
    if (tenant) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(tenant);
    }
  }, [tenant]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setIsSaving(true);
    try {
      await api.patch('/tenant/settings', {
        ...form,
        taxRatePercent: Number(form.taxRatePercent),
      });
      toast.success('Configuración guardada');
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  if (!form) return null;

  return (
    <Card className="mt-4 max-w-2xl">
      <CardHeader>
        <CardTitle className="text-sm">Datos del taller</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Nombre del taller</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>Dirección</Label>
            <Input
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Teléfono</Label>
            <Input value={form.phone ?? ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Correo</Label>
            <Input value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>NIT / Identificación fiscal</Label>
            <Input value={form.taxId ?? ''} onChange={(e) => setForm({ ...form, taxId: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Impuesto (%)</Label>
            <Input
              type="number"
              value={form.taxRatePercent}
              onChange={(e) => setForm({ ...form, taxRatePercent: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Moneda</Label>
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Prefijo de facturas</Label>
            <Input
              value={form.invoicePrefix}
              onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function StoresSettings() {
  const { data: stores, mutate } = useApiSWR<Store[]>('/stores');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Store | null>(null);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> Nueva sucursal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <StoreForm
              store={editing}
              onSuccess={() => {
                setOpen(false);
                setEditing(null);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Ciudad</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {stores?.map((s) => (
            <TableRow key={s.id}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell>{s.code}</TableCell>
              <TableCell>{s.city ?? '—'}</TableCell>
              <TableCell>
                <Badge variant={s.isActive ? 'success' : 'destructive'}>
                  {s.isActive ? 'Activa' : 'Inactiva'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditing(s);
                    setOpen(true);
                  }}
                >
                  Editar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function StoreForm({ store, onSuccess }: { store: Store | null; onSuccess: () => void }) {
  const [form, setForm] = React.useState({
    name: store?.name ?? '',
    code: store?.code ?? '',
    address: store?.address ?? '',
    city: store?.city ?? '',
    phone: store?.phone ?? '',
    email: store?.email ?? '',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (store) {
        await api.patch(`/stores/${store.id}`, form);
        toast.success('Sucursal actualizada');
      } else {
        await api.post('/stores', form);
        toast.success('Sucursal creada');
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
        <DialogTitle>{store ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Código interno</Label>
          <Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Ciudad</Label>
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Dirección</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Teléfono</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Correo</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : store ? 'Guardar cambios' : 'Crear sucursal'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function UsersSettings() {
  const { data: users, mutate } = useApiSWR<UserSummary[]>('/users');
  const { data: stores } = useApiSWR<Store[]>('/stores');
  const { user: currentUser } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [permissionsUser, setPermissionsUser] = React.useState<UserSummary | null>(null);

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> Nuevo usuario
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewUserForm
              stores={stores ?? []}
              onSuccess={() => {
                setOpen(false);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Sucursales</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users?.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">
                {u.firstName} {u.lastName}
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {u.stores.map((s) => (
                    <Badge key={s.id} variant="outline">
                      {s.code}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant={u.isActive ? 'success' : 'destructive'}>
                  {u.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
              <TableCell>
                {currentUser?.role === 'ADMIN' && u.role !== 'ADMIN' && (
                  <Button variant="ghost" size="sm" onClick={() => setPermissionsUser(u)}>
                    <Settings2 className="size-4" /> Permisos
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Dialog open={!!permissionsUser} onOpenChange={(v) => !v && setPermissionsUser(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {permissionsUser && (
            <UserPermissionsForm user={permissionsUser} onClose={() => setPermissionsUser(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewUserForm({ stores, onSuccess }: { stores: Store[]; onSuccess: () => void }) {
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    role: Role.RECEPTIONIST as Role,
    storeIds: [] as string[],
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function toggleStore(id: string) {
    setForm((f) => ({
      ...f,
      storeIds: f.storeIds.includes(id) ? f.storeIds.filter((s) => s !== id) : [...f.storeIds, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.storeIds.length === 0) {
      toast.error('Selecciona al menos una sucursal');
      return;
    }
    setIsSubmitting(true);
    try {
      await api.post('/users', form);
      toast.success('Usuario creado');
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
        <DialogTitle>Nuevo usuario</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Apellido</Label>
          <Input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Correo</Label>
          <Input
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Contraseña</Label>
          <Input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Rol</Label>
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Sucursales</Label>
          <div className="flex flex-col gap-2 rounded-md border p-3">
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.storeIds.includes(s.id)}
                  onCheckedChange={() => toggleStore(s.id)}
                />
                {s.name}
              </label>
            ))}
            {stores.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay sucursales creadas todavía</p>
            )}
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Crear usuario'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function UserPermissionsForm({ user, onClose }: { user: UserSummary; onClose: () => void }) {
  const { data } = useApiSWR<{ role: Role; permissions: PermissionEntry[] }>(
    `/users/${user.id}/permissions`,
  );
  const [values, setValues] = React.useState<Record<string, boolean> | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (data && !values) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValues(Object.fromEntries(data.permissions.map((p) => [p.key, p.effective])));
    }
  }, [data, values]);

  async function handleSave() {
    if (!data || !values) return;
    const overrides = data.permissions
      .filter((p) => values[p.key] !== p.roleDefault)
      .map((p) => ({ permission: p.key, granted: values[p.key] }));
    setIsSaving(true);
    try {
      await api.put(`/users/${user.id}/permissions`, { overrides });
      toast.success('Permisos actualizados');
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <DialogHeader>
        <DialogTitle>
          Permisos de {user.firstName} {user.lastName}
        </DialogTitle>
      </DialogHeader>
      <p className="py-2 text-sm text-muted-foreground">
        El rol <strong>{ROLE_LABELS[user.role]}</strong> trae permisos por defecto — puedes activar o
        desactivar cualquiera individualmente para este usuario.
      </p>
      <div className="grid max-h-96 grid-cols-1 gap-2 overflow-y-auto py-2 sm:grid-cols-2">
        {values &&
          data?.permissions.map((p) => (
            <label key={p.key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
              <Checkbox
                checked={values[p.key]}
                onCheckedChange={(checked) => setValues({ ...values, [p.key]: checked === true })}
              />
              <span className="flex-1 font-mono text-xs">{p.key}</span>
              {p.override !== null && (
                <Badge variant="outline" className="text-[10px]">
                  personalizado
                </Badge>
              )}
            </label>
          ))}
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={isSaving || !values}>
          {isSaving ? 'Guardando...' : 'Guardar permisos'}
        </Button>
      </DialogFooter>
    </div>
  );
}

function CatalogSettings({
  endpoint,
  title,
  placeholder,
}: {
  endpoint: string;
  title: string;
  placeholder: string;
}) {
  const { data: items, mutate } = useApiSWR<(QuickService | AccessoryOption)[]>(
    `${endpoint}?includeInactive=true`,
  );
  const [newLabel, setNewLabel] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setIsSaving(true);
    try {
      await api.post(endpoint, { label: newLabel.trim() });
      setNewLabel('');
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    try {
      await api.patch(`${endpoint}/${id}`, { isActive: !isActive });
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleRemove(id: string) {
    try {
      await api.delete(`${endpoint}/${id}`);
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    if (!items) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    try {
      await api.patch(`${endpoint}/reorder`, { orderedIds: reordered.map((i) => i.id) });
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <Card className="mt-4 max-w-2xl">
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input placeholder={placeholder} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Button type="submit" size="sm" disabled={isSaving || !newLabel.trim()}>
            <Plus /> Agregar
          </Button>
        </form>
        <div className="flex flex-col gap-2">
          {items?.map((item, index) => (
            <div key={item.id} className="flex items-center gap-2 rounded-lg border p-2">
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  disabled={index === 0}
                  className="text-muted-foreground disabled:opacity-30"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  disabled={index === items.length - 1}
                  className="text-muted-foreground disabled:opacity-30"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              <span className="flex-1 text-sm">{item.label}</span>
              <Switch checked={item.isActive} onCheckedChange={() => handleToggleActive(item.id, item.isActive)} />
              <Button variant="ghost" size="icon" onClick={() => handleRemove(item.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {items?.length === 0 && <p className="text-sm text-muted-foreground">Sin elementos todavía</p>}
        </div>
      </CardContent>
    </Card>
  );
}
