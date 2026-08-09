'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportButton } from '@/components/reports/export-button';
import { DateRangeFilter, defaultDateRange, type DateRange } from '@/components/reports/date-range-filter';
import { useApiSWR } from '@/hooks/use-api-swr';
import { useAuth } from '@/components/providers/auth-provider';
import type { PosSummary } from '@/lib/pos-types';

function money(v: number) {
  return `$${v.toLocaleString('es-CO')}`;
}

/** AAAA-MM del mes calendario anterior — el mes que normalmente se cierra. */
function defaultCloseMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export default function PosReportesPage() {
  const { user } = useAuth();
  const isAdmin = user?.posRole === 'ADMIN';
  const [range, setRange] = React.useState<DateRange>(defaultDateRange());
  const [month, setMonth] = React.useState(defaultCloseMonth());

  const params = new URLSearchParams();
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  const key = isAdmin ? `/pos/reports/summary?${params.toString()}` : null;
  const { data, isLoading } = useApiSWR<PosSummary>(key);

  // Los reportes y el cierre son solo para ADMIN — un cajero no ve la
  // ganancia. El guardia del layout de /pos/* ya exige posRole; este además
  // exige que sea justo ADMIN.
  if (!isAdmin) {
    return (
      <div className="text-sm text-muted-foreground">
        Esta sección es solo para administradores del POS.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Ventas, ganancia y separados del periodo, y el cierre mensual para el contador.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumen del periodo</CardTitle>
          <CardDescription>
            Las ventas anuladas no cuentan; las notas crédito restan del total y de la ganancia.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <DateRangeFilter value={range} onChange={setRange} />
            <div className="flex flex-wrap gap-2">
              <ExportButton
                endpoint="/pos/sales/export"
                filename="ventas"
                label="Ventas"
                visible={isAdmin}
                params={{ from: range.from, to: range.to }}
              />
              <ExportButton
                endpoint="/pos/products/export"
                filename="inventario"
                label="Inventario"
                visible={isAdmin}
                params={{}}
              />
              <ExportButton
                endpoint="/pos/layaways/export"
                filename="separados"
                label="Separados"
                visible={isAdmin}
                params={{ from: range.from, to: range.to }}
              />
            </div>
          </div>

          {isLoading && <Skeleton className="h-32 w-full" />}

          {data && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatTile label="Ventas del periodo" value={String(data.salesCount)} />
                <StatTile label="Total facturado" value={money(data.totalInvoiced)} />
                <StatTile label="Ganancia" value={money(data.totalProfit)} />
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-medium">Por método de pago</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Método</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.byPaymentMethod.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground">
                            Sin datos
                          </TableCell>
                        </TableRow>
                      )}
                      {data.byPaymentMethod.map((m) => (
                        <TableRow key={m.method}>
                          <TableCell className="capitalize">{m.method}</TableCell>
                          <TableCell className="text-right">{money(m.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <h3 className="mb-2 text-sm font-medium">Productos más vendidos</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topProducts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            Sin datos
                          </TableCell>
                        </TableRow>
                      )}
                      {data.topProducts.map((p) => (
                        <TableRow key={p.name}>
                          <TableCell>{p.name}</TableCell>
                          <TableCell className="text-right">{p.quantity}</TableCell>
                          <TableCell className="text-right">{money(p.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-sm font-medium">
                  Separados activos ({data.activeLayaways.length})
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Abonado</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.activeLayaways.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          Sin separados activos
                        </TableCell>
                      </TableRow>
                    )}
                    {data.activeLayaways.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.clientName}</TableCell>
                        <TableCell className="text-right">{money(l.total)}</TableCell>
                        <TableCell className="text-right">{money(l.paid)}</TableCell>
                        <TableCell className="text-right">{money(l.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cierre mensual</CardTitle>
          <CardDescription>
            El archivo que recibe el contador: ventas, conciliación de efectivo e inventario de
            la sucursal activa, en un mes.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="close-month">Mes</Label>
            <Input
              id="close-month"
              type="month"
              className="w-40"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <ExportButton
            endpoint="/pos/reports/monthly-close"
            filename={`cierre-${month}`}
            label="Generar cierre"
            hint="Un archivo por sucursal — cambia de sucursal activa para cerrar otra."
            visible={isAdmin}
            params={{ month }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
