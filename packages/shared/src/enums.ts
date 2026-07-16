// Mirrors apps/api/prisma/schema.prisma enums.
// Kept in sync manually since the frontend does not depend on the generated Prisma client.

export const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  RECEPTIONIST: 'RECEPTIONIST',
  TECHNICIAN: 'TECHNICIAN',
  VIEWER: 'VIEWER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Super Administrador',
  MANAGER: 'Administrador de Tienda',
  RECEPTIONIST: 'Recepción',
  TECHNICIAN: 'Técnico',
  VIEWER: 'Visualizador',
};

export const OrderStatus = {
  RECEIVED: 'RECEIVED',
  WAITING_DIAGNOSIS: 'WAITING_DIAGNOSIS',
  DIAGNOSING: 'DIAGNOSING',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  WAITING_PARTS: 'WAITING_PARTS',
  IN_REPAIR: 'IN_REPAIR',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  WARRANTY: 'WARRANTY',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
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

/**
 * Duplicada intencionalmente de `apps/api/src/orders/order-status.util.ts` — el
 * backend no puede depender en tiempo de ejecución de este paquete (Prisma 7 forzó
 * salida CommonJS pura en el backend), así que cada lado mantiene su propia copia.
 */
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

export const VehicleType = {
  BICIMOTO: 'BICIMOTO',
  PATINETA: 'PATINETA',
  MOTO: 'MOTO',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  BICIMOTO: 'Bicimoto',
  PATINETA: 'Patineta',
  MOTO: 'Moto',
};

export const QuotationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const ConditionRating = {
  GOOD: 'GOOD',
  FAIR: 'FAIR',
  BAD: 'BAD',
} as const;
export type ConditionRating = (typeof ConditionRating)[keyof typeof ConditionRating];

export const CONDITION_LABELS: Record<ConditionRating, string> = {
  GOOD: 'Bueno',
  FAIR: 'Regular',
  BAD: 'Malo',
};

export const ChecklistItemType = {
  TIRES: 'TIRES',
  BRAKES: 'BRAKES',
  DISCS: 'DISCS',
  LIGHTS: 'LIGHTS',
  SIGNALS: 'SIGNALS',
  HORN: 'HORN',
  DISPLAY: 'DISPLAY',
  THROTTLE: 'THROTTLE',
  SUSPENSION: 'SUSPENSION',
  BATTERY: 'BATTERY',
  CHARGER: 'CHARGER',
  KEYS: 'KEYS',
  MIRRORS: 'MIRRORS',
  FENDERS: 'FENDERS',
  SEAT: 'SEAT',
} as const;
export type ChecklistItemType = (typeof ChecklistItemType)[keyof typeof ChecklistItemType];

export const CHECKLIST_ITEM_LABELS: Record<ChecklistItemType, string> = {
  TIRES: 'Llantas',
  BRAKES: 'Frenos',
  DISCS: 'Discos',
  LIGHTS: 'Luces',
  SIGNALS: 'Direccionales',
  HORN: 'Bocina',
  DISPLAY: 'Pantalla',
  THROTTLE: 'Acelerador',
  SUSPENSION: 'Suspensión',
  BATTERY: 'Batería',
  CHARGER: 'Cargador',
  KEYS: 'Llaves',
  MIRRORS: 'Espejos',
  FENDERS: 'Guardabarros',
  SEAT: 'Sillín',
};

export const PhotoCategory = {
  FRONT: 'FRONT',
  BACK: 'BACK',
  LEFT_SIDE: 'LEFT_SIDE',
  RIGHT_SIDE: 'RIGHT_SIDE',
  DAMAGE: 'DAMAGE',
  SERIAL_NUMBER: 'SERIAL_NUMBER',
  MOTOR: 'MOTOR',
  BATTERY: 'BATTERY',
  ACCESSORY: 'ACCESSORY',
  OTHER: 'OTHER',
  GENERAL: 'GENERAL',
} as const;
export type PhotoCategory = (typeof PhotoCategory)[keyof typeof PhotoCategory];

export const QuotationItemType = {
  PART: 'PART',
  LABOR: 'LABOR',
  OTHER: 'OTHER',
} as const;
export type QuotationItemType = (typeof QuotationItemType)[keyof typeof QuotationItemType];

export const InventoryMovementType = {
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  ADJUSTMENT_IN: 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT: 'ADJUSTMENT_OUT',
  RETURN: 'RETURN',
} as const;
export type InventoryMovementType = (typeof InventoryMovementType)[keyof typeof InventoryMovementType];

export const PurchaseOrderStatus = {
  DRAFT: 'DRAFT',
  ORDERED: 'ORDERED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const WarrantyStatus = {
  OPEN: 'OPEN',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RESOLVED: 'RESOLVED',
} as const;
export type WarrantyStatus = (typeof WarrantyStatus)[keyof typeof WarrantyStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  TRANSFER: 'TRANSFER',
  CARD: 'CARD',
  QR: 'QR',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  QR: 'QR',
};

export const InvoiceStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type InvoiceStatus = (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const AppointmentType = {
  APPOINTMENT: 'APPOINTMENT',
  MAINTENANCE: 'MAINTENANCE',
  WARRANTY: 'WARRANTY',
  DELIVERY: 'DELIVERY',
} as const;
export type AppointmentType = (typeof AppointmentType)[keyof typeof AppointmentType];

export const AppointmentStatus = {
  SCHEDULED: 'SCHEDULED',
  CONFIRMED: 'CONFIRMED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type AppointmentStatus = (typeof AppointmentStatus)[keyof typeof AppointmentStatus];
