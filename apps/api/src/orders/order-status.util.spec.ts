import { canTransition } from './order-status.util';
import { OrderStatus } from '../generated/prisma/enums';

describe('canTransition', () => {
  it('allows the standard happy path', () => {
    expect(
      canTransition(OrderStatus.RECEIVED, OrderStatus.WAITING_DIAGNOSIS),
    ).toBe(true);
    expect(
      canTransition(OrderStatus.WAITING_DIAGNOSIS, OrderStatus.DIAGNOSING),
    ).toBe(true);
    expect(
      canTransition(OrderStatus.DIAGNOSING, OrderStatus.WAITING_APPROVAL),
    ).toBe(true);
    expect(
      canTransition(OrderStatus.WAITING_APPROVAL, OrderStatus.IN_REPAIR),
    ).toBe(true);
    expect(
      canTransition(OrderStatus.IN_REPAIR, OrderStatus.READY_FOR_DELIVERY),
    ).toBe(true);
    expect(
      canTransition(OrderStatus.READY_FOR_DELIVERY, OrderStatus.DELIVERED),
    ).toBe(true);
  });

  it('allows staying in the same status', () => {
    expect(canTransition(OrderStatus.IN_REPAIR, OrderStatus.IN_REPAIR)).toBe(
      true,
    );
  });

  it('rejects skipping stages', () => {
    expect(canTransition(OrderStatus.RECEIVED, OrderStatus.DELIVERED)).toBe(
      false,
    );
    expect(
      canTransition(OrderStatus.DIAGNOSING, OrderStatus.READY_FOR_DELIVERY),
    ).toBe(false);
  });

  it('rejects any transition out of a cancelled order', () => {
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.RECEIVED)).toBe(
      false,
    );
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.DIAGNOSING)).toBe(
      false,
    );
  });

  it('allows warranty flow after delivery', () => {
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.WARRANTY)).toBe(
      true,
    );
    expect(canTransition(OrderStatus.WARRANTY, OrderStatus.IN_REPAIR)).toBe(
      true,
    );
    expect(canTransition(OrderStatus.WARRANTY, OrderStatus.DELIVERED)).toBe(
      true,
    );
  });
});
