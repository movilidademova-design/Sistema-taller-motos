# Sección Cotizaciones + limpieza de Pagos y Garantías — Diseño y Plan

**Fecha:** 2026-08-04
**Estado:** Aprobado por el usuario.

Continúa `2026-08-04-cotizaciones-design.md`, que dejó el módulo funcionando pero escondido en una pestaña dentro de la orden. Este documento lo saca a su propio lugar y quita de en medio lo que no se usa.

## 1. Qué cambia y por qué

| Hoy | Después |
|---|---|
| La cotización vive en una pestaña dentro de la orden | Sección propia **Cotizaciones** en el menú, con contador de pendientes |
| Para saber si hay algo por revisar hay que entrar orden por orden | El contador del menú lo dice |
| Menú de 12 ítems, con Pagos y Garantías sin usar (0 registros) | 10 ítems |
| El formulario de registrar pago vive dentro de la orden | Se elimina |

El objetivo del usuario, textual: *"lo más fácil posible para entender y manejar, sin que se pierda la información o no quede registrada"*.

## 2. Decisiones confirmadas

- **Un solo lugar para trabajar la cotización.** La pestaña dentro de la orden desaparece; en su lugar queda una línea de resumen con enlace. Que dos pantallas editen lo mismo es la forma más fácil de que se contradigan.
- **El contador cuenta solo `PENDING_REVIEW`**, no las enviadas. Una cotización enviada espera al cliente, no al personal: si contara, el número nunca llegaría a cero y dejaría de significar algo.
- **Pagos y Garantías se eliminan por completo** — menú, tablas, endpoints, y el formulario de pago dentro de la orden. Ambas tablas tienen **0 registros**.
- **Facturas se queda.** Se siguen generando facturas y su PDF.

## 3. Consecuencia que hay que resolver: `amountPaid`

`Invoice.amountPaid` solo lo actualizaba `PaymentsService`. Sin pagos queda congelado en 0 para siempre, así que estas tres cosas mostrarían números falsos:

| Dónde | Columna | Qué mostraría |
|---|---|---|
| Export de Facturas | "Pagado" | siempre 0 |
| Export de Facturas | "Saldo pendiente" | siempre el total completo |
| Reporte de Ingresos | "Total cobrado" / "Saldo pendiente" | lo mismo |

**Decisión: se eliminan esas columnas.** Un reporte de dinero que siempre miente es peor que uno que no lo dice. El reporte de Ingresos queda con Periodo, Sucursal, Órdenes entregadas, Facturas y Total facturado.

El campo `amountPaid` se conserva en la base de datos (no estorba y evita una migración más); simplemente ya nada lo lee.

El Panel también calculaba "ingresos de hoy/del mes" sumando pagos. Pasa a sumar **facturas emitidas** en el periodo, que es la fuente que sobrevive y la misma que usa el reporte de Ingresos — hoy los dos números salen de sitios distintos.

## 4. Backend

### 4.1. Endpoint de lista

`QuotationsController` está montado en `orders/:orderId/quotation`. Se agrega un controller nuevo montado en `quotations` para la lista:

```
GET /quotations?status=PENDING_REVIEW   → lista con orden, cliente, vehículo y total
GET /quotations/pending-count           → { count } para el contador del menú
```

Roles `ADMIN, MANAGER, RECEPTIONIST`, filtrado por la sucursal activa a través de `order.branchId` (una cotización pertenece a la orden, y la orden a una sucursal).

Las acciones (editar, PDF, enviar, cambiar estado) **no se duplican**: siguen viviendo en `orders/:orderId/quotation`, que ya está construido y probado. La pantalla nueva las llama con el `orderId` que trae cada fila.

### 4.2. Eliminaciones

- Borrar `apps/api/src/payments/` y `apps/api/src/warranties/` completos, y su registro en `app.module.ts`.
- Del esquema: modelos `Payment` y `Warranty`, enums `PaymentMethod` y `WarrantyStatus`, y las relaciones inversas en `Tenant`, `Client`, `Order`, `Motorcycle`, `Invoice` y `User`.
- `ORDER_DETAIL_INCLUDE` deja de incluir `payments` y `warranties`.
- `DashboardService`: los ingresos salen de facturas; se elimina `activeWarranties`.
- `ReportsService` y el export de facturas: fuera las columnas de cobrado/saldo.

## 5. Frontend

### 5.1. Sección Cotizaciones

- `nav-config.ts`: se agrega `{ href: '/quotations', label: 'Cotizaciones', roles: ['ADMIN','MANAGER','RECEPTIONIST'] }` justo después de Órdenes, y se eliminan las entradas de Pagos y Garantías.
- El contador del menú pasa a leer `/quotations/pending-count` en vez de contar órdenes en `WAITING_APPROVAL` (más preciso: cuenta cotizaciones por revisar, no órdenes).
- `/quotations` — lista agrupada por estado, con las de revisar primero. Cada fila: número de orden, cliente, vehículo, cantidad de repuestos, total, cuándo y quién la generó.
- `/quotations/[orderId]` — el detalle. **Reutiliza el componente `QuotationTab` que ya existe**, con la cabecera de cliente/vehículo/orden encima y un enlace a la orden.

### 5.2. Detalle de la orden

- Se elimina la pestaña Cotización (quedan Diagnóstico, Fotos, Historial).
- Se elimina `RecordPaymentForm` y todo lo de pagos dentro de `InvoiceActions`; se conserva generar factura y ver su PDF.
- Se agrega una línea de resumen: `Cotización: Enviada — $515.000 ›` enlazando a `/quotations/[orderId]`. Si no hay cotización, no se muestra nada.

### 5.3. Páginas eliminadas

`/payments` y `/warranties` con sus componentes y tipos.

## 6. Plan de implementación

- [x] **Task 1 — Backend: eliminar Pagos y Garantías.** Borrar ambos módulos, quitarlos de `app.module.ts` y del esquema (modelos, enums, relaciones inversas), migración, quitar `payments`/`warranties` de `ORDER_DETAIL_INCLUDE`, y ajustar `DashboardService` (ingresos desde facturas, fuera `activeWarranties`). Verificar build+tests y commitear.
- [x] **Task 2 — Backend: columnas de dinero que ya no aplican.** Quitar "Pagado" y "Saldo pendiente" del export de Facturas y "Total cobrado"/"Saldo pendiente" del reporte de Ingresos. Actualizar `reports.service.spec.ts`, que los verifica.
- [x] **Task 3 — Backend: lista de cotizaciones.** Controller nuevo en `quotations` con `GET /` (filtro por estado, alcance por sucursal) y `GET /pending-count`. Tests del alcance por sucursal y del conteo.
- [x] **Task 4 — Frontend: sección Cotizaciones.** `nav-config.ts` (agregar Cotizaciones, quitar Pagos y Garantías), páginas `/quotations` y `/quotations/[orderId]` reutilizando `QuotationTab`, y el contador leyendo `/quotations/pending-count`.
- [x] **Task 5 — Frontend: limpiar la orden.** Quitar la pestaña Cotización, quitar `RecordPaymentForm` y lo de pagos de `InvoiceActions`, agregar la línea de resumen con enlace. Borrar `/payments` y `/warranties` y sus tipos.
- [x] **Task 6 — Verificación.** Build+tests de ambos lados, y prueba manual del flujo completo: técnico genera → aparece en la sección con contador → revisar, PDF, enviar → aprobar → el contador baja.

## 7. Qué NO incluye

- Marcar facturas como pagadas a mano (sin el módulo de pagos, una factura no cambia de estado). Si más adelante hace falta cobrar, es una funcionalidad aparte.
- La API de Meta para adjuntar el PDF (sigue pendiente de la fase anterior).
- Reactivar garantías en otra forma.
