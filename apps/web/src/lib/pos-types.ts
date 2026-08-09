// Tipos del POS, calcados de los DTOs y del schema Prisma en
// apps/api/src/pos/**. OJO: los campos de dinero (Decimal en Prisma) llegan
// serializados como CADENA en el JSON ("180000.00"), nunca como número — hay
// que convertirlos con Number(...) solo para mostrarlos, no para acumular.

export type PosProductCategory = 'MOTO' | 'ACCESORIO' | 'REPUESTO' | 'TALLER';
export type PosSaleStatus = 'ACTIVE' | 'VOIDED' | 'CREDIT_NOTE';
export type DiscountType = 'pct' | 'amount';

export interface PosProduct {
  id: string;
  name: string;
  category: PosProductCategory;
  price: string;
  cost: string;
  stock: number;
  reference: string;
  color: string;
  supplier: string;
  entryDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PosSaleItem {
  id: string;
  saleId: string;
  productId?: string | null;
  name: string;
  unitPrice: string;
  unitCost: string;
  itemDiscount: string;
  finalPrice: string;
  quantity: number;
  lineTotal: string;
  reference: string;
  color: string;
  supplier: string;
  engineNumber?: string | null;
  chassisNumber?: string | null;
}

export interface PosSalePayment {
  id: string;
  saleId: string;
  method: string;
  amount: string;
}

export interface PosSale {
  id: string;
  invoiceNumber: number | null;
  soldAt: string;
  clientName: string;
  clientDoc: string;
  paymentMethod: string;
  subtotal: string;
  generalDiscount: string;
  total: string;
  status: PosSaleStatus;
  statusChangedAt?: string | null;
  createdById: string;
  createdAt: string;
  items: PosSaleItem[];
  payments: PosSalePayment[];
}

export interface PosList {
  id: string;
  type: string;
  value: string;
}

export type PosLayawayStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface PosLayawayItem {
  id: string;
  layawayId: string;
  productId?: string | null;
  name: string;
  unitPrice: string;
  unitCost: string;
  finalPrice: string;
  quantity: number;
  lineTotal: string;
  reference: string;
  color: string;
  supplier: string;
  engineNumber?: string | null;
  chassisNumber?: string | null;
}

export interface PosLayawayPayment {
  id: string;
  layawayId: string;
  paidAt: string;
  amount: string;
  method: string;
  notes: string;
  receiptNumber: number | null;
  createdById: string;
}

export interface PosLayaway {
  id: string;
  clientName: string;
  clientDoc: string;
  clientPhone: string;
  total: string;
  generalDiscount: string;
  paid: string;
  balance: string;
  status: PosLayawayStatus;
  notes: string;
  saleId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  items: PosLayawayItem[];
  payments: PosLayawayPayment[];
}

/** Respuesta de POST /pos/layaways/:id/payments: el separado actualizado y,
 * si este abono lo completó, la venta que se generó (si no, `sale` es null). */
export interface PosLayawayPaymentResult extends PosLayaway {
  sale: PosSale | null;
}
