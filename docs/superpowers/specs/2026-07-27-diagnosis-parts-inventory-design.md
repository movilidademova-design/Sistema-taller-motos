# Repuestos en el Diagnóstico (Grupo D) — Diseño

**Fecha:** 2026-07-27
**Estado:** Aprobado por el usuario, pendiente de plan de implementación.

## 1. Objetivo

Hoy, la sección "Repuestos requeridos" de la pestaña Diagnóstico permite al técnico listar repuestos, pero:
- No hay forma de buscar/vincular un producto del inventario (todo es texto libre).
- El stock nunca se descuenta ahí — solo se descuenta más tarde, cuando se aprueba una Cotización, un flujo completamente separado.
- Toda la lista se reemplaza en bloque (borra y recrea) cada vez que se guarda el formulario completo del diagnóstico.

Este diseño mejora esa misma sección para que el técnico pueda elegir entre dos opciones al agregar un repuesto:
1. **Repuesto del inventario**: lo busca por nombre/SKU/código, lo agrega, y el stock se descuenta **al instante**.
2. **Repuesto libre**: nombre, cantidad y observaciones — no toca el inventario, solo existe dentro de esa orden.

No se toca el sistema de Cotizaciones (ya construido, ya revisado, fuera de alcance) — esta es una vía adicional para registrar repuestos *usados* durante el diagnóstico/reparación, independiente del proceso de cotizar y aprobar precios con el cliente.

## 2. Decisiones ya confirmadas con el usuario

- Es la **misma** sección "Repuestos requeridos" del Diagnóstico, mejorada — no una sección nueva separada.
- El descuento de stock ocurre **al instante**, con un botón "Agregar" propio por cada repuesto — no como parte del guardado general del formulario de diagnóstico.
- Al **eliminar** un repuesto que vino del inventario, el stock se **restaura automáticamente** (movimiento de ajuste inverso). Los repuestos libres se eliminan sin ningún efecto en inventario.

## 3. Modelo de datos

Se agrega un campo a `DiagnosisPart` (el `productId` opcional ya existe):

```prisma
model DiagnosisPart {
  id           String     @id @default(uuid())
  diagnosisId  String
  diagnosis    Diagnosis  @relation(fields: [diagnosisId], references: [id], onDelete: Cascade)
  productId    String?
  product      Product?   @relation(fields: [productId], references: [id], onDelete: SetNull)
  description  String
  quantity     Int        @default(1)
  unitCost     Decimal    @db.Decimal(10, 2)
  observations String?    // NUEVO

  @@map("diagnosis_parts")
}
```

## 4. Backend

### 4.1 Se elimina el manejo en bloque de `requiredParts`

`UpsertDiagnosisDto` (`apps/api/src/orders/diagnosis/dto/upsert-diagnosis.dto.ts`) pierde el campo `requiredParts` y su `DiagnosisPartDto` anidado. `DiagnosisService.upsert` deja de hacer `deleteMany`/`createMany` sobre `diagnosisPart` — sigue manejando el resto de los campos del diagnóstico exactamente igual que hoy.

Razón: si se dejara el reemplazo en bloque activo junto a los nuevos endpoints incrementales, guardar el resto del formulario (ej. solo cambiar "Falla encontrada") borraría repuestos de inventario ya agregados **sin revertir el descuento de stock** — un bug real de inventario fantasma.

### 4.2 Endpoints nuevos

En `apps/api/src/orders/diagnosis/diagnosis.controller.ts` (mismos roles que el `PUT` existente: `ADMIN, MANAGER, TECHNICIAN`):

- `POST /orders/:orderId/diagnosis/parts` — agrega un repuesto.
  - Body: `{ productId?: string; description: string; quantity: number; observations?: string }`.
  - Si la orden no tiene `Diagnosis` todavía, se crea uno vacío automáticamente (`description: ''`, `faultFound: ''`, `technicianId` = usuario autenticado) — así el técnico puede empezar a agregar repuestos antes de llenar el resto del formulario.
  - Si `productId` viene: valida que el producto pertenezca al tenant; valida stock suficiente (igual que `ProductsService.adjustStock`, bloquea con 400 si quedaría negativo); dentro de una transacción: descuenta `product.quantity`, crea un `InventoryMovement` (`SALE_OUT`, `orderId` de la orden, razón `"Usado en diagnóstico — orden #<orderNumber>"`), y crea el `DiagnosisPart` con `unitCost` tomado de `product.unitCost` (no lo escribe el técnico).
  - Si no viene `productId` (repuesto libre): crea el `DiagnosisPart` con `unitCost: 0`, sin ningún movimiento de inventario.
- `DELETE /orders/:orderId/diagnosis/parts/:partId` — elimina un repuesto.
  - Si el repuesto tiene `productId`: dentro de una transacción, incrementa `product.quantity` de vuelta, crea un `InventoryMovement` (`ADJUSTMENT_IN`, razón `"Reversión — repuesto eliminado de orden #<orderNumber>"`), y elimina el `DiagnosisPart`.
  - Si no tiene `productId`: solo elimina el `DiagnosisPart`.

## 5. Frontend

- `apps/web/src/components/orders/diagnosis-tab.tsx`: la sección "Repuestos requeridos" deja de ser un array en estado local que se edita libremente y se envía junto con el resto del formulario — pasa a reflejar directamente `diagnosis.requiredParts` (los datos ya guardados en el servidor). Cada fila existente muestra: descripción, cantidad, un indicador "Inventario"/"Repuesto libre", observaciones (si las hay), y un botón eliminar que llama al `DELETE` de inmediato y refresca.
- Nuevo componente de búsqueda de inventario: campo de texto con búsqueda (debounce) contra `GET /inventory/products?search=...&pageSize=10` (endpoint ya existente, sin cambios necesarios), mostrando resultados en un menú desplegable (usando el `Popover` ya disponible en este proyecto — no se agrega ninguna librería nueva de tipo "combobox"). Al elegir un producto, se pide la cantidad y se llama al `POST` de inmediato.
- Alternativa "Repuesto libre": un botón/toggle que revela campos de texto libre (Nombre, Cantidad, Observaciones) con su propio botón "Agregar", que llama al mismo `POST` sin `productId`.
- El resto del formulario de Diagnóstico (descripción técnica, falla encontrada, etc.) sigue guardándose igual que hoy con "Guardar diagnóstico".

## 6. Testing

Sigue el patrón ya establecido en este proyecto: verificación manual (build + smoke test en navegador), ya que los servicios de sub-recursos de órdenes (Diagnosis, Quotation, etc.) no tienen pruebas unitarias de servicio hoy — consistente con el resto del código, no una regresión de este cambio.
