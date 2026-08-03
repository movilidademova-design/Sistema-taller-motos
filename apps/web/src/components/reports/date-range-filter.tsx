'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface DateRange {
  from: string;
  to: string;
}

/** Rango por defecto: el último mes, que es lo que se consulta habitualmente. */
export function defaultDateRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (value: DateRange) => void;
}) {
  const isEmpty = !value.from && !value.to;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="range-from">Desde</Label>
        <Input
          id="range-from"
          type="date"
          className="w-40"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="range-to">Hasta</Label>
        <Input
          id="range-to"
          type="date"
          className="w-40"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </div>
      {!isEmpty && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ from: '', to: '' })}
        >
          Limpiar fechas
        </Button>
      )}
    </div>
  );
}
