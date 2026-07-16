/**
 * Plantilla del mensaje de confirmación de recepción, usada tanto para el
 * enlace de WhatsApp como para el correo de notificación. Se duplica
 * (pequeña, ~15 líneas) en vez de importarse de @taller/shared porque
 * apps/api no puede depender en tiempo de ejecución de ese paquete: Prisma 7
 * forzó salida CommonJS pura en el backend y esa dependencia ya se retiró
 * antes por un conflicto de resolución de módulos ESM/CJS.
 */
export function formatOrderNumber(prefix: string, orderNumber: number): string {
  return `${prefix}-${String(orderNumber).padStart(6, '0')}`;
}

export function buildIntakeMessage(params: {
  clientName: string;
  tenantName: string;
  formattedOrderNumber: string;
  exitCode: string;
  trackingUrl: string;
}): string {
  return `Hola ${params.clientName}.
Hemos recibido correctamente tu vehículo en nuestro taller.

📋 Número de Orden: ${params.formattedOrderNumber}
🔐 Clave de salida: ${params.exitCode}

Esta clave será necesaria para retirar tu vehículo. Por favor, consérvala y no la compartas con terceros.

🔗 Consulta el estado de tu orden en cualquier momento aquí: ${params.trackingUrl}

Gracias por confiar en nosotros. Será un gusto atenderte.
Equipo ${params.tenantName}`;
}

/** Duplicado de ORDER_STATUS_LABELS en @taller/shared — ver nota arriba. */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Recibida',
  WAITING_DIAGNOSIS: 'En espera de diagnóstico',
  DIAGNOSING: 'Diagnóstico',
  WAITING_APPROVAL: 'Esperando aprobación de repuestos',
  WAITING_PARTS: 'Esperando repuestos',
  IN_REPAIR: 'Reparación',
  READY_FOR_DELIVERY: 'Lista para entrega',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelada',
  WARRANTY: 'Garantía',
};

export function buildStatusUpdateMessage(params: {
  clientName: string;
  tenantName: string;
  formattedOrderNumber: string;
  statusLabel: string;
  trackingUrl: string;
}): string {
  return `Hola ${params.clientName}.

Tu orden ${params.formattedOrderNumber} cambió de estado: ahora está en "${params.statusLabel}".

🔗 Puedes consultar el detalle en cualquier momento aquí: ${params.trackingUrl}

Gracias por confiar en nosotros.
Equipo ${params.tenantName}`;
}
