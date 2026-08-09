'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api } from '@/lib/api';
import { useAuth } from '@/components/providers/auth-provider';
import { getErrorMessage } from '@/components/providers/auth-provider';
import type { PaginatedResult } from '@/lib/types';
import type { PosSale, PosSaleStatus } from '@/lib/pos-types';

const STATUS_LABEL: Record<PosSaleStatus, string> = {
  ACTIVE: 'Activa',
  VOIDED: 'Anulada',
  CREDIT_NOTE: 'Nota crédito',
};
const STATUS_VARIANT: Record<PosSaleStatus, 'success' | 'destructive' | 'warning'> = {
  ACTIVE: 'success',
  VOIDED: 'destructive',
  CREDIT_NOTE: 'warning',
};

function money(v: string) {
  return `$${Number(v).toLocaleString('es-CO')}`;
}

export default function PosVentasPage() {
  const { user } = useAuth();
  const isAdmin = user?.posRole === 'ADMIN';
  const [status, setStatus] = React.useState<string>('ALL');
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState<PosSale | null>(null);

  const params = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (status !== 'ALL') params.set('status', status);
  const key = `/pos/sales?${params.toString()}`;
  const { data, isLoading } = useApiSWR<PaginatedResult<PosSale>>(key);

  function refreshList() {
    mutate((k) => typeof k === 'string' && k.startsWith('/pos/sales'));
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? 0} ventas registradas</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos los estados</SelectItem>
            <SelectItem value="ACTIVE">Activa</SelectItem>
            <SelectItem value="VOIDED">Anulada</SelectItem>
            <SelectItem value="CREDIT_NOTE">Nota crédito</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factura</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
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
                  Sin ventas registradas
                </TableCell>
              </TableRow>
            )}
            {data?.items.map((sale) => (
              <TableRow
                key={sale.id}
                onClick={() => setSelected(sale)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-mono text-xs">
                  {sale.invoiceNumber ?? '—'}
                </TableCell>
                <TableCell>{new Date(sale.soldAt).toLocaleString('es-CO')}</TableCell>
                <TableCell className="font-medium">{sale.clientName}</TableCell>
                <TableCell className="text-right">{money(sale.total)}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[sale.status]}>{STATUS_LABEL[sale.status]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft /> Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {data.page} de {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Siguiente <ChevronRight />
          </Button>
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected && (
            <SaleDetail
              sale={selected}
              isAdmin={isAdmin}
              onChanged={(updated) => {
                setSelected(updated);
                refreshList();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaleDetail({
  sale,
  isAdmin,
  onChanged,
}: {
  sale: PosSale;
  isAdmin: boolean;
  onChanged: (sale: PosSale) => void;
}) {
  const [isVoiding, setIsVoiding] = React.useState(false);
  const [isCreditingNote, setIsCreditingNote] = React.useState(false);

  async function handleVoid() {
    // Es dinero: un window.confirm nativo basta para que un clic accidental
    // no anule una venta ya cobrada.
    if (!window.confirm(`¿Anular la venta #${sale.invoiceNumber ?? sale.id}? Libera el número de factura y devuelve el stock.`)) {
      return;
    }
    setIsVoiding(true);
    try {
      const updated = await api.post<PosSale>(`/pos/sales/${sale.id}/void`);
      toast.success('Venta anulada');
      onChanged(updated);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsVoiding(false);
    }
  }

  async function handleCreditNote() {
    if (!window.confirm(`¿Generar nota crédito para la venta #${sale.invoiceNumber ?? sale.id}? Devuelve el stock y conserva el número de factura.`)) {
      return;
    }
    setIsCreditingNote(true);
    try {
      const updated = await api.post<PosSale>(`/pos/sales/${sale.id}/credit-note`);
      toast.success('Nota crédito generada');
      onChanged(updated);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsCreditingNote(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>
          Venta #{sale.invoiceNumber ?? '—'} — {sale.clientName}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{new Date(sale.soldAt).toLocaleString('es-CO')}</span>
        <Badge variant={STATUS_VARIANT[sale.status]}>{STATUS_LABEL[sale.status]}</Badge>
        {sale.clientDoc && <span>Doc: {sale.clientDoc}</span>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Producto</TableHead>
            <TableHead className="text-right">Cant.</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead className="text-right">Total línea</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sale.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {item.name}
                {(item.engineNumber || item.chassisNumber) && (
                  <div className="text-xs text-muted-foreground">
                    {item.engineNumber && <>Motor: {item.engineNumber} </>}
                    {item.chassisNumber && <>Chasis: {item.chassisNumber}</>}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">{money(item.unitPrice)}</TableCell>
              <TableCell className="text-right">{money(item.lineTotal)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-col items-end gap-1 text-sm">
        <div>Subtotal: {money(sale.subtotal)}</div>
        {Number(sale.generalDiscount) > 0 && <div>Descuento: -{money(sale.generalDiscount)}</div>}
        <div className="text-base font-semibold">Total: {money(sale.total)}</div>
      </div>

      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Pagos</span>
        {sale.payments.map((p) => (
          <div key={p.id} className="flex justify-between">
            <span>{p.method}</span>
            <span>{money(p.amount)}</span>
          </div>
        ))}
      </div>

      {isAdmin && sale.status === 'ACTIVE' && (
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" disabled={isVoiding || isCreditingNote} onClick={handleVoid}>
            {isVoiding ? 'Anulando...' : 'Anular'}
          </Button>
          <Button variant="destructive" disabled={isVoiding || isCreditingNote} onClick={handleCreditNote}>
            {isCreditingNote ? 'Generando...' : 'Nota crédito'}
          </Button>
        </div>
      )}
    </div>
  );
}
