'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';
import { VEHICLE_TYPE_LABELS, type VehicleType } from '@taller/shared';
import type { Client, Motorcycle, PaginatedResult } from '@/lib/types';

export default function MotorcyclesPage() {
  const [search, setSearch] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const { user } = useAuth();
  const key = `/motorcycles?search=${encodeURIComponent(search)}`;
  const { data, isLoading } = useApiSWR<PaginatedResult<Motorcycle>>(key);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Vehículos</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? 0} vehículos registrados</p>
        </div>
        {!!user?.permissions['motorcycles.manage'] && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nuevo vehículo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewMotorcycleForm
              onSuccess={() => {
                setOpen(false);
                mutate((k) => typeof k === 'string' && k.startsWith('/motorcycles'));
              }}
            />
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por marca, modelo o serie..."
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Marca / Modelo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Serie</TableHead>
              <TableHead>Batería</TableHead>
              <TableHead className="text-right">Kilometraje</TableHead>
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
            {!isLoading && data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No hay vehículos registrados
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">
                  <Link href={`/motorcycles/${m.id}`} className="hover:underline">
                    {m.brand} {m.model}
                  </Link>
                </TableCell>
                <TableCell>
                  {m.client ? `${m.client.firstName} ${m.client.lastName}` : '—'}
                </TableCell>
                <TableCell>{m.serialNumber ?? '—'}</TableCell>
                <TableCell>
                  {m.batteryCapacity ?? '—'} {m.voltage ?? ''}
                </TableCell>
                <TableCell className="text-right">{m.mileage ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewMotorcycleForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: clients } = useApiSWR<PaginatedResult<Client>>('/clients?pageSize=100');
  const [form, setForm] = React.useState({
    clientId: '',
    vehicleType: 'BICIMOTO' as VehicleType,
    brand: '',
    model: '',
    color: '',
    year: '',
    serialNumber: '',
    motorNumber: '',
    batteryNumber: '',
    batteryCapacity: '',
    voltage: '',
    controller: '',
    display: '',
    mileage: '',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/motorcycles', {
        ...form,
        year: form.year ? Number(form.year) : undefined,
        mileage: form.mileage ? Number(form.mileage) : undefined,
      });
      toast.success('Vehículo registrado');
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
        <DialogTitle>Nuevo vehículo</DialogTitle>
        <DialogDescription>Registra los datos técnicos del vehículo</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Cliente</Label>
          <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
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
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Tipo de vehículo</Label>
          <Select
            value={form.vehicleType}
            onValueChange={(v) => setForm({ ...form, vehicleType: v as VehicleType })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(VEHICLE_TYPE_LABELS) as [VehicleType, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Marca</Label>
          <Input required value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Modelo</Label>
          <Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Color</Label>
          <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Año</Label>
          <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Número de serie</Label>
          <Input
            value={form.serialNumber}
            onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Número de motor</Label>
          <Input
            value={form.motorNumber}
            onChange={(e) => setForm({ ...form, motorNumber: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Número de batería</Label>
          <Input
            value={form.batteryNumber}
            onChange={(e) => setForm({ ...form, batteryNumber: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Capacidad de batería</Label>
          <Input
            value={form.batteryCapacity}
            onChange={(e) => setForm({ ...form, batteryCapacity: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Voltaje</Label>
          <Input value={form.voltage} onChange={(e) => setForm({ ...form, voltage: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Controlador</Label>
          <Input value={form.controller} onChange={(e) => setForm({ ...form, controller: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Pantalla</Label>
          <Input value={form.display} onChange={(e) => setForm({ ...form, display: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Kilometraje</Label>
          <Input
            type="number"
            value={form.mileage}
            onChange={(e) => setForm({ ...form, mileage: e.target.value })}
          />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !form.clientId}>
          {isSubmitting ? 'Guardando...' : 'Guardar vehículo'}
        </Button>
      </DialogFooter>
    </form>
  );
}
