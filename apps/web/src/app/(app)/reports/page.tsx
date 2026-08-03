'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExportButton } from '@/components/reports/export-button';
import {
  DateRangeFilter,
  defaultDateRange,
  type DateRange,
} from '@/components/reports/date-range-filter';

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Genera y descarga reportes en Excel. Cada reporte se configura y se
          descarga por separado.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <RevenueReportCard />
      </div>
    </div>
  );
}

function RevenueReportCard() {
  const [range, setRange] = React.useState<DateRange>(defaultDateRange());
  const [groupBy, setGroupBy] = React.useState('month');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresos</CardTitle>
        <CardDescription>
          Facturado, cobrado y saldo pendiente por periodo y sucursal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex flex-col gap-1.5">
          <Label>Agrupar por</Label>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Día</SelectItem>
              <SelectItem value="month">Mes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <ExportButton
            endpoint="/reports/revenue/export"
            filename="ingresos"
            label="Generar reporte"
            params={{ from: range.from, to: range.to, groupBy }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
