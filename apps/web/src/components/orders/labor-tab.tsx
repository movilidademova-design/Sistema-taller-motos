'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import type { LaborEntry, UserSummary } from '@/lib/types';

export function LaborTab({
  orderId,
  entries,
  onUpdated,
}: {
  orderId: string;
  entries: LaborEntry[];
  onUpdated: () => void;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> Registrar labor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewLaborForm
              orderId={orderId}
              onSuccess={() => {
                setOpen(false);
                onUpdated();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Técnico</TableHead>
            <TableHead>Actividad</TableHead>
            <TableHead>Inicio</TableHead>
            <TableHead>Fin</TableHead>
            <TableHead className="text-right">Horas</TableHead>
            <TableHead className="text-right">Costo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell>
                {entry.technician ? `${entry.technician.firstName} ${entry.technician.lastName}` : '—'}
              </TableCell>
              <TableCell>{entry.activity}</TableCell>
              <TableCell>{new Date(entry.startTime).toLocaleString('es-CO')}</TableCell>
              <TableCell>{entry.endTime ? new Date(entry.endTime).toLocaleString('es-CO') : '—'}</TableCell>
              <TableCell className="text-right">{entry.hours ?? '—'}</TableCell>
              <TableCell className="text-right">${Number(entry.cost).toLocaleString('es-CO')}</TableCell>
            </TableRow>
          ))}
          {entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Sin registros de mano de obra
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function NewLaborForm({ orderId, onSuccess }: { orderId: string; onSuccess: () => void }) {
  const { data: technicians } = useApiSWR<UserSummary[]>('/users/technicians');
  const [technicianId, setTechnicianId] = React.useState('');
  const [activity, setActivity] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [endTime, setEndTime] = React.useState('');
  const [cost, setCost] = React.useState('0');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post(`/orders/${orderId}/labor`, {
        technicianId,
        activity,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : undefined,
        cost: Number(cost || 0),
      });
      toast.success('Labor registrada');
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
        <DialogTitle>Registrar mano de obra</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>Técnico</Label>
          <Select value={technicianId} onValueChange={setTechnicianId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un técnico" />
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
          <Label>Actividad</Label>
          <Input required value={activity} onChange={(e) => setActivity(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Hora inicio</Label>
            <Input
              type="datetime-local"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Hora fin</Label>
            <Input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Costo</Label>
          <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !technicianId || !activity}>
          {isSubmitting ? 'Guardando...' : 'Registrar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
