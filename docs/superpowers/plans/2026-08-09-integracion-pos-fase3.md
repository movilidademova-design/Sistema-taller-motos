# Fase 3 — Separados: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Apartar mercancía con un abono inicial, recibir abonos con recibo numerado, y convertir el separado en venta cuando se termina de pagar.

**Spec de la lógica:** `motopos/app.py` — `crear_separado` (1418), `agregar_pago_separado` (1523), `cancelar_separado` (1568), `_completar_separado` (1382), `_next_recibo_num` (379).

**Antecedente:** Fases 1 y 2 implementadas. La base `motopos` ya tiene productos, ventas, ítems y pagos; `computeSaleTotals` ya calcula descuentos; `SalesService` ya sabe numerar facturas reutilizando huecos.

---

## Las reglas, extraídas de `app.py`

**Crear un separado:**
- Nombre de cliente obligatorio, al menos un ítem, y **abono inicial > 0**.
- `total = max(0, subtotal − descuentoGeneral)`.
- **Si el abono cubre el total completo → 400**, con el mensaje *"El abono cubre el total. Use una venta normal."* (línea 1451). Un separado que nace pagado no es un separado.
- **El stock se descuenta AL CREAR**: la mercancía queda apartada, fuera del inventario disponible.
- El abono inicial genera un **recibo numerado**.

**Abonar:**
- Monto > 0, y **se recorta al saldo pendiente**: `monto = min(monto, saldo)` (línea 1538). Nunca se paga de más.
- Cada abono genera su propio recibo numerado.
- Solo sobre separados **activos**.
- **Cuando el saldo llega a cero, el separado se convierte en venta automáticamente.** Es el único paso automático de todo el módulo.

**Al completarse:**
- Se crea una `PosSale` real con su número de factura, tomado del mismo contador que las ventas normales.
- El método de pago sale de **agrupar los abonos por método**: si hubo uno solo, ese; si hubo varios, `dividido` con una fila de pago por método.
- Los números de motor y chasis se capturan **en ese momento** (línea 1553), no al crear el separado: cuando se aparta una moto todavía no se sabe cuál unidad concreta se entrega.
- ⚠️ **NO se vuelve a descontar stock.** Ya se descontó al crear. `app.py` lo marca con un comentario expreso en la línea 1412. Este proyecto ya sufrió un doble descuento con las cotizaciones; no repetirlo.

**Cancelar** (solo ADMIN):
- Devuelve el stock.
- Estado `CANCELLED`.
- **Libera todos los números de recibo** del separado (`recibo_num = NULL`, línea 1580), igual que anular una venta libera su número de factura. Misma decisión fiscal.

**Numeración de recibos:** `_next_recibo_num` (línea 379) usa el mismo patrón de hueco libre que las facturas, con su propio piso y su propia serie. Aquí va **por sucursal**, como todo lo demás.

---

## Modelo de datos

Tres tablas nuevas en `apps/api/prisma/pos/schema.prisma`:

```prisma
enum PosLayawayStatus {
  ACTIVE
  COMPLETED
  CANCELLED
}

model PosLayaway {
  id              String           @id @default(uuid())
  tenantId        String
  branchId        String
  clientName      String
  clientDoc       String           @default("")
  clientPhone     String           @default("")
  total           Decimal          @db.Decimal(12, 2)
  generalDiscount Decimal          @default(0) @db.Decimal(12, 2)
  paid            Decimal          @default(0) @db.Decimal(12, 2)
  balance         Decimal          @db.Decimal(12, 2)
  status          PosLayawayStatus @default(ACTIVE)
  notes           String           @default("")
  // Se llena al completarse: la venta que generó este separado.
  saleId          String?
  createdById     String
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  items    PosLayawayItem[]
  payments PosLayawayPayment[]

  @@index([tenantId, branchId, status])
  @@map("pos_layaways")
}

model PosLayawayItem {
  id            String      @id @default(uuid())
  layawayId     String
  layaway       PosLayaway  @relation(fields: [layawayId], references: [id], onDelete: Cascade)
  productId     String?
  product       PosProduct? @relation(fields: [productId], references: [id])
  name          String
  unitPrice     Decimal     @db.Decimal(12, 2)
  unitCost      Decimal     @default(0) @db.Decimal(12, 2)
  finalPrice    Decimal     @db.Decimal(12, 2)
  quantity      Int
  lineTotal     Decimal     @db.Decimal(12, 2)
  reference     String      @default("")
  color         String      @default("")
  supplier      String      @default("")
  // Se capturan al entregar, no al apartar: cuando se aparta una moto todavía
  // no se sabe qué unidad concreta se va a entregar.
  engineNumber  String?
  chassisNumber String?

  @@index([layawayId])
  @@map("pos_layaway_items")
}

model PosLayawayPayment {
  id            String     @id @default(uuid())
  layawayId     String
  layaway       PosLayaway @relation(fields: [layawayId], references: [id], onDelete: Cascade)
  paidAt        DateTime   @default(now())
  amount        Decimal    @db.Decimal(12, 2)
  method        String
  notes         String     @default("")
  // Se libera (queda nulo) al cancelar el separado, igual que el número de
  // factura al anular una venta.
  receiptNumber Int?
  createdById   String

  @@unique([layawayId, receiptNumber])
  @@index([layawayId])
  @@map("pos_layaway_payments")
}
```

`PosProduct` gana `layawayItems PosLayawayItem[]`.

**Sobre `@@unique([layawayId, receiptNumber])`:** la serie de recibos es por sucursal, pero la unicidad no puede declararse ahí porque `PosLayawayPayment` no tiene `branchId`. La unicidad real la impone el servicio al calcular el siguiente número dentro de la transacción. Se deja este índice como red de seguridad local y **se anota como limitación conocida** con un comentario `ponytail:`.

---

## Tareas

### Task 1: Esquema y migración

Mismo procedimiento que la Fase 2: editar `prisma/pos/schema.prisma`, generar con `prisma migrate diff`, **leer el SQL antes de aplicarlo**, `migrate deploy` con `--config prisma/pos/prisma.config.ts`, y regenerar el cliente.

Verificar con `\dt` en la base `motopos` que aparecen las tres tablas nuevas y que las cinco anteriores siguen ahí.

### Task 2: `LayawaysService`

**Pruebas primero**, con dobles escritos a mano. Como mínimo:

1. Crear descuenta stock de los ítems con producto.
2. **Un abono que cubre el total al crear → 400.**
3. Un abono mayor que el saldo **se recorta al saldo**, no lo excede.
4. El saldo llegando a cero **crea la venta** y deja el separado `COMPLETED` con su `saleId`.
5. **Al completarse NO se vuelve a descontar stock** — la comprobación más importante de esta fase.
6. Los abonos se agrupan por método al crear la venta: un solo método lo conserva, dos o más dan `dividido`.
7. Cancelar devuelve el stock, deja `CANCELLED` y **pone todos los `receiptNumber` en nulo**.
8. Abonar a un separado no activo → 404.
9. Los números de recibo reutilizan huecos, por sucursal.

`createLayaway`, `addPayment` y `cancel` corren **enteros dentro de `$transaction`**.

Reutilizar `computeSaleTotals` para los totales y la lógica de numeración que ya existe en `SalesService` para el número de factura al completar — extraerla a una función compartida si hace falta, en vez de duplicarla.

### Task 3: Controlador

- `POST /pos/layaways` — ADMIN, CASHIER
- `GET /pos/layaways?status=` — ADMIN, CASHIER (por omisión, los activos)
- `GET /pos/layaways/:id` — ADMIN, CASHIER
- `POST /pos/layaways/:id/payments` — ADMIN, CASHIER
- `POST /pos/layaways/:id/cancel` — **solo ADMIN**

Todo con `@PosRoles(...)` y filtrado por `tenantId` + `branchId`.

### Task 4: Pantalla

`apps/web/src/app/(app)/pos/separados/page.tsx`, y la entrada en `POS_NAV`.

Lista con filtro por estado. Por separado: cliente, total, pagado, **saldo destacado**, y el historial de abonos con su número de recibo. Botón de abonar (diálogo con monto y método) y, para ADMIN, botón de cancelar con confirmación.

Cuando un abono completa el separado, avisar en pantalla que **se generó la venta** y con qué número de factura. Si el separado incluye motos, pedir motor y chasis **antes** de completar.

### Task 5: Humo

Añadir a `scripts/pruebas-humo.sh`: el cajero ve y crea separados; el cajero **no** puede cancelar (403); un usuario solo del taller recibe **403** en `/pos/layaways`.

---

## Notas

- **Dos clientes de Prisma**: `PosPrismaService` para todo esto.
- **Todo endpoint del POS necesita `@PosRoles(...)`**, o el guard global exige rol de taller.
- **Nunca convertir `Decimal` a `number`** para operar.
- El único paso automático del módulo es la conversión a venta al llegar a saldo cero. Todo lo demás lo dispara una persona.
