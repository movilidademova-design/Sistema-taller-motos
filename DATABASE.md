# DATABASE.md — La base de datos

Todas las cifras de este documento salieron de consultar la base real el 2026-08-13.

---

## 1. Son dos bases, no una

| Base | Tablas | Claves foráneas | Índices | Contiene |
|---|---|---|---|---|
| `taller_motos` | **28** | 60 | 70 | Clientes, vehículos, órdenes, diagnósticos, cotizaciones, facturas, inventario, compras, usuarios, sucursales, auditoría |
| `motopos` | **9** | 6 | 20 | Productos del POS, ventas, pagos, separados, recibos, catálogos |

**Están separadas a propósito.** El propio esquema del POS lo explica: `tenantId`,
`branchId` y `createdById` son texto plano **sin clave foránea**, porque apuntan a la otra
base y no puede haber una relación entre bases distintas. Ese es justamente el aislamiento
que se busca: son dos negocios y ninguna consulta debe poder cruzarlos.

**Consecuencia práctica: todo lo que hagas con una, hazlo con las dos.** Copias de
seguridad, migraciones y restauraciones. Olvidar la del POS es el error más fácil aquí.

---

## 2. Cómo está protegida la integridad

```
Restricciones CHECK ...... 202     (casi todas, validación de los tipos enumerados)
Claves foráneas .......... 60
Índices .................. 70
```

Reglas de borrado en `taller_motos`:

| Regla | Cuántas | Qué significa |
|---|---|---|
| `CASCADE` | 29 | Al borrar el padre se borran los hijos. Se usa donde el hijo no tiene sentido solo (los ítems de una cotización, el historial de una orden). |
| `RESTRICT` | 18 | **Impide borrar** el padre si tiene hijos. Protege el historial: no se puede borrar un cliente que tiene órdenes, ni un producto que tiene movimientos. |
| `SET NULL` | 13 | El hijo sobrevive con el vínculo vacío. Se usa donde el dato histórico importa más que la relación (una orden conserva su historia aunque se desactive al técnico). |

Esta distribución está bien pensada: `RESTRICT` en los sitios donde un borrado destruiría
historial contable, `CASCADE` sólo donde el hijo carece de sentido por sí mismo.

**Comprobado en la práctica:** tras restaurar una copia completa, la consulta de registros
huérfanos devolvió **0 órdenes sin cliente** y **0 órdenes sin vehículo**.

---

## 3. Entidades principales

### Multiempresa y sucursales

```
Tenant (empresa)
 ├── Branch (sucursal)     ← code único por empresa; lleva su propio contador de órdenes
 ├── User                  ← role (taller) y/o posRole (POS); al menos uno obligatorio
 │    └── UserBranch       ← a qué sucursales llega cada usuario
 └── … todo lo demás
```

**Toda tabla de negocio lleva `tenantId`.** Es el eje del aislamiento entre empresas, y
está verificado ejecutándolo: un tenant no alcanza los datos de otro (ver `CODE_AUDIT.md`,
sección 2).

`User.role` y `User.posRole` son ambos opcionales, pero una restricción de base
(`users_at_least_one_role`) impide que los dos queden vacíos: sería una cuenta capaz de
iniciar sesión e incapaz de ir a ninguna parte.

### El ciclo de la orden

```
Client ──< Motorcycle ──< Order
                            ├── OrderPhoto        (INTAKE = evidencia, no se puede borrar)
                            ├── Diagnosis ──< DiagnosisPart
                            ├── Quotation ──< QuotationItem
                            │                └── QuotationStatusHistory
                            ├── OrderStatusHistory
                            ├── InventoryMovement
                            ├── Invoice           (1 a 1: una orden, una factura)
                            └── Notification
```

Detalles con intención:
- `Order.orderNumber` es único **por empresa**, y la numeración la lleva cada sucursal
  (`Branch.nextOrderNumber`), no la empresa.
- `Invoice.orderId` es **único**: una orden no se puede facturar dos veces. Verificado: el
  segundo intento devuelve `409`.
- `OrderPhoto.stage` distingue las fotos de recepción (`INTAKE`) de las del trabajo
  (`WORK`). Las de recepción **no se pueden borrar**: son la prueba del estado en que
  llegó el vehículo, y la firma del cliente se apoya en ellas.

### El punto de venta

```
PosProduct ──< PosSaleItem >── PosSale ──< PosSalePayment
     └───────< PosLayawayItem >── PosLayaway ──< PosLayawayPayment
```

- `PosSale.invoiceNumber` es **único por (empresa, sucursal)** y **anulable**: al anular
  una venta el número se libera y lo reutiliza la siguiente. Es una decisión fiscal
  deliberada del proyecto, no un descuido.
- Los ítems guardan una **copia congelada** del nombre y el precio: editar el producto
  después no altera una venta ya registrada. Verificado.

---

## 4. Todo el dinero es `Decimal`

Cada importe está declarado como `Decimal` en el esquema y se manipula con
`Prisma.Decimal` en el código. **No encontré ni un solo cálculo monetario en coma
flotante** en toda la auditoría.

Importa más de lo que parece: en coma flotante, `0.1 + 0.2` no da `0.3`. En un sistema que
factura, ese error se acumula silenciosamente hasta que un cierre mensual no cuadra por
unos céntimos que nadie sabe explicar.

Verificado ejecutándolo: una cotización de `1.350.000` con IVA del 19% dio exactamente
`256.500` de impuesto y `1.606.500` de total, y la factura generada después coincidió al
céntimo.

---

## 5. Migraciones

### Estado actual

- `taller_motos`: **19 migraciones** en `apps/api/prisma/migrations/`
- `motopos`: **2 migraciones** en `apps/api/prisma/pos/migrations/`

### Aplicarlas

```bash
pnpm --filter @taller/api prisma:deploy     # base del taller
pnpm --filter @taller/api pos:migrate       # base del POS
```

`prisma migrate deploy` sólo aplica lo pendiente y **no borra nada**. Es idempotente:
ejecutarlo dos veces no hace daño (comprobado: la segunda vez responde
«No pending migrations to apply»).

> ⚠️ **Nunca uses `prisma migrate dev` ni `prisma migrate reset` en producción.** El modo
> `dev` puede decidir que la base hay que recrearla, y `reset` **la vacía entera**.

### Crear una migración nueva (sólo en desarrollo)

```bash
# 1. Edita apps/api/prisma/schema.prisma
# 2. Genera la migración
cd apps/api && npx prisma migrate dev --name descripcion_del_cambio
```

Si el entorno no es interactivo, Prisma se niega. En ese caso se escribe el SQL a mano —
es lo que se hizo con la migración `20260813120000_refresh_token_hash_index` de esta
auditoría, y tiene la ventaja de que controlas el SQL exacto:

```bash
mkdir -p apps/api/prisma/migrations/$(date +%Y%m%d%H%M%S)_mi_cambio
# escribe el SQL en migration.sql, luego:
pnpm --filter @taller/api prisma:deploy
```

> Antes de añadir una restricción `UNIQUE` a una tabla con datos, **comprueba que no hay
> duplicados** o la migración fallará a medias:
> ```sql
> SELECT count(*) FROM (SELECT campo FROM tabla GROUP BY campo HAVING count(*)>1) d;
> ```

### Base de datos nueva desde cero

```bash
docker compose up -d postgres
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "CREATE DATABASE motopos;"
pnpm --filter @taller/api prisma:generate
pnpm --filter @taller/api pos:generate
pnpm --filter @taller/api prisma:deploy
pnpm --filter @taller/api pos:migrate
```

Para desarrollo, además: `pnpm --filter @taller/api prisma:seed` — crea datos de
demostración con la contraseña `Password123!`. **Nunca en producción.**

---

## 6. Transacciones y concurrencia

Las operaciones que tocan varias tablas corren dentro de `$transaction`: o todo, o nada.
Cubre la venta del POS, el separado, la aprobación de cotización y la recepción de órdenes.

**Pero una transacción da atomicidad, no serialización.** Es la confusión que causó los
tres fallos más graves de esta auditoría, todos reproducidos contra PostgreSQL real:

| Problema | Qué pasaba | Cómo está resuelto |
|---|---|---|
| Recibos de separado duplicados | Dos abonos simultáneos guardaban el **mismo número** sin error | `pg_advisory_xact_lock` por (sucursal, serie) |
| Colisión de número de factura | La segunda venta simultánea moría con violación de unicidad | El mismo bloqueo |
| Stock negativo | Dos ventas de la última unidad dejaban el stock en **−1** | Descuento condicional: `updateMany({ where: { stock: { gte: n } } })` y comprobar `count` |

El bloqueo consultivo se toma dentro de la transacción y **se libera solo** al terminar,
tanto si confirma como si deshace: no hay forma de dejarlo colgado.

Hay una prueba permanente que lo verifica contra PostgreSQL real:

```bash
pnpm --filter @taller/api test:concurrency
```

Sale con código 1 si alguna carrera vuelve a abrirse. **Estas tres carreras no se pueden
detectar con mocks**: los tests unitarios comprueban que se pide el bloqueo y que el
descuento es condicional, pero que *funcione de verdad* sólo lo demuestra PostgreSQL
ejecutando transacciones simultáneas.

---

## 7. Consultas de salud

```bash
PSQL="docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos"
```

**Registros huérfanos** (deben dar 0):

```sql
SELECT count(*) FROM orders o LEFT JOIN clients c ON o."clientId"=c.id WHERE c.id IS NULL;
SELECT count(*) FROM orders o LEFT JOIN motorcycles m ON o."motorcycleId"=m.id WHERE m.id IS NULL;
SELECT count(*) FROM motorcycles m LEFT JOIN clients c ON m."clientId"=c.id WHERE c.id IS NULL;
```

**Coherencia del dinero** — facturas cuyo total no cuadra con su cotización:

```sql
SELECT i."invoiceNumber", i.total, q.total
FROM invoices i JOIN quotations q ON q."orderId" = i."orderId"
WHERE abs(i.total - q.total) > 0.01;
```

**Stock negativo** (en la base del POS; con el arreglo aplicado debe dar 0):

```sql
SELECT id, name, stock FROM pos_products WHERE stock < 0;
```

**Números de recibo duplicados por sucursal** (debe dar 0):

```sql
SELECT l."branchId", p."receiptNumber", count(*)
FROM pos_layaway_payments p JOIN pos_layaways l ON p."layawayId" = l.id
WHERE p."receiptNumber" IS NOT NULL
GROUP BY 1,2 HAVING count(*) > 1;
```

**Tamaño de las tablas** (para detectar crecimiento descontrolado):

```sql
SELECT relname, n_live_tup AS filas,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamano
FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 15;
```

---

## 8. Cosas que conviene vigilar

### `refresh_tokens` crece sin parar

Cada inicio de sesión y cada renovación crea una fila. Con renovación cada 15 minutos, un
equipo de 10 personas genera unas 300 filas al día.

**Ya está mitigado**: la migración `20260813120000` añadió índice único en `tokenHash`
(antes cada renovación recorría la tabla entera) e índice en `expiresAt`, y `AuthService`
borra de forma oportunista los caducados. Aun así, vigílala:

```sql
SELECT count(*) FROM refresh_tokens;
```

Si pasa de unos pocos miles con pocos usuarios, algo no está limpiando.

### `audit_logs` también crece

Registra cada operación de escritura. No hay borrado automático **a propósito**: es
información de auditoría. Decide una política de conservación antes de que ocupe de más:

```sql
DELETE FROM audit_logs WHERE "createdAt" < now() - interval '1 year';
```

### El «primer hueco libre» de la numeración se degrada

`nextInvoiceNumber` y `nextReceiptNumber` traen **todos** los números usados de la sucursal
a memoria en cada venta, para buscar el primer hueco. Con 50.000 ventas son 50.000 filas
en cada cobro, dentro de la transacción. Funciona, pero crece linealmente y para siempre.
Documentado como hallazgo **M-5** en `CODE_AUDIT.md`.

---

## 9. Copias de seguridad

Procedimiento completo, con comandos probados de verdad, en
**[BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)**.

Lo esencial:

```bash
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc taller_motos > taller_motos.dump
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc motopos       > motopos.dump
```

**Las dos.** Y una vez al mes, comprueba que una copia se puede restaurar de verdad.
