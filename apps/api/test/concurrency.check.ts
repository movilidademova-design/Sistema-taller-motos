/**
 * Prueba de concurrencia contra PostgreSQL real.
 *
 *     pnpm --filter @taller/api test:concurrency
 *
 * Necesita la base del POS levantada y migrada (`docker compose up -d` y
 * `pnpm --filter @taller/api pos:migrate`). Sale con código 1 si alguna carrera
 * vuelve a abrirse, así que puede ir en CI donde haya una base disponible.
 *
 * No es un test de Jest a propósito: estas tres carreras NO se pueden detectar
 * con mocks. Los tests unitarios comprueban que se pide el bloqueo y que el
 * descuento es condicional; que eso *funcione de verdad* solo lo demuestra
 * PostgreSQL ejecutando transacciones simultáneas.
 *
 * Las tres carreras que cubre se reprodujeron de verdad antes del arreglo
 * (auditoría 2026-08-13): stock a -1, colisión de número de factura, y dos
 * recibos de separado con el mismo número guardados sin error. Importa el
 * código real de la aplicación, no una copia, para que no puedan divergir.
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/pos/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { lockNumberSeries, NumberSeries } from '../src/pos/shared/branch-lock.util';
import { decrementStock } from '../src/pos/shared/stock.util';
import { nextFreeNumber } from '../src/pos/shared/next-free-number.util';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.POS_DATABASE_URL }) });
const T = 'race-verify-tenant';
const B = 'race-verify-branch';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function reset() {
  await prisma.posLayawayPayment.deleteMany({ where: { layaway: { tenantId: T } } });
  await prisma.posLayaway.deleteMany({ where: { tenantId: T } });
  await prisma.posSaleItem.deleteMany({ where: { sale: { tenantId: T } } });
  await prisma.posSale.deleteMany({ where: { tenantId: T } });
  await prisma.posProduct.deleteMany({ where: { tenantId: T } });
}

/** Camino de venta: bloqueo -> número -> crear -> descuento condicional. */
async function sell(productId: string, qty: number) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.posProduct.findFirst({ where: { id: productId, tenantId: T, branchId: B, isActive: true } });
    if (!p) throw new Error('no product');
    if (p.stock < qty) throw new Error('STOCK_INSUFICIENTE (validación temprana)');

    await lockNumberSeries(tx, T, B, NumberSeries.INVOICE);
    const sales = await tx.posSale.findMany({ where: { tenantId: T, branchId: B, invoiceNumber: { not: null } }, select: { invoiceNumber: true } });
    const n = nextFreeNumber(new Set(sales.map((s) => s.invoiceNumber as number)), 3, 4);

    await sleep(120); // el mismo entrelazado que antes hacía fallar todo
    await tx.posSale.create({
      data: { tenantId: T, branchId: B, invoiceNumber: n, clientName: 'x', paymentMethod: 'efectivo', subtotal: 100, total: 100, createdById: 'u' },
    });
    await decrementStock(tx, productId, qty, p.name);
    return n;
  });
}

async function payLayaway(layawayId: string) {
  return prisma.$transaction(async (tx) => {
    await lockNumberSeries(tx, T, B, NumberSeries.RECEIPT);
    const payments = await tx.posLayawayPayment.findMany({
      where: { receiptNumber: { not: null }, layaway: { tenantId: T, branchId: B } },
      select: { receiptNumber: true },
    });
    const n = nextFreeNumber(new Set(payments.map((p) => p.receiptNumber as number)), 0, 1);
    await sleep(120);
    return tx.posLayawayPayment.create({ data: { layawayId, amount: 10, method: 'efectivo', receiptNumber: n, createdById: 'u' } });
  });
}

async function main() {
  let fallos = 0;
  await reset();

  // ── 1 y 2: stock negativo + colisión de factura ────────────────────────────
  const p = await prisma.posProduct.create({
    data: { tenantId: T, branchId: B, name: 'Casco', category: 'ACCESORIO', price: 100, stock: 1 },
  });
  const r = await Promise.allSettled([sell(p.id, 1), sell(p.id, 1)]);
  const after = await prisma.posProduct.findUniqueOrThrow({ where: { id: p.id } });
  const invoices = (await prisma.posSale.findMany({ where: { tenantId: T }, select: { invoiceNumber: true } })).map((s) => s.invoiceNumber);

  console.log('\n=== CARRERA 1: STOCK NEGATIVO (antes: -1) ===');
  r.forEach((x, i) => console.log(`  venta ${i + 1}: ${x.status === 'fulfilled' ? 'OK' : 'RECHAZADA -> ' + (x.reason as Error).message.slice(0, 80)}`));
  console.log(`  stock final: ${after.stock}`);
  if (after.stock < 0) { console.log('  ❌ SIGUE NEGATIVO'); fallos++; } else console.log('  ✅ nunca baja de cero');

  console.log('\n=== CARRERA 2: NÚMERO DE FACTURA (antes: colisión P2002) ===');
  console.log(`  facturas guardadas: [${invoices.join(', ')}]`);
  const p2002 = r.filter((x) => x.status === 'rejected' && /Unique constraint|P2002/.test((x.reason as Error).message));
  if (p2002.length) { console.log('  ❌ SIGUE COLISIONANDO'); fallos++; } else console.log('  ✅ sin violación de unicidad');

  // ── 3: recibos de separado ────────────────────────────────────────────────
  await reset();
  const mk = () => prisma.posLayaway.create({ data: { tenantId: T, branchId: B, clientName: 'c', total: 100, balance: 100, createdById: 'u' } });
  const [l1, l2] = await Promise.all([mk(), mk()]);
  await Promise.allSettled([payLayaway(l1.id), payLayaway(l2.id)]);
  const nums = (await prisma.posLayawayPayment.findMany({ where: { layaway: { tenantId: T } }, select: { receiptNumber: true } })).map((x) => x.receiptNumber);

  console.log('\n=== CARRERA 3: RECIBOS DE SEPARADO (antes: [1, 1] duplicado) ===');
  console.log(`  recibos guardados: [${nums.join(', ')}]`);
  if (new Set(nums).size !== nums.length) { console.log('  ❌ SIGUEN DUPLICÁNDOSE'); fallos++; } else console.log('  ✅ números distintos');

  // ── 4: 8 ventas simultáneas, prueba de carga del bloqueo ──────────────────
  await reset();
  const p2 = await prisma.posProduct.create({
    data: { tenantId: T, branchId: B, name: 'Batería', category: 'REPUESTO', price: 50, stock: 5 },
  });
  const many = await Promise.allSettled(Array.from({ length: 8 }, () => sell(p2.id, 1)));
  const ok = many.filter((x) => x.status === 'fulfilled').length;
  const stock2 = await prisma.posProduct.findUniqueOrThrow({ where: { id: p2.id } });
  const inv2 = (await prisma.posSale.findMany({ where: { tenantId: T }, select: { invoiceNumber: true } })).map((s) => s.invoiceNumber);

  console.log('\n=== CARRERA 4: 8 VENTAS SIMULTÁNEAS, SOLO 5 UNIDADES ===');
  console.log(`  ventas completadas: ${ok} (esperado exactamente 5)`);
  console.log(`  stock final: ${stock2.stock} (esperado 0)`);
  console.log(`  facturas: [${inv2.sort((a, b) => (a ?? 0) - (b ?? 0)).join(', ')}]`);
  if (ok !== 5 || stock2.stock !== 0) { console.log('  ❌ no cuadra'); fallos++; }
  else if (new Set(inv2).size !== inv2.length) { console.log('  ❌ facturas duplicadas'); fallos++; }
  else console.log('  ✅ se vendieron exactamente las 5 que había, con números consecutivos y únicos');

  await reset();
  await prisma.$disconnect();
  console.log(`\n${fallos === 0 ? '✅ TODAS LAS CARRERAS CORREGIDAS' : `❌ ${fallos} carrera(s) siguen abiertas`}`);
  process.exit(fallos === 0 ? 0 : 1);
}
void main();
