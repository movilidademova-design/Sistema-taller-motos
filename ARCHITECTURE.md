# ARCHITECTURE.md — Cómo funciona la aplicación

Documento de referencia técnica. Las cifras salen de contar sobre el código real el
2026-08-13, no de estimaciones.

---

## 1. Qué es

Sistema de gestión para talleres de bicimotos y motos eléctricas, **multiempresa**
(varios talleres en la misma instalación) y **multisucursal**.

Son en realidad **dos sistemas que conviven** en una sola aplicación:

| Sistema | Para qué | Quién entra |
|---|---|---|
| **Taller** | Órdenes de trabajo, diagnósticos, cotizaciones, facturas, inventario, agenda | `Role`: ADMIN, MANAGER, RECEPTIONIST, TECHNICIAN |
| **POS** | Punto de venta: productos, ventas, separados, cierre mensual | `PosRole`: ADMIN, CASHIER |

Un usuario puede tener rol de taller, de POS, o ambos — pero **al menos uno**, y lo impone
una restricción de la base de datos. La separación está aplicada en el servidor, no sólo
escondiendo botones: verificado ejecutándolo (`CODE_AUDIT.md`, sección 2).

---

## 2. Tecnologías

| Capa | Tecnología | Versión |
|---|---|---|
| Frontend | Next.js (App Router) + React | 16.2.10 / 19.2.4 |
| Estilos | Tailwind CSS 4 + Radix UI (shadcn) | — |
| Datos en cliente | SWR | 2.4 |
| Backend | NestJS | 11 |
| ORM | Prisma (con adaptador `pg`) | 7.8 |
| Base de datos | PostgreSQL | 16 |
| Autenticación | JWT (Passport) + Argon2 | — |
| Tiempo real | Socket.IO | 4.8 |
| Documentos | PDFKit (cotizaciones) · ExcelJS (exportaciones) | — |
| Almacenamiento | Disco local o S3/Cloudflare R2 | — |
| Monorepo | pnpm workspaces | pnpm 9.15.0 |

---

## 3. Estructura de carpetas

```
sistema-taller-motos/
├── apps/
│   ├── api/                        NestJS — el backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma       Esquema del taller (28 tablas)
│   │   │   ├── migrations/         19 migraciones
│   │   │   ├── pos/                Esquema y migraciones del POS (9 tablas)
│   │   │   └── seed.ts             Datos de demostración (SOLO desarrollo)
│   │   ├── src/
│   │   │   ├── main.ts             Arranque: CORS, helmet, validación, Swagger
│   │   │   ├── app.module.ts       Registra módulos y los guards globales
│   │   │   ├── auth/               Login, refresco, registro de empresa
│   │   │   ├── common/
│   │   │   │   ├── guards/         JwtAuth, Roles, BranchContext
│   │   │   │   ├── decorators/     @Roles @PosRoles @Public @CurrentUser @CurrentBranch
│   │   │   │   ├── filters/        Traducción y saneado de errores
│   │   │   │   ├── interceptors/   Auditoría automática
│   │   │   │   ├── dto/            Utilidades de validación compartidas
│   │   │   │   ├── upload/         Reglas de subida de imágenes (compartidas)
│   │   │   │   ├── pdf/ excel/     Generación de documentos
│   │   │   │   └── utils/          Duración, código de recogida, filtros de export
│   │   │   ├── orders/             Órdenes + diagnóstico, cotizaciones, fotos
│   │   │   ├── pos/                Punto de venta (base de datos aparte)
│   │   │   │   └── shared/         Bloqueo de numeración, stock, hueco libre
│   │   │   ├── inventory/          Productos, categorías, proveedores, movimientos
│   │   │   └── …                   clients, motorcycles, invoices, branches, users…
│   │   └── test/
│   │       └── concurrency.check.ts  Prueba de carreras contra PostgreSQL real
│   └── web/                        Next.js — el frontend
│       └── src/
│           ├── app/
│           │   ├── (app)/          Pantallas con sesión (layout con menú)
│           │   ├── login/ register/
│           │   └── layout.tsx      Proveedores: tema, sesión, SWR, avisos
│           ├── components/
│           │   ├── ui/             Componentes base (shadcn)
│           │   ├── orders/         Piezas del módulo de órdenes
│           │   └── providers/      auth-provider, swr-provider, theme-provider
│           ├── hooks/              useApiSWR
│           └── lib/                Cliente de API, sesión, tipos
├── packages/shared/                Tipos compartidos entre ambos
├── docker-compose.yml              PostgreSQL 16 para desarrollo
└── motopos/                        Sistema Flask anterior. NO forma parte de la
                                    compilación; se conserva como especificación
                                    histórica de la lógica del POS.
```

---

## 4. El recorrido de una petición

```
Navegador
   │  fetch con Authorization: Bearer <token>  y  X-Branch-Id: <sucursal>
   ▼
lib/api.ts ─── si recibe 401, renueva el token y reintenta una vez
   │
   ▼
NestJS  ─────────────────────────────────────────────────────
   │
   ├─ 1. JwtAuthGuard      ¿token válido? (@Public lo salta)
   │                        Relee el usuario de la base en CADA petición
   ├─ 2. RolesGuard        ¿el rol permite este endpoint?
   ├─ 3. BranchContextGuard ¿la sucursal del encabezado es suya y está activa?
   ├─ 4. ThrottlerGuard    límite de peticiones
   ├─ 5. ValidationPipe    valida el DTO y rechaza campos desconocidos
   ├─ 6. Controlador       recibe tenantId, branchId y userId ya resueltos
   ├─ 7. Servicio          lógica de negocio; transacciones donde hace falta
   ├─ 8. Prisma            SQL, siempre filtrando por tenantId
   └─ 9. AuditInterceptor  registra la escritura
   │
   ▼
PostgreSQL   taller_motos  |  motopos
```

**El punto clave de seguridad:** `tenantId` y `branchId` **nunca** llegan del cuerpo de la
petición. Salen del token verificado y del guard. Un cliente no puede pedir datos de otra
empresa cambiando un campo, y está comprobado ejecutándolo.

---

## 5. Autenticación

- Contraseñas con **Argon2**.
- **Token de acceso** (JWT, 15 minutos) y **token de refresco** (opaco, 7 días, guardado
  hasheado con SHA-256 en la base).
- **Rotación**: al renovar, el token usado se revoca y se emite uno nuevo.
- El frontend renueva de forma transparente al recibir un 401, y reintenta la petición.

**Decisión de diseño acertada y poco común:** el rol **no se confía al token**.
`JwtStrategy.validate()` relee el usuario de la base en cada petición, así que revocar un
rol o desactivar una cuenta surte efecto **inmediato**, sin esperar a que caduque la
sesión. Cuesta una consulta por petición y lo vale.

**La aplicación no arranca** si `JWT_ACCESS_SECRET` falta, es el valor de ejemplo o tiene
menos de 32 caracteres. Es deliberado: un despliegue mal configurado debe fallar de forma
ruidosa, no quedarse aceptando tokens forjables en silencio.

---

## 6. Autorización

Tres guards globales, en cadena:

**`RolesGuard`** — cierra por defecto. Un endpoint sin decorador de rol exige tener rol de
taller (`return !!user.role`), así que una cuenta sólo-POS no alcanza el taller aunque
nadie se acordara de poner `@Roles`. Los endpoints del POS se marcan uno a uno con
`@PosRoles`.

**`BranchContextGuard`** — valida el encabezado `X-Branch-Id`:
- Sucursal de **otra empresa** → `403` y se corta la petición. No debería ocurrir nunca,
  así que se trata como señal de alarma.
- Sucursal propia pero no utilizable (desactivada, o permiso retirado a mitad de sesión) →
  **no falla**; simplemente no se resuelve la sucursal. Es un cambio de estado benigno que
  un administrador puede provocar en cualquier momento, y bloquear la petición dejaría al
  usuario sin poder llegar ni al endpoint que le permite elegir otra sucursal.
- `@CurrentBranch()` lanza su propio `400` en los endpoints que sí necesitan sucursal, así
  que nada se amplía silenciosamente a toda la empresa.

**`ThrottlerGuard`** — 200 peticiones/minuto en general; el login baja a 8/minuto y el
registro de empresa a 3/hora.

---

## 7. Los 128 endpoints

30 controladores. Distribución real:

| Área | Endpoints | Protección |
|---|---|---|
| `/orders` (+ diagnóstico, cotización, fotos) | 22 | `@Roles` |
| `/users` | 9 | `@Roles` + `@PosRoles` |
| `/clients` | 7 | `@Roles` |
| `/pos/products` | 7 | `@PosRoles` |
| `/pos/sales`, `/pos/layaways` | 12 | `@PosRoles` |
| `/inventory/*` | 14 | `@Roles` |
| `/invoices`, `/purchase-orders` | 12 | `@Roles` |
| `/dashboard` | 6 | sesión de taller |
| `/auth` | 4 | **`@Public`** |
| resto | 15 | `@Roles` |

**Sólo 5 endpoints son públicos**: los 4 de `/auth` (login, registro de empresa, refrescar,
cerrar sesión) y el de salud en la raíz. Todo lo demás exige sesión — verificado
ejecutándolo.

`/dashboard` y `/inventory/movements` no llevan `@Roles`: cualquier usuario **con rol de
taller** puede leerlos. Es intencionado (son datos de consulta interna), pero conviene
saberlo.

---

## 8. Entidades principales

Ver **[DATABASE.md](DATABASE.md)** para el detalle. Resumen:

```
Tenant ──< Branch ──< UserBranch >── User
   └──< Client ──< Motorcycle ──< Order ──┬── Diagnosis ──< DiagnosisPart
                                          ├── Quotation ──< QuotationItem
                                          ├── OrderStatusHistory
                                          ├── Invoice (1:1)
                                          └── InventoryMovement

[base motopos, separada]
PosProduct ──< PosSaleItem >── PosSale ──< PosSalePayment
     └───────< PosLayawayItem >── PosLayaway ──< PosLayawayPayment
```

El ciclo de la orden lo gobierna una **máquina de estados** explícita
(`orders/order-status.util.ts`): `RECEIVED → DIAGNOSING → WAITING_APPROVAL → …`. Las
transiciones inválidas se rechazan con un mensaje en español. Las cotizaciones tienen la
suya propia.

---

## 9. Integraciones externas

| Servicio | Estado |
|---|---|
| **S3 / Cloudflare R2** | Implementado. Se activa con `STORAGE_DRIVER=s3`. Por defecto usa disco local. |
| **SMTP (correo)** | Implementado con nodemailer. Inactivo si no se configura. **No verificado en esta auditoría.** |
| **WhatsApp** | **No implementado.** El módulo existe preparado y `WHATSAPP_PROVIDER=none`. El envío al cliente se hace hoy abriendo WhatsApp Web con el mensaje ya escrito. |
| **Socket.IO** | Notificaciones en tiempo real, dentro del propio proceso de la API. **No verificado.** |

No hay pasarela de pago, ni facturación electrónica, ni ningún servicio de terceros más.

---

## 10. Variables de entorno

### `apps/api/.env`

| Variable | Para qué | Cuidado |
|---|---|---|
| `DATABASE_URL` | Base del taller | |
| `POS_DATABASE_URL` | Base del POS | **Distinta de la anterior** |
| `NODE_ENV` | Entorno | `production` desactiva Swagger y oculta los errores internos |
| `PORT` | Puerto de la API | 3001 por defecto |
| `JWT_ACCESS_SECRET` | Firma del token | **Sin él la API no arranca.** Mínimo 32 caracteres |
| `JWT_REFRESH_SECRET` | Token de refresco | |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Caducidades | `15m` / `7d` |
| `CORS_ORIGIN` | Dominios permitidos | Si está mal, el navegador bloquea todo sin explicación clara |
| `PUBLIC_URL` | Base de los enlaces al cliente | Dominio público de la API, no localhost |
| `STORAGE_DRIVER` | `local` o `s3` | |
| `S3_*` | Credenciales de almacenamiento | Sólo con `STORAGE_DRIVER=s3` |
| `SMTP_*` | Correo saliente | Opcional |
| `WHATSAPP_*` | Preparado, sin implementar | |

### `apps/web/.env.local`

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_API_URL` | Dirección de la API, con `/api` al final |
| `NEXT_PUBLIC_WS_URL` | Dirección para el tiempo real |

> ⚠️ Estas dos se **incrustan al compilar**. Cambiarlas exige **recompilar** el frontend;
> reiniciarlo no basta.

---

## 11. Arrancar en local

```bash
# 1. Base de datos
docker compose up -d postgres
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "CREATE DATABASE motopos;"

# 2. Dependencias
pnpm install

# 3. Configuración
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Genera secretos reales (la API no arranca con "change_me"):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 4. Migraciones y datos de prueba
pnpm --filter @taller/api prisma:generate
pnpm --filter @taller/api pos:generate
pnpm --filter @taller/api prisma:deploy
pnpm --filter @taller/api pos:migrate
pnpm --filter @taller/api prisma:seed

# 5. Arrancar (dos terminales)
pnpm dev:api      # http://localhost:3001/api
pnpm dev:web      # http://localhost:3000
```

Usuarios de prueba (todos con `Password123!`): `admin@`, `gerente@`, `recepcion@`,
`tecnico@`, `cajero@`, `pos-admin@` — todos `@tallerdemo.com`.

---

## 12. Pruebas

```bash
pnpm --filter @taller/api test              # 266 tests unitarios
pnpm --filter @taller/api test:concurrency  # carreras, contra PostgreSQL real
pnpm --filter @taller/api test:cov          # con cobertura
```

`test:concurrency` **necesita la base levantada y migrada**. Comprueba las tres carreras
que se reprodujeron en la auditoría (stock negativo, número de factura, recibo duplicado)
y sale con código 1 si alguna vuelve a abrirse.

> El typecheck (`npx tsc --noEmit`) **arrastra 44 errores previos** en scripts obsoletos y
> tres ficheros de test, todos excluidos de la compilación. No afectan a la aplicación
> compilada, pero significan que `tsc` no sirve hoy como barrera de calidad. Hallazgo
> **M-6** en `CODE_AUDIT.md`.

---

## 13. Compilar y desplegar

```bash
pnpm --filter @taller/api build      # -> apps/api/dist/src/main.js
pnpm --filter @taller/web build      # -> apps/web/.next/
```

> El punto de entrada de la API queda en **`dist/src/main.js`**, no en `dist/main.js`,
> porque la compilación incluye ficheros de fuera de `src/`. El script `start:prod` ya
> apunta ahí; fue el hallazgo **C-1** de la auditoría, y bloqueaba el despliegue por
> completo.

Procedimiento completo en **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## 14. Decisiones de diseño que conviene entender antes de tocar nada

1. **Dos bases separadas.** Taller y POS no comparten base, y el POS guarda `tenantId` y
   `branchId` como texto sin clave foránea. No es un descuido: es el aislamiento buscado.
2. **El rol se relee en cada petición**, no se confía al token. Revocar surte efecto ya.
3. **Los números de factura y recibo reutilizan huecos.** Anular una venta libera su
   número para la siguiente. Es una decisión fiscal deliberada, heredada del sistema
   anterior.
4. **Los ítems de venta guardan copia congelada** del nombre y el precio. Editar un
   producto no altera una venta pasada.
5. **Las fotos de recepción no se pueden borrar.** Son la evidencia que respalda la firma
   del cliente.
6. **Todo el dinero es `Decimal`.** Nunca coma flotante. No lo cambies.
7. **La numeración se serializa con bloqueo consultivo.** Quitarlo reabre corrupción de
   datos reproducible.
