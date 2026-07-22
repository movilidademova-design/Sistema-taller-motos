'use client';

import { cn } from '@/lib/utils';
import type { QuickService } from '@/lib/types';

export function QuickServiceChips({
  services,
  selectedIds,
  onToggle,
}: {
  services: QuickService[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {services.map((service) => {
        const selected = selectedIds.includes(service.id);
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onToggle(service.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-foreground',
            )}
          >
            {service.label}
          </button>
        );
      })}
    </div>
  );
}
