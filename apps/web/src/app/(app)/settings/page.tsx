'use client';

import * as React from 'react';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { Role } from '@taller/shared';
import type { AccessoryOption, Branch, QuickService, UserSummary } from '@/lib/types';

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
          <TabsTrigger value="accessories">Accesorios</TabsTrigger>
          <TabsTrigger value="branches">Sucursales</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <GeneralSettings />
        </TabsContent>
        <TabsContent value="users">
          <UsersSettings />
        </TabsContent>
        <TabsContent value="quick-services">
          <QuickServicesSettings />
        </TabsContent>
        <TabsContent value="accessories">
          <AccessoryOptionsSettings />
        </TabsContent>
        <TabsContent value="branches">
          <BranchesSettings />
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
            <TableHead>Sucursales</TableHead>
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
              <TableCell>
                <AssignBranchesButton user={u} onAssigned={() => mutate()} />
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

function QuickServicesSettings() {
  const { data: services, mutate } = useApiSWR<QuickService[]>('/quick-services');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<QuickService | null>(null);
  const [isReordering, setIsReordering] = React.useState(false);

  async function handleMove(index: number, direction: -1 | 1) {
    if (!services || isReordering) return;
    const next = [...services];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIsReordering(true);
    try {
      await api.patch('/quick-services/reorder', { orderedIds: next.map((s) => s.id) });
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsReordering(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/quick-services/${id}`);
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

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
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus /> Nuevo servicio rápido
            </Button>
          </DialogTrigger>
          <DialogContent>
            <QuickServiceForm
              editing={editing}
              onSuccess={() => {
                setOpen(false);
                setEditing(null);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-col gap-2">
        {services?.map((service, index) => (
          <div key={service.id} className="flex items-center gap-2 rounded-lg border p-2">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={index === 0 || isReordering}
                onClick={() => handleMove(index, -1)}
                aria-label="Mover arriba"
                className="disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={index === services.length - 1 || isReordering}
                onClick={() => handleMove(index, 1)}
                aria-label="Mover abajo"
                className="disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <span className="flex-1 text-sm">{service.label}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(service);
                setOpen(true);
              }}
            >
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(service.id)}>
              Eliminar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickServiceForm({
  editing,
  onSuccess,
}: {
  editing: QuickService | null;
  onSuccess: () => void;
}) {
  const [label, setLabel] = React.useState(editing?.label ?? '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/quick-services/${editing.id}`, { label });
      } else {
        await api.post('/quick-services', { label });
      }
      toast.success('Guardado');
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
        <DialogTitle>{editing ? 'Editar servicio rápido' : 'Nuevo servicio rápido'}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5 py-4">
        <Label>Nombre</Label>
        <Input required value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !label}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AccessoryOptionsSettings() {
  const { data: options, mutate } = useApiSWR<AccessoryOption[]>('/accessory-options');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AccessoryOption | null>(null);
  const [isReordering, setIsReordering] = React.useState(false);

  async function handleMove(index: number, direction: -1 | 1) {
    if (!options || isReordering) return;
    const next = [...options];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIsReordering(true);
    try {
      await api.patch('/accessory-options/reorder', { orderedIds: next.map((o) => o.id) });
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsReordering(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/accessory-options/${id}`);
      mutate();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

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
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus /> Nuevo accesorio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <AccessoryOptionForm
              editing={editing}
              onSuccess={() => {
                setOpen(false);
                setEditing(null);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-col gap-2">
        {options?.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2 rounded-lg border p-2">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={index === 0 || isReordering}
                onClick={() => handleMove(index, -1)}
                aria-label="Mover arriba"
                className="disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={index === options.length - 1 || isReordering}
                onClick={() => handleMove(index, 1)}
                aria-label="Mover abajo"
                className="disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <span className="flex-1 text-sm">{option.label}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(option);
                setOpen(true);
              }}
            >
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(option.id)}>
              Eliminar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccessoryOptionForm({
  editing,
  onSuccess,
}: {
  editing: AccessoryOption | null;
  onSuccess: () => void;
}) {
  const [label, setLabel] = React.useState(editing?.label ?? '');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editing) {
        await api.patch(`/accessory-options/${editing.id}`, { label });
      } else {
        await api.post('/accessory-options', { label });
      }
      toast.success('Guardado');
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
        <DialogTitle>{editing ? 'Editar accesorio' : 'Nuevo accesorio'}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-1.5 py-4">
        <Label>Nombre</Label>
        <Input required value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !label}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function BranchesSettings() {
  const { data: branches, mutate } = useApiSWR<Branch[]>('/branches');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Branch | null>(null);

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
            <Button size="sm" onClick={() => setEditing(null)}>
              <Plus /> Nueva sucursal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <BranchForm
              editing={editing}
              onSuccess={() => {
                setOpen(false);
                setEditing(null);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <div className="flex flex-col gap-2">
        {branches?.map((branch) => (
          <div key={branch.id} className="flex items-center gap-2 rounded-lg border p-2">
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium">
                {branch.name} <span className="text-muted-foreground">({branch.code})</span>
              </span>
              {(branch.city || branch.address) && (
                <span className="text-xs text-muted-foreground">
                  {[branch.address, branch.city].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
            <Badge variant={branch.isActive ? 'success' : 'destructive'}>
              {branch.isActive ? 'Activa' : 'Inactiva'}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(branch);
                setOpen(true);
              }}
            >
              Editar
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchForm({
  editing,
  onSuccess,
}: {
  editing: Branch | null;
  onSuccess: () => void;
}) {
  const [form, setForm] = React.useState({
    name: editing?.name ?? '',
    code: editing?.code ?? '',
    address: editing?.address ?? '',
    city: editing?.city ?? '',
    phone: editing?.phone ?? '',
    email: editing?.email ?? '',
    isActive: editing?.isActive ?? true,
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // Optional fields are @IsOptional() on the backend, which only skips
      // null/undefined — an empty string still fails e.g. @IsEmail(). Omit
      // blanks entirely rather than sending them.
      const address = form.address || undefined;
      const city = form.city || undefined;
      const phone = form.phone || undefined;
      const email = form.email || undefined;
      if (editing) {
        await api.patch(`/branches/${editing.id}`, {
          name: form.name,
          code: form.code,
          address,
          city,
          phone,
          email,
          isActive: form.isActive,
        });
      } else {
        await api.post('/branches', { name: form.name, code: form.code, address, city, phone, email });
      }
      toast.success('Guardado');
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
        <DialogTitle>{editing ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Código (4 dígitos)</Label>
          <Input
            required
            maxLength={4}
            inputMode="numeric"
            value={form.code}
            onChange={(e) =>
              setForm({ ...form, code: e.target.value.replace(/\D/g, '').slice(0, 4) })
            }
          />
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
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        {editing && (
          <div className="col-span-2">
            <Label className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={form.isActive}
                onCheckedChange={(checked) => setForm({ ...form, isActive: checked === true })}
              />
              Sucursal activa
            </Label>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !form.name || !form.code}>
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AssignBranchesButton({
  user,
  onAssigned,
}: {
  user: UserSummary;
  onAssigned: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const { data: branches } = useApiSWR<Branch[]>(open ? '/branches' : null);
  const { data: assigned, mutate: mutateAssigned } = useApiSWR<{ branch: Branch }[]>(
    open ? `/users/${user.id}/branches` : null,
  );
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (assigned) setSelectedIds(assigned.map((a) => a.branch.id));
  }, [assigned]);

  async function handleSave() {
    setIsSubmitting(true);
    try {
      await api.post(`/users/${user.id}/branches`, { branchIds: selectedIds });
      toast.success('Sucursales asignadas');
      mutateAssigned();
      onAssigned();
      setOpen(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          Asignar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Sucursales de {user.firstName} {user.lastName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 py-4">
          {branches?.map((branch) => (
            <Label key={branch.id} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={selectedIds.includes(branch.id)}
                onCheckedChange={(checked) =>
                  setSelectedIds((prev) =>
                    checked === true
                      ? [...prev, branch.id]
                      : prev.filter((id) => id !== branch.id),
                  )
                }
              />
              {branch.name} ({branch.code})
            </Label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={isSubmitting}>
            {isSubmitting ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
