'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage, useAuth } from '@/components/providers/auth-provider';
import type { Expense } from '@/lib/types';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(
    value,
  );
}

export default function ExpensesPage() {
  const { data: expenses, mutate } = useApiSWR<Expense[]>('/expenses');
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const canManage = !!user?.permissions['expenses.manage'];

  const total = (expenses ?? []).reduce((acc, e) => acc + Number(e.amount), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Egresos operativos del taller — Total: {formatCurrency(total)}
          </p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus /> Registrar gasto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <NewExpenseForm
                onSuccess={() => {
                  setOpen(false);
                  mutate();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Concepto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Registrado por</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses?.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{new Date(e.expenseDate).toLocaleDateString('es-CO')}</TableCell>
                <TableCell className="font-medium">{e.concept}</TableCell>
                <TableCell>{e.category}</TableCell>
                <TableCell>
                  {e.createdBy ? `${e.createdBy.firstName} ${e.createdBy.lastName}` : '—'}
                </TableCell>
                <TableCell className="text-right">{formatCurrency(Number(e.amount))}</TableCell>
              </TableRow>
            ))}
            {(!expenses || expenses.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin gastos registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function NewExpenseForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = React.useState({
    concept: '',
    category: '',
    amount: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/expenses', { ...form, amount: Number(form.amount) });
      toast.success('Gasto registrado');
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
        <DialogTitle>Registrar gasto</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 py-4">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Concepto</Label>
          <Input required value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Categoría</Label>
          <Input
            required
            placeholder="Ej: Servicios, Nómina, Arriendo"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Monto</Label>
          <Input
            type="number"
            required
            min={1}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Fecha</Label>
          <Input
            type="date"
            value={form.expenseDate}
            onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label>Notas</Label>
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Guardando...' : 'Registrar'}
        </Button>
      </DialogFooter>
    </form>
  );
}
