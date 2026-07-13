'use client';

import * as React from 'react';
import { FileText, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useApiSWR } from '@/hooks/use-api-swr';
import { api, openAuthedBlobInNewTab } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import type { Invoice } from '@/lib/types';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  ISSUED: 'default',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  CANCELLED: 'destructive',
};

export default function InvoicesPage() {
  const { data: invoices } = useApiSWR<Invoice[]>('/invoices');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facturas</h1>
        <p className="text-sm text-muted-foreground">Facturación generada a partir de órdenes con cotización aprobada</p>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factura</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Orden</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Pagado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices?.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} />
            ))}
            {(!invoices || invoices.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Sin facturas generadas todavía
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const [isSending, setIsSending] = React.useState(false);

  async function handleSendEmail() {
    setIsSending(true);
    try {
      await api.post(`/invoices/${invoice.id}/send-email`);
      toast.success('Factura enviada por correo');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSending(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{invoice.invoiceNumber}</TableCell>
      <TableCell>{invoice.client ? `${invoice.client.firstName} ${invoice.client.lastName}` : '—'}</TableCell>
      <TableCell>{invoice.order ? `#${invoice.order.orderNumber}` : '—'}</TableCell>
      <TableCell className="text-right">${Number(invoice.total).toLocaleString('es-CO')}</TableCell>
      <TableCell className="text-right">${Number(invoice.amountPaid).toLocaleString('es-CO')}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openAuthedBlobInNewTab(`/invoices/${invoice.id}/pdf`)}>
            <FileText />
          </Button>
          <Button variant="outline" size="sm" disabled={isSending} onClick={handleSendEmail}>
            <Mail />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
