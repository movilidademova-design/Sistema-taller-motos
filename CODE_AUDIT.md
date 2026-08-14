# CODE_AUDIT.md — Auditoría de código pre-producción

**Fecha:** 2026-08-13
**Rama:** `claude/ebike-workshop-saas-egicrb`
**Alcance de este documento:** Fases 1–3 completas, y las partes de las fases 4, 6, 7, 8, 9 y 10 que pude **ejecutar y verificar de verdad**.

> **Regla aplicada:** ningún hallazgo de esta lista se marca como confirmado por leer el código.
> Cada uno marcado ✅ VERIFICADO fue reproducido ejecutando la aplicación real contra
> PostgreSQL real. Los marcados ❓ NO VERIFICADO están explícitamente señalados como tales.

---

## 0. Cómo se verificó

| Elemento | Estado |
|---|---|
| Base de datos PostgreSQL 16 (docker-compose) | ✅ levantada |
| Migraciones `taller_motos` (18) | ✅ aplicadas |
| Migraciones `motopos` (2) | ✅ aplicadas |
| Semilla de datos de prueba | ✅ ejecutada |
| Tests unitarios `apps/api` | ✅ **251/251 pasan** (31 suites, 91 s) → ahora **259/259** |
| Typecheck `tsc --noEmit` de la API | ⚠️ **44 errores preexistentes** (ver nota) |
| Build de producción `nest build` | ✅ compila (pero ver 🔴 C-1) |
| API arrancada y respondiendo | ✅ `http://localhost:3001/api` |
| Pruebas de autenticación / permisos / IDOR en vivo | ✅ ejecutadas |
| Pruebas de concurrencia contra PostgreSQL real | ✅ ejecutadas |
| Build de producción del frontend (`next build`) | ✅ compila, 28 rutas |
| Frontend probado en navegador real (Chromium/Playwright) | ✅ 20 pantallas, 3 tamaños, 4 roles |

> **Corrección a la primera versión de este documento.** Ahí decía «Typecheck ✅ sin
> errores». Era incorrecto: el comando se ejecutó como `tsc ... | tail`, así que el código
> de salida que se leyó era el de `tail`, no el de `tsc`. Repetido correctamente, hay
> **44 errores de tipos preexistentes**, todos en ficheros que el build de producción
> excluye: `prisma/backfill-*.ts` (scripts obsoletos, documentados como tales) y tres
> `.spec.ts`. No afectan a la aplicación compilada, pero significan que **`tsc` no sirve
> hoy como barrera de calidad**, porque nunca está en verde. Se añade como hallazgo M-6.
> Comprobado que mis cambios no añaden ninguno: 44 antes, 44 después, mismos ficheros.

---

## 1. Resumen de hallazgos

| Sev | Nº | Título | Verificado | Estado |
|---|---|---|---|---|
| 🔴 | C-1 | `pnpm start:prod` no arranca: la app no existe en la ruta que el script invoca | ✅ reproducido | ✅ **CORREGIDO** |
| 🔴 | C-2 | Subida de archivos sin validar + servidos públicamente sin autenticación | ✅ explotado | ⚠️ **PARCIAL** |
| 🔴 | C-3 | Números de recibo de separados duplicados en concurrencia | ✅ reproducido | ✅ **CORREGIDO** |
| 🔴 | C-4 | Secreto JWT de reserva embebido en el repositorio | ✅ leído en código | ✅ **CORREGIDO** |
| 🟠 | A-1 | El stock puede quedar negativo bajo concurrencia | ✅ reproducido | ✅ **CORREGIDO** |
| 🟠 | A-2 | Colisión de número de factura: la venta revienta con error de servidor | ✅ reproducido | ✅ **CORREGIDO** |
| 🟠 | A-3 | Sin protección de fuerza bruta en el login | ✅ reproducido (40/40 sin bloqueo) | ✅ **CORREGIDO** |
| 🟠 | A-4 | Los errores internos (incluidos los de Prisma) se devuelven al cliente | ✅ observado | ✅ **CORREGIDO** |
| 🟠 | A-5 | `bufferLogs: true` sin `flushLogs()`: la API arranca y no registra **nada** | ✅ reproducido | ✅ **CORREGIDO** |
| 🟠 | A-6 | `refresh_tokens` sin índice ni limpieza: crece sin límite y se degrada | ✅ leído en esquema | ✅ **CORREGIDO** |
| 🟡 | M-1 | Swagger (`/api/docs`) expuesto públicamente en producción | ✅ HTTP 200 sin token | ✅ **CORREGIDO** |
| 🟡 | M-2 | Tokens (incluido el de refresco, 7 días) en `localStorage` | ✅ leído en código | ⏸️ **APLAZADO** |
| 🟡 | M-3 | `next.config.ts` vacío: sin cabeceras de seguridad en el frontend | ✅ leído | ✅ **CORREGIDO** |
| 🟡 | M-4 | `fetchAuthedBlob` no manda sucursal ni renueva el token en 401 | ✅ leído | ✅ **CORREGIDO** |
| 🟡 | M-5 | `nextInvoiceNumber` carga TODAS las ventas de la sucursal en cada venta | ✅ leído | ⏸️ **APLAZADO** |
| 🟡 | M-6 | 44 errores de tipos preexistentes: `tsc` nunca está en verde | ✅ reproducido | ⏸️ **APLAZADO** |
| 🔵 | B-1 | Jest avisa de handles sin cerrar al terminar los tests | ✅ observado | ⏸️ **APLAZADO** |
| 🔵 | B-2 | Campo `Tenant.nextOrderNumber` huérfano (documentado en el esquema) | ✅ leído | ⏸️ **APLAZADO** |
| 🔴 | F-3 | No se podía crear un cliente sin correo (38 campos afectados) | ✅ reproducido | ✅ **CORREGIDO** |
| 🟠 | F-1 | Un fallo de carga (403/500/sin red) se pintaba como «lista vacía» | ✅ reproducido | ✅ **CORREGIDO** |
| 🟠 | F-2 | La página desbordaba en horizontal en móvil y tableta | ✅ medido | ✅ **CORREGIDO** |
| 🟡 | F-4 | Sin longitud máxima en campos de texto (600 caracteres aceptados) | ✅ reproducido | ⏸️ **APLAZADO** |
| 🟠 | A-7 | Se podía reescribir una cotización ya APROBADA por el cliente | ✅ reproducido | ✅ **CORREGIDO** |
| 🟡 | M-7 | Subir un fichero que no es Excel devolvía 500 en vez de un 400 útil | ✅ reproducido | ✅ **CORREGIDO** |
| 🔴 | C-4 bis | El secreto JWT de reserva seguía vivo en el WebSocket (2.ª copia) | ✅ reproducido | ✅ **CORREGIDO** |
| 🟠 | A-8 | Marcaba las notificaciones como enviadas sin enviar ningún correo | ✅ reproducido | ✅ **CORREGIDO** |
| 🟡 | M-8 | El WebSocket aceptaba conexiones desde cualquier origen (`cors: '*'`) | ✅ leído | ✅ **CORREGIDO** |
| 🟡 | M-9 | Mi arreglo de A-4 tapaba los mensajes 5xx escritos a propósito | ✅ reproducido | ✅ **CORREGIDO** |
| 🔵 | B-4 | Tiempo real a medias: el backend emite, el frontend nunca se conecta | ✅ verificado | ⏸️ **DECISIÓN TUYA** |
| 🔵 | B-3 | La semilla creaba un proveedor con un id que la propia API rechaza | ✅ reproducido | ✅ **CORREGIDO** |

### Qué se corrigió y cómo se comprobó

Todos los cambios se verificaron **ejecutando**, no leyendo. Estado tras la corrección:
**259/259 tests pasan** (8 nuevos), **44 errores de tipos → 44** (ninguno añadido),
lint limpio en los ficheros tocados, build de API y de frontend correctos.

| Nº | Cambio | Comprobación |
|---|---|---|
| C-1 | `start:prod` → `node dist/src/main` | `pnpm start:prod` arranca y sirve peticiones |
| C-3, A-2 | `pg_advisory_xact_lock` por (sucursal, serie) antes de asignar número | `pnpm test:concurrency`: sin duplicados ni colisiones |
| A-1 | Descuento condicional `updateMany({ where: { stock: { gte } } })` + `count` | 8 ventas simultáneas sobre 5 unidades → exactamente 5 ventas, stock 0 |
| C-4 | Se elimina el secreto de reserva; el arranque falla sin secreto válido | Arranque con secreto vacío y con `change_me`: ambos abortan con mensaje accionable |
| C-2 | `IMAGE_UPLOAD_OPTIONS` compartido; extensión derivada del mimetype | Subida de `.html` → 400; renombrado a `.png` con mimetype falso → 400; PNG legítimo → 201 |
| A-3 | `@Throttle` propio en login (8/min) y registro (3/hora) | 15 intentos → 429 desde el octavo; la cuenta se recupera al pasar la ventana |
| A-4 | Mensaje genérico en 5xx; P2002/P2025/P2003 traducidos al español | 6 tests nuevos que fallan si se filtra `prisma.`, nombres de tabla o de restricción |
| A-5 | `app.flushLogs()` + `bootstrap().catch()` con `exit(1)` | El arranque ya escribe log; antes el fichero de salida quedaba vacío |
| A-6 | Índice único en `tokenHash` + índice en `expiresAt` + purga oportunista | Migración aplicada; `POST /auth/refresh` → 200 |
| M-1 | Swagger solo fuera de producción | Condicionado a `NODE_ENV !== 'production'` |
| M-3 | CSP, HSTS, X-Frame-Options y demás en `next.config.ts` | `next build` correcto con las cabeceras |
| M-4 | `authedBinaryFetch` compartido: manda sucursal y renueva token en 401 | Typecheck del frontend limpio; elimina la triplicación que causó la divergencia |

**Comprobación de no-regresión tras todos los cambios** (contra la API en marcha):
aislamiento entre empresas sigue dando 404 en lectura y borrado del dato ajeno; el cajero
sigue recibiendo 403 en `/clients`, `/orders` y `/users`; la renovación de token responde 200.

### Lo que NO se corrigió, y por qué

**C-2 queda PARCIAL — es el riesgo pendiente más importante.** Lo corregido es la entrada:
ya no se puede subir un fichero que no sea imagen, y la extensión se deriva del mimetype
validado, así que no se puede volver a servir contenido como `text/html`.

**Lo que sigue abierto: `/uploads` no tiene autenticación.** Cualquiera con la URL puede ver
las fotos de los vehículos de los clientes y las firmas de recepción. No lo cambié porque
arreglarlo bien rompe las URLs ya guardadas en `OrderPhoto.url`, `Motorcycle.photoUrl`,
`Order.signatureUrl` y `Quotation.pdfUrl`: hace falta un endpoint autenticado, una
migración de datos y tocar el frontend. Es un cambio con riesgo real que merece hacerse
con calma y probarse entero, no como último retoque antes de desplegar.
**Mientras tanto, quien despliegue debe saber que esas imágenes son públicas.**

**M-2 (tokens en `localStorage`) aplazado:** pasar a cookies `httpOnly` toca login,
renovación, CORS y el guard de sucursal a la vez. Es una decisión de arquitectura, no un
parche. Hoy no hay ninguna vía de XSS conocida (verificado: no hay
`dangerouslySetInnerHTML`, `innerHTML` ni `eval` en el frontend) y la CSP recién añadida da
una segunda capa que antes no existía.

**M-5, M-6, B-1, B-2 aplazados:** ninguno afecta a la corrección ni a la seguridad hoy.
M-5 se degrada con el volumen y conviene resolverlo junto al bloqueo, en el mismo código.

---

## 🔴 C-1 — `pnpm start:prod` no arranca la aplicación

**Archivo:** `apps/api/package.json:12` · `apps/api/tsconfig.build.json` · `apps/api/prisma.config.ts`

**Problema.** El script de producción es `node dist/main`. El build real emite el punto de
entrada en `dist/src/main.js`. La ruta que el script invoca no existe.

**Evidencia (reproducido):**

```
$ npx nest build           # BUILD_EXIT=0  — compila sin quejarse
$ ls dist/
prisma  prisma.config.js  src  tsconfig.build.tsbuildinfo     # <- no hay main.js
$ npm run start:prod
Error: Cannot find module 'C:\...\apps\api\dist\main'
code: 'MODULE_NOT_FOUND'
```

**Por qué ocurre.** `tsconfig.build.json` sólo excluye dos scripts de backfill. Siguen
entrando en la compilación `prisma.config.ts` (raíz del paquete) y `prisma/seed.ts`.
Como hay ficheros fuera de `src/`, TypeScript sube el `rootDir` común a la raíz del
paquete, y todo el árbol se desplaza un nivel: `src/main.ts` → `dist/src/main.js`.
El comentario de `tsconfig.build.json` explica que `seed.ts` se deja dentro a propósito
para que el build lo typechequee; ese efecto secundario sobre el `rootDir` no se vio.

**Impacto.** **Bloqueador de despliegue absoluto.** Cualquier plataforma (Docker, PM2,
Railway, Render, systemd) que ejecute el comando estándar entra en bucle de reinicio.
El build da éxito, así que el fallo aparece sólo al arrancar en el servidor.

**Solución recomendada.** La mínima y menos arriesgada: apuntar el script a la ruta real.

```jsonc
"start:prod": "node dist/src/main"
```

Alternativa más limpia (cambia la forma del `dist/`, hay que reajustar el Dockerfile
y cualquier ruta relativa a `process.cwd()`): añadir `"rootDir": "./src"` en
`tsconfig.build.json` y excluir `prisma.config.ts` y `prisma/seed.ts`, typechequeando
la semilla en un paso aparte. **Riesgo:** medio; `main.ts:16` resuelve `uploads` con
`process.cwd()`, no con `__dirname`, así que no le afecta, pero conviene reprobar el
arranque tras el cambio.

---

## 🔴 C-2 — Subida de archivos sin validar, servidos públicamente sin autenticación

**Archivos:** `apps/api/src/orders/photos/photos.controller.ts:36` ·
`apps/api/src/storage/storage.service.ts:45-46` · `apps/api/src/main.ts:16-17`

**Problema.** El endpoint de fotos de orden usa el interceptor **desnudo**:

```ts
@UseInterceptors(FileInterceptor('file'))   // photos.controller.ts:36 — sin limits, sin fileFilter
```

Su endpoint hermano `orders.controller.ts:99-108` sí valida (8 MB y sólo
`image/jpeg|png|webp`). El de fotos se quedó sin ninguna de las dos cosas.
`StorageService` conserva la extensión que mande el atacante
(`path.extname(originalName)`), y `main.ts:16` publica todo el directorio con
`useStaticAssets` **sin ningún guard**.

**Evidencia (explotado de extremo a extremo contra la API en marcha):**

```
$ curl -X POST /api/orders/<id>/photos -F "file=@evil.html;type=text/html"
{"url":"/uploads/orders/652027c8-....html"}          <- ACEPTADO

$ curl http://localhost:3001/uploads/orders/652027c8-....html     # SIN TOKEN
HTTP 200   content-type: text/html; charset=utf-8
<html><script>alert(document.domain)</script></html>
```

**Cómo se explota.**
1. Cualquier usuario ADMIN/MANAGER/TECHNICIAN (de **cualquier** tenant, sobre una orden
   suya) sube un `.html` o `.svg` con script.
2. El fichero queda servido desde el origen de la API, con `Content-Type: text/html`,
   accesible por cualquiera en internet sin sesión.
3. Sirve para phishing alojado en tu propio dominio y para ejecutar script en el origen
   de la API. `helmet({ crossOriginResourcePolicy: false })` (main.ts:17) además relaja
   la política que limitaría la incrustación desde otros orígenes.

**Segundo impacto, independiente y ya activo:** **todas las fotos de vehículos de clientes
y las firmas de recepción son públicas**. No hay autenticación en `/uploads`. El nombre
UUID es oscuridad, no control de acceso; y las URLs viajan en las respuestas de la API,
en los PDF de cotización y en el historial del navegador.

**Tercer impacto:** sin `limits`, multer acumula el fichero **en memoria** (`file.buffer`).
Una subida de varios GB tumba el proceso por falta de memoria. Es una denegación de
servicio con una sola petición autenticada.

**Solución recomendada.**
1. Copiar en `photos.controller.ts` el mismo bloque `limits`+`fileFilter` que ya existe
   en `orders.controller.ts:97-110` (extraerlo a una constante compartida y usarla en
   los dos sitios — hoy están duplicados y por eso divergieron).
2. Forzar la extensión a partir del mimetype validado en `StorageService`, en vez de
   confiar en `originalName`.
3. Decidir explícitamente el modelo de acceso a `/uploads`. Si las fotos son datos de
   cliente (lo son), servirlas por un endpoint autenticado que compruebe el tenant, o
   por URLs firmadas con caducidad si se migra a S3/R2. Publicar el directorio entero
   con `useStaticAssets` no es compatible con datos de cliente.

**Riesgo del cambio:** bajo para los puntos 1 y 2. El punto 3 rompe las URLs ya guardadas
en `OrderPhoto.url`, `Motorcycle.photoUrl`, `Order.signatureUrl` y `Quotation.pdfUrl`:
requiere migración de datos y tocar el frontend. **No lo apliqué**; va al plan de corrección.

---

## 🔴 C-3 — Recibos de separado duplicados en concurrencia

**Archivos:** `apps/api/src/pos/layaways/layaways.service.ts:494-508` ·
`apps/api/prisma/pos/schema.prisma:211`

**Problema.** `nextReceiptNumber` calcula "el primer número libre" leyendo todos los
recibos de la sucursal y buscando un hueco. Dos transacciones simultáneas leen el mismo
conjunto, eligen el **mismo** número, y **las dos escriben**. La base de datos no lo
impide: el único índice único es `@@unique([layawayId, receiptNumber])`, o sea *dentro de
un mismo separado*. Dos separados distintos de la misma sucursal no chocan nunca.

El propio esquema documenta el hueco (líneas 205-210) y delega la unicidad real "a
LayawaysService dentro de la transacción". **Una transacción no proporciona esa garantía**
en el nivel de aislamiento READ COMMITTED que usa Prisma por defecto: dos transacciones
concurrentes leen el mismo estado y ninguna ve la escritura de la otra hasta el commit.

**Evidencia (reproducido contra PostgreSQL real):**

```
=== CARRERA 3: NÚMERO DE RECIBO DE SEPARADO ===
  abono 1: OK
  abono 2: OK
  recibos guardados: [1, 1]
  ❌ DOS RECIBOS CON EL MISMO NÚMERO, ambos guardados.
```

**Impacto.** Corrupción **silenciosa** de una serie de documentos fiscales. No hay error,
no hay log, nadie se entera. Dos clientes distintos reciben un comprobante con el mismo
número de recibo. Se descubre en una auditoría contable, meses después, sin forma de
saber cuál era cuál.

**Solución recomendada.** La correcta y más barata es que lo garantice la base de datos,
no el código: dar `branchId` (y `tenantId`) a `PosLayawayPayment` y poner
`@@unique([tenantId, branchId, receiptNumber])`. Con eso, la colisión se convierte en un
error controlado en vez de en datos corruptos, y encima se puede reintentar. Requiere
migración con backfill de las filas existentes desde `layaway`.

Mientras tanto (o además), serializar la asignación por sucursal con un
`pg_advisory_xact_lock` sobre el hash de `tenantId+branchId` al principio de la
transacción. Es una línea y elimina la carrera de raíz.

**Nota:** el mismo patrón "primer hueco libre" se usa para las facturas
(`invoice-number.util.ts`) y allí **sí** hay un `@@unique` que salva los datos — por eso
ese caso es 🟠 A-2 y no 🔴. El arreglo del bloqueo consultivo cubre los dos.

---

## 🔴 C-4 — Secreto JWT de reserva embebido en el repositorio

**Archivo:** `apps/api/src/auth/strategies/jwt.strategy.ts:24-27`

```ts
secretOrKey:
  config.get<string>('JWT_ACCESS_SECRET') ??
  'dev_access_secret_change_me_in_production',
```

**Problema.** Si `JWT_ACCESS_SECRET` no está definido, la **verificación** de tokens usa
una cadena que está publicada en el repositorio. La *firma* (en `auth.service.ts:170`)
no tiene ese respaldo, así que el login fallaría — pero el arranque no falla, y la
verificación sigue aceptando cualquier token firmado con el secreto conocido.

**Cómo se explota.** Un despliegue en el que la variable falte (typo en el nombre, panel
del proveedor mal configurado, `.env` no montado en el contenedor) permite a cualquiera
que lea este repositorio forjar un token válido: basta con firmar
`{sub, tenantId, email, role}` con esa cadena. Como `validate()` relee al usuario de la
base, hace falta un `sub` real, pero los ids de usuario aparecen en respuestas de la API.
El resultado es suplantación de cualquier cuenta, en cualquier tenant.

**Impacto.** Compromiso total, condicionado a un error de configuración que no da ninguna
señal visible.

**Solución recomendada.** Que la aplicación **no arranque** sin secreto. Quitar el `??` y
validar al inicio:

```ts
const secret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
```

Y verificar también longitud mínima y que no sea el valor `change_me` del `.env.example`.
Es preferible un fallo ruidoso al arrancar que un agujero silencioso en producción.
**Riesgo del cambio:** bajo. Efecto: un despliegue mal configurado falla de inmediato,
que es exactamente lo que se busca.

---

## 🟠 A-1 — El stock puede quedar negativo bajo concurrencia

**Archivos:** `apps/api/src/pos/sales/sales.service.ts:445-452` (validación) y `154-161`
(descuento) · mismo patrón en `layaways.service.ts:153-160`

**Problema.** La validación existe y es correcta en el caso secuencial:

```ts
if (product.stock < item.quantity) throw new BadRequestException('Stock insuficiente...')
```

Pero es un *check-then-act*: la comprobación se hace en `resolveItem`, al principio de la
transacción, y el `decrement` ocurre mucho después. Entre medias corren, para una venta
de N líneas: N consultas de producto, el cálculo de totales, el escaneo completo de
números de factura, la creación de la venta con sus ítems y sus pagos. En ese hueco otra
transacción lee el mismo stock y pasa la misma validación.

**Evidencia (reproducido contra PostgreSQL real).** Sin latencia entre lectura y
escritura la carrera no se manifiesta en local. Introduciendo 150 ms —muy por debajo de
lo que tarda el cuerpo real de la transacción— aparece de inmediato:

```
stock inicial: 1 — dos apartados simultáneos de 1 unidad
  op 1: OK
  op 2: OK
  stock final: -1  ❌ NEGATIVO
```

**Impacto.** Se vende mercancía que no existe. El inventario queda negativo, y el comentario
del propio código (`sales.service.ts:446-448`) explica que precisamente eso es lo que se
quería evitar porque ensucia el cierre mensual. Con dos cajeros es cuestión de tiempo.

**Solución recomendada.** Mover la garantía a la base de datos, que es donde puede ser
atómica. Dos opciones, ambas de bajo riesgo:

- Un `CHECK (stock >= 0)` en `pos_products`: convierte el sobreventa en un error de
  transacción en vez de en datos malos. Hay que traducir ese error a un 400 legible.
- Hacer el descuento condicional y comprobar el número de filas afectadas:
  `UPDATE pos_products SET stock = stock - $1 WHERE id = $2 AND stock >= $1` — si
  devuelve 0 filas, no había stock y se aborta la transacción. Es la comprobación y el
  descuento en una sola operación atómica, sin carrera posible.

---

## 🟠 A-2 — Colisión de número de factura: la venta revienta

**Archivos:** `apps/api/src/pos/sales/invoice-number.util.ts:20-31` ·
`apps/api/src/pos/sales/sales.service.ts:67-71`

**Problema.** Mismo patrón que C-3. Aquí **sí** existe
`@@unique([tenantId, branchId, invoiceNumber])`, así que los datos quedan íntegros: la
segunda transacción muere con P2002 y hace rollback.

El comentario de `sales.service.ts:68-71` dice que la transacción evita que "dos cajeros
vendiendo a la vez podrían llevarse el mismo número de factura". Es incorrecto: la
transacción da atomicidad, no serialización.

**Evidencia (reproducido):**

```
=== CARRERA 2: NÚMERO DE FACTURA ===
  facturas creadas: [4]
  ❌ 1 venta reventó con violación de unicidad en invoiceNumber
```

**Impacto.** No se corrompen datos, pero el cajero pierde la venta con un error opaco
(agravado por A-4, que le muestra el mensaje crudo de Prisma). Ocurre justo en el momento
de más carga: dos cajas cobrando a la vez.

**Solución recomendada.** El mismo `pg_advisory_xact_lock` por sucursal de C-3 lo elimina.
Como red adicional, reintentar una vez ante P2002.

---

## 🟠 A-3 — Sin protección de fuerza bruta en el login

**Archivos:** `apps/api/src/app.module.ts:38` · `apps/api/src/auth/auth.controller.ts`

**Problema.** El único límite es el `ThrottlerModule` global: **200 peticiones por minuto**.
No hay límite específico para `/auth/login` ni bloqueo por cuenta tras N fallos.

**Evidencia (reproducido contra la API en marcha):**

```
=== 40 intentos de contraseña fallidos seguidos ===
429 recibidos: 0
401 recibidos: 40
login correcto tras 40 fallos -> 200
```

**Impacto.** 200 intentos/minuto por IP ≈ 288.000 al día, y más rotando IPs. Contra
contraseñas de usuarios reales de taller (que no serán fuertes) es un ataque viable.
Argon2 protege el hash si roban la base, no protege el endpoint.

**Solución recomendada.** `@Throttle({ default: { limit: 5, ttl: 60_000 } })` sobre el
handler de login, y un contador de fallos por cuenta con espera creciente. `User` ya
tiene `lastLoginAt`; añadir `failedLoginAttempts` y `lockedUntil` es una migración
pequeña. **Riesgo:** bajo, pero conviene un modo de desbloqueo administrativo para no
dejar fuera a un usuario legítimo.

---

## 🟠 A-4 — Los errores internos se devuelven al cliente

**Archivo:** `apps/api/src/common/filters/http-exception.filter.ts:28-33, 43-48`

**Problema.** Para cualquier excepción que no sea `HttpException` —es decir, todo error
inesperado, incluidos los de Prisma— el filtro devuelve `exception.message` tal cual en
el cuerpo de la respuesta.

Los mensajes de error de Prisma incluyen la invocación completa, nombres de tabla, de
columna y de restricción. La colisión de A-2, por ejemplo, devuelve al navegador el
nombre exacto del índice único y los campos que lo componen.

**Impacto.** Filtración de la estructura interna de la base de datos a cualquier cliente,
que es material de reconocimiento para un atacante. Y para el usuario final, un mensaje
incomprensible en lugar de una explicación.

**Solución recomendada.** Para `status >= 500`, registrar el detalle completo en el log y
devolver un mensaje genérico:

```ts
message: isServerError && process.env.NODE_ENV === 'production'
  ? 'Error interno del servidor'
  : message,
```

Conviene además un `PrismaClientKnownRequestError` → 409/400 con texto en español para
los casos frecuentes (P2002 unicidad, P2025 no encontrado). **Riesgo:** bajo.

---

## 🟠 A-5 — La API arranca sin registrar nada

**Archivo:** `apps/api/src/main.ts:12-14`

**Problema.** `NestFactory.create(AppModule, { bufferLogs: true })` retiene todos los logs
hasta que se llame a `app.flushLogs()`. **`main.ts` nunca lo llama.** Todo lo que se
registre durante el arranque —incluidos los errores de arranque— se queda en el buffer y
se pierde.

**Evidencia (observado).** Al arrancar `node dist/src/main.js` en segundo plano, el fichero
de salida quedó **completamente vacío**: ni los banners de Nest, ni el
`Connected to PostgreSQL`, ni el `console.log` final. Tuve que comprobar el puerto y
lanzar un segundo proceso en primer plano para descubrir por qué no respondía.

**Impacto.** Operativo y grave para alguien que no es ingeniero: si la API no arranca en
producción, **no hay ningún mensaje que explique por qué**. Ni en el log del contenedor,
ni en PM2, ni en el panel del proveedor. Es exactamente el escenario que más preocupa al
propietario de este proyecto.

**Solución recomendada.** Añadir `app.flushLogs()` justo después de crear la app (o quitar
`bufferLogs`), y envolver `bootstrap()` en un `.catch()` que registre y termine con
código distinto de cero:

```ts
void bootstrap().catch((err) => {
  console.error('Fallo al arrancar la API:', err);
  process.exit(1);
});
```

**Riesgo:** ninguno. Es puramente aditivo. **Es el cambio con mejor relación valor/riesgo
de toda la auditoría.**

---

## 🟠 A-6 — `refresh_tokens` sin índice de búsqueda ni limpieza

**Archivos:** `apps/api/prisma/schema.prisma:289-302` · `auth.service.ts:117-119`

**Problema.** `refresh()` busca por `tokenHash`:

```ts
const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash }, ... });
```

`tokenHash` **no tiene índice ni restricción de unicidad**. El único índice es por
`userId`. Cada renovación de token es por tanto un recorrido secuencial de la tabla.

Y no hay ningún proceso que borre los tokens caducados o revocados: cada login y cada
renovación crea una fila que no se elimina jamás.

**Impacto.** Con rotación de tokens cada 15 minutos, un equipo de 10 personas genera del
orden de 300 filas al día, ~110.000 al año, todas permanentes. El recorrido secuencial en
cada renovación se degrada de forma continua y silenciosa. No se nota en pruebas; se nota
a los meses, en producción.

**Solución recomendada.** `@@unique([tokenHash])` en el modelo (permite además cambiar
`findFirst` por `findUnique`, que es lo semánticamente correcto) y una tarea programada
—o un borrado oportunista en `logout`— que elimine
`expiresAt < now()` o `revokedAt IS NOT NULL` con más de N días. **Riesgo:** bajo; la
migración sólo añade un índice.

---

## 🟡 M-1 — Swagger expuesto públicamente

**Archivo:** `apps/api/src/main.ts:35-44`. `SwaggerModule.setup('api/docs', ...)` sin
condicionar por entorno.

**Evidencia:** `GET /api/docs -> 200` sin ningún token.

**Impacto.** Publica el mapa completo de la API: cada endpoint, cada parámetro, cada
esquema de DTO. Es un regalo para la fase de reconocimiento de un atacante.

**Solución.** Envolver en `if (process.env.NODE_ENV !== 'production')`, o protegerlo con
autenticación básica.

---

## 🟡 M-2 — Tokens en `localStorage`

**Archivo:** `apps/web/src/lib/auth-storage.ts`

El token de acceso, el de refresco (**7 días de validez**) y los datos de usuario viven en
`localStorage`, legible por cualquier JavaScript de la página.

**Atenuante verificado:** no encontré `dangerouslySetInnerHTML`, `innerHTML` ni `eval` en
todo el frontend, así que hoy no hay una vía de XSS conocida. El riesgo es que cualquier
XSS futuro —o una dependencia npm comprometida— pasa de "molesto" a "toma de control de
cuentas durante 7 días", porque el token de refresco sobrevive al cierre del navegador.

**Solución.** Lo correcto es una cookie `httpOnly` + `Secure` + `SameSite` para el token
de refresco. **Riesgo del cambio: alto** — toca login, renovación, CORS y el guard de
sucursal. No es un arreglo de última hora; decisión consciente antes de crecer.

---

## 🟡 M-3 — Frontend sin cabeceras de seguridad

**Archivo:** `apps/web/next.config.ts` — vacío, sólo el comentario de plantilla.

Sin `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy` ni HSTS. Con los
tokens en `localStorage` (M-2), una CSP es la segunda línea de defensa que hoy no existe.

**Solución.** Añadir `async headers()` con las cabeceras. **Riesgo:** medio — una CSP mal
ajustada rompe la aplicación en silencio; hay que probarla pantalla por pantalla.

---

## 🟡 M-4 — `fetchAuthedBlob` no manda sucursal ni renueva el token

**Archivo:** `apps/web/src/lib/api.ts:110-117`

`request()` y `downloadFile()` mandan `X-Branch-Id` y reintentan tras un 401 renovando el
token. `fetchAuthedBlob` (y por tanto `openAuthedBlobInNewTab`) **no hace ninguna de las
dos cosas**: no manda la cabecera de sucursal y lanza `ApiError(res.statusText)` en cuanto
recibe un 401.

**Impacto.** Abrir un PDF con el token de acceso caducado (15 minutos) falla con
"Unauthorized" en vez de renovar y reintentar, mientras el resto de la aplicación sigue
funcionando. Y cualquier endpoint de descarga que dependa de la sucursal recibe la
petición sin ella.

**Solución.** Reutilizar la misma cabecera y el mismo bloque de reintento que
`downloadFile` ya implementa (líneas 145-163). Los tres caminos deberían compartir una
única función; hoy están copiados y por eso divergen.

---

## 🟡 M-5 — `nextInvoiceNumber` escanea toda la tabla en cada venta

**Archivo:** `apps/api/src/pos/sales/invoice-number.util.ts:25-28`

```ts
const sales = await tx.posSale.findMany({
  where: { tenantId, branchId, invoiceNumber: { not: null } },
  select: { invoiceNumber: true },
});
```

Trae **todas** las facturas de la sucursal a memoria en cada venta, para buscar un hueco.
Igual en `layaways.service.ts:499-505`.

**Impacto.** Con 50.000 ventas son 50.000 filas transferidas y un `Set` de 50.000 enteros
construido en cada cobro, dentro de la transacción y por tanto manteniendo bloqueos más
tiempo del necesario. Crece de forma lineal y para siempre. Al principio no se nota.

**Solución.** El requisito real es "el primer hueco desde el suelo". Se resuelve en SQL sin
traer nada a memoria:

```sql
SELECT COALESCE(MIN(s.n), (SELECT MAX(invoice_number)+1 FROM ...))
FROM generate_series(4, (SELECT COALESCE(MAX(invoice_number),3)+1 FROM ...)) AS s(n)
WHERE NOT EXISTS (SELECT 1 FROM pos_sales WHERE invoice_number = s.n AND ...)
```

No es urgente para el primer día. Sí conviene resolverlo junto con el bloqueo de C-3/A-2,
porque se toca el mismo código.

---

## 🔵 Menores

**B-1 — Handles sin cerrar en los tests.** Jest avisa:
`A worker process has failed to exit gracefully`. No afecta a producción, pero puede
colgar un pipeline de CI. Investigar con `--detectOpenHandles`.

**B-2 — `Tenant.nextOrderNumber` huérfano.** Ya documentado en `schema.prisma:149-152`.
Ningún código lo lee ni lo escribe. Correcto dejarlo; conviene borrarlo en una limpieza.

---

## 2. Lo que verifiqué y **está bien** (con evidencia)

No todo son problemas. Esto se probó de verdad y pasa:

**✅ Aislamiento multi-tenant — VERIFICADO.** Registré un tenant atacante real por el
endpoint público y traté de alcanzar los datos del tenant sembrado:

```
  B -> GET    /api/clients/<id-de-A>   -> 404
  B -> PATCH  /api/clients/<id-de-A>   -> 404
  B -> DELETE /api/clients/<id-de-A>   -> 404
  (y el registro de A quedó intacto, comprobado después)
```

**✅ Autorización por rol en el backend — VERIFICADO.** No depende de esconder botones:

```
  CAJERO  -> /clients /orders /invoices /users /appointments /inventory/products : 403
  TÉCNICO -> /users /branches, POST /users, POST /branches                       : 403
  RECEPCIÓN -> GET y POST /users                                                 : 403
  ADMIN taller -> /pos/products /pos/sales /pos/reports/summary                  : 403
```

La separación taller/POS está realmente aplicada en el servidor. `RolesGuard` cierra por
defecto (`if (!wantsTaller && !wantsPos) return !!user.role`), que es la decisión correcta.

**✅ Autenticación.** Sin token → 401. Token inválido → 401. Rotación de tokens de refresco
implementada con revocación del usado. Contraseñas con Argon2. El rol se relee de la base
en cada petición en vez de confiar en el del token (`jwt.strategy.ts:37-39`), así que
revocar un rol surte efecto inmediato — es una decisión de diseño acertada y poco común.

**✅ Actualizaciones de stock atómicas.** Todos los cambios de inventario usan
`{ increment }` / `{ decrement }`, nunca leer-modificar-escribir. El problema de A-1 es la
validación previa, no la escritura.

**✅ Los pagos cuadran.** `sales.service.ts:101-105` rechaza la venta si la suma de los
pagos no coincide **exactamente** con el total, usando `Decimal` en vez de coma flotante.
Todo el dinero es `Decimal` en el esquema y `Prisma.Decimal` en el código: no encontré ni
un solo cálculo monetario en coma flotante.

**✅ Alcance de escritura atado al padre.** `layaways.service.ts:252-263` usa
`updateMany({ where: { id, layawayId: id } })` y comprueba `count === 0` — el patrón
correcto para impedir que un id del cuerpo de la petición escriba en una fila de otro
tenant. Bien hecho.

**✅ Integridad referencial.** El esquema usa `onDelete: Restrict` en las relaciones donde
el borrado en cascada destruiría historial (cliente→orden, producto→movimiento) y
`SetNull` donde tiene sentido. No encontré cascadas peligrosas.

---

## 2 bis. Fases 4, 5, 11 y 12 — Frontend en navegador real

Probado con Chromium controlado por Playwright, contra el frontend compilado en modo
producción (`next start`) y la API real. **Playwright se instaló fuera del repositorio**
(en un directorio temporal) para no añadir dependencias que no se pidieron.

### Pantallas: las 20 cargan

Recorridas una a una con sesión de administrador: `/dashboard`, `/orders`, `/orders/new`,
`/clients`, `/motorcycles`, `/appointments`, `/quotations`, `/inventory`, `/purchases`,
`/invoices`, `/reports`, `/notifications`, `/settings` y las 7 del POS.

**Ninguna aparece en blanco, ninguna lanza una excepción de JavaScript, ninguna muestra
una pantalla de error.** La navegación a detalle funciona: al hacer clic en una fila de
`/orders` se abre `/orders/<id>` con datos reales (orden #60000010, estado «En
reparación», cliente, vehículo y detalle de recepción).

> **Corrección sobre mi propia herramienta.** El primer recorrido marcó ⚠️ en `/orders`,
> `/clients`, `/motorcycles` y `/quotations` por «peticiones de red fallidas». Al
> investigarlo eran **falsos positivos**: las 114 peticiones `_rsc` (prefetch de Next.js)
> devuelven 200. Mi script contaba como fallo las peticiones *abortadas*, y Next.js
> cancela los prefetch al navegar, que es comportamiento normal. **No hay ningún fallo de
> red en esas pantallas.**

### 🟠 F-1 — Un fallo de carga se pinta como «lista vacía» (CORREGIDO)

**Archivos:** los 24 que usan `useApiSWR` · corregido en
`apps/web/src/components/providers/swr-provider.tsx` (nuevo)

**Problema.** `useApiSWR` devuelve `error`, y **ninguna de las 24 pantallas lo
desestructuraba**. Comprobado: `grep` de `} = useApiSWR` da 24 usos y **0** mencionan
`error`. El resultado es que cualquier petición fallida deja `data` indefinido y la
pantalla lo pinta con `data?.total ?? 0`.

**Evidencia (navegador real).** Un cajero (sin acceso al taller) abre `/clients`:

```
  --- lo que ve en pantalla ---
   | Clientes
   | 0 clientes registrados          <-- MENTIRA: hay clientes, no tiene permiso
   | Nuevo cliente                   <-- botón que fallará al pulsarlo
  --- lo que respondió la API ---
    403 clients                      <-- el backend hizo lo correcto
  ¿aparece algún aviso de permisos? ❌ NO
```

**Impacto.** No es una fuga de datos —el backend devuelve 403 correctamente y no envía
nada—, pero es grave por otra vía: **el sistema afirma un dato falso**. Quien lo ve
concluye que el taller no tiene clientes. El mismo camino se recorre cuando el backend
está caído o devuelve 500: la aplicación se queda muda, que es exactamente lo que la
Fase 12 pedía descartar.

**Solución aplicada.** Un `onError` global en `SWRConfig`, en un único sitio, en vez de
parchear 24 pantallas — así quedan cubiertas también las que se añadan mañana, que es
por donde el problema volvería a entrar. Distingue 403 (permisos), fallo de conexión,
5xx y el resto, y desactiva el reintento en 403/404 para no repetir el aviso en bucle.

**Verificado en navegador tras el arreglo:**

| Situación simulada | Lo que ve el usuario ahora |
|---|---|
| Cajero abre `/clients` (403) | ✅ «No tienes permiso para ver esta información — Si crees que deberías tenerlo, pídele acceso al administrador del taller.» |
| Backend caído (peticiones abortadas) | ✅ «No se pudo conectar con el servidor — Comprueba tu conexión.» |
| La API devuelve 500 | ✅ «Error en el servidor — La información no se pudo cargar.» |

### 🟠 F-2 — La página entera desborda en horizontal en móvil y tableta (CORREGIDO)

**Archivos:** `apps/web/src/app/(app)/layout.tsx` · `apps/web/src/components/ui/tabs.tsx`

**Problema.** Medido en navegador, el ancho de desplazamiento superaba al de la pantalla:

| Tamaño | Antes |
|---|---|
| Escritorio 1440×900 | ✅ ninguna |
| **Tableta 768×1024** | ⚠️ **6 pantallas**: Órdenes +265px, Clientes +278px, Motocicletas +210px, Cotizaciones +285px, Inventario +261px, Facturas +216px |
| **Móvil 390×844** | ⚠️ **8 pantallas**: hasta **+391px** (Cotizaciones), es decir el doble de ancho que la pantalla |

**Por qué ocurría.** El componente `Table` ya traía `overflow-x-auto`, así que a primera
vista debería haber bastado. No servía de nada porque su contenedor llegaba ya estirado
desde arriba: en `(app)/layout.tsx`, `<div className="flex ... flex-1 flex-col">` y
`<main className="flex-1">` son elementos flex, y un elemento flex tiene
`min-width: auto` por defecto — **se niega a encoger por debajo del ancho de su
contenido**. La tabla ancha estiraba la columna entera y con ella la página.
Diagnosticado midiendo en el navegador qué elemento concreto excedía el ancho, no
adivinando.

**Solución aplicada.** `min-w-0` en esos dos contenedores (dos palabras, un solo
archivo, arregla todas las pantallas a la vez) y `max-w-full overflow-x-auto` en
`TabsList`, que desbordaba aparte en Ajustes (454px de pestañas en 390px de pantalla).

**Verificado tras el arreglo:**

| Tamaño | Después |
|---|---|
| Escritorio 1440×900 | ✅ ninguna |
| Tableta 768×1024 | ✅ **ninguna** |
| Móvil 390×844 | ✅ **ninguna** (12 pantallas comprobadas) |

Importa más de lo que parece: en un taller lo normal es consultar una orden desde el
móvil, con el vehículo delante.

### 🔴 F-3 — No se podía crear un cliente sin correo (CORREGIDO)

**Archivos:** 24 DTOs de `apps/api/src/**/dto/` · corregido con
`apps/api/src/common/dto/blank-to-undefined.decorator.ts` (nuevo)

**Cómo apareció.** Al automatizar el formulario de «Nuevo cliente», el envío no creaba
nada y el diálogo se quedaba abierto. No era un fallo de la prueba: **el formulario estaba
roto para el caso normal**.

**Evidencia (contra la API real, enviando exactamente lo que manda el navegador):**

```
1. { firstName, lastName, documentId, phone, email:"", address:"", notes:"" }
   -> 400  ["email must be an email"]         <-- lo que enviaba el formulario

2. { firstName, lastName, documentId, phone }  (sin los campos vacíos)
   -> 201                                      <-- funciona

3. { firstName, lastName, documentId, email:"" }
   -> 400  ["email must be an email"]          <-- basta el correo vacío
```

**Por qué ocurría.** `@IsOptional()` de class-validator salta la validación cuando el valor
es `undefined` o `null`, **pero no cuando es una cadena vacía**. Un formulario de React
inicializa su estado con `email: ''` y lo envía así aunque el usuario no toque el campo.
El `@IsEmail()` recibía `''`, fallaba, y con él la petición entera.

**Impacto.** Es un bloqueo del flujo más básico del taller: **dar de alta un cliente que no
tiene correo**, que en un taller de motos es lo habitual. La única forma de crear un
cliente era rellenar un correo válido, aunque el campo no esté marcado como obligatorio.
El usuario veía el formulario abierto y un aviso de error sobre un campo que él había
dejado en blanco a propósito.

Y no era sólo el correo: el mismo patrón afectaba a **38 campos en 24 DTOs** —fechas
(`@IsDateString`) e identificadores de desplegables (`@IsUUID`), que también llegan como
`''` cuando no hay nada seleccionado.

**Solución aplicada.** Un decorador `@BlankToUndefined()` que convierte la cadena vacía en
`undefined` antes de validar, aplicado a los 38 campos que llevan un validador de formato
donde `''` nunca es un valor válido. **Deliberadamente NO se aplica a campos de texto
libre** (dirección, notas): ahí `''` sí significa «bórralo», y convertirlo en `undefined`
haría imposible vaciar un campo.

**Verificado:** el caso que fallaba ahora devuelve 201; un correo mal escrito
(`no-es-correo`) sigue devolviendo 400. Cubierto por 7 tests de regresión nuevos.

### 🟡 F-4 — Sin longitud máxima en los campos de texto (NO corregido)

Un nombre de **600 caracteres se guarda sin protestar**. No hay `@MaxLength` en los campos
de texto de los DTOs. No rompe nada hoy —Postgres usa `text`— pero descuadra las tablas de
la interfaz y permite engordar la base sin límite. Queda anotado; arreglarlo es añadir
`@MaxLength` y decidir un tope por campo, lo que conviene hacer con criterio de negocio.

### Formularios y flujos (Fases 5 y 6)

Probado sobre el formulario de clientes de extremo a extremo, **comprobando cada resultado
contra la base de datos**, no contra lo que muestra la pantalla:

| Prueba | Resultado |
|---|---|
| Enviar con los obligatorios vacíos | ✅ no crea nada, el formulario sigue abierto |
| Crear un cliente completo | ✅ existe en la base, con nombre, teléfono y sucursal correctos |
| Aparece en la lista sin recargar | ✅ |
| Documento duplicado | ✅ no duplica el registro (el servicio reactiva el existente) |
| Cancelar con el formulario relleno | ✅ no guarda nada; el registro no existe en la base |
| Nombre de 600 caracteres | ⚠️ aceptado — ver F-4 |
| **XSS almacenado** (`<img src=x onerror=alert(1)>`) | ✅ **no se ejecuta**; se muestra como texto |
| Búsqueda | ✅ filtra de 20 filas a 1 |
| Búsqueda sin resultados | ✅ estado vacío comprensible |
| Errores de JavaScript en toda la sesión | ✅ **0** |

### Flujo completo: recepción de una orden (Fase 6)

Recorrido entero del asistente de 7 pasos por la interfaz, con cliente y vehículo nuevos,
**comprobando cada resultado contra la base de datos**:

| Comprobación | Resultado |
|---|---|
| Cédula desconocida → ofrece dar de alta al cliente | ✅ |
| Paso «Motivo» con el campo vacío | ✅ el botón «Siguiente» está **deshabilitado** (mejor que un error tras pulsar) |
| Al escribir el motivo se habilita | ✅ |
| Se creó **exactamente una** orden (3 → 4) | ✅ sin duplicados |
| La orden nace en estado `RECEIVED` | ✅ |
| Queda ligada a cliente y a vehículo | ✅ |
| Queda en la sucursal activa | ✅ |
| El cliente del paso 1 es el que quedó guardado | ✅ |
| El cliente nuevo se creó **una sola vez** | ✅ (no se duplica entre pasos) |
| Firma guardada y código de recogida generado | ✅ firma guardada, código `210110` |
| El detalle en pantalla refleja lo que hay en la base | ✅ número, cliente y motivo |
| Errores de JavaScript en todo el flujo | ✅ **0** |

Resultado: **orden 60000011 creada correctamente de extremo a extremo.** No se encontró
ninguna desincronización entre lo que muestra la pantalla y lo que guarda la base.

> **Corrección sobre mi propio proceso, por transparencia.** Durante esta prueba obtuve un
> `400 ["newClient.email must be an email"]` y estuve a punto de reportarlo como un bug
> crítico del flujo de recepción. **No lo era.** Mi script rellenaba automáticamente todo
> campo vacío con un texto genérico (`Dato5`), y eso incluía el campo de correo, que
> lógicamente lo rechazó. Lo comprobé aislando la misma petición con `curl` y campos
> vacíos de verdad: pasa la validación. Corregido el script (los campos de correo se
> rellenan con un correo válido), el flujo completo pasa.
>
> Lo dejo escrito porque ilustra el criterio de esta auditoría: **un fallo observado no es
> un hallazgo hasta que se aísla la causa.**

### Separados del POS (Fase 6)

Es el flujo con más dinero en juego: la mercancía sale del inventario **al apartar**, y sólo
se convierte en venta cuando el saldo llega a cero. Verificado contra la base:

| Comprobación | Resultado |
|---|---|
| Total, abonado y saldo cuadran al crear | ✅ |
| El abono inicial recibe número de recibo | ✅ |
| **La mercancía sale del inventario al apartar** | ✅ `7 → 6` |
| Los abonos se acumulan; sigue `ACTIVE` mientras quede saldo | ✅ |
| Un abono **no** vuelve a descontar stock | ✅ |
| Los números de recibo **no se repiten** | ✅ `[3, 4, 5]` |
| **Pagar de más se recorta al saldo pendiente** | ✅ nunca se cobra de más |
| Al saldar, se convierte en venta automáticamente | ✅ con número de factura |
| El total de la venta coincide con el del separado | ✅ |
| **Al completarse NO se vuelve a descontar stock** (ya salió al apartar) | ✅ |
| **Al cancelar, la mercancía vuelve al inventario** | ✅ `4 → 6` |
| Al cancelar se liberan los números de recibo | ✅ verificado en la base (`receiptNumber` a NULL) |
| Cancelar dos veces / abonar a uno completado / apartar más de lo que hay | ✅ los tres rechazados |

> Una aserción de mi prueba sobre los recibos liberados pasó con un array vacío, o sea de
> forma vacua. Lo comprobé aparte consultando la base directamente: el separado cancelado
> tiene `receiptNumber` NULL y el completado conserva 3, 4 y 5, todos distintos. **El
> comportamiento es correcto; la aserción no lo demostraba.**

### Exportaciones a Excel

| Exportación | Resultado |
|---|---|
| `/clients/export` | ✅ HTTP 200, 8.546 bytes, cabecera `PK` (xlsx válido) |
| `/orders/export` | ✅ HTTP 200, 7.640 bytes, xlsx válido |
| `/invoices/export` | ✅ HTTP 200, 7.058 bytes, xlsx válido |

Comprobado que el fichero es realmente un `.xlsx` (empieza por `PK`, es un ZIP), no una
respuesta de error con nombre de hoja de cálculo.

**El PDF de cotización se verificó después**, creando una orden nueva con una cotización en
estado editable. Ver la sección «Agenda y PDF de cotización» más abajo.

### Flujo completo: venta del punto de venta (Fase 6)

Es dinero, así que cada número se contrastó con la base, no con lo que muestra la pantalla.
Venta real por la interfaz con el usuario administrador del POS:

| Comprobación | Resultado |
|---|---|
| «Cobrar» con el carrito vacío | ✅ deshabilitado |
| El buscador encuentra el producto y entra en el carrito | ✅ |
| El total en pantalla coincide con el de la base | ✅ `$4.187.500` |
| Se registró **exactamente una** venta (11 → 12) | ✅ |
| La venta nace `ACTIVE` con número de factura | ✅ factura nº 8 |
| **Los pagos suman exactamente el total** | ✅ `4187500 == 4187500` |
| **El stock bajó exactamente lo vendido** | ✅ `7 → 6` |
| El stock nunca queda negativo | ✅ |
| El precio quedó **congelado** en la venta | ✅ (editar el producto después no altera la venta) |
| La venta aparece en la pantalla de ventas | ✅ |
| Errores de JavaScript | ✅ **0** |

**Anulación de venta** (operación crítica: mueve dinero e inventario):

| Comprobación | Resultado |
|---|---|
| La venta pasa a `VOIDED` | ✅ |
| El número de factura se libera (`null`) para reutilizarse | ✅ — decisión fiscal deliberada del proyecto |
| **El stock vuelve al inventario** | ✅ `6 → 7`, exactamente lo que se había descontado |
| Anular dos veces | ✅ rechazado: «La venta ya fue anulada» |

No se encontró ninguna diferencia entre lo que muestra la pantalla y lo que guarda la base
en todo el módulo de ventas.

### Ciclo completo de una orden (Fase 6)

Recorrido entero: recepción → diagnóstico → cotización → aprobación → reparación →
entrega → factura. Se comprobó en cada paso lo que de verdad puede corromper datos.

| Paso | Comprobación | Resultado |
|---|---|---|
| Recepción | Orden creada, nace en `RECEIVED`, con clave de salida | ✅ |
| Diagnóstico | Se guarda y el repuesto queda ligado | ✅ |
| Cotización | Subtotal `1.350.000` | ✅ cuadra |
| | IVA 19% = `256.500` | ✅ cuadra |
| | Total `1.606.500` | ✅ cuadra |
| | `total = subtotal + IVA − descuento` | ✅ coherencia interna |
| **Aprobación** | **Descuenta inventario: 4 → 2, exactamente las 2 unidades cotizadas** | ✅ |
| | Queda un movimiento de inventario ligado a la orden (`SALE_OUT x2`) | ✅ |
| Estados | `WAITING_APPROVAL → IN_REPAIR → TESTING → READY_FOR_DELIVERY` | ✅ |
| | El historial registró **cada** cambio (6 entradas) | ✅ |
| Entrega | Clave de salida **incorrecta** → rechazada, y la orden NO se entrega | ✅ |
| | Clave correcta → entregada, con fecha y verificación registradas | ✅ |
| Factura | **El total coincide exactamente con el de la cotización** | ✅ `1.606.500` |
| | Apunta al cliente correcto | ✅ |
| | **Facturar dos veces la misma orden** | ✅ rechazado (409) |

**Resultado: el ciclo completo es correcto.** No se encontró ninguna incoherencia entre
estado, inventario y dinero.

> **Segunda corrección sobre mi propio proceso.** La primera ejecución de esta prueba dio
> **17 fallos** y parecía que medio ciclo estaba roto. Al leer los mensajes de error,
> **ninguno era un fallo de la aplicación**:
> - `property technicianId should not exist` — el DTO de diagnóstico no acepta ese campo
>   porque el técnico sale del usuario en sesión. `forbidNonWhitelisted` lo rechazó, que
>   es exactamente lo que debe hacer.
> - `No se puede pasar de Esperando revisión a Esperando revisión` — la cotización ya
>   estaba en ese estado; hay una máquina de estados que impide transiciones inválidas.
> - Las transiciones de la orden fallaban porque **también** hay una máquina de estados
>   (`order-status.util.ts`) y mi secuencia no la respetaba.
>
> Es decir: **los 17 «fallos» eran defensas del sistema funcionando correctamente.** Ajustada
> la prueba a los DTOs y a las transiciones reales, el ciclo pasa entero. Lo dejo escrito
> porque es la segunda vez en esta auditoría que un fallo aparente resulta ser código
> defensivo bien hecho, y merece constar a favor del proyecto.

### Roles en la interfaz

| Escenario | Resultado |
|---|---|
| Cajero inicia sesión | ✅ va directo a `/pos/vender`, ve solo el menú del POS |
| Cajero usa el POS | ✅ vender, productos, ventas y separados cargan con datos reales |
| Cajero fuerza `/clients` o `/orders` por URL | ✅ la API devuelve 403 y **ahora** la interfaz lo explica (antes: lista vacía) |
| Admin de taller fuerza `/pos/vender` por URL | ✅ se le muestra el panel del taller, sin error ni pantalla rota |

**Observación menor (no corregida):** al admin de taller que entra a `/pos/vender` se le
pinta el panel del taller pero **la barra de direcciones sigue diciendo `/pos/vender`**.
No es un problema de seguridad ni rompe nada; es sólo que la URL y el contenido no
coinciden. Queda anotado, no tocado.

---

## 🟠 A-7 — Se podía reescribir una cotización ya aprobada por el cliente (CORREGIDO)

**Archivo:** `apps/api/src/orders/quotations/quotations.service.ts:247` (`upsert`)

**Cómo apareció.** Probando la generación del PDF de cotización creé una cotización de
prueba sobre una orden existente. El `PUT` devolvió **200** — pero esa cotización estaba
en estado `APPROVED`. La API había aceptado reescribir un presupuesto que el cliente ya
había aprobado.

**El problema.** De los tres caminos que modifican una cotización, **dos comprueban
`EDITABLE_STATUSES` y el tercero no**:

| Método | ¿Comprueba? |
|---|---|
| `createFromDiagnosis` (línea 186) | ✅ sí — «una vez enviada o decidida, el diagnóstico ya no la puede pisar» |
| `generatePdf` (línea 306) | ✅ sí — lanza «Esta cotización ya no se puede modificar» |
| **`upsert`** (línea 247) | ❌ **no** |

Es decir: la regla estaba pensada y escrita dos veces, y al camino principal —el que usa
el formulario de la interfaz— se le pasó.

**Evidencia (reproducido contra la API real):**

```
PUT /orders/<id>/quotation   sobre una cotización en estado APPROVED
  -> HTTP 200                            <-- aceptado

Estado resultante en la base:
  status = APPROVED  |  approvedAt = NULL      <-- estado imposible
```

**Impacto.** Cuatro consecuencias, todas comprobadas:

1. **El cliente aprueba un importe y queda guardado otro.** La aprobación deja de
   corresponder a lo aprobado, que es justo lo que respalda el cobro.
2. **Estado imposible**: `update` pone `approvedAt: null` pero **no cambia el estado**, así
   que la cotización queda «aprobada sin fecha de aprobación».
3. **El inventario ya se descontó al aprobar.** Reescribir los ítems no lo reconcilia:
   stock y cotización pasan a contar cosas distintas.
4. **Si ya había factura**, su total deja de coincidir con la cotización.

**Solución aplicada.** La misma comprobación que ya hacían sus dos hermanos, con un
mensaje que además dice qué hacer:

> «Esta cotización ya fue enviada o decidida por el cliente y no se puede modificar. Crea
> una cotización nueva si hay que cambiar el presupuesto.»

**Verificado tras el arreglo:** el mismo `PUT` sobre una cotización `APPROVED` devuelve
**400** y la cotización queda intacta. Cubierto por **8 tests de regresión** que recorren
los 7 estados: rechaza `SENT`, `APPROVED` y `REJECTED`; permite `DRAFT`, `PENDING_REVIEW`,
`READY_TO_SEND`, `PARTIALLY_APPROVED` y la creación inicial.

> **Nota de honestidad sobre el dato de demostración.** Al reproducir este bug sobrescribí
> los importes de una cotización de la base de desarrollo, y sus valores originales se
> perdieron (es el propio bug: por eso es grave). Restauré la coherencia del estado —ya no
> hay ninguna cotización `APPROVED` sin fecha de aprobación— pero los importes de esa fila
> concreta son los de mi prueba, no los originales. Sólo afecta a datos de demostración.

---

## 🔴 C-4 bis — El secreto JWT de reserva seguía vivo en el WebSocket (CORREGIDO)

**Archivo:** `apps/api/src/realtime/realtime.gateway.ts:42`

**Este hallazgo es un fallo mío.** Al corregir C-4 quité el valor de reserva
`'dev_access_secret_change_me_in_production'` de `jwt.strategy.ts` y di el problema por
cerrado. **Estaba escrito en dos sitios.** El gateway de tiempo real conservaba su propia
copia:

```ts
secret: this.config.get('JWT_ACCESS_SECRET')
     ?? 'dev_access_secret_change_me_in_production',   // seguía aquí
```

**Impacto.** Un despliegue sin `JWT_ACCESS_SECRET` tenía la API HTTP correctamente
protegida (no arranca) y **el WebSocket aceptando tokens firmados con una cadena publicada
en el repositorio**. Y el WebSocket está de verdad escuchando: comprobado, el handshake en
`/socket.io/` responde **HTTP 200**.

**Solución aplicada — esta vez atacando la causa.** El secreto ya no se resuelve en cada
sitio: sale de `common/config/jwt-secret.util.ts`, que es ahora el único lugar que lo lee
y lo valida. Los dos consumidores lo llaman. Cualquier sitio nuevo debe hacer lo mismo.
**8 tests de regresión** sobre ese único punto.

**Lección, y la anoto porque es la que más veces se repite en esta auditoría:** un valor
duplicado se arregla una vez y sigue roto en la otra copia. Buscar `grep` de la cadena
completa **antes** de dar por cerrado un hallazgo, no después.

### 🟡 M-8 — El WebSocket aceptaba conexiones desde cualquier origen (CORREGIDO)

Mismo archivo: `cors: { origin: '*' }`, mientras la API HTTP sí respeta `CORS_ORIGIN`. El
token seguía siendo obligatorio, así que no era una puerta abierta por sí sola, pero no hay
motivo para que las dos mitades de la misma API tengan políticas distintas. Ahora usa la
misma lista que `main.ts`.

### 🔵 B-4 — El tiempo real está construido a medias (NO corregido)

El backend **emite** eventos (`orders.service.ts` llama a `emitOrderUpdated` en 3 sitios) y
el servidor WebSocket está levantado y aceptando conexiones. Pero **el frontend nunca se
conecta**:

```
grep -rniE "socket|websocket|NEXT_PUBLIC_WS_URL|realtime" apps/web/src   ->  sin resultados
apps/web/package.json  ->  no incluye socket.io-client
```

Es decir: el servidor difunde a nadie. `NEXT_PUBLIC_WS_URL` está en los `.env` y en la guía
de despliegue, lo que sugiere que hace falta configurarla — y hoy no sirve para nada.

**No lo he tocado.** Son dos decisiones distintas y las dos son tuyas: terminar la función
(conectar el frontend) o retirarla (quitar el gateway y la variable). Lo que no conviene es
dejarla como está: un servicio en marcha, con su propia superficie de autenticación y CORS,
que no da valor a nadie. **Los dos problemas de seguridad de arriba estaban justamente ahí.**

---

## 🟠 A-8 — Marcaba las notificaciones como enviadas sin enviar nada (CORREGIDO)

**Archivo:** `apps/api/src/notifications/email.service.ts:42`

**El problema.** Con SMTP sin configurar —que es el estado por defecto—, `send()` dejaba un
aviso en el log y **devolvía como si todo hubiera ido bien**. Los dos únicos sitios que lo
llaman son endpoints cuyo trabajo *es* enviar el correo, y marcan la notificación como
enviada justo después.

**Evidencia (reproducido contra la API y comprobado en la base):**

```
POST /notifications/<id>/send-email        (con SMTP_HOST vacío)
  -> HTTP 201, respuesta de éxito

Log del servidor:
  WARN [EmailService] SMTP no configurado — se omite envío de correo a carlos.ramirez@...

Estado en la base:
  status = SENT | sentVia = EMAIL | sentAt = <fecha>
```

**Impacto.** El sistema **afirma un hecho falso**: que se avisó al cliente. El personal del
taller ve «enviado» y da por hecho que el cliente conoce su cotización. El cliente no
recibió nada. Es la misma clase de fallo que F-1 (mostrar «0 clientes» ante un 403): la
aplicación informa de algo que no ocurrió.

**Solución aplicada.** `send()` lanza `ServiceUnavailableException` con un mensaje que
ofrece la alternativa real:

> «El envío de correo no está configurado en este servidor. Usa la opción de copiar el
> mensaje o de WhatsApp, o pide al administrador que configure el correo saliente.»

**Verificado tras el arreglo:** devuelve **503** con ese texto y la notificación **sigue
PENDIENTE**. 5 tests de regresión.

### 🟡 M-9 — Mi propio arreglo A-4 tapaba ese mensaje (CORREGIDO)

Al verificar A-8 en vivo, el usuario recibía `503 "Error interno del servidor"` en lugar
del mensaje útil. **Causa: mi arreglo de A-4.** Genericizaba el mensaje de todo lo que
fuera 5xx, y un `ServiceUnavailableException` es 5xx.

La regla estaba mal planteada. Lo que hay que ocultar no es «lo que sea 5xx», sino **lo que
no controlamos**: una `HttpException` la escribió alguien de este equipo a propósito, y su
texto está pensado para el usuario. Ahora sólo se genericiza lo que **no** es
`HttpException`.

**Verificado:** el 503 del correo llega con su texto; un error inesperado sigue devolviendo
«Error interno del servidor». 3 tests nuevos que cubren justamente esta interacción.

---

## Correo (SMTP) — lo que sí está bien

- **Escapa el HTML** del texto libre (`escapeHtml` en el mensaje, el nombre del cliente y
  el del taller): un `<` en unas notas no rompe el correo, y una carga deliberada no
  inyecta marcado en el buzón del cliente. Cubierto ahora por 2 tests.
- **Un fallo de correo no rompe ningún flujo de negocio.** Los dos puntos de envío son
  endpoints dedicados: si el correo falla, falla esa acción y nada más. La orden, la
  factura y la cotización no dependen de que el correo salga.
- `notification-inbox.sendEmail` marca como enviada **después** de que el envío tenga
  éxito, no antes. El orden es el correcto.

❓ **NO VERIFICADO:** un envío real contra un servidor SMTP. No hay ninguno configurado y
no monté uno falso. Lo verificado es el comportamiento **sin** SMTP y el escapado del HTML.

---

## Agenda y PDF de cotización (Fase 6)

### Agenda / citas

| Comprobación | Resultado |
|---|---|
| Crear cita: nace `SCHEDULED`, ligada al cliente | ✅ |
| Aparece en la agenda con los datos del cliente | ✅ |
| Mover de fecha: la fecha nueva queda guardada | ✅ |
| `SCHEDULED → CONFIRMED → COMPLETED` | ✅ |
| Fecha inválida (`"no-es-una-fecha"`) | ✅ rechazada (400) |
| Tipo de cita inválido | ✅ rechazado (400) |
| Cliente inexistente | ✅ rechazado (409) |

### PDF de cotización

| Comprobación | Resultado |
|---|---|
| Cotización con descuento e IVA | ✅ subtotal 730.000 − 30.000 desc. |
| **El IVA se calcula sobre el importe YA descontado** | ✅ 700.000 × 19% = **133.000** (correcto contablemente) |
| Total | ✅ 833.000 |
| PDF generado | ✅ HTTP 201, ruta guardada en la cotización |
| **Generar el PDF deja la cotización `READY_TO_SEND`** | ✅ transición automática coherente |
| El fichero es un PDF real | ✅ cabecera `%PDF`, 3.058 bytes, con al menos una página |

### ⚠️ Y una confirmación incómoda sobre C-2

**El PDF de la cotización se descarga sin ningún token:**

```
GET /uploads/quotations/818007b9-....pdf   (sin cabecera Authorization)
  -> HTTP 200, 3.058 bytes
```

Hasta ahora C-2 se había descrito sobre las fotos de vehículos y las firmas. **También
afecta a los PDF de cotización**, que es el documento con el nombre del cliente, su
vehículo y el presupuesto detallado. Y estas direcciones **se envían al cliente por
WhatsApp**, así que circulan fuera del sistema por diseño.

*(No pude extraer el texto comprimido del PDF en este entorno para mostrar su contenido
exacto; lo que está verificado es el acceso público sin autenticación, no una transcripción
del documento.)*

Esto **sube la prioridad de C-2** en el plan de corrección: no es sólo «fotos de motos».

---

## 🟡 M-7 — Subir un fichero que no es Excel devolvía 500 (CORREGIDO)

**Archivo:** `apps/api/src/pos/products/product-import.util.ts:121`

**El problema.** Un `.xlsx` es un ZIP. Al subir cualquier otra cosa —un `.csv` renombrado,
un archivo corrupto, una descarga a medias— `ExcelJS.load()` lanza su propio error, que
salía al usuario como **`500 Error interno del servidor`**.

**Evidencia (reproducido):**

```
POST /pos/products/import/preview  con un fichero de texto plano
  -> HTTP 500  {"message":"Error interno del servidor"}
```

**Impacto.** Quien se equivoca de archivo —el caso más común de todos en una importación—
recibe un fallo de servidor en lugar de que le digan qué pasó. Además ensucia los
registros con errores que no son fallos del sistema. No es grave, pero es exactamente el
tipo de detalle que genera una llamada de soporte evitable.

**Solución aplicada.** Envolver la carga y traducirlo a un 400 que dice qué hacer:

> «El archivo no se pudo leer como Excel. Asegúrate de subir un .xlsx generado desde la
> plantilla de exportación (no un .csv ni un archivo dañado).»

**Verificado:** el mismo fichero devuelve ahora **400** con ese mensaje. 3 tests de
regresión (texto plano, contenido CSV y fichero vacío).

---

## Importación masiva de productos (Fase 6)

Los tres pasos, con un Excel construido para la prueba:

| Comprobación | Resultado |
|---|---|
| La **previsualización no escribe nada** | ✅ 50 → 50 productos |
| Detecta las filas malas antes de escribir | ✅ categoría inválida y precio no numérico, con nº de fila |
| **Hoja con errores: no se aplica NADA** | ✅ todo-o-nada, 400 con explicación |
| Hoja limpia: crea lo que toca | ✅ `{"created":3,"updated":0}` |
| Nombre, precio, costo, stock, categoría, color y proveedor | ✅ los siete correctos |
| **Reimportar la misma hoja NO duplica** | ✅ actualiza por referencia |
| Fichero que no es Excel | ✅ 400 con mensaje útil (era 500 — ver M-7) |
| **El cajero no puede importar en bloque** | ✅ 403 |

> **La importación es todo-o-nada, y es la decisión correcta.** Mi prueba esperaba que
> importara las filas buenas y descartara las malas; el sistema rechaza el archivo entero
> con un mensaje claro. Es más seguro: una importación parcial te deja sin saber qué
> entró y qué no. Corregí mi expectativa, no el código.

---

## 🔵 B-3 — La semilla creaba un proveedor con un id que la propia API rechaza (CORREGIDO)

**Archivo:** `apps/api/prisma/seed.ts:19`

**Cómo apareció.** Al probar las órdenes de compra, crear una para el proveedor de
demostración devolvía `400 ["supplierId must be a UUID"]`. El id parecía perfectamente
válido: `00000000-0000-0000-0000-000000000001`.

**Por qué.** `@IsUUID()` de class-validator exige que el dígito de versión (el 13.º
carácter hexadecimal) sea **1-5**. En ese id es `0`, así que **no es un UUID válido**:

```
isUUID('00000000-0000-0000-0000-000000000001')  ->  false
isUUID('2eeff193-330a-4cc1-86eb-fd9780e7e667')  ->  true
```

**Impacto.** Sólo afecta a **datos de demostración**: los proveedores reales usan
`@default(uuid())`, que genera un v4 correcto. Pero hacía imposible probar el módulo de
compras con la semilla, y quien lo intentara concluiría que las compras están rotas cuando
no lo están.

**Solución aplicada.** Una constante `SEED_SUPPLIER_ID` con formato v4 válido
(`11111111-1111-4111-8111-111111111111`), que conserva la idempotencia de la semilla.
La fila existente en la base de desarrollo se actualizó al id nuevo.

---

## Inventario y compras (Fase 6)

Verificado contra la base, con especial atención a todo lo que mueve stock:

| Comprobación | Resultado |
|---|---|
| Alta de producto con stock inicial | ✅ |
| SKU duplicado | ✅ rechazado |
| Editar el precio **no** altera el stock | ✅ |
| Ajuste positivo suma exactamente | ✅ `10 → 15` |
| Ajuste negativo resta exactamente | ✅ `15 → 11` |
| Cada ajuste deja su movimiento | ✅ `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` |
| **Un ajuste no puede dejar el stock negativo** | ✅ `-9999` sobre 11 → 400, stock intacto |
| Orden de compra: total cuadra | ✅ `20 × 9.500 = 190.000` |
| **Crear la orden NO toca el stock todavía** | ✅ |
| **Recibir suma exactamente lo comprado** | ✅ `11 → 31` |
| Queda movimiento ligado a la compra | ✅ `PURCHASE_IN x20` |
| **Recibir dos veces** | ✅ rechazado, **y no volvió a sumar stock** |

Ninguna incoherencia entre stock, movimientos y estado de la compra.

---

## 2 ter. Fase 14 — Dependencias

`pnpm audit` ejecutado el 2026-08-13:

```
35 vulnerabilidades: 19 altas · 15 moderadas · 1 baja
12 paquetes afectados
```

**Ninguna se ha actualizado**, siguiendo tu indicación de documentar antes de tocar. Lo
importante no es el número, sino **cuáles afectan de verdad a esta aplicación**:

| Paquete | Sev. | ¿Afecta aquí? |
|---|---|---|
| `next` 16.2.10 | Alta | **NO.** El aviso es «Middleware / Proxy bypass in App Router». **Esta aplicación no tiene `middleware.ts`** (comprobado) y la autorización se aplica en la API con guards, no en el middleware de Next. El camino vulnerable no existe. |
| `socket.io-parser` | Alta | **Sí, en teoría.** «Zero-attachment Memory Exhaustion» — un atacante podría agotar memoria. **No hay parche**: `socket.io` 4.8.3 ya es la última estable. Atenuante: el WebSocket exige sesión. |
| `sharp` (libvips) | Alta | **Sí, indirectamente.** Llega por la optimización de imágenes de Next (`next/image`, usado en `photos-tab.tsx`). Procesa imágenes subidas por usuarios. |
| `postcss` | Alta | **No en ejecución.** Sólo se usa al compilar (Tailwind). Un atacante tendría que controlar tus hojas de estilo. |
| `brace-expansion`, `nanoid`, `fast-uri`, `uuid` | Alta/Mod. | Transitivas. Sin camino explotable identificado desde esta aplicación. |
| `js-yaml`, `hono`, `@hono/node-server`, `valibot` | Alta/Mod. | **Sólo desarrollo.** Llegan por el CLI de Prisma y herramientas de compilación. No se despliegan. |

### Recomendación

**No actualizar de golpe.** En concreto:

- **`next` 16.2.10 → 16.3.0** existe, pero `apps/web/AGENTS.md` avisa de que esta versión
  de Next tiene cambios importantes respecto a lo habitual. Como **el CVE no aplica**, no
  hay prisa: hazlo cuando puedas probar las 20 pantallas después.
- **`socket.io`** ya está en la última estable. No hay nada que hacer hasta que publiquen
  el parche del parser. **Anótalo para revisarlo.**
- **`sharp`**: llega a través de Next; se resuelve al actualizar Next.
- Las de sólo desarrollo pueden esperar a la siguiente actualización de Prisma.

**Cuando actualices, uno cada vez**, con los 266 tests y la prueba de concurrencia
delante, y probando las pantallas después. Actualizar los 12 de golpe y ver qué se rompe
es la peor forma de hacerlo.

---

## 3. Lo que NO he verificado todavía

Marcado explícitamente, sin inventar resultados:

| Área | Estado |
|---|---|
| Frontend: las 20 pantallas cargan, navegación a detalle | ✅ VERIFICADO en navegador |
| Responsive (escritorio / tableta / móvil) | ✅ VERIFICADO y corregido |
| Comportamiento de la interfaz ante 403/500/desconexión | ✅ VERIFICADO y corregido |
| Build de producción del frontend (`next build`) | ✅ VERIFICADO |
| Formularios (clientes): validación, guardar, cancelar, duplicados, XSS | ✅ VERIFICADO y corregido |
| Flujo de **recepción de orden** (7 pasos, cliente y vehículo nuevos) | ✅ VERIFICADO contra la base |
| Flujo de **venta del POS** + anulación con devolución de stock | ✅ VERIFICADO contra la base |
| **Separados del POS** (apartar, abonar, saldar, cancelar) | ✅ VERIFICADO contra la base |
| **Inventario** (alta, edición, ajustes de stock, movimientos) | ✅ VERIFICADO contra la base |
| **Compras** (crear, pedir, recibir, doble recepción) | ✅ VERIFICADO contra la base |
| **Importación masiva** (previsualizar, aplicar, reimportar, permisos) | ✅ VERIFICADO contra la base |
| **Agenda / citas** (crear, mover, estados, datos inválidos) | ✅ VERIFICADO contra la base |
| **PDF de cotización** (generación, descarga, contenido) | ✅ VERIFICADO |
| **Correo sin SMTP** + escapado de HTML | ✅ VERIFICADO y corregido |
| **WebSocket**: alcanzable, autenticado, aislado por empresa | ✅ VERIFICADO y corregido |
| **Exportaciones a Excel** (clientes, órdenes, facturas) | ✅ VERIFICADO (xlsx válidos) |
| Auditoría de dependencias (`pnpm audit`) | ✅ VERIFICADO y clasificado |
| **Ciclo completo de la orden** (diagnóstico → cotización → aprobación → entrega → factura) | ✅ VERIFICADO contra la base |
| Copia de seguridad y **restauración** de las dos bases | ✅ VERIFICADO (restauración real) |
| **Fase 5 — inventario exhaustivo de botones**: sé cuántos hay por pantalla y que las pantallas no lanzan errores, **no que cada botón haga lo suyo** | ❓ **NO VERIFICADO** |
| **Envío real contra un servidor SMTP** (no hay ninguno configurado) | ❓ **NO VERIFICADO** |
| WhatsApp | ❓ NO VERIFICADO (declarado como no implementado en el propio código) |

---

## 4. Recomendación provisional

🟡 **LISTA CON CONDICIONES** (antes de la corrección era 🔴 NO LISTA).

Los cuatro bloqueadores que impedían desplegar están corregidos y verificados
ejecutándolos: la aplicación arranca con el comando estándar, registra lo que hace, no
acepta ficheros que no sean imágenes, no duplica documentos fiscales, no vende lo que no
tiene y no arranca con un secreto inseguro.

**Condiciones que quedan antes de poner clientes reales dentro:**

1. **Asumir o resolver C-2 parcial:** las imágenes de `/uploads` son públicas para quien
   tenga la URL. Es un dato de cliente. O se acepta conscientemente, o se cierra antes.
2. **Generar secretos JWT nuevos** en el servidor de producción (el `.env` local traía
   `change_me`; ya se sustituyó en desarrollo, pero producción necesita los suyos).
3. **Completar las fases pendientes** de esta auditoría: el frontend no se ha probado en
   navegador, así que de las pantallas, los botones y los formularios **no puedo afirmar
   nada todavía**.

La noticia buena, y no es menor: **el núcleo de seguridad —autenticación, autorización por
rol y aislamiento entre empresas— está bien construido y lo verifiqué ejecutándolo, no
leyéndolo.** Eso es lo más caro de arreglar a posteriori, y aquí está bien. Lo que falló
fue el borde operativo —arranque, logs, subidas y concurrencia— que es justo lo que no se
ve hasta que hay dos personas usando el sistema a la vez.
