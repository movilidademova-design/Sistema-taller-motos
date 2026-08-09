import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/pos/client';
import { PosSaleStatus } from '../../generated/pos/enums';
import { PosPrismaService } from '../pos-prisma.service';
import {
  CreateSaleDto,
  CreateSaleItemDto,
  ListPosSalesQueryDto,
} from './dto/sale.dto';
import { computeSaleTotals, DiscountType } from './sale-pricing.util';
import { nextInvoiceNumber } from './invoice-number.util';

// Reglas migradas de motopos/app.py: crear_venta (línea 389), anular_venta
// (línea 499), hacer_nota_credito (línea 510). La numeración de factura
// (_next_factura_num, línea 369) vive en invoice-number.util.ts porque
// PosLayawaysService también la necesita al completar un separado.

const SALE_INCLUDE = {
  items: true,
  payments: true,
} satisfies Prisma.PosSaleInclude;

interface ResolvedSaleItem {
  productId: string | null;
  name: string;
  unitPrice: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  reference: string;
  color: string;
  supplier: string;
  quantity: number;
  discount?: Prisma.Decimal;
  discountType?: DiscountType;
  engineNumber?: string;
  chassisNumber?: string;
}

@Injectable()
export class PosSalesService {
  constructor(private readonly prisma: PosPrismaService) {}

  async create(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreateSaleDto,
  ) {
    // app.py línea 394: nombre de cliente obligatorio (y no solo espacios).
    if (!dto.clientName.trim()) {
      throw new BadRequestException('El nombre del cliente es obligatorio');
    }

    return this.prisma.$transaction(async (tx) => {
      // Toda la venta corre en una sola transacción: leer productos, calcular
      // el número de factura, crear la venta/ítems/pagos y descontar stock —
      // o todo, o nada. Sin esto, dos cajeros vendiendo a la vez podrían
      // llevarse el mismo número de factura.
      const resolvedItems: ResolvedSaleItem[] = [];
      for (const item of dto.items) {
        resolvedItems.push(
          await this.resolveItem(tx, tenantId, branchId, item),
        );
      }

      const totals = computeSaleTotals({
        items: resolvedItems.map((r) => ({
          unitPrice: r.unitPrice,
          quantity: r.quantity,
          discount: r.discount,
          discountType: r.discountType,
        })),
        generalDiscount:
          dto.generalDiscount !== undefined
            ? new Prisma.Decimal(dto.generalDiscount)
            : undefined,
        generalDiscountType: dto.generalDiscountType,
      });

      // Pago dividido tipado: a diferencia de la cadena
      // "efectivo:1000,tarjeta:500" que parsea app.py con un try/except que se
      // traga errores (línea 436), aquí la suma debe cuadrar exacto con el
      // total o la venta se rechaza con 400. Es dinero.
      const paymentsSum = dto.payments.reduce(
        (sum, p) => sum.plus(new Prisma.Decimal(p.amount)),
        new Prisma.Decimal(0),
      );
      if (!paymentsSum.eq(totals.total)) {
        throw new BadRequestException(
          `La suma de los pagos (${paymentsSum.toFixed(2)}) no coincide con el total de la venta (${totals.total.toFixed(2)})`,
        );
      }

      const invoiceNumber = await nextInvoiceNumber(tx, tenantId, branchId);
      // "dividido" es el término que ya usa el catálogo de métodos de pago
      // (PosList) para esta venta con más de un método.
      const paymentMethod =
        dto.payments.length > 1 ? 'dividido' : dto.payments[0].method;

      const sale = await tx.posSale.create({
        data: {
          tenantId,
          branchId,
          invoiceNumber,
          clientName: dto.clientName.trim(),
          clientDoc: dto.clientDoc ?? '',
          paymentMethod,
          subtotal: totals.subtotal,
          generalDiscount: totals.generalDiscount,
          total: totals.total,
          createdById: userId,
          items: {
            create: resolvedItems.map((r, i) => ({
              productId: r.productId,
              name: r.name,
              unitPrice: r.unitPrice,
              unitCost: r.unitCost,
              itemDiscount: r.discount ?? new Prisma.Decimal(0),
              finalPrice: totals.items[i].finalPrice,
              quantity: r.quantity,
              lineTotal: totals.items[i].lineTotal,
              reference: r.reference,
              color: r.color,
              supplier: r.supplier,
              engineNumber: r.engineNumber ?? null,
              chassisNumber: r.chassisNumber ?? null,
            })),
          },
          payments: {
            create: dto.payments.map((p) => ({
              method: p.method,
              amount: new Prisma.Decimal(p.amount),
            })),
          },
        },
        include: SALE_INCLUDE,
      });

      // Descontar stock — solo de los ítems que sí tienen un producto real.
      // Los sueltos (servicios, productId nulo) no tocan inventario.
      for (const r of resolvedItems) {
        if (r.productId) {
          await tx.posProduct.update({
            where: { id: r.productId },
            data: { stock: { decrement: r.quantity } },
          });
        }
      }

      return sale;
    });
  }

  async findAll(
    tenantId: string,
    branchId: string,
    query: ListPosSalesQueryDto,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = {
      tenantId,
      branchId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.posSale.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { soldAt: 'desc' },
        include: SALE_INCLUDE,
      }),
      this.prisma.posSale.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(tenantId: string, branchId: string, id: string) {
    const sale = await this.prisma.posSale.findFirst({
      where: { id, tenantId, branchId },
      include: SALE_INCLUDE,
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  async void(tenantId: string, branchId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.mustFindActiveSale(tx, tenantId, branchId, id);
      if (sale.status !== PosSaleStatus.ACTIVE) {
        throw new BadRequestException(
          sale.status === PosSaleStatus.VOIDED
            ? 'La venta ya fue anulada'
            : 'La venta ya tiene nota crédito, no se puede anular',
        );
      }

      await tx.posSale.update({
        where: { id },
        data: {
          status: PosSaleStatus.VOIDED,
          // El número queda libre: la siguiente venta lo reutiliza. Decisión
          // fiscal deliberada del usuario (motopos commit 4ae2d0f).
          invoiceNumber: null,
          statusChangedAt: new Date(),
        },
      });

      // Desviación deliberada de app.py: allí anular NO devuelve stock (solo
      // la nota crédito lo hace). Aquí sí, porque anular es para una venta que
      // nunca ocurrió — la mercancía nunca salió del estante, así que dejarla
      // descontada deja el inventario permanentemente mal.
      await this.returnStock(tx, sale.items);

      return tx.posSale.findUnique({ where: { id }, include: SALE_INCLUDE });
    });
  }

  async creditNote(tenantId: string, branchId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await this.mustFindActiveSale(tx, tenantId, branchId, id);
      if (sale.status === PosSaleStatus.VOIDED) {
        throw new BadRequestException('Venta anulada, no aplica nota crédito');
      }
      if (sale.status === PosSaleStatus.CREDIT_NOTE) {
        throw new BadRequestException('Ya es nota crédito');
      }

      // El número de factura se conserva — a diferencia de anular, esto es
      // una devolución real de una venta que sí ocurrió.
      await tx.posSale.update({
        where: { id },
        data: {
          status: PosSaleStatus.CREDIT_NOTE,
          statusChangedAt: new Date(),
        },
      });

      await this.returnStock(tx, sale.items);

      return tx.posSale.findUnique({ where: { id }, include: SALE_INCLUDE });
    });
  }

  private async mustFindActiveSale(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    id: string,
  ) {
    const sale = await tx.posSale.findFirst({
      where: { id, tenantId, branchId },
      include: { items: true },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return sale;
  }

  private async returnStock(
    tx: Prisma.TransactionClient,
    items: { productId: string | null; quantity: number }[],
  ) {
    for (const item of items) {
      if (item.productId) {
        await tx.posProduct.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
  }

  private async resolveItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
    item: CreateSaleItemDto,
  ): Promise<ResolvedSaleItem> {
    const discount =
      item.discount !== undefined
        ? new Prisma.Decimal(item.discount)
        : undefined;

    if (!item.productId) {
      // Ítem suelto (servicio, etc.): no hay catálogo del que leer nombre ni
      // precio, así que se usa lo que mandó el cajero. No toca stock.
      return {
        productId: null,
        name: item.name ?? '',
        unitPrice: new Prisma.Decimal(item.unitPrice ?? 0),
        unitCost: new Prisma.Decimal(0),
        reference: '',
        color: '',
        supplier: '',
        quantity: item.quantity,
        discount,
        discountType: item.discountType,
        engineNumber: item.engineNumber,
        chassisNumber: item.chassisNumber,
      };
    }

    const product = await tx.posProduct.findFirst({
      where: { id: item.productId, tenantId, branchId, isActive: true },
    });
    if (!product) {
      throw new NotFoundException(`Producto ${item.productId} no encontrado`);
    }
    // No está en app.py (allí el stock puede quedar negativo). Un inventario
    // negativo no significa nada y ensucia el cierre mensual, así que aquí se
    // rechaza antes de vender lo que no hay.
    if (product.stock < item.quantity) {
      throw new BadRequestException(
        `Stock insuficiente para ${product.name}: hay ${product.stock}, se pidieron ${item.quantity}`,
      );
    }

    // Copia congelada del producto al momento de vender: si después se edita
    // el producto, esta venta ya guardada no cambia.
    return {
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      unitCost: product.cost,
      reference: product.reference,
      color: product.color,
      supplier: product.supplier,
      quantity: item.quantity,
      discount,
      discountType: item.discountType,
      engineNumber: item.engineNumber,
      chassisNumber: item.chassisNumber,
    };
  }
}
