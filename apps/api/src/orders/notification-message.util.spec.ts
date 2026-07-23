import { buildStatusChangeMessage } from './notification-message.util';

describe('buildStatusChangeMessage', () => {
  it('builds a generic status-change message', () => {
    const message = buildStatusChangeMessage({
      clientFirstName: 'Carlos',
      orderNumber: 123,
      status: 'IN_REPAIR',
      tenantName: 'Taller Demo',
    });
    expect(message).toBe(
      'Hola Carlos. Tu vehículo (Orden #123) cambió de estado a: En reparación.\nCualquier duda, contáctanos.\nEquipo Taller Demo',
    );
  });

  it('builds a thank-you message for DELIVERED', () => {
    const message = buildStatusChangeMessage({
      clientFirstName: 'Ana',
      orderNumber: 456,
      status: 'DELIVERED',
      tenantName: 'Taller Demo',
    });
    expect(message).toBe(
      'Hola Ana. Gracias por confiar en nosotros — tu vehículo (Orden #456) fue entregado exitosamente. ¡Será un gusto atenderte de nuevo!\nEquipo Taller Demo',
    );
  });

  it('covers every OrderStatus value without throwing', () => {
    const statuses = [
      'RECEIVED',
      'DIAGNOSING',
      'WAITING_APPROVAL',
      'WAITING_PARTS',
      'IN_REPAIR',
      'TESTING',
      'READY_FOR_DELIVERY',
      'DELIVERED',
      'CANCELLED',
      'WARRANTY',
    ] as const;
    for (const status of statuses) {
      const message = buildStatusChangeMessage({
        clientFirstName: 'Cliente',
        orderNumber: 1,
        status,
        tenantName: 'Taller',
      });
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
    }
  });
});
