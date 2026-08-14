import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { QuotationPdfService } from '../../common/pdf/quotation-pdf.service';
import { Prisma } from '../../generated/prisma/client';
import { OrdersService } from '../orders.service';
import { UpsertQuotationDto } from './dto/upsert-quotation.dto';
import { ChangeQuotationStatusDto } from './dto/change-quotation-status.dto';
import {
  QuotationItemType,
  QuotationStatus,
  OrderStatus,
  InventoryMovementType,
} from '../../generated/prisma/enums';

/** Etiquetas en español, espejo de packages/shared. El backend no depende de @taller/shared. */
const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'Esperando revisión',
  READY_TO_SEND: 'Lista para enviar',
  SENT: 'Enviada',
  APPROVED: 'Aprobada',
  PARTIALLY_APPROVED: 'Aprobada parcialmente',
  REJECTED: 'Rechazada',
};

/**
 * Qué estados puede elegir una persona desde cada estado. Tras una aprobación
 * parcial se ajusta la cotización y se vuelve a enviar, las veces que haga falta.
 */
const QUOTATION_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: [QuotationStatus.PENDING_REVIEW],
  PENDING_REVIEW: [QuotationStatus.READY_TO_SEND],
  READY_TO_SEND: [QuotationStatus.SENT, QuotationStatus.PENDING_REVIEW],
  SENT: [
    QuotationStatus.APPROVED,
    QuotationStatus.PARTIALLY_APPROVED,
    QuotationStatus.REJECTED,
  ],
  PARTIALLY_APPROVED: [
    QuotationStatus.READY_TO_SEND,
    QuotationStatus.APPROVED,
    QuotationStatus.REJECTED,
  ],
  APPROVED: [],
  REJECTED: [],
};

/** Días que el cliente tiene para responder antes de que los precios cambien. */
const QUOTATION_VALIDITY_DAYS = 8;

/** Estados en los que la cotización todavía se puede editar libremente. */
export const EDITABLE_STATUSES: QuotationStatus[] = [
  QuotationStatus.DRAFT,
  QuotationStatus.PENDING_REVIEW,
  QuotationStatus.READY_TO_SEND,
  QuotationStatus.PARTIALLY_APPROVED,
];

@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly quotationPdf: QuotationPdfService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Lista para la sección Cotizaciones (no una orden en particular): alcance
   * por sucursal activa, no por orderId. Una cotización no tiene tenantId ni
   * branchId propios — pertenece a una orden, y la orden a la sucursal — por
   * eso el `where` filtra a través de `order`.
   */
  async findAllForBranch(
    tenantId: string,
    branchId: string,
    status?: QuotationStatus,
  ) {
    const quotations = await this.prisma.quotation.findMany({
      where: {
        order: { tenantId, branchId },
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        status: true,
        total: true,
        createdAt: true,
        updatedAt: true,
        pdfUrl: true,
        _count: { select: { items: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            client: { select: { firstName: true, lastName: true } },
            motorcycle: { select: { brand: true, model: true } },
          },
        },
      },
    });

    const rows = quotations.map((q) => ({
      id: q.id,
      status: q.status,
      total: q.total,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      pdfUrl: q.pdfUrl,
      itemCount: q._count.items,
      order: q.order,
    }));

    // PENDING_REVIEW primero (son las que hay que revisar), luego el resto por
    // actualización más reciente. Prisma no puede ordenar por una secuencia de
    // enum arbitraria, así que el orden se arma en JS después de traer los datos.
    return rows.sort((a, b) => {
      const aPending = a.status === QuotationStatus.PENDING_REVIEW ? 0 : 1;
      const bPending = b.status === QuotationStatus.PENDING_REVIEW ? 0 : 1;
      return aPending !== bPending
        ? aPending - bPending
        : b.updatedAt.getTime() - a.updatedAt.getTime();
    });
  }

  /** Cuenta para la insignia del menú: solo lo que hay por revisar. */
  async pendingCount(tenantId: string, branchId: string) {
    const count = await this.prisma.quotation.count({
      where: {
        order: { tenantId, branchId },
        status: QuotationStatus.PENDING_REVIEW,
      },
    });
    return { count };
  }

  async findOne(tenantId: string, orderId: string) {
    await this.ordersService.assertOrderExists(tenantId, orderId);
    const quotation = await this.prisma.quotation.findUnique({
      where: { orderId },
      include: {
        items: true,
        history: {
          orderBy: { createdAt: 'desc' },
          include: {
            changedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');
    return quotation;
  }

  /**
   * Convierte los repuestos del diagnóstico en una cotización por revisar.
   * Es el único cambio de estado automático del módulo: todo lo demás lo decide
   * una persona. Reemplaza los ítems cada vez, porque el técnico puede guardar
   * el diagnóstico varias veces mientras trabaja.
   */
  async createFromDiagnosis(
    tenantId: string,
    orderId: string,
    technicianId: string,
    parts: {
      productId: string | null;
      description: string;
      quantity: number;
      unitCost: Prisma.Decimal;
    }[],
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const existing = await this.prisma.quotation.findUnique({
      where: { orderId },
    });

    // Una vez enviada o decidida, el diagnóstico ya no la puede pisar: el
    // cliente vio esa versión y quien manda a partir de ahí es el personal.
    if (existing && !EDITABLE_STATUSES.includes(existing.status))
      return existing;

    const items = parts.map((p) => ({
      type: QuotationItemType.PART,
      productId: p.productId,
      description: p.description,
      quantity: new Prisma.Decimal(p.quantity),
      unitPrice: p.unitCost,
      subtotal: new Prisma.Decimal(Number(p.unitCost) * p.quantity),
    }));
    const partsCost = items.reduce((acc, i) => acc + Number(i.subtotal), 0);
    const totals = {
      partsCost,
      discount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: partsCost,
    };

    return this.prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.upsert({
        where: { orderId },
        create: { orderId, status: QuotationStatus.PENDING_REVIEW, ...totals },
        update: { status: QuotationStatus.PENDING_REVIEW, ...totals },
      });
      await tx.quotationItem.deleteMany({
        where: { quotationId: quotation.id },
      });
      await tx.quotationItem.createMany({
        data: items.map((i) => ({ ...i, quotationId: quotation.id })),
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: existing?.status ?? null,
          toStatus: QuotationStatus.PENDING_REVIEW,
          changedById: technicianId,
          notes: 'Generada desde el diagnóstico',
        },
      });

      if (order.status === OrderStatus.DIAGNOSING) {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.WAITING_APPROVAL },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: OrderStatus.DIAGNOSING,
            toStatus: OrderStatus.WAITING_APPROVAL,
            changedById: technicianId,
            notes: 'Diagnóstico con repuestos: cotización por revisar',
          },
        });
      }
      return quotation;
    });
  }

  async upsert(tenantId: string, orderId: string, dto: UpsertQuotationDto) {
    // Se llama por su efecto, no por su valor: lanza si la orden no existe o
    // es de otra empresa. El resultado no se usa.
    await this.ordersService.assertOrderExists(tenantId, orderId);

    // La misma regla que ya aplican `syncFromDiagnosis` (arriba) y
    // `generatePdf` (abajo), que aquí faltaba: una cotización enviada o
    // decidida no se puede reescribir.
    //
    // Sin esta comprobación se podía cambiar los importes de una cotización ya
    // APROBADA y la respuesta era 200. Consecuencias, todas comprobadas:
    //   - el cliente aprobó un importe y quedaba guardado otro distinto;
    //   - `approvedAt` se ponía a null pero el estado seguía siendo APPROVED,
    //     un estado imposible (aprobada sin fecha de aprobación);
    //   - el inventario ya se había descontado al aprobar, así que reescribir
    //     los ítems dejaba stock y cotización contando cosas distintas;
    //   - si ya había factura, su total dejaba de coincidir con la cotización.
    const existing = await this.prisma.quotation.findUnique({
      where: { orderId },
    });
    if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
      throw new BadRequestException(
        'Esta cotización ya fue enviada o decidida por el cliente y no se puede modificar. ' +
          'Crea una cotización nueva si hay que cambiar el presupuesto.',
      );
    }

    const partsCost = sumByType(dto.items, [
      QuotationItemType.PART,
      QuotationItemType.OTHER,
    ]);
    const discount = dto.discount ?? 0;
    const taxRate = dto.taxRate ?? 0;
    const taxable = partsCost - discount;
    const taxAmount = Math.max(0, taxable) * (taxRate / 100);
    const total = Math.max(0, taxable) + taxAmount;

    await this.prisma.$transaction(async (tx) => {
      const record = await tx.quotation.upsert({
        where: { orderId },
        create: {
          orderId,
          partsCost,
          discount,
          taxRate,
          taxAmount,
          total,
          notes: dto.notes,
          status: QuotationStatus.PENDING_REVIEW,
        },
        update: {
          partsCost,
          discount,
          taxRate,
          taxAmount,
          total,
          notes: dto.notes,
          approvedAt: null,
          rejectedAt: null,
        },
      });

      await tx.quotationItem.deleteMany({ where: { quotationId: record.id } });
      await tx.quotationItem.createMany({
        data: dto.items.map((item) => ({
          quotationId: record.id,
          type: item.type,
          productId: item.productId,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice,
        })),
      });

      return record;
    });

    return this.findOne(tenantId, orderId);
  }

  /** Genera el PDF y deja la cotización lista para enviar. */
  async generatePdf(tenantId: string, orderId: string, userId: string) {
    const order = await this.ordersService.findOne(tenantId, orderId);
    const quotation = await this.findOne(tenantId, orderId);

    if (!EDITABLE_STATUSES.includes(quotation.status)) {
      throw new BadRequestException('Esta cotización ya no se puede modificar');
    }
    if (quotation.items.length === 0) {
      throw new BadRequestException('La cotización no tiene repuestos');
    }
    // Un repuesto sin producto de inventario llega en cero desde el diagnóstico;
    // quien revisa tiene que ponerle precio antes de que el cliente lo vea.
    const sinPrecio = quotation.items.filter((i) => Number(i.unitPrice) <= 0);
    if (sinPrecio.length > 0) {
      throw new BadRequestException(
        `Falta el precio de: ${sinPrecio.map((i) => i.description).join(', ')}`,
      );
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const buffer = await this.quotationPdf.render({
      tenant,
      quotationNumber: order.orderNumber,
      date: new Date(),
      clientName: `${order.client.firstName} ${order.client.lastName}`,
      vehicle: `${order.motorcycle.brand} ${order.motorcycle.model}`,
      items: quotation.items.map((i) => ({
        description: i.description,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.subtotal),
      })),
      total: Number(quotation.total),
      notes: quotation.notes,
      validityDays: QUOTATION_VALIDITY_DAYS,
    });

    const pdfUrl = await this.storage.upload(
      buffer,
      `cotizacion-${order.orderNumber}.pdf`,
      'application/pdf',
      'quotations',
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { pdfUrl, status: QuotationStatus.READY_TO_SEND },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: quotation.status,
          toStatus: QuotationStatus.READY_TO_SEND,
          changedById: userId,
          notes: 'PDF generado',
        },
      });
    });

    return this.findOne(tenantId, orderId);
  }

  /**
   * Deja el mensaje listo en la bandeja de notificaciones y marca la cotización
   * como enviada. El botón de WhatsApp que ya existe en /notifications abre el
   * chat con este texto; wa.me no adjunta archivos, por eso el PDF va como enlace.
   */
  async prepareSend(tenantId: string, orderId: string, userId: string) {
    const order = await this.ordersService.findOne(tenantId, orderId);
    const quotation = await this.findOne(tenantId, orderId);
    if (!quotation.pdfUrl) {
      throw new BadRequestException('Primero genera el PDF de la cotización');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
    });
    const baseUrl =
      this.config.get<string>('PUBLIC_URL') ?? 'http://localhost:3001';
    const message =
      `Hola ${order.client.firstName}. Le compartimos la cotización de los repuestos para su vehículo (Orden #${order.orderNumber}).

` +
      `Puede verla aquí: ${baseUrl}${quotation.pdfUrl}

` +
      `Quedamos atentos a su aprobación para continuar con la reparación.
Equipo ${tenant.name}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.notification.create({
        data: {
          tenantId,
          orderId,
          toStatus: order.status,
          message,
          createdById: userId,
        },
      });
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { status: QuotationStatus.SENT, sentAt: new Date() },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: quotation.status,
          toStatus: QuotationStatus.SENT,
          changedById: userId,
          notes: 'Mensaje preparado para enviar por WhatsApp',
        },
      });
    });

    return this.findOne(tenantId, orderId);
  }

  /**
   * Todo cambio de estado pasa por aquí y lo dispara una persona. La única
   * transición automática del módulo es la creación en PENDING_REVIEW desde el
   * diagnóstico (ver createFromDiagnosis).
   */
  async changeStatus(
    tenantId: string,
    orderId: string,
    userId: string,
    dto: ChangeQuotationStatusDto,
  ) {
    const order = await this.ordersService.assertOrderExists(tenantId, orderId);
    const quotation = await this.prisma.quotation.findUnique({
      where: { orderId },
      include: { items: true },
    });
    if (!quotation) throw new NotFoundException('Cotización no encontrada');

    if (!QUOTATION_TRANSITIONS[quotation.status].includes(dto.status)) {
      throw new BadRequestException(
        `No se puede pasar de ${QUOTATION_STATUS_LABELS[quotation.status]} a ${QUOTATION_STATUS_LABELS[dto.status]}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: quotation.id },
        data: {
          status: dto.status,
          approvedAt:
            dto.status === QuotationStatus.APPROVED ? new Date() : undefined,
          rejectedAt:
            dto.status === QuotationStatus.REJECTED ? new Date() : undefined,
        },
      });
      await tx.quotationStatusHistory.create({
        data: {
          quotationId: quotation.id,
          fromStatus: quotation.status,
          toStatus: dto.status,
          changedById: userId,
          notes: dto.notes,
        },
      });

      // El inventario se mueve una sola vez, aquí: el diagnóstico ya no
      // descuenta nada. Una cotización rechazada no toca el stock.
      if (dto.status === QuotationStatus.APPROVED) {
        await this.consumeStock(tx, tenantId, order, quotation.items, userId);
      }
    });

    return this.findOne(tenantId, orderId);
  }

  /** Descuenta del inventario los repuestos aprobados y adelanta la orden. */
  private async consumeStock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    order: { id: string; orderNumber: string; status: OrderStatus },
    items: {
      type: QuotationItemType;
      productId: string | null;
      quantity: Prisma.Decimal;
    }[],
    userId: string,
  ) {
    let missingStock = false;
    for (const item of items) {
      if (item.type !== QuotationItemType.PART || !item.productId) continue;
      const product = await tx.product.findUnique({
        where: { id: item.productId },
      });
      if (!product) continue;
      const quantity = Number(item.quantity);
      if (product.quantity < quantity) missingStock = true;

      await tx.product.update({
        where: { id: item.productId },
        data: { quantity: { decrement: quantity } },
      });
      await tx.inventoryMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          orderId: order.id,
          type: InventoryMovementType.SALE_OUT,
          quantity,
          reason: `Cotización aprobada — orden #${order.orderNumber}`,
          createdById: userId,
        },
      });
    }

    if (order.status === OrderStatus.WAITING_APPROVAL) {
      const nextStatus = missingStock
        ? OrderStatus.WAITING_PARTS
        : OrderStatus.IN_REPAIR;
      await tx.order.update({
        where: { id: order.id },
        data: { status: nextStatus },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: OrderStatus.WAITING_APPROVAL,
          toStatus: nextStatus,
          changedById: userId,
          notes: 'Cotización aprobada por el cliente',
        },
      });
    }
  }
}

function sumByType(
  items: UpsertQuotationDto['items'],
  types: QuotationItemType[],
) {
  return items
    .filter((item) => types.includes(item.type))
    .reduce((acc, item) => acc + item.quantity * item.unitPrice, 0);
}
