'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { PAYMENT_METHOD_LABELS, PaymentMethod } from '@taller/shared';
import type { Client, PaginatedResult, Payment } from '@/lib/types';

export default function PaymentsPage() {
  const [open, setOpen] = React.useState(false);
  const { data, mutate } = useApiSWR<Payment[]>('/payments');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pagos</h1>
          <p className="text-sm text-muted-foreground">Historial de pagos recibidos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus /> Registrar pago
            </Button>
          </DialogTrigger>
          <DialogContent>
            <NewPaymentForm
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
              <TableHead>Recibo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead>Método</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.receiptNumber}</TableCell>
                <TableCell>{p.client ? `${p.client.firstName} ${p.client.lastName}` : '—'}</TableCell>
                <TableCell>{p.order ? `#${p.order.orderNumber}` : '—'}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{PAYMENT_METHOD_LABELS[p.method]}</Badge>
                </TableCell>
                <TableCell className="text-right">${Number(p.amount).toLocaleString('es-CO')}</TableCell>
                <TableCell>{new Date(p.createdAt).toLocaleDateString('es-CO')}</TableCell>
              </TableRow>
            ))}
            {(!data || data.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Sin pagos registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewPaymentForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: clients } = useApiSWR<PaginatedResult<Client>>('/clients?pageSize=100');
  const [clientId, setClientId] = React.useState('');
  const [method, setMethod] = React.useState<PaymentMethod>(PaymentMethod.CASH);
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/payments', { clientId, method, amount: Number(amount), reference: reference || undefined });
      toast.success('Pago registrado');
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
        <DialogTitle>Registrar pago</DialogTitle>
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
          <Label>Método</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CASH">Efectivo</SelectItem>
              <SelectItem value="TRANSFER">Transferencia</SelectItem>
              <SelectItem value="CARD">Tarjeta</SelectItem>
              <SelectItem value="QR">QR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Monto</Label>
          <Input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Referencia (opcional)</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting || !clientId || !amount}>
          {isSubmitting ? 'Guardando...' : 'Registrar pago'}
        </Button>
      </DialogFooter>
    </form>
  );
}
