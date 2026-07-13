'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import type { Warranty } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  OPEN: 'warning',
  APPROVED: 'default',
  REJECTED: 'destructive',
  RESOLVED: 'success',
};

export default function WarrantiesPage() {
  const { data: warranties, mutate } = useApiSWR<Warranty[]>('/warranties');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Garantías</h1>
        <p className="text-sm text-muted-foreground">
          Registradas desde el detalle de cada orden. Aquí se autorizan y resuelven.
        </p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Costo</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {warranties?.map((w) => (
              <WarrantyRow key={w.id} warranty={w} onUpdated={() => mutate()} />
            ))}
            {(!warranties || warranties.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin garantías registradas
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function WarrantyRow({ warranty, onUpdated }: { warranty: Warranty; onUpdated: () => void }) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [result, setResult] = React.useState('');

  async function handleAction(action: 'approve' | 'reject') {
    setIsSubmitting(true);
    try {
      await api.post(`/warranties/${warranty.id}/${action}`);
      toast.success('Garantía actualizada');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResolve() {
    if (!result) return;
    setIsSubmitting(true);
    try {
      await api.post(`/warranties/${warranty.id}/resolve`, { result });
      toast.success('Garantía resuelta');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <TableRow>
      <TableCell>{warranty.client ? `${warranty.client.firstName} ${warranty.client.lastName}` : '—'}</TableCell>
      <TableCell className="max-w-64 truncate">{warranty.reason}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[warranty.status]}>{warranty.status}</Badge>
      </TableCell>
      <TableCell className="text-right">${Number(warranty.cost).toLocaleString('es-CO')}</TableCell>
      <TableCell className="text-right">
        {warranty.status === 'OPEN' && (
          <div className="flex justify-end gap-2">
            <Button size="sm" disabled={isSubmitting} onClick={() => handleAction('approve')}>
              Aprobar
            </Button>
            <Button size="sm" variant="outline" disabled={isSubmitting} onClick={() => handleAction('reject')}>
              Rechazar
            </Button>
          </div>
        )}
        {warranty.status === 'APPROVED' && (
          <div className="flex justify-end gap-2">
            <Input
              placeholder="Resultado"
              className="h-8 w-40"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
            <Button size="sm" disabled={isSubmitting || !result} onClick={handleResolve}>
              Resolver
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
