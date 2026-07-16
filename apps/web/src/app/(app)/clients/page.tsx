'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';
import type { Client, PaginatedResult } from '@/lib/types';

export default function ClientsPage() {
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const { user } = useAuth();
  const key = `/clients?search=${encodeURIComponent(search)}`;
  const { data, isLoading } = useApiSWR<PaginatedResult<Client>>(key);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} clientes registrados</p>
        </div>
        {!!user?.permissions['clients.create'] && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> Nuevo cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <NewClientForm
                onSuccess={() => {
                  setOpen(false);
                  mutate((k) => typeof k === 'string' && k.startsWith('/clients'));
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, documento o teléfono..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead className="text-right">Motos</TableHead>
              <TableHead className="text-right">Órdenes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay clientes todavía
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium">
                  <Link href={`/clients/${client.id}`} className="hover:underline">
                    {client.firstName} {client.lastName}
                  </Link>
                </TableCell>
                <TableCell>{client.documentId ?? '—'}</TableCell>
                <TableCell>{client.phone ?? '—'}</TableCell>
                <TableCell>{client.email ?? '—'}</TableCell>
                <TableCell className="text-right">{client._count?.motorcycles ?? 0}</TableCell>
                <TableCell className="text-right">{client._count?.orders ?? 0}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewClientForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = React.useState({
    firstName: '',
    lastName: '',
    documentId: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/clients', form);
      toast.success('Cliente creado');
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
        <DialogTitle>Nuevo cliente</DialogTitle>
        <DialogDescription>Registra los datos básicos del cliente</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Nombre</Label>
          <Input
            required
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Apellido</Label>
          <Input
            required
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Documento</Label>
          <Input
            value={form.documentId}
            onChange={(e) => setForm({ ...form, documentId: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Teléfono</Label>
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Correo</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Dirección</Label>
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Notas</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Guardar cliente'}
        </Button>
      </DialogFooter>
    </form>
  );
}
