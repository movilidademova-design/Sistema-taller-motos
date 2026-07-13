'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/components/providers/auth-provider';
import {
  CHECKLIST_ITEM_LABELS,
  CONDITION_LABELS,
  ChecklistItemType,
  ConditionRating,
} from '@taller/shared';
import type { ChecklistItem } from '@/lib/types';

const ALL_ITEMS = Object.values(ChecklistItemType) as ChecklistItemType[];

export function ChecklistTab({
  orderId,
  items,
  onUpdated,
}: {
  orderId: string;
  items: ChecklistItem[];
  onUpdated: () => void;
}) {
  const [draft, setDraft] = React.useState<Record<string, { condition: ConditionRating; observations: string }>>(
    () =>
      Object.fromEntries(
        ALL_ITEMS.map((item) => {
          const existing = items.find((i) => i.item === item);
          return [
            item,
            { condition: existing?.condition ?? ConditionRating.GOOD, observations: existing?.observations ?? '' },
          ];
        }),
      ),
  );
  const [isSaving, setIsSaving] = React.useState(false);

  async function handleSave() {
    setIsSaving(true);
    try {
      await api.put(`/orders/${orderId}/checklist`, {
        items: ALL_ITEMS.map((item) => ({
          item,
          condition: draft[item].condition,
          observations: draft[item].observations || undefined,
        })),
      });
      toast.success('Checklist guardado');
      onUpdated();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Elemento</TableHead>
            <TableHead className="w-40">Condición</TableHead>
            <TableHead>Observaciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ALL_ITEMS.map((item) => (
            <TableRow key={item}>
              <TableCell className="font-medium">{CHECKLIST_ITEM_LABELS[item]}</TableCell>
              <TableCell>
                <Select
                  value={draft[item].condition}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, [item]: { ...d[item], condition: v as ConditionRating } }))
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Input
                  value={draft[item].observations}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [item]: { ...d[item], observations: e.target.value } }))
                  }
                  placeholder="Opcional"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar checklist'}
        </Button>
      </div>
    </div>
  );
}
