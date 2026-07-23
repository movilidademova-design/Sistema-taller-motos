'use client';

import * as React from 'react';
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
  const otherTextId = React.useId();

  return (
    <div className="flex flex-col gap-3">
      {options.map((option) => (
        <Label key={option.id} className="font-normal">
          <Checkbox
            checked={selectedIds.includes(option.id)}
            onCheckedChange={() => onToggle(option.id)}
          />
          {option.label}
        </Label>
      ))}
      <Label className="font-normal">
        <Checkbox
          checked={otherChecked}
          onCheckedChange={(checked) => onOtherCheckedChange(checked === true)}
        />
        Otro
      </Label>
      {otherChecked && (
        <div className="flex flex-col gap-1.5 pl-6">
          <Label htmlFor={otherTextId} className="text-xs text-muted-foreground">
            Especifica cuál
          </Label>
          <Input
            id={otherTextId}
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
