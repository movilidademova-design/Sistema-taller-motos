'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AccessoryOption } from '@/lib/types';

export function AccessoryChecklist({
  options,
  selectedIds,
  onToggle,
  otherChecked,
  onOtherCheckedChange,
  otherText,
  onOtherTextChange,
}: {
  options: AccessoryOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  otherChecked: boolean;
  onOtherCheckedChange: (checked: boolean) => void;
  otherText: string;
  onOtherTextChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {options.map((option) => (
        <label key={option.id} className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={selectedIds.includes(option.id)}
            onCheckedChange={() => onToggle(option.id)}
          />
          {option.label}
        </label>
      ))}
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={otherChecked}
          onCheckedChange={(checked) => onOtherCheckedChange(checked === true)}
        />
        Otro
      </label>
      {otherChecked && (
        <div className="flex flex-col gap-1.5 pl-6">
          <Label className="text-xs text-muted-foreground">Especifica cuál</Label>
          <Input value={otherText} onChange={(e) => onOtherTextChange(e.target.value)} />
        </div>
      )}
    </div>
  );
}
