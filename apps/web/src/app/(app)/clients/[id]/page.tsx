'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderStatusBadge } from '@/components/shared/order-status-badge';
import { useApiSWR } from '@/hooks/use-api-swr';
import { PAYMENT_METHOD_LABELS } from '@taller/shared';
import type { Client } from '@/lib/types';

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data: client, isLoading } = useApiSWR<Client>(`/clients/${id}`);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!client) return <p>Cliente no encontrado.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/clients" className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
          <ArrowLeft className="size-4" /> Clientes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {client.firstName} {client.lastName}
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Contacto</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <span>{client.phone ?? 'Sin teléfono'}</span>
            <span>{client.email ?? 'Sin correo'}</span>
            <span>{client.address ?? 'Sin dirección'}</span>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Documento</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">{client.documentId ?? 'No registrado'}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Notas</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{client.notes ?? 'Sin notas'}</CardContent>
        </Card>
      </div>

      <Tabs defaultValue="motorcycles">
        <TabsList>
          <TabsTrigger value="motorcycles">Vehículos ({client.motorcycles?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="orders">Órdenes ({client.orders?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="invoices">Facturas ({client.invoices?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="payments">Pagos ({client.payments?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="warranties">Garantías ({client.warranties?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="motorcycles">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca / Modelo</TableHead>
                <TableHead>Serie</TableHead>
                <TableHead>Kilometraje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.motorcycles?.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link href={`/motorcycles/${m.id}`} className="font-medium hover:underline">
                      {m.brand} {m.model}
                    </Link>
                  </TableCell>
                  <TableCell>{m.serialNumber ?? '—'}</TableCell>
                  <TableCell>{m.mileage ?? '—'} km</TableCell>
                </TableRow>
              ))}
              {(!client.motorcycles || client.motorcycles.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin vehículos registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="orders">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Orden</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.orders?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                      #{o.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{o.reason}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                  <TableCell>{new Date(o.receivedAt).toLocaleDateString('es-CO')}</TableCell>
                </TableRow>
              ))}
              {(!client.orders || client.orders.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin órdenes registradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="invoices">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Factura</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.invoices?.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoiceNumber}</TableCell>
                  <TableCell>${Number(inv.total).toLocaleString('es-CO')}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{inv.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!client.invoices || client.invoices.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin facturas registradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="payments">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recibo</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.payments?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.receiptNumber}</TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                  <TableCell>${Number(p.amount).toLocaleString('es-CO')}</TableCell>
                  <TableCell>{new Date(p.createdAt).toLocaleDateString('es-CO')}</TableCell>
                </TableRow>
              ))}
              {(!client.payments || client.payments.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sin pagos registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        <TabsContent value="warranties">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Motivo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {client.warranties?.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="max-w-64 truncate">{w.reason}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{w.status}</Badge>
                  </TableCell>
                  <TableCell>{new Date(w.createdAt).toLocaleDateString('es-CO')}</TableCell>
                </TableRow>
              ))}
              {(!client.warranties || client.warranties.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Sin garantías registradas
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </div>
  );
}
