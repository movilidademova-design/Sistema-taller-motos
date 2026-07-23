import type {
  Role,
  OrderStatus,
  QuotationStatus,
  ConditionRating,
  ChecklistItemType,
  PhotoCategory,
  QuotationItemType,
  WarrantyStatus,
  PaymentMethod,
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
  role: Role;
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
  payments?: Payment[];
  invoices?: Invoice[];
  warranties?: Warranty[];
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
  warranties?: Warranty[];
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

export interface ChecklistItem {
  id: string;
  item: ChecklistItemType;
  condition: ConditionRating;
  observations?: string | null;
}

export interface OrderPhoto {
  id: string;
  category?: PhotoCategory | null;
  url: string;
  uploadedAt: string;
}

export interface DiagnosisPart {
  id: string;
  productId?: string | null;
  description: string;
  quantity: number;
  unitCost: string;
}

export interface Diagnosis {
  id: string;
  description: string;
  faultFound: string;
  testsPerformed?: string | null;
  batteryVoltage?: string | null;
  controllerStatus?: string | null;
  motorStatus?: string | null;
  observations?: string | null;
  estimatedTimeHours?: string | null;
  estimatedCost?: string | null;
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

export interface Quotation {
  id: string;
  status: QuotationStatus;
  laborCost: string;
  partsCost: string;
  discount: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  notes?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  items: QuotationItem[];
}

export interface OrderStatusHistoryEntry {
  id: string;
  fromStatus?: OrderStatus | null;
  toStatus: OrderStatus;
  notes?: string | null;
  createdAt: string;
  changedBy?: { firstName: string; lastName: string };
}

export interface LaborEntry {
  id: string;
  technicianId: string;
  technician?: { firstName: string; lastName: string };
  activity: string;
  startTime: string;
  endTime?: string | null;
  hours?: string | null;
  cost: string;
}

export interface Order {
  id: string;
  orderNumber: number;
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
  checklistItems?: ChecklistItem[];
  photos?: OrderPhoto[];
  diagnosis?: Diagnosis | null;
  quotation?: Quotation | null;
  statusHistory?: OrderStatusHistoryEntry[];
  laborEntries?: LaborEntry[];
  invoice?: Invoice | null;
  payments?: Payment[];
  warranties?: Warranty[];
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

export interface Warranty {
  id: string;
  orderId: string;
  order?: { orderNumber: number };
  motorcycleId: string;
  motorcycle?: Motorcycle;
  clientId: string;
  client?: Client;
  requestedAt: string;
  reason: string;
  status: WarrantyStatus;
  approvedById?: string | null;
  cost: string;
  result?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  orderId?: string | null;
  order?: { orderNumber: number };
  invoiceId?: string | null;
  clientId: string;
  client?: { firstName: string; lastName: string };
  method: PaymentMethod;
  amount: string;
  reference?: string | null;
  receiptNumber: string;
  receivedById: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  orderId: string;
  order?: { orderNumber: number };
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
  payments?: Payment[];
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
    activeWarranties: number;
  };
}
