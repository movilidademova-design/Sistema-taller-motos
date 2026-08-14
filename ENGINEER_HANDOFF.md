# ENGINEER_HANDOFF.md — Entrega a otro ingeniero

Documento para que alguien que no ha visto este proyecto pueda hacerse cargo **sin
depender de nadie**. Lee esto primero; el resto de documentos entran en detalle.

---

## 1. Qué hace la aplicación

Gestión de talleres de bicimotos y motos eléctricas. **Multiempresa y multisucursal.**

Son dos sistemas que conviven:
- **Taller**: recepción de vehículos con fotos y firma, diagnóstico, cotización con
  aprobación del cliente, reparación, entrega con clave de salida, y factura.
- **POS**: punto de venta con productos, ventas, pagos divididos, separados y cierre mensual.

El POS es una **migración de un sistema Flask anterior** que sigue en la carpeta `motopos/`
como especificación histórica. **No forma parte de la compilación.** Muchos comentarios del
código del POS citan líneas concretas de `app.py`; son la justificación de por qué una
regla es como es.

---

## 2. Arquitectura

Detalle completo en **[ARCHITECTURE.md](ARCHITECTURE.md)**. Lo mínimo:

```
Next.js 16 (frontend)  ──HTTP──>  NestJS 11 (API)  ──Prisma──>  PostgreSQL 16
                                        │
                                        └── dos bases separadas:
                                            taller_motos (28 tablas)
                                            motopos      (9 tablas)
```

Cadena de guards globales en cada petición:
`JwtAuth → Roles → BranchContext → Throttler → ValidationPipe`

---

## 3. Stack

Next.js 16.2 · React 19.2 · Tailwind 4 · Radix/shadcn · SWR ·
NestJS 11 · Prisma 7.8 · PostgreSQL 16 · Passport JWT · Argon2 · Socket.IO ·
PDFKit · ExcelJS · pnpm 9.15 workspaces.

**Node 20 o superior. pnpm, no npm** (es un workspace).

> `apps/web/AGENTS.md` avisa: esta versión de Next.js tiene cambios importantes respecto a
> versiones anteriores. Consulta `node_modules/next/dist/docs/` antes de escribir código
> de frontend.

---

## 4. Estructura del proyecto

Ver `ARCHITECTURE.md` sección 3. Lo que conviene saber de entrada:

- `apps/api/src/common/` — guards, decoradores, filtros y utilidades compartidas. **Mira
  aquí antes de escribir algo nuevo**; probablemente ya existe.
- `apps/api/src/pos/shared/` — bloqueo de numeración, descuento de stock, hueco libre.
  Estas tres piezas resuelven bugs reproducidos; no las esquives.
- `apps/api/prisma/` — dos esquemas, dos juegos de migraciones.
- `apps/web/src/lib/api.ts` — **todas** las llamadas pasan por aquí. Renueva el token
  automáticamente en un 401.

---

## 5. Base de datos

**[DATABASE.md](DATABASE.md)** tiene el detalle. Lo esencial:

- **Dos bases separadas a propósito.** El POS guarda `tenantId`/`branchId` como texto sin
  clave foránea porque apuntan a la otra base. Es el aislamiento buscado.
- 28 + 9 tablas · 66 claves foráneas · 90 índices.
- Reglas de borrado con criterio: `RESTRICT` donde borrar destruiría historial contable,
  `CASCADE` sólo donde el hijo no tiene sentido solo.
- **Todo el dinero es `Decimal`.** Nunca coma flotante.

**Todo lo que hagas con una base, hazlo con las dos**: migraciones, copias, restauraciones.

---

## 6. Variables de entorno

Tabla completa en `ARCHITECTURE.md` sección 10. Las trampas:

| Variable | Trampa |
|---|---|
| `JWT_ACCESS_SECRET` | **La API no arranca** sin él, ni con `change_me`, ni con menos de 32 caracteres. Es deliberado |
| `POS_DATABASE_URL` | Se olvida constantemente. Es una base **distinta** |
| `CORS_ORIGIN` | Si está mal, el navegador bloquea todo y la aplicación parece rota sin explicar por qué |
| `NODE_ENV` | En `production` desactiva Swagger y oculta los errores internos |
| `NEXT_PUBLIC_*` | Se **incrustan al compilar**. Cambiarlas exige recompilar, no reiniciar |

---

## 7. Usuarios y permisos

Dos ejes independientes: `Role` (taller) y `PosRole` (POS). Ambos opcionales pero **al
menos uno**, impuesto por una restricción de base.

| Rol | Alcance |
|---|---|
| `ADMIN` | Todo el taller, todas las sucursales |
| `MANAGER` | Casi todo salvo administración de usuarios |
| `RECEPTIONIST` | Recepción, clientes, vehículos, agenda |
| `TECHNICIAN` | Diagnóstico y estados de sus órdenes |
| `PosRole.ADMIN` | Todo el POS, incluidos informes |
| `PosRole.CASHIER` | Vender y consultar |

**`RolesGuard` cierra por defecto**: un endpoint sin decorador exige rol de taller, así que
una cuenta sólo-POS no alcanza el taller aunque nadie se acordara de poner `@Roles`. Los
endpoints del POS se marcan uno a uno con `@PosRoles`.

Verificado ejecutándolo: todos los cruces indebidos devuelven `403`.

---

## 8. APIs

**128 endpoints en 30 controladores.** Sólo **5 públicos**: los 4 de `/auth` y el de salud.

Documentación interactiva en `/api/docs` **cuando `NODE_ENV` no es `production`**.

Convención: `tenantId`, `branchId` y `userId` **nunca** vienen del cuerpo de la petición.
Los inyectan `@CurrentUser()` y `@CurrentBranch()` desde el token verificado y el guard.
**Respétalo**: es la base del aislamiento entre empresas.

---

## 9. Integraciones

| Servicio | Estado |
|---|---|
| S3 / Cloudflare R2 | Implementado (`STORAGE_DRIVER=s3`). Por defecto, disco local |
| SMTP | Implementado, inactivo sin configurar. **No verificado** |
| WhatsApp | **No implementado.** Se abre WhatsApp Web con el mensaje ya escrito |
| Socket.IO | Notificaciones en el propio proceso de la API. **No verificado** |

Sin pasarela de pago ni facturación electrónica.

---

## 10. Despliegue

**[DEPLOYMENT.md](DEPLOYMENT.md)**, paso a paso.

Dos cosas que cuestan tiempo si no las sabes:

1. **El punto de entrada es `dist/src/main.js`**, no `dist/main.js`. La compilación incluye
   ficheros de fuera de `src/` y eso desplaza el árbol. `start:prod` ya apunta bien.
2. **Recompilar no basta: hay que reiniciar.** Node carga el código en memoria al arrancar.

---

## 11. Copias de seguridad

**[BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)**. Comandos probados de verdad.

**Las dos bases.** Y prueba una restauración una vez al mes: una copia que nunca has
restaurado no es una copia.

---

## 12. Registros

```bash
pm2 logs taller-api --lines 200
pm2 logs --err
```

`main.ts` llama a `app.flushLogs()` y envuelve el arranque en un `.catch()` que registra y
sale con código ≠ 0. **Sin eso, la API arrancaba y fallaba sin escribir una sola línea** —
era el hallazgo A-5.

---

## 13. Problemas conocidos

| # | Problema | Estado |
|---|---|---|
| **C-2** | **Las imágenes de clientes en `/uploads` son públicas, sin autenticación** | ⚠️ Abierto. Ver `PLAN_DE_CORRECCION.md` 1.1 |
| M-2 | Tokens (7 días) en `localStorage` | Aplazado; sin XSS conocido, con CSP |
| M-5 | La numeración carga todas las ventas de la sucursal en cada cobro | Se degrada con el volumen |
| M-6 | 44 errores de tipos previos: `tsc` nunca está en verde | `tsc` no sirve hoy como barrera |
| F-4 | Sin `@MaxLength` en los campos de texto | 600 caracteres se aceptan |
| B-1 | Jest avisa de procesos sin cerrar | Puede colgar CI |
| — | 85 ficheros con errores de formato de Prettier | Previo |

**Sin verificar** (no afirmes que funcionan): separados del POS, formularios de inventario
y compras, importación masiva, exportaciones, SMTP, tiempo real, y **cualquier cosa en un
servidor real**.

---

## 14. Decisiones técnicas importantes

Cada una tiene su razón. Están explicadas en `ARCHITECTURE.md` sección 14:

1. Dos bases separadas (aislamiento taller/POS).
2. El rol se relee de la base en cada petición, no se confía al token.
3. Los números de factura y recibo **reutilizan huecos** — decisión fiscal deliberada.
4. Los ítems de venta guardan **copia congelada** del nombre y el precio.
5. Las fotos de recepción **no se pueden borrar** — son evidencia.
6. Todo el dinero en `Decimal`.
7. La numeración se serializa con `pg_advisory_xact_lock`.

El código está **muy comentado, y los comentarios explican el porqué**, no el qué. Léelos
antes de simplificar algo: varios documentan bugs que ya se pagaron una vez.

---

## 15. Qué NO modificar sin entenderlo antes

| No toques | Por qué |
|---|---|
| `pos/shared/branch-lock.util.ts` | Quitar el bloqueo reabre **corrupción de datos reproducible**: dos recibos con el mismo número, guardados sin error |
| `pos/shared/stock.util.ts` | Volver a "comprobar y luego restar" deja el **stock en negativo**. Reproducido |
| `Decimal` en los importes | Coma flotante = descuadres que nadie sabrá explicar |
| La separación de las dos bases | Es el aislamiento buscado |
| `JwtStrategy.validate()` | Confiar el rol al token hace que revocar no surta efecto |
| `@BlankToUndefined()` en los DTOs | Sin él **no se puede crear un cliente sin correo**. Afecta a 38 campos |
| `RolesGuard` (cierra por defecto) | Abrirlo expone el taller a las cuentas sólo-POS |
| El `min-w-0` de `(app)/layout.tsx` | Sin él la página **desborda en horizontal** en móvil y tableta |

---

## 16. Cómo hacer cambios correctamente

1. Rama nueva desde `main`.
2. **Lee los comentarios** del código que vas a tocar. Explican el porqué.
3. Cambio pequeño y enfocado. Un cambio, un propósito.
4. **Test que falla antes y pasa después**, si es lógica de negocio.
5. Ejecuta todo:
   ```bash
   pnpm --filter @taller/api test              # 266
   pnpm --filter @taller/api test:concurrency  # necesita la base levantada
   npx tsc --noEmit                            # no debe subir de 44 errores
   npx eslint <tus ficheros>
   ```
6. Si tocas el esquema: migración con nombre descriptivo, y **comprueba duplicados antes**
   de añadir una restricción `UNIQUE`.

---

## 17. Cómo probar antes de producción

```bash
# 1. Base limpia
docker compose up -d postgres
pnpm --filter @taller/api prisma:deploy
pnpm --filter @taller/api pos:migrate
pnpm --filter @taller/api prisma:seed

# 2. Compila como en producción
pnpm --filter @taller/api build
pnpm --filter @taller/web build

# 3. Arranca con la configuración de producción
NODE_ENV=production node apps/api/dist/src/main.js
cd apps/web && pnpm start

# 4. Comprobaciones mínimas
curl -i http://localhost:3001/api/clients        # 401
curl -o /dev/null -w "%{http_code}\n" http://localhost:3001/api/docs   # 404
```

Y a mano: iniciar sesión, crear un cliente, recorrer el asistente de recepción, hacer una
venta en el POS. **Contrasta cada resultado con la base de datos**, no sólo con la pantalla:
es el método que encontró los bugs de esta auditoría.

---

## 18. Cómo volver atrás

`DEPLOYMENT.md` sección 13.

> ⚠️ **Volver atrás en el código NO deshace las migraciones.** Si desplegaste una migración
> que cambia el esquema, el código antiguo puede no entenderse con él. La única vuelta
> atrás real es la **copia de la base hecha antes de migrar**. Por eso el paso 1 de toda
> actualización es la copia.

---

## 19. Antes de tu primer cambio

1. Levanta el proyecto en local (`ARCHITECTURE.md` §11).
2. Ejecuta los 266 tests y la prueba de concurrencia. Que pasen antes de tocar nada.
3. Lee `CODE_AUDIT.md` entero: sabrás qué se rompió, por qué y cómo se arregló.
4. Lee `PLAN_DE_CORRECCION.md`: sabrás qué queda y por qué en ese orden.
5. Haz una copia de seguridad. Acostúmbrate.

**Una advertencia sobre el método.** Dos veces durante la auditoría un fallo aparente
resultó ser **código defensivo funcionando correctamente**: `forbidNonWhitelisted`
rechazando campos de más, y dos máquinas de estados impidiendo transiciones inválidas.
Antes de "arreglar" algo que falla, **lee el mensaje de error entero y aísla la causa**.
Este proyecto rechaza bastantes cosas a propósito.
