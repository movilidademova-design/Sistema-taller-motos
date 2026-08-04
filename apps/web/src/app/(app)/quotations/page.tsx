'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiSWR } from '@/hooks/use-api-swr';
import { QUOTATION_STATUS_LABELS, type QuotationStatus } from '@taller/shared';
import type { QuotationListRow } from '@/lib/types';

const STATUS_OPTIONS = Object.entries(QUOTATION_STATUS_LABELS) as [QuotationStatus, string][];

const STATUS_BADGE_VARIANT: Record<QuotationStatus, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  DRAFT: 'secondary',
  PENDING_REVIEW: 'warning',
  READY_TO_SEND: 'warning',
  SENT: 'warning',
  APPROVED: 'success',
  PARTIALLY_APPROVED: 'warning',
  REJECTED: 'destructive',
};

export default function QuotationsPage() {
  const [status, setStatus] = React.useState<string>('ALL');
  const router = useRouter();

  const key = status !== 'ALL' ? `/quotations?status=${status}` : '/quotations';
  const { data: quotations, isLoading } = useApiSWR<QuotationListRow[]>(key);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Cotizaciones</h1>
          <p className="text-sm text-muted-foreground">{quotations?.length ?? 0} cotizaciones</p>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas</SelectItem>
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
              <TableHead>Vehículo</TableHead>
              <TableHead>Ítems</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Actualizada</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))}
            {!isLoading && (!quotations || quotations.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No hay cotizaciones
                </TableCell>
              </TableRow>
            )}
            {quotations?.map((q) => (
              <TableRow
                key={q.id}
                onClick={() => router.push(`/quotations/${q.order.id}`)}
                className="cursor-pointer hover:bg-muted/50"
              >
                <TableCell className="font-medium" onClick={(e) => e.stopPropagation()}>
                  <Link href={`/quotations/${q.order.id}`} className="hover:underline">
                    #{q.order.orderNumber}
                  </Link>
                </TableCell>
                <TableCell>
                  {q.order.client.firstName} {q.order.client.lastName}
                </TableCell>
                <TableCell>
                  {q.order.motorcycle.brand} {q.order.motorcycle.model}
                </TableCell>
                <TableCell>{q.itemCount}</TableCell>
                <TableCell className="text-right">${Number(q.total).toLocaleString('es-CO')}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[q.status]}>{QUOTATION_STATUS_LABELS[q.status]}</Badge>
                </TableCell>
                <TableCell>{new Date(q.updatedAt).toLocaleDateString('es-CO')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
