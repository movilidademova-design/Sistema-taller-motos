'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  type TooltipContentProps,
} from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const gridColor = 'var(--border)';
const textColor = 'var(--muted-foreground)';

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="font-medium">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString('es-CO') : p.value}
        </div>
      ))}
    </div>
  );
}

export function RevenueAreaChart({ data }: { data: { date: string; total: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Ingresos (últimos 30 días)</CardTitle>
      </CardHeader>
      <CardContent className="h-64 px-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: textColor, fontSize: 11 }}
              tickFormatter={(v) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={ChartTooltip} />
            <Area
              type="monotone"
              dataKey="total"
              name="Ingresos"
              stroke="var(--chart-1)"
              fill="url(#revenueFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function OrdersPerDayChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Órdenes por día</CardTitle>
      </CardHeader>
      <CardContent className="h-64 px-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: textColor, fontSize: 11 }}
              tickFormatter={(v) => new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
              axisLine={false}
              tickLine={false}
            />
            <YAxis tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
            <Tooltip content={ChartTooltip} />
            <Bar dataKey="count" name="Órdenes" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

export function HorizontalBarChart({
  title,
  data,
  dataKey,
  nameKey,
}: {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  nameKey: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64 px-2">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sin datos suficientes todavía
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis type="number" tick={{ fill: textColor, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey={nameKey}
                tick={{ fill: textColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip content={ChartTooltip} />
              <Bar dataKey={dataKey} name="Cantidad" fill="var(--chart-3)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
