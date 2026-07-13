import { Badge } from '@/components/ui/badge';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@taller/shared';

const VARIANTS: Record<OrderStatus, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  RECEIVED: 'secondary',
  DIAGNOSING: 'default',
  WAITING_APPROVAL: 'warning',
  WAITING_PARTS: 'warning',
  IN_REPAIR: 'default',
  TESTING: 'default',
  READY_FOR_DELIVERY: 'success',
  DELIVERED: 'success',
  CANCELLED: 'destructive',
  WARRANTY: 'warning',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANTS[status]}>{ORDER_STATUS_LABELS[status]}</Badge>;
}
