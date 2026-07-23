import { OrderStatus } from '../generated/prisma/enums';

/**
 * Backend-local mirror of packages/shared/src/enums.ts's ORDER_STATUS_LABELS.
 * Kept in sync manually — the backend does not depend on @taller/shared.
 */
const STATUS_LABELS_ES: Record<OrderStatus, string> = {
  RECEIVED: 'Recibida',
  DIAGNOSING: 'En diagnóstico',
  WAITING_APPROVAL: 'Esperando aprobación',
  WAITING_PARTS: 'Esperando repuestos',
  IN_REPAIR: 'En reparación',
  TESTING: 'En pruebas',
  READY_FOR_DELIVERY: 'Lista para entrega',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
  WARRANTY: 'Garantía',
};

export function buildStatusChangeMessage(params: {
  clientFirstName: string;
  orderNumber: number;
  status: OrderStatus;
  tenantName: string;
}): string {
  const { clientFirstName, orderNumber, status, tenantName } = params;
  if (status === OrderStatus.DELIVERED) {
    return `Hola ${clientFirstName}. Gracias por confiar en nosotros — tu vehículo (Orden #${orderNumber}) fue entregado exitosamente. ¡Será un gusto atenderte de nuevo!\nEquipo ${tenantName}`;
  }
  return `Hola ${clientFirstName}. Tu vehículo (Orden #${orderNumber}) cambió de estado a: ${STATUS_LABELS_ES[status]}.\nCualquier duda, contáctanos.\nEquipo ${tenantName}`;
}
