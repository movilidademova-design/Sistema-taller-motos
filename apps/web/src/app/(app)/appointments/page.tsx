'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { AppointmentType } from '@taller/shared';
import type { Appointment, Client, PaginatedResult } from '@/lib/types';

const TYPE_LABELS: Record<AppointmentType, string> = {
  APPOINTMENT: 'Cita',
  MAINTENANCE: 'Mantenimiento',
  WARRANTY: 'Garantía',
  DELIVERY: 'Entrega',
};

export default function AppointmentsPage() {
  const [open, setOpen] = React.useState(false);
  const { data: appointments, mutate } = useApiSWR<Appointment[]>('/appointments');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted-foreground">Citas, mantenimientos, garantías y entregas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Nueva cita
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewAppointmentForm
              onSuccess={() => {
                setOpen(false);
                mutate();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments?.map((a) => (
              <TableRow key={a.id}>
                <TableCell>{new Date(a.scheduledAt).toLocaleString('es-CO')}</TableCell>
                <TableCell>{a.client ? `${a.client.firstName} ${a.client.lastName}` : '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{TYPE_LABELS[a.type]}</Badge>
                </TableCell>
                <TableCell>{a.status}</TableCell>
                <TableCell className="max-w-64 truncate">{a.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
            {(!appointments || appointments.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin citas programadas
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewAppointmentForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: clients } = useApiSWR<PaginatedResult<Client>>('/clients?pageSize=100');
  const [clientId, setClientId] = React.useState('');
  const [type, setType] = React.useState<AppointmentType>(AppointmentType.APPOINTMENT);
  const [scheduledAt, setScheduledAt] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/appointments', {
        clientId,
        type,
        scheduledAt: new Date(scheduledAt).toISOString(),
        notes: notes || undefined,
      });
      toast.success('Cita creada');
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
        <DialogTitle>Nueva cita</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Cliente</Label>
          <Select value={clientId} onValueChange={setClientId}>
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
          <Label>Tipo</Label>
          <Select value={type} onValueChange={(v) => setType(v as AppointmentType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Fecha y hora</Label>
          <Input
            type="datetime-local"
            required
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Notas</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !clientId || !scheduledAt}>
          {isSubmitting ? 'Creando...' : 'Crear cita'}
        </Button>
      </DialogFooter>
    </form>
  );
}
