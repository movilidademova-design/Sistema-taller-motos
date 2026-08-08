# Fase 2 — El POS que se usa a diario: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Vender desde el sistema nuevo — productos, listas, ventas con descuentos y pago dividido, anulación y nota crédito — sobre una base de datos propia y separada de la del taller.

**Architecture:** Una segunda base PostgreSQL (`motopos`) con su propio `schema.prisma` y su propio cliente generado. Referencia `tenantId`, `branchId` y `userId` como texto plano, sin llave foránea: no puede haberla entre bases distintas. Todo el dinero en `Decimal(12,2)`.

**Spec de la lógica de negocio:** `motopos/app.py`. Es código Python que funciona hoy en producción; cuando este plan y `app.py` discrepen, gana `app.py` salvo donde este documento diga explícitamente lo contrario.

**Antecedente:** `docs/superpowers/specs/2026-08-05-integracion-pos-taller-design.md` (arquitectura) y `docs/superpowers/plans/2026-08-05-integracion-pos-fase1.md` (Fase 1, ya implementada).

---

## Convenciones del repositorio

Idénticas a la Fase 1. Las que más cuestan si se ignoran:

- **Tipos en `apps/api`: `npx tsc -p tsconfig.build.json --noEmit`**, nunca `npx tsc --noEmit` a secas (22 errores preexistentes ajenos, en archivos que el build excluye).
- **Nunca `pnpm lint`** (se pasa del tiempo límite). `npx eslint <rutas concretas>` desde dentro de cada app.
- **Nunca `prisma migrate dev`** (interactivo, falla aquí). Migración escrita a mano + `prisma migrate deploy`.
- Pruebas sin `TestingModule`: instanciación a mano con dobles escritos a mano.
- Comentarios **en español** explicando el porqué; commits **en inglés**.
- `apps/web` no tiene jest. La lógica de dinero se prueba en la API, que sí lo tiene.

---

## Decisiones tomadas antes de escribir el plan

**1. El dinero va en `Decimal(12,2)`, no en coma flotante.** MotoPos usa `REAL` en SQLite para precios y totales. Sumar dinero en coma flotante acumula errores de centavos que después no cuadran en el cierre mensual. El taller ya usa `Decimal(10,2)`; el POS usa `Decimal(12,2)` porque una moto cuesta más que un repuesto. **Esto corrige un defecto conocido de MotoPos, no lo replica.**

**2. Anular una venta ahora SÍ devuelve el stock.** En `app.py`, `anular_venta` (línea 499) libera el número de factura pero **no** devuelve el inventario, mientras que `hacer_nota_credito` (línea 510) sí lo devuelve. Anular es para una venta mal digitada: la mercancía nunca salió, así que dejarla descontada deja el inventario permanentemente mal. Se implementa devolviendo stock en los dos casos.

> **Desviación deliberada de `app.py`. Si el usuario prefiere el comportamiento original, es cambiar una línea.**

**3. El número de factura se reutiliza, y eso se conserva.** `_next_factura_num` (línea 369) busca el **primer hueco libre** por encima de un piso configurable, no el siguiente consecutivo. Anular libera el número y el siguiente lo reaprovecha. Es una decisión fiscal deliberada del usuario (commit `4ae2d0f` de MotoPos: *"reutilizar prefijos FVBB/RC al anular venta"*). Se replica tal cual, **pero por sucursal**: cada sucursal lleva su propia numeración.

**4. Sin clientes en el POS.** Una venta guarda `clientName` y `clientDoc` como texto suelto, igual que hoy en MotoPos. **No** se enlaza con la tabla `Client` del taller: está en la otra base y el aislamiento lo prohíbe.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `apps/api/prisma/pos/schema.prisma` | Esquema de la base `motopos`, cliente generado aparte |
| `apps/api/prisma/pos/migrations/<ts>_init/migration.sql` | Creación de las cinco tablas |
| `apps/api/src/pos/pos-prisma.service.ts` | Cliente Prisma de la base `motopos` |
| `apps/api/src/pos/pos.module.ts` | Módulo raíz del POS |
| `apps/api/src/pos/products/` | `products.service.ts`, `products.controller.ts`, DTOs |
| `apps/api/src/pos/lists/` | `lists.service.ts`, `lists.controller.ts`, DTO |
| `apps/api/src/pos/sales/sales.service.ts` | Crear, listar, anular, nota crédito |
| `apps/api/src/pos/sales/sale-pricing.util.ts` | Descuentos y totales — **función pura, es el corazón del dinero** |
| `apps/api/src/pos/sales/sale-pricing.util.spec.ts` | Pruebas de la aritmética del dinero |
| `apps/api/src/pos/sales/sales.service.spec.ts` | Pruebas de stock, numeración, anulación |
| `apps/api/src/pos/sales/sales.controller.ts` + DTOs | |
| `apps/web/src/app/(app)/pos/vender/page.tsx` | Pantalla de venta |
| `apps/web/src/app/(app)/pos/productos/page.tsx` | Catálogo |
| `apps/web/src/app/(app)/pos/ventas/page.tsx` | Historial |
| `apps/web/src/lib/pos-types.ts` | Tipos del POS para el frontend |

**Se modifican:** `apps/api/src/app.module.ts` (registrar `PosModule`), `apps/api/.env` y `.env.example` (`POS_DATABASE_URL`), `apps/api/package.json` (guiones de migración del POS), `apps/web/src/components/layout/nav-config.ts` (menú real del POS), `scripts/pruebas-humo.sh`.

---

## Task 1: La segunda base de datos

**Files:** `apps/api/prisma/pos/schema.prisma`, `apps/api/prisma/pos/migrations/20260805120000_init/migration.sql`, `apps/api/.env`, `apps/api/.env.example`, `apps/api/package.json`

- [ ] **Step 1: Crear la base**

```bash
docker compose -p sistema-taller-motos exec -T postgres psql -U postgres -c "CREATE DATABASE motopos;"
```

Esperado: `CREATE DATABASE`. Si dice que ya existe, seguir.

- [ ] **Step 2: Variable de entorno**

En `apps/api/.env` y en `apps/api/.env.example`, junto a `DATABASE_URL`:

```
# Base del POS. Separada de la del taller a propósito: son dos negocios
# distintos y ninguna consulta debe poder cruzarlos.
POS_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/motopos?schema=public"
```

Copiar usuario, contraseña y puerto exactos de la `DATABASE_URL` que ya existe; solo cambia el nombre de la base.

- [ ] **Step 3: El esquema**

`apps/api/prisma/pos/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"
  output   = "../../src/generated/pos"
}

datasource db {
  provider = "postgresql"
  url      = env("POS_DATABASE_URL")
}

// tenantId, branchId y createdById son texto plano SIN llave foránea: apuntan a
// la base del taller, y no puede haber una relación entre bases distintas. Ese
// es justamente el aislamiento que se busca.

enum PosProductCategory {
  MOTO
  ACCESORIO
  REPUESTO
  TALLER
}

enum PosSaleStatus {
  ACTIVE
  VOIDED       // anulada: venta mal digitada, libera el número de factura
  CREDIT_NOTE  // nota crédito: devolución real, conserva el número
}

model PosProduct {
  id           String             @id @default(uuid())
  tenantId     String
  branchId     String
  name         String
  category     PosProductCategory
  price        Decimal            @db.Decimal(12, 2)
  cost         Decimal            @default(0) @db.Decimal(12, 2)
  stock        Int                @default(0)
  reference    String             @default("")
  color        String             @default("")
  supplier     String             @default("")
  entryDate    DateTime?
  isActive     Boolean            @default(true)
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  saleItems PosSaleItem[]

  @@index([tenantId, branchId, isActive])
  @@map("pos_products")
}

// Catálogos editables: categorías, colores, proveedores, métodos de pago.
model PosList {
  id       String @id @default(uuid())
  tenantId String
  branchId String
  type     String
  value    String

  @@unique([tenantId, branchId, type, value])
  @@index([tenantId, branchId, type])
  @@map("pos_lists")
}

model PosSale {
  id              String        @id @default(uuid())
  tenantId        String
  branchId        String
  // Se reutiliza el hueco que deja una venta anulada, por decisión fiscal del
  // usuario. Nulo mientras la venta está anulada.
  invoiceNumber   Int?
  soldAt          DateTime      @default(now())
  clientName      String
  clientDoc       String        @default("")
  // Texto suelto a propósito: el cliente del taller vive en la otra base.
  paymentMethod   String
  subtotal        Decimal       @db.Decimal(12, 2)
  generalDiscount Decimal       @default(0) @db.Decimal(12, 2)
  total           Decimal       @db.Decimal(12, 2)
  status          PosSaleStatus @default(ACTIVE)
  statusChangedAt DateTime?
  createdById     String
  createdAt       DateTime      @default(now())

  items    PosSaleItem[]
  payments PosSalePayment[]

  @@unique([tenantId, branchId, invoiceNumber])
  @@index([tenantId, branchId, soldAt])
  @@map("pos_sales")
}

model PosSaleItem {
  id           String      @id @default(uuid())
  saleId       String
  sale         PosSale     @relation(fields: [saleId], references: [id], onDelete: Cascade)
  productId    String?
  product      PosProduct? @relation(fields: [productId], references: [id])
  // Copia congelada: el nombre y el precio de la venta no deben cambiar porque
  // después se edite el producto.
  name         String
  unitPrice    Decimal     @db.Decimal(12, 2)
  unitCost     Decimal     @default(0) @db.Decimal(12, 2)
  itemDiscount Decimal     @default(0) @db.Decimal(12, 2)
  finalPrice   Decimal     @db.Decimal(12, 2)
  quantity     Int
  lineTotal    Decimal     @db.Decimal(12, 2)
  reference    String      @default("")
  color        String      @default("")
  supplier     String      @default("")
  // Solo para motos. El cierre mensual los exige.
  engineNumber String?
  chassisNumber String?

  @@index([saleId])
  @@map("pos_sale_items")
}

// Una venta puede pagarse con varios métodos a la vez (pago dividido).
model PosSalePayment {
  id     String  @id @default(uuid())
  saleId String
  sale   PosSale @relation(fields: [saleId], references: [id], onDelete: Cascade)
  method String
  amount Decimal @db.Decimal(12, 2)

  @@index([saleId])
  @@map("pos_sale_payments")
}
```

- [ ] **Step 4: Generar el cliente y migrar**

Añadir a los guiones de `apps/api/package.json`:

```json
    "pos:generate": "prisma generate --schema prisma/pos/schema.prisma",
    "pos:migrate": "prisma migrate deploy --schema prisma/pos/schema.prisma"
```

Generar la migración a partir del esquema:

```bash
cd apps/api
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/pos/schema.prisma --script > /tmp/pos-init.sql
mkdir -p prisma/pos/migrations/20260805120000_init
cp /tmp/pos-init.sql prisma/pos/migrations/20260805120000_init/migration.sql
```

**Leer el SQL generado antes de aplicarlo.** En este proyecto ya salió una vez con las sentencias en mal orden (una tabla alterada antes de crearse). Comprobar que los `CREATE TYPE` van antes de los `CREATE TABLE` y que las llaves foráneas van al final.

Crear también `prisma/pos/migrations/migration_lock.toml` con el mismo contenido que el del taller (`provider = "postgresql"`).

```bash
cd apps/api && npx prisma migrate deploy --schema prisma/pos/schema.prisma && npx prisma generate --schema prisma/pos/schema.prisma
```

- [ ] **Step 5: Verificar el aislamiento**

```bash
docker compose -p sistema-taller-motos exec -T postgres psql -U postgres -d motopos -c "\dt"
docker compose -p sistema-taller-motos exec -T postgres psql -U postgres -d motopos -c "SELECT * FROM users;"
```

Esperado: la primera lista las cinco tablas `pos_*`. **La segunda debe FALLAR** con `relation "users" does not exist` — esa es la prueba de que las bases están de verdad separadas.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/pos apps/api/package.json apps/api/.env.example
git commit -m "Give the POS its own database"
```

`.env` no se commitea (está en `.gitignore`); sí `.env.example`.

---

## Task 2: El servicio de Prisma del POS

**Files:** `apps/api/src/pos/pos-prisma.service.ts`, `apps/api/src/pos/pos.module.ts`, `apps/api/src/app.module.ts`

- [ ] **Step 1: Leer el servicio existente**

Leer `apps/api/src/prisma/prisma.service.ts` entero y copiar su forma exacta (cómo instancia el adaptador `@prisma/adapter-pg`, cómo hace `onModuleInit`). El del POS es el mismo con otro cliente y otra variable de entorno.

- [ ] **Step 2: Crear el servicio**

`apps/api/src/pos/pos-prisma.service.ts` — mismo patrón que `PrismaService`, importando `PrismaClient` desde `../generated/pos/client` y leyendo `POS_DATABASE_URL`. Un comentario en español dejando claro que es una **segunda conexión a una base distinta** y que no comparte nada con la del taller.

- [ ] **Step 3: Módulo y registro**

`apps/api/src/pos/pos.module.ts` que provee y exporta `PosPrismaService`, y registrarlo en `imports` de `app.module.ts`.

- [ ] **Step 4: Verificar que arranca**

```bash
cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npx jest
```
Levantar la API y comprobar en el log que no hay error de conexión.

- [ ] **Step 5: Commit**

```bash
git commit -m "Connect to the POS database"
```

---

## Task 3: La aritmética del dinero (función pura)

Esta es la pieza que más importa que esté bien. Va aparte y con pruebas propias porque es donde un error cuesta plata de verdad.

**Files:** `apps/api/src/pos/sales/sale-pricing.util.ts`, `apps/api/src/pos/sales/sale-pricing.util.spec.ts`

- [ ] **Step 1: Escribir las pruebas primero**

Reglas exactas, tomadas de `app.py` líneas 398-421:

- Descuento por ítem porcentual: `precioFinal = precioBase * (1 - pct/100)`
- Descuento por ítem fijo: `precioFinal = max(0, precioBase - valor)` — **nunca negativo**
- `subtotal = Σ (precioFinal × cantidad)`
- Descuento general porcentual: `subtotal * pct/100`
- Descuento general fijo: `min(valor, subtotal)` — **nunca mayor que el subtotal**
- `total = subtotal - descuentoGeneral`

`apps/api/src/pos/sales/sale-pricing.util.spec.ts`:

```ts
import { Prisma } from '../../generated/pos/client';
import { computeSaleTotals } from './sale-pricing.util';

const d = (n: string) => new Prisma.Decimal(n);

describe('computeSaleTotals', () => {
  it('suma líneas sin descuento', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 2 },
        { unitPrice: d('500.50'), quantity: 1 },
      ],
    });
    expect(r.subtotal.toFixed(2)).toBe('2500.50');
    expect(r.total.toFixed(2)).toBe('2500.50');
  });

  it('aplica un descuento por ítem porcentual', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 2, discount: d('10'), discountType: 'pct' },
      ],
    });
    expect(r.items[0].finalPrice.toFixed(2)).toBe('900.00');
    expect(r.subtotal.toFixed(2)).toBe('1800.00');
  });

  it('aplica un descuento por ítem fijo', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 1, discount: d('150'), discountType: 'amount' },
      ],
    });
    expect(r.items[0].finalPrice.toFixed(2)).toBe('850.00');
  });

  // Sin esto, un descuento mal digitado convierte una venta en un regalo con
  // vuelto: el total sale negativo y el cierre del mes deja de cuadrar.
  it('un descuento por ítem mayor que el precio deja la línea en cero, no en negativo', () => {
    const r = computeSaleTotals({
      items: [
        { unitPrice: d('1000'), quantity: 1, discount: d('5000'), discountType: 'amount' },
      ],
    });
    expect(r.items[0].finalPrice.toFixed(2)).toBe('0.00');
    expect(r.total.toFixed(2)).toBe('0.00');
  });

  it('aplica un descuento general porcentual', () => {
    const r = computeSaleTotals({
      items: [{ unitPrice: d('1000'), quantity: 1 }],
      generalDiscount: d('20'),
      generalDiscountType: 'pct',
    });
    expect(r.generalDiscount.toFixed(2)).toBe('200.00');
    expect(r.total.toFixed(2)).toBe('800.00');
  });

  it('un descuento general fijo nunca supera el subtotal', () => {
    const r = computeSaleTotals({
      items: [{ unitPrice: d('1000'), quantity: 1 }],
      generalDiscount: d('99999'),
      generalDiscountType: 'amount',
    });
    expect(r.generalDiscount.toFixed(2)).toBe('1000.00');
    expect(r.total.toFixed(2)).toBe('0.00');
  });

  // La razón de usar Decimal y no números de coma flotante: con `number`,
  // 0.1 + 0.2 da 0.30000000000000004, y esos centavos se acumulan hasta que
  // el cierre mensual no cuadra.
  it('no arrastra error de coma flotante', () => {
    const r = computeSaleTotals({
      items: Array.from({ length: 3 }, () => ({ unitPrice: d('0.10'), quantity: 1 })),
    });
    expect(r.subtotal.toFixed(2)).toBe('0.30');
  });
});
```

- [ ] **Step 2: Verla fallar**

```bash
cd apps/api && npx jest src/pos/sales/sale-pricing.util.spec.ts
```
Esperado: `Cannot find module './sale-pricing.util'`.

- [ ] **Step 3: Implementar**

`sale-pricing.util.ts` exporta `computeSaleTotals(input)` con esta forma:

```ts
export type DiscountType = 'pct' | 'amount';

export interface SaleItemInput {
  unitPrice: Prisma.Decimal;
  quantity: number;
  discount?: Prisma.Decimal;
  discountType?: DiscountType;
}

export interface SaleTotalsInput {
  items: SaleItemInput[];
  generalDiscount?: Prisma.Decimal;
  generalDiscountType?: DiscountType;
}

export interface SaleTotals {
  items: { finalPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }[];
  subtotal: Prisma.Decimal;
  generalDiscount: Prisma.Decimal;
  total: Prisma.Decimal;
}

export function computeSaleTotals(input: SaleTotalsInput): SaleTotals;
```

Toda la aritmética con métodos de `Prisma.Decimal` (`.mul`, `.sub`, `.div`, `.lessThan`), **nunca** convirtiendo a `number`. Redondear cada `finalPrice` y cada `lineTotal` a 2 decimales al calcularlos, no al final.

- [ ] **Step 4: Verla pasar y comprobar que tiene dientes**

```bash
cd apps/api && npx jest src/pos/sales/sale-pricing.util.spec.ts
```
Esperado: 7 en verde.

Después, **romper a propósito** el tope del descuento fijo (quitar el `max(0, ...)`), volver a correr y confirmar que la prueba del negativo se pone roja. Restaurar. Reportar la salida de las dos corridas: una prueba que no puede fallar no protege nada.

- [ ] **Step 5: Commit**

```bash
git commit -m "Compute sale totals without floating point"
```

---

## Task 4: Productos y listas

**Files:** `apps/api/src/pos/products/*`, `apps/api/src/pos/lists/*`

- [ ] **Step 1: Servicio de productos**

CRUD sobre `PosProduct`, **siempre** filtrando por `tenantId` y `branchId` del `@CurrentUser()` y `@CurrentBranch()`. Borrado suave (`isActive = false`), igual que `app.py` línea 361. Listado ordenado por categoría y nombre, solo activos.

`app.py` guarda un emoji por categoría (línea 335). **No se replica**: es presentación, va en el frontend, no en la base.

- [ ] **Step 2: Servicio de listas**

`PosList` es un catálogo genérico por tipo (categorías, colores, proveedores, métodos de pago). Leer (cualquier rol de POS), crear y borrar (solo `PosRole.ADMIN`), como en `app.py` líneas 289-320. Devolver 409 si el valor ya existe, en vez del 400 genérico del original.

- [ ] **Step 3: Controladores**

Rutas bajo `/pos/products` y `/pos/lists`. **Todos los endpoints llevan `@PosRoles(...)`**: sin ese decorador el guard exige rol de taller y un cajero quedaría fuera de su propio sistema. Lectura para `ADMIN` y `CASHIER`; escritura solo `ADMIN`.

- [ ] **Step 4: Pruebas**

Una prueba por servicio que demuestre que **el filtro de sucursal se aplica**: pedir productos con `branchId` A no debe devolver los de B. Es la garantía de que el POS de Calle 80 y el de Ciudadela no se mezclan.

- [ ] **Step 5: Verificar y commitear**

```bash
cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npx jest && npx eslint src/pos
git commit -m "Manage POS products and catalogues per branch"
```

---

## Task 5: Ventas

**Files:** `apps/api/src/pos/sales/sales.service.ts`, `sales.service.spec.ts`, `sales.controller.ts`, DTOs

- [ ] **Step 1: Escribir las pruebas primero**

Cubrir, con dobles escritos a mano:

1. **Descuenta stock** de los ítems con `productId`, y **no** de los ítems sueltos (servicios sin producto).
2. **El número de factura reutiliza el primer hueco** por encima del piso: con facturas 4 y 6 usadas, la siguiente es 5.
3. **La numeración es por sucursal**: la sucursal B empieza por su cuenta aunque A ya tenga facturas.
4. **Pago dividido**: `[{efectivo, 10000}, {tarjeta, 5000}]` crea dos filas de pago; **la suma debe cuadrar con el total** o devuelve 400.
5. **Anular**: pone `VOIDED`, `invoiceNumber = null` y **devuelve el stock**.
6. **Anular dos veces** devuelve 400.
7. **Nota crédito**: pone `CREDIT_NOTE`, **conserva** el `invoiceNumber` y devuelve el stock.
8. **Nota crédito sobre una venta anulada** devuelve 400 (`app.py` línea 517).
9. **Vender más unidades que el stock disponible** devuelve 400.

El punto 9 **no está en `app.py`** — allí el stock puede quedar negativo. Es una corrección deliberada: un inventario negativo no significa nada y ensucia el cierre.

El punto 4 tampoco está en `app.py`, que parte una cadena `"efectivo:1000,tarjeta:500"` con `try/except: pass` (línea 436) y se traga los errores en silencio. Aquí se recibe un arreglo tipado y se valida la suma.

- [ ] **Step 2: Verlas fallar, luego implementar**

`createSale` corre **entera dentro de una transacción** (`$transaction`): el número de factura, la venta, sus ítems, sus pagos y el descuento de stock, o todo o nada. Sin transacción, dos cajeros vendiendo a la vez pueden llevarse el mismo número de factura.

`nextInvoiceNumber(tx, tenantId, branchId)` replica `_next_factura_num` de `app.py` (línea 369): lee el piso de la configuración (por ahora, constante `INVOICE_NUMBER_FLOOR = 3` con un comentario `ponytail:` diciendo que se hará configurable cuando alguien lo pida), busca los usados **de esa sucursal** y devuelve el primer libre.

- [ ] **Step 3: Controlador**

`POST /pos/sales` (`ADMIN` y `CASHIER`), `GET /pos/sales` con paginación (reutilizar `PaginationQueryDto`, y **una clase DTO propia** — un tipo intersección hace que Nest se salte la transformación, cosa que ya rompió tres endpoints en este proyecto), `GET /pos/sales/:id`, `POST /pos/sales/:id/void` y `POST /pos/sales/:id/credit-note` (**solo `ADMIN`**, como en `app.py`).

- [ ] **Step 4: Verificar contra la API viva**

Crear una venta real con dos ítems, uno con descuento; comprobar el total, que el stock bajó y que el número de factura es el esperado. Anularla y comprobar que el stock volvió y el número quedó libre. Crear otra y comprobar que **reutiliza** ese número. Reportar las respuestas literales.

- [ ] **Step 5: Commit**

```bash
git commit -m "Sell, void and credit-note from the new POS"
```

---

## Task 6: Las tres pantallas

**Files:** `apps/web/src/app/(app)/pos/vender/page.tsx`, `productos/page.tsx`, `ventas/page.tsx`, `apps/web/src/lib/pos-types.ts`, `nav-config.ts`

- [ ] **Step 1: Menú real del POS**

En `nav-config.ts`, `POS_NAV` pasa a:

```ts
export const POS_NAV: NavItem[] = [
  { href: '/pos/vender', label: 'Vender', icon: ShoppingCart },
  { href: '/pos/productos', label: 'Productos', icon: Package },
  { href: '/pos/ventas', label: 'Ventas', icon: Receipt },
];
```

`/pos` a secas redirige a `/pos/vender`.

- [ ] **Step 2: Las pantallas**

Con los componentes de shadcn que ya usa el taller — heredan el naranja Mobulaa sin trabajo extra. Mirar `apps/web/src/app/(app)/inventory/` como referencia de tabla con búsqueda y diálogo de edición.

**Vender** es la pantalla crítica: buscador de productos, carrito con cantidad y descuento por línea, descuento general, selector de método de pago con opción de dividir, y un total grande y legible. El botón de cobrar es `variant="default"` — naranja con letra oscura, 6,28:1 de contraste, que es justo el motivo de haber elegido letra oscura.

**Productos** solo lo edita `PosRole.ADMIN`; un cajero lo ve en modo lectura.

- [ ] **Step 3: Verificar**

```bash
cd apps/web && npx tsc --noEmit && npx eslint src/app/\(app\)/pos src/lib/pos-types.ts
cd ../.. && pnpm --filter @taller/web build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "Sell from the browser"
```

---

## Task 7: Pruebas de humo y cierre de la fase

- [ ] **Step 1: Ampliar `scripts/pruebas-humo.sh`**

Sección `POS` con: el cajero **sí** entra a `/pos/products`, `/pos/lists` y `/pos/sales`; el cajero **no** puede crear un producto (403, solo ADMIN); un usuario **solo del taller** recibe **403 en todo `/pos/*`** — este último es el espejo de las comprobaciones de la Fase 1 y el que demuestra que el aislamiento funciona en los dos sentidos.

- [ ] **Step 2: Todo verde**

```bash
cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npx jest
cd ../.. && pnpm --filter @taller/web build && bash scripts/pruebas-humo.sh
```

- [ ] **Step 3: Commit**

```bash
git commit -m "Cover the POS in the smoke test"
```

---

## Notas para quien implemente

**Lo que esta fase NO hace:** separados (Fase 3), reportes, exportaciones ni cierre mensual (Fase 4). No importa datos de `motopos.db` — el POS arranca vacío por decisión del usuario.

**Tres sitios donde es fácil equivocarse:**

1. **Los dos clientes de Prisma se parecen y no son el mismo.** `PrismaService` es el taller; `PosPrismaService` es el POS. Importar el equivocado compila y falla en tiempo de ejecución.
2. **Todo endpoint del POS necesita `@PosRoles(...)`.** Sin él, el guard exige rol de taller y el cajero queda fuera de su propio sistema. Esto se descubrió por las malas en la Fase 1.
3. **Nunca convertir `Decimal` a `number` para operar.** Ni siquiera "solo para redondear". Para eso están `.toFixed()` al presentar y los métodos de `Decimal` al calcular.
