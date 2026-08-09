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
