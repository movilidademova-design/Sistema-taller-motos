import { OrderStatus } from '../generated/prisma/enums';

/** Allowed forward/lateral transitions for the work-order lifecycle. */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  RECEIVED: [OrderStatus.WAITING_DIAGNOSIS, OrderStatus.CANCELLED],
  WAITING_DIAGNOSIS: [OrderStatus.DIAGNOSING, OrderStatus.CANCELLED],
  DIAGNOSING: [OrderStatus.WAITING_APPROVAL, OrderStatus.CANCELLED],
  WAITING_APPROVAL: [
    OrderStatus.WAITING_PARTS,
    OrderStatus.IN_REPAIR,
    OrderStatus.CANCELLED,
  ],
  WAITING_PARTS: [OrderStatus.IN_REPAIR, OrderStatus.CANCELLED],
  IN_REPAIR: [
    OrderStatus.READY_FOR_DELIVERY,
    OrderStatus.WAITING_PARTS,
    OrderStatus.CANCELLED,
  ],
  READY_FOR_DELIVERY: [OrderStatus.DELIVERED],
  DELIVERED: [OrderStatus.WARRANTY],
  WARRANTY: [OrderStatus.IN_REPAIR, OrderStatus.DELIVERED],
  CANCELLED: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return true;
  return ORDER_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
