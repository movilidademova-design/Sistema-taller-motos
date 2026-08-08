import type {
  Role,
  PosRole,
  OrderStatus,
  QuotationStatus,
  PhotoCategory,
  QuotationItemType,
  InvoiceStatus,
  AppointmentType,
  AppointmentStatus,
  VehicleType,
} from '@taller/shared';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: Role | null;
  posRole: PosRole | null;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  documentId?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  isActive: boolean;
  createdAt: string;
  _count?: { motorcycles: number; orders: number };
  motorcycles?: Motorcycle[];
  orders?: Order[];
  invoices?: Invoice[];
}

export interface Motorcycle {
  id: string;
  clientId: string;
  vehicleType: VehicleType;
  client?: Pick<Client, 'id' | 'firstName' | 'lastName'>;
  brand: string;
  model: string;
  color?: string | null;
  year?: number | null;
  serialNumber?: string | null;
  motorNumber?: string | null;
  batteryNumber?: string | null;
  batteryCapacity?: string | null;
  voltage?: string | null;
  controller?: string | null;
  display?: string | null;
  purchaseDate?: string | null;
  warrantyUntil?: string | null;
  mileage?: number | null;
  photoUrl?: string | null;
  observations?: string | null;
  createdAt: string;
  orders?: Order[];
}

export interface QuickService {
  id: string;
  label: string;
  position: number;
  isActive: boolean;
  createdAt: string;
}

export interface AccessoryOption {
  id: string;
  label: string;
  position: number;
  isActive: boolean;
  createdAt: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface OrderPhoto {
  id: string;
  category?: PhotoCategory | null;
  stage: 'INTAKE' | 'WORK';
  url: string;
  uploadedAt: string;
}

export interface DiagnosisPart {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitCost: string;
  observations?: string | null;
}

export interface Diagnosis {
  id: string;
  description: string;
  faultFound?: string | null;
  testsPerformed?: string | null;
  requiredParts: DiagnosisPart[];
}

export interface QuotationItem {
  id: string;
  type: QuotationItemType;
  productId?: string | null;
  description: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
}

export interface QuotationStatusHistory {
  id: string;
  fromStatus?: QuotationStatus | null;
  toStatus: QuotationStatus;
  notes?: string | null;
  createdAt: string;
  changedBy?: { firstName: string; lastName: string };
}

export interface QuotationListRow {
  id: string;
  status: QuotationStatus;
  total: string;
  createdAt: string;
  updatedAt: string;
  pdfUrl?: string | null;
  itemCount: number;
  order: {
    id: string;
    orderNumber: string;
    client: { firstName: string; lastName: string };
    motorcycle: { brand: string; model: string };
  };
}

export interface Quotation {
  id: string;
  status: QuotationStatus;
  partsCost: string;
  discount: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  notes?: string | null;
  pdfUrl?: string | null;
  sentAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  items: QuotationItem[];
  history?: QuotationStatusHistory[];
}

export interface OrderStatusHistoryEntry {
  id: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  notes?: string | null;
  createdAt: string;
  changedBy?: { firstName: string; lastName: string };
}

export interface Notification {
  id: string;
  orderId: string;
  order: {
    orderNumber: string;
    client: {
      firstName: string;
      lastName: string;
      phone?: string | null;
      email?: string | null;
    };
  };
  toStatus: OrderStatus;
  message: string;
  status: 'PENDING' | 'SENT';
  createdBy: { firstName: string; lastName: string };
  sentAt?: string | null;
  sentBy?: { firstName: string; lastName: string } | null;
  sentVia?: 'WHATSAPP' | 'EMAIL' | 'COPY' | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  clientId: string;
  motorcycleId: string;
  receptionistId: string;
  technicianId?: string | null;
  status: OrderStatus;
  reason: string;
  accessoriesDelivered?: string | null;
  receivedAt: string;
  estimatedDeliveryAt?: string | null;
  deliveredAt?: string | null;
  cancelReason?: string | null;
  pickupCode?: string | null;
  pickupCodeVerifiedAt?: string | null;
  signatureUrl?: string | null;
  signedAt?: string | null;
  createdAt: string;
  client?: Client;
  motorcycle?: Motorcycle;
  receptionist?: { id: string; firstName: string; lastName: string };
  technician?: { id: string; firstName: string; lastName: string } | null;
  photos?: OrderPhoto[];
  diagnosis?: Diagnosis | null;
  quotation?: Quotation | null;
  statusHistory?: OrderStatusHistoryEntry[];
  invoice?: Invoice | null;
}

export interface Category {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
}

export interface Product {
  id: string;
  categoryId?: string | null;
  category?: Category | null;
  supplierId?: string | null;
  supplier?: Supplier | null;
  code?: string | null;
  sku: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  unitCost: string;
  unitPrice: string;
  quantity: number;
  location?: string | null;
  minStock: number;
  isActive: boolean;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  product?: { name: string; sku: string };
  orderId?: string | null;
  purchaseOrderId?: string | null;
  type: string;
  quantity: number;
  reason?: string | null;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitCost: string;
  subtotal: string;
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  supplier?: Supplier;
  status: string;
  orderedAt?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
  total: string;
  items: PurchaseOrderItem[];
  createdAt: string;
}

export interface Invoice {
  id: string;
  orderId: string;
  order?: { orderNumber: string };
  clientId: string;
  client?: Client;
  invoiceNumber: string;
  subtotal: string;
  taxAmount: string;
  discount: string;
  total: string;
  amountPaid: string;
  status: InvoiceStatus;
  pdfUrl?: string | null;
  issuedAt: string;
  dueAt?: string | null;
  sentAt?: string | null;
}

export interface Appointment {
  id: string;
  clientId: string;
  client?: { firstName: string; lastName: string };
  motorcycleId?: string | null;
  motorcycle?: { brand: string; model: string };
  orderId?: string | null;
  type: AppointmentType;
  status: AppointmentStatus;
  scheduledAt: string;
  endAt?: string | null;
  notes?: string | null;
  assignedToId?: string | null;
  assignedTo?: { firstName: string; lastName: string };
}

export interface DashboardSummary {
  cards: {
    openOrders: number;
    diagnosing: number;
    waitingApproval: number;
    waitingParts: number;
    inRepair: number;
    readyForDelivery: number;
    deliveredThisMonth: number;
    revenueToday: number;
    revenueMonth: number;
    newClientsThisMonth: number;
  };
}
