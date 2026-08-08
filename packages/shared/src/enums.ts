// Mirrors apps/api/prisma/schema.prisma enums.
// Kept in sync manually since the frontend does not depend on the generated Prisma client.

export const Role = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  RECEPTIONIST: 'RECEPTIONIST',
  TECHNICIAN: 'TECHNICIAN',
  CLIENT: 'CLIENT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const PosRole = {
  ADMIN: 'ADMIN',
  CASHIER: 'CASHIER',
} as const;
export type PosRole = (typeof PosRole)[keyof typeof PosRole];

export const OrderStatus = {
  RECEIVED: 'RECEIVED',
  DIAGNOSING: 'DIAGNOSING',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  WAITING_PARTS: 'WAITING_PARTS',
  IN_REPAIR: 'IN_REPAIR',
  TESTING: 'TESTING',
  READY_FOR_DELIVERY: 'READY_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  WARRANTY: 'WARRANTY',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
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

export const QuotationStatus = {
  DRAFT: 'DRAFT',
  PENDING_REVIEW: 'PENDING_REVIEW',
  READY_TO_SEND: 'READY_TO_SEND',
  SENT: 'SENT',
  APPROVED: 'APPROVED',
  PARTIALLY_APPROVED: 'PARTIALLY_APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Esperando revisión',
  READY_TO_SEND: 'Lista para enviar',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  PARTIALLY_APPROVED: 'Aprobada parcialmente',
  REJECTED: 'Rechazada',
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
} as const;
export type PhotoCategory = (typeof PhotoCategory)[keyof typeof PhotoCategory];

export const PhotoStage = {
  INTAKE: 'INTAKE',
  WORK: 'WORK',
} as const;
export type PhotoStage = (typeof PhotoStage)[keyof typeof PhotoStage];

export const QuotationItemType = {
  PART: 'PART',
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
