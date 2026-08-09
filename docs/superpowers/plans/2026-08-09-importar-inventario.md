# Importar inventario desde Excel: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Cargar y actualizar el inventario del POS subiendo el mismo archivo de Excel que el sistema ya exporta, y traer de una vez los 50 productos que viven en MotoPos.

**Architecture:** No se inventa un formato nuevo. La exportación de productos que ya existe (`GET /pos/products/export`, Fase 4) **es** la plantilla: se descarga, se edita en Excel y se vuelve a subir. La importación tiene un paso de previsualización obligatorio y escribe todo dentro de una transacción.

---

## Lo que ya existe y hay que reutilizar

- **La exportación**, en `apps/api/src/pos/products/products.service.ts`: columnas `Referencia · Nombre · Categoría · Color · Proveedor · Precio venta · Costo · Stock · Valorización`. **Son exactamente las columnas de entrada**, menos `Valorización`, que es calculada y se ignora al leer.
- **`exceljs`** ya es dependencia y sabe **leer** (`workbook.xlsx.load(buffer)`), no solo escribir.
- **`FileInterceptor`** de `@nestjs/platform-express`, ya usado en `apps/api/src/orders/photos/photos.controller.ts`. Copiar ese patrón, incluidos sus límites de tamaño.
- `downloadFile()` en `apps/web/src/lib/api.ts` para bajar la plantilla.

No hace falta ninguna dependencia nueva.

---

## Decisiones tomadas

**1. Un producto se identifica por `referencia + color`.** Verificado contra los datos reales: las referencias **se repiten** entre colores — `EB-11U` es a la vez "Apolo Negro Plomo" y "Apolo Gris Plomo". Usar la referencia sola machacaría un producto con otro.

Regla derivada, que hay que implementar explícitamente: **una fila sin referencia siempre crea un producto nuevo**, nunca actualiza. No hay con qué emparejarla. De los 50 productos reales, 1 está en ese caso.

La comparación es **sin distinguir mayúsculas y con los espacios de los extremos recortados**: `EB-11U` y `eb-11u ` son el mismo producto. Quien edita en Excel no debería perder una tarde por un espacio.

**2. La previsualización es obligatoria.** El endpoint que analiza el archivo **no escribe nada**. Devuelve cuántos se crean, cuántos se actualizan y qué filas tienen error, con el número de fila del Excel para poder ir a buscarla. Solo una segunda llamada, explícita, aplica los cambios.

**3. Todo o nada.** La aplicación corre dentro de `$transaction`. Un archivo a medio aplicar deja un inventario que nadie sabe interpretar.

**4. Importar no borra.** Un producto que está en el sistema pero no en el archivo **se queda como está**. Dar de baja se hace a mano, desde la pantalla. Un archivo incompleto no debe vaciar el inventario.

**5. El stock del archivo reemplaza al del sistema**, no se suma. Es una hoja de inventario, no un movimiento de entrada. Va dicho en la pantalla para que nadie se confunda.

---

## Estructura de archivos

**Se crean:**

| Archivo | Responsabilidad |
|---|---|
| `apps/api/src/pos/products/product-import.util.ts` | Función pura: hoja de cálculo → filas validadas + errores. **Sin base de datos** |
| `apps/api/src/pos/products/product-import.util.spec.ts` | Pruebas del análisis y de la validación |
| `apps/api/src/pos/products/products-import.service.spec.ts` | Pruebas del emparejado y de la escritura |
| `apps/web/src/app/(app)/pos/productos/importar/page.tsx` | Pantalla de tres pasos |
| `scripts/exportar-productos-motopos.py` | Una sola vez: `motopos.db` → `.xlsx` con el formato de la plantilla |

**Se modifican:** `products.service.ts` (métodos `previewImport` y `applyImport`), `products.controller.ts` (dos endpoints), y la pantalla de productos (botón "Importar").

---

## Task 1: El analizador (función pura)

**Files:** `product-import.util.ts`, `product-import.util.spec.ts`

Es donde vive el riesgo real: un archivo que la gente edita a mano llega con de todo.

**Pruebas primero.** Casos obligatorios:

1. Una hoja bien formada devuelve las filas con sus tipos correctos.
2. **Los encabezados se reconocen sin distinguir mayúsculas ni tildes**: `categoria`, `Categoría` y `CATEGORÍA` son la misma columna. Quien edita en Excel no debería fallar por una tilde.
3. Falta una columna obligatoria → error claro que la nombra.
4. Precio no numérico → error **con el número de fila del Excel**, no un mensaje genérico.
5. Categoría inexistente → error que **lista las válidas** (`MOTO`, `ACCESORIO`, `REPUESTO`, `TALLER`), y acepta minúsculas: `moto` vale.
6. Nombre vacío → error.
7. Precio o stock negativo → error.
8. **La columna `Valorización` se ignora**: es calculada en la exportación, y si alguien reexporta y vuelve a subir, no debe estorbar.
9. Filas totalmente vacías se saltan sin quejarse — Excel las deja al final todo el tiempo.
10. **Dos filas con la misma referencia y color dentro del MISMO archivo** → error. Si no, una pisa a la otra y el resultado depende del orden.

Devuelve `{ rows: ParsedRow[], errors: ImportError[] }`, con `ImportError = { row: number, message: string }`.

Los números llegan como texto de Excel a veces: convertir a `Decimal` desde la cadena, **nunca pasando por `parseFloat`**.

---

## Task 2: Previsualizar y aplicar

**Files:** `products.service.ts`, `products-import.service.spec.ts`, `products.controller.ts`

`previewImport(tenantId, branchId, buffer)`:
- Analiza con la utilidad de la Task 1.
- Busca los existentes de **esa sucursal** por `referencia + color` (normalizados).
- Devuelve `{ toCreate: n, toUpdate: n, errors: [...], rows: [...] }` para pintar la previsualización.
- **No escribe nada.**

`applyImport(tenantId, branchId, buffer)`:
- Vuelve a analizar (el archivo se manda otra vez; no se guarda estado entre llamadas — es más simple y no deja archivos temporales colgando).
- **Si hay un solo error, rechaza el archivo entero** con 400. Nada de aplicar "las buenas".
- Dentro de `$transaction`: crea las nuevas, actualiza las existentes.
- Devuelve `{ created: n, updated: n }`.

Pruebas: que el emparejado sea por referencia+color normalizados; que una fila sin referencia siempre cree; que un archivo con errores no escriba **nada**; que se respete el `branchId`.

**Endpoints**, ambos `@PosRoles(PosRole.ADMIN)` — cargar inventario no es tarea de un cajero:
- `POST /pos/products/import/preview` (multipart, `FileInterceptor('file')`)
- `POST /pos/products/import`

---

## Task 3: La pantalla

**File:** `apps/web/src/app/(app)/pos/productos/importar/page.tsx`, más un botón "Importar" en la pantalla de productos (solo ADMIN).

Tres pasos en una sola página:

1. **Descargar plantilla** — botón que llama a `downloadFile('/pos/products/export', 'plantilla-productos.xlsx')`. Con un texto que explique que se puede bajar el inventario actual, editarlo y volver a subirlo.
2. **Elegir archivo** → llama a la previsualización → muestra un resumen (**X nuevos · Y se actualizan · Z con error**) y, si hay errores, **la tabla de errores con su número de fila**. Con errores, el botón de confirmar queda deshabilitado.
3. **Confirmar** → aplica y muestra el resultado, con enlace de vuelta a productos.

Avisar en pantalla, con todas las letras: **el stock del archivo reemplaza al del sistema**, y **importar nunca da de baja productos**.

---

## Task 4: Traer los 50 de MotoPos

**File:** `scripts/exportar-productos-motopos.py`

Python con `sqlite3` (de la biblioteca estándar) y `openpyxl` (ya instalado con MotoPos). Lee `motopos/motopos.db`, toma los productos con `activo=1` y escribe un `.xlsx` **con los mismos encabezados que la plantilla**.

Conversiones necesarias:
- `categoria` de MotoPos está en minúsculas (`moto`, `taller`) → mayúsculas del enum.
- `costo` viene en 0 en todos los registros: se deja en 0 y **se avisa en la salida del script**, porque hace que los reportes de ganancia salgan inflados hasta que se llenen.

Luego se importa ese archivo **por la pantalla nueva**, no por un camino aparte. Así la carga inicial usa exactamente el mismo código que usará el usuario para siempre, y queda probado de verdad.

Verificación: los 50 productos aparecen en la sucursal correcta, con su precio, referencia, color y proveedor; y **volver a importar el mismo archivo actualiza los 50, no crea 50 duplicados**. Esa segunda pasada es la prueba de que el emparejado funciona.

---

## Notas

- **Dos clientes de Prisma**: aquí todo es `PosPrismaService`.
- **Nunca `parseFloat`** para dinero: de cadena a `Decimal` directo.
- El tope de filas: reutilizar `MAX_ROWS` de `excel.service.ts` para rechazar un archivo absurdo antes de analizarlo entero.
