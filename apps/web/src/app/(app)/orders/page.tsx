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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@taller/shared';
import type { Client, Motorcycle, Order, PaginatedResult, UserSummary } from '@/lib/types';

const STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS) as [OrderStatus, string][];

export default function OrdersPage() {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>('ALL');
  const [open, setOpen] = React.useState(false);

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status !== 'ALL') params.set('status', status);
  const key = `/orders?${params.toString()}`;

  const { data, isLoading } = useApiSWR<PaginatedResult<Order>>(key);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Órdenes de trabajo</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} órdenes</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nueva orden
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewOrderForm
              onSuccess={(id) => {
                setOpen(false);
                mutate((k) => typeof k === 'string' && k.startsWith('/orders'));
                window.location.href = `/orders/${id}`;
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, motivo o serie..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            {STATUS_OPTIONS.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Orden</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Bicimoto</TableHead>
              <TableHead>Técnico</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
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
                  No hay órdenes todavía
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  <Link href={`/orders/${order.id}`} className="hover:underline">
                    #{order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  {order.client ? `${order.client.firstName} ${order.client.lastName}` : '—'}
                </TableCell>
                <TableCell>
                  {order.motorcycle ? `${order.motorcycle.brand} ${order.motorcycle.model}` : '—'}
                </TableCell>
                <TableCell>
                  {order.technician ? `${order.technician.firstName} ${order.technician.lastName}` : 'Sin asignar'}
                </TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>{new Date(order.receivedAt).toLocaleDateString('es-CO')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewOrderForm({ onSuccess }: { onSuccess: (id: string) => void }) {
  const { data: clients } = useApiSWR<PaginatedResult<Client>>('/clients?pageSize=100');
  const [clientId, setClientId] = React.useState('');
  const { data: motorcycles } = useApiSWR<PaginatedResult<Motorcycle>>(
    clientId ? `/motorcycles?clientId=${clientId}&pageSize=100` : null,
  );
  const { data: technicians } = useApiSWR<UserSummary[]>('/users/technicians');
  const [motorcycleId, setMotorcycleId] = React.useState('');
  const [technicianId, setTechnicianId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [accessories, setAccessories] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const order = await api.post<Order>('/orders', {
        clientId,
        motorcycleId,
        technicianId: technicianId || undefined,
        reason,
        accessoriesDelivered: accessories || undefined,
      });
      toast.success(`Orden #${order.orderNumber} creada`);
      onSuccess(order.id);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogHeader>
        <DialogTitle>Nueva orden de recepción</DialogTitle>
        <DialogDescription>Registra el ingreso de una bicimoto al taller</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Cliente</Label>
          <Select
            value={clientId}
            onValueChange={(v) => {
              setClientId(v);
              setMotorcycleId('');
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un cliente" />
            </SelectTrigger>
            <SelectContent>
              {clients?.items.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Bicimoto</Label>
          <Select value={motorcycleId} onValueChange={setMotorcycleId} disabled={!clientId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona una bicimoto" />
            </SelectTrigger>
            <SelectContent>
              {motorcycles?.items.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.brand} {m.model} {m.serialNumber ? `(${m.serialNumber})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Técnico asignado (opcional)</Label>
          <Select value={technicianId} onValueChange={setTechnicianId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin asignar" />
            </SelectTrigger>
            <SelectContent>
              {technicians?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Motivo de ingreso</Label>
          <Textarea required value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Accesorios entregados</Label>
          <Textarea value={accessories} onChange={(e) => setAccessories(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !clientId || !motorcycleId || !reason}>
          {isSubmitting ? 'Creando...' : 'Crear orden'}
        </Button>
      </DialogFooter>
    </form>
  );
}
