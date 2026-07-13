# Sistema de Gestión de Taller — Bicimotos y Motos Eléctricas

Plataforma SaaS multi-tenant para administrar talleres especializados en bicimotos y motos
eléctricas: recepción, diagnóstico, cotización, reparación, inventario, facturación y reportes.

## Arquitectura

Monorepo gestionado con **pnpm workspaces**:

```
apps/
  api/    NestJS + Prisma + PostgreSQL — API REST documentada con Swagger
  web/    Next.js (App Router) + TailwindCSS + componentes estilo shadcn/ui
packages/
  shared/ Enums y constantes TypeScript compartidas por el frontend
```

### Backend (`apps/api`)

- **NestJS** con arquitectura modular (un módulo por dominio: `orders`, `clients`,
  `motorcycles`, `inventory`, `payments`, `invoices`, `warranties`, `appointments`,
  `dashboard`, `audit`, etc.)
- **Prisma 7** como ORM sobre **PostgreSQL**, con el driver adapter `@prisma/adapter-pg`.
- **Multi-tenant por fila**: toda tabla de negocio tiene `tenantId`; cada request autenticado
  lleva el `tenantId` del usuario y todos los queries lo filtran explícitamente. Un taller
  nunca puede ver datos de otro.
- **Auth**: JWT de acceso (corta duración) + refresh tokens con rotación, revocación e
  historial, hasheados con `argon2`. Guards globales (`JwtAuthGuard`, `RolesGuard`) más
  decoradores `@Public()` y `@Roles()`.
- **Roles**: `ADMIN`, `MANAGER`, `RECEPTIONIST`, `TECHNICIAN`, `CLIENT` (portal de cliente
  preparado para el futuro).
- **Ciclo de vida de órdenes**: máquina de estados validada en `orders/order-status.util.ts`
  (Recibida → Diagnóstico → Esperando aprobación → Esperando repuestos / En reparación →
  Pruebas → Lista para entrega → Entregada, más Cancelada y Garantía).
- **Inventario en tiempo real**: al aprobar una cotización, los repuestos con `productId` se
  descuentan automáticamente del inventario y quedan registrados como movimientos
  (`InventoryMovement`). Las compras a proveedores reponen el stock al marcarse "recibidas".
- **Facturación**: numeración automática por taller, generación de PDF con `pdfkit`
  (cotizaciones, órdenes y facturas), envío por correo con `nodemailer`.
- **Tiempo real**: gateway de WebSockets (`socket.io`) que emite `order:updated` por
  `tenantId` para refrescar tableros sin recargar.
- **Auditoría**: interceptor global que registra en `AuditLog` cada operación de escritura
  marcada con `@Audit('Entidad')` — usuario, IP, acción y payload (nunca se borra).
- **Almacenamiento**: `StorageService` abstrae S3/Cloudflare R2 (vía `STORAGE_DRIVER=s3`) con
  fallback a disco local para desarrollo sin configuración.
- **WhatsApp**: arquitectura preparada (`notifications/whatsapp.service.ts`) con plantillas
  ya definidas (moto recibida, cotización disponible, en reparación, lista, agradecimiento,
  recordatorio de mantenimiento) enrutadas por una interfaz `WhatsappProvider`. Hoy usa un
  proveedor "noop" que solo registra logs — conectar un proveedor real es un cambio de un
  archivo, tal como pide el alcance del proyecto.
- **Swagger**: documentación interactiva en `/api/docs`.

### Frontend (`apps/web`)

- **Next.js 16** (App Router) con componentes cliente para todo el dashboard autenticado
  (evita la complejidad de Server Actions/caching para una SPA de gestión con JWT).
- **TailwindCSS v4** + primitivas propias estilo **shadcn/ui** construidas a mano sobre
  Radix UI (el registro de `ui.shadcn.com` no era alcanzable desde este entorno, así que los
  componentes en `src/components/ui/` replican fielmente el patrón oficial: mismas props,
  mismas clases, misma filosofía "código tuyo, no una dependencia opaca").
- **Modo oscuro/claro** con `next-themes`, paleta con variables OKLCH.
- **SWR** para datos remotos con revalidación; **recharts** para las gráficas del panel.
- Módulos: Panel (KPIs + gráficas), Clientes, Bicimotos, Órdenes (checklist, fotos,
  diagnóstico, cotización, mano de obra, historial de estados), Inventario (productos,
  categorías, proveedores, movimientos), Compras, Garantías, Pagos, Facturas, Agenda y
  Configuración (datos del taller + usuarios).

## Requisitos

- Node.js 20+
- pnpm 9+
- PostgreSQL 16 (incluido como contenedor en `docker-compose.yml`)

## Puesta en marcha

```bash
# 1. Instalar dependencias del monorepo
pnpm install

# 2. Levantar PostgreSQL (o usa una instancia propia y ajusta DATABASE_URL)
docker compose up -d

# 3. Configurar variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 4. Migrar la base de datos y generar el cliente Prisma
pnpm --filter @taller/api prisma:migrate
pnpm --filter @taller/api prisma:generate

# 5. Cargar datos de ejemplo (un taller demo, usuarios, cliente, bicimoto, producto)
pnpm --filter @taller/api prisma:seed

# 6. Levantar ambos servidores en desarrollo (en dos terminales)
pnpm --filter @taller/api start:dev   # http://localhost:3001/api  (docs en /api/docs)
pnpm --filter @taller/web dev         # http://localhost:3000
```

### Usuarios de prueba (creados por el seed)

Todos con contraseña `Password123!`:

| Rol            | Correo                       |
| -------------- | ---------------------------- |
| Administrador  | admin@tallerdemo.com         |
| Gerente        | gerente@tallerdemo.com       |
| Recepcionista  | recepcion@tallerdemo.com     |
| Técnico        | tecnico@tallerdemo.com       |

También puedes crear un taller nuevo desde `/register` (flujo de alta de tenant, pensado
para el modelo SaaS de autoservicio).

## Scripts útiles

| Comando                                   | Descripción                                  |
| ------------------------------------------ | --------------------------------------------- |
| `pnpm --filter @taller/api start:dev`      | API en modo desarrollo (watch)                |
| `pnpm --filter @taller/api build`          | Compila la API a `apps/api/dist`              |
| `pnpm --filter @taller/api prisma:migrate` | Crea/aplica migraciones en desarrollo         |
| `pnpm --filter @taller/api prisma:seed`    | Carga datos de ejemplo                        |
| `pnpm --filter @taller/web dev`            | Frontend en modo desarrollo (Turbopack)        |
| `pnpm --filter @taller/web build`          | Build de producción del frontend              |

## Notas técnicas relevantes

- **Prisma 7** cambia el generador por defecto a `prisma-client` (salida en
  `apps/api/src/generated/prisma`, TypeScript en vez de binario) y requiere un *driver
  adapter* explícito (`@prisma/adapter-pg`) — ya está resuelto en `PrismaService`. El
  generador se configuró con `moduleFormat = "cjs"` porque el resto del proyecto Nest
  compila a CommonJS.
- **Next.js 16**: `params`/`searchParams` son ahora `Promise` (se resuelven con `React.use()`
  en los componentes cliente de páginas dinámicas); `middleware.ts` se reemplazó
  conceptualmente por `proxy.ts` (no se usa en este proyecto todavía).
- El monto de dinero se maneja como `Decimal` en Prisma/PostgreSQL; el frontend los recibe
  serializados como string y los convierte a `number` solo para presentarlos.

## Seguridad

- Contraseñas con `argon2`.
- JWT de acceso de vida corta + refresh tokens rotativos y revocables (tabla
  `refresh_tokens`, con hash del token, no el token en claro).
- `helmet`, `compression`, `class-validator` (`whitelist` + `forbidNonWhitelisted`) y
  rate limiting (`@nestjs/throttler`) activados globalmente.
- Aislamiento estricto por `tenantId` en cada consulta — nunca se confía en el `tenantId`
  del body, siempre viene del JWT validado.
- Nada se borra físicamente: clientes, usuarios y bicimotos usan borrado lógico
  (`isActive`); el historial de auditoría y el historial de estados de orden son
  append-only.

## Extensibilidad prevista

La arquitectura modular (controllers/services/DTOs separados por dominio, guards y
decoradores reutilizables, `StorageService`/`WhatsappService` desacoplados por interfaz)
está pensada para agregar sin fricción: CRM, ventas de motos, POS, e-commerce, apps
móviles, portal de clientes/proveedores, integración contable, WhatsApp Business API real,
pasarelas de pago, códigos QR/barras, notificaciones push y firma digital — sin tocar los
módulos existentes.
