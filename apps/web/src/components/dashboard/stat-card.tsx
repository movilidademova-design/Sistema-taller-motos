import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: 'default' | 'success' | 'warning';
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center justify-between px-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
        </div>
        <div
          className={cn(
            'flex size-9 items-center justify-center rounded-lg',
            accent === 'success' && 'bg-success/15 text-success',
            accent === 'warning' && 'bg-warning/15 text-warning',
            (!accent || accent === 'default') && 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="size-4.5" />
        </div>
      </CardContent>
    </Card>
  );
}
