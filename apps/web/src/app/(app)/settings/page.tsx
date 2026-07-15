'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { getErrorMessage } from '@/components/providers/auth-provider';
import { Role } from '@taller/shared';
import type { AccessoryOption, QuickService, UserSummary } from '@/lib/types';

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  RECEPTIONIST: 'Recepcionista',
  TECHNICIAN: 'Técnico',
  CLIENT: 'Cliente',
};

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
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground">Datos del taller y gestión de usuarios</p>
      </div>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="quick-services">Servicios rápidos</TabsTrigger>
          <TabsTrigger value="accessory-options">Accesorios</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
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

function UsersSettings() {
  const { data: users, mutate } = useApiSWR<UserSummary[]>('/users');
  const [open, setOpen] = React.useState(false);

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
            <TableHead>Estado</TableHead>
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
                <Badge variant={u.isActive ? 'success' : 'destructive'}>
                  {u.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NewUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    phone: '',
    role: Role.RECEPTIONIST as Role,
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
              {Object.entries(ROLE_LABELS)
                .filter(([value]) => value !== 'CLIENT')
                .map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
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
