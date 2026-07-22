'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { useApiSWR } from '@/hooks/use-api-swr';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@taller/shared';
import type { Order, PaginatedResult } from '@/lib/types';

const STATUS_OPTIONS = Object.entries(ORDER_STATUS_LABELS) as [OrderStatus, string][];

export default function OrdersPage() {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState<string>('ALL');

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
        <Button asChild>
          <Link href="/orders/new">
            <Plus /> Nueva orden
          </Link>
        </Button>
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
