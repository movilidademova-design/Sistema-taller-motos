# PLAN_DE_CORRECCION.md — Qué queda y en qué orden

Lo ya corregido está en `CODE_AUDIT.md` con su evidencia. Este documento es **sólo lo que
falta**, ordenado por riesgo real, no por facilidad.

---

## Estado de partida

```
🔴 Críticos    6 encontrados  →  5 corregidos, 1 parcial
🟠 Altos      10 encontrados  → 10 corregidos
🟡 Medios     10 encontrados  →  6 corregidos, 4 pendientes
🔵 Bajos       4 encontrados  →  2 corregidos (ninguno afecta a producción)
```

---

## PRIORIDAD 1 — Antes de abrir a clientes reales

### 1.1 🔴 Decidir sobre las imágenes públicas (C-2 parcial)

**El problema.** Las fotos de vehículos, las firmas de recepción **y los PDF de cotización**
se sirven en `/uploads` **sin pedir sesión**. Cualquiera con la dirección los ve. Son datos
de cliente.

**Verificado durante la auditoría:** `GET /uploads/quotations/<id>.pdf` sin cabecera de
autenticación devuelve **HTTP 200**. Y las direcciones de esos PDF **se envían al cliente
por WhatsApp**, así que salen del sistema por diseño: no son un secreto bien guardado.

**Tienes dos salidas, y las dos son legítimas:**

**Opción A — Aceptarlo conscientemente.** Las direcciones son aleatorias y no se adivinan
por casualidad. Si las fotos son de motos genéricas y las firmas no te preocupan, puedes
abrir así y cerrarlo más adelante. **Pero decídelo, no lo dejes por olvido.**

**Opción B — Cerrarlo. 2-3 días de trabajo.**
1. Crear `GET /orders/:id/photos/:photoId/file` autenticado, que compruebe el tenant y
   devuelva el fichero.
2. Quitar `app.useStaticAssets(...)` de `main.ts:16`.
3. Migrar las direcciones guardadas en `OrderPhoto.url`, `Motorcycle.photoUrl`,
   `Order.signatureUrl` y `Quotation.pdfUrl`.
4. Actualizar el frontend para usar `fetchAuthedBlob`, que ya existe y ya manda la sesión.

**Riesgo del cambio: alto.** Toca cuatro tablas, el backend y el frontend. Requiere probar
las fotos de órdenes, las de vehículos, las firmas y los PDF de cotización, uno por uno.
**No lo hagas el día antes de abrir.**

*Alternativa si migras a S3/R2:* usar URLs firmadas con caducidad. Más limpio y evita
servir ficheros desde la API, pero implica montar el almacenamiento externo.

### 1.2 🔴 Despliegue de prueba completo

**Nada de esta auditoría se ha ejecutado en un servidor real.** Todo se verificó en local
con PostgreSQL en Docker.

Sigue `DEPLOYMENT.md` de principio a fin en un servidor de pruebas y comprueba:
- La API arranca con `pnpm start:prod` y **escribe registros**.
- `/api/docs` devuelve **404** (`NODE_ENV=production`).
- El frontend habla con la API (si `CORS_ORIGIN` está mal, todo falla sin decir por qué).
- HTTPS funciona y las notificaciones en tiempo real pasan por el proxy.

**Riesgo: ninguno.** Es un servidor de pruebas. El riesgo es *no* hacerlo.

### 1.3 🔴 Secretos nuevos en producción

El `.env` de desarrollo traía `JWT_ACCESS_SECRET=change_me`. Genera dos valores nuevos:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Y cambia también la contraseña de PostgreSQL, que por defecto es `postgres`. **No publiques
el puerto 5432** hacia internet.

### 1.4 🔴 Probar una restauración en el servidor real

`BACKUP_AND_RECOVERY.md` sección 4. **Hazlo antes de tener datos que perder.**

---

## PRIORIDAD 2 — Primeras semanas

### 2.1 🟡 Probar las áreas sin verificar

No he podido probarlas y no voy a afirmar que funcionan. Antes de que las use el personal,
recórrelas a mano:

| Área | Qué probar |
|---|---|
| Correo (SMTP) | Si lo vas a usar, configúralo y manda uno de prueba real |

**Contrasta cada resultado con la base de datos**, no sólo con lo que muestra la pantalla.
Es el método que encontró los bugs de esta auditoría.

### 2.2 🟡 Dependencias — YA AUDITADAS, decidir qué actualizar

`pnpm audit` ya está hecho: **35 avisos** (19 altos), **12 paquetes**. La clasificación
completa está en `CODE_AUDIT.md`, Fase 14. Resumen de lo que importa:

- **`next` (alto): NO aplica.** El aviso es de bypass de middleware y esta aplicación no
  tiene `middleware.ts`. Sin prisa; actualiza cuando puedas probar las 20 pantallas.
- **`socket.io-parser` (alto): sin parche disponible.** `socket.io` ya está en la última
  estable. Anótalo para revisar más adelante.
- **`sharp` (alto):** llega por `next/image`; se resuelve al actualizar Next.
- **`postcss` (alto):** sólo al compilar, no en ejecución.
- **4 paquetes son sólo de desarrollo**: llegan por el CLI de Prisma y no se despliegan.

**Uno cada vez**, con los 274 tests y la prueba de concurrencia delante.

### 2.3 🟡 Longitud máxima en los campos de texto (F-4)

Un nombre de 600 caracteres se guarda sin protestar. Añade `@MaxLength` en los DTOs con
topes que tengan sentido para el negocio (nombre 100, notas 2000…).

**Riesgo: bajo**, pero decide los topes con criterio: si pones 50 en un campo donde ya hay
datos de 80, esos registros dejarán de poder editarse.

---

## PRIORIDAD 3 — Cuando haya rodaje

### 3.1 🟡 Rendimiento de la numeración (M-5)

`nextInvoiceNumber` y `nextReceiptNumber` traen **todas** las ventas de la sucursal a
memoria en cada cobro. Con 50.000 ventas son 50.000 filas por venta, dentro de la
transacción.

**No es urgente el primer día.** Se degrada linealmente. Cuando lo abordes, hazlo junto al
bloqueo consultivo porque es el mismo código, y resuélvelo en SQL sin traer nada a memoria
(hay un ejemplo en `CODE_AUDIT.md`, M-5).

**Cuándo:** cuando una venta tarde perceptiblemente, o al pasar de ~10.000 ventas por
sucursal.

### 3.2 🟡 Sesión en cookies en vez de `localStorage` (M-2)

Hoy el token de refresco (7 días) vive en `localStorage`, legible por cualquier JavaScript
de la página. **No hay ninguna vía de XSS conocida** —verificado— y la CSP recién añadida
da una segunda capa. Pero un XSS futuro pasaría de molesto a robo de cuentas.

Pasar a cookie `httpOnly` + `Secure` + `SameSite` toca login, renovación, CORS y el guard
de sucursal a la vez. **Riesgo: alto.** Es arquitectura, no parche: hazlo con tiempo y con
las pruebas delante.

### 3.3 🟡 Poner `tsc` en verde (M-6)

44 errores de tipos previos en scripts obsoletos y tres ficheros de test. No afectan a la
aplicación compilada, pero mientras existan **`tsc` no sirve como barrera de calidad**,
porque nunca está limpio y nadie mira si aparecen errores nuevos.

Borra los dos scripts de backfill (el propio esquema los documenta como obsoletos) y
arregla los tres tests. Luego añade `tsc --noEmit` a la integración continua.

### 3.4 🔵 Decidir qué hacer con el tiempo real (B-4)

El backend emite eventos por WebSocket y el servidor está levantado y aceptando
conexiones, pero **el frontend nunca se conecta**: no hay `socket.io-client` ni una sola
referencia en `apps/web/src`. El servidor difunde a nadie.

Son dos opciones y las dos valen:
- **Terminarlo**: añadir `socket.io-client`, conectar con el token y refrescar el panel y
  el tablero de órdenes con los eventos que ya se emiten.
- **Retirarlo**: quitar `RealtimeModule`, el gateway y `NEXT_PUBLIC_WS_URL`.

Lo que no conviene es dejarlo como está. **Los dos problemas de seguridad C-4 bis y M-8
estaban justamente en ese componente que no usa nadie**: código que nadie mira acumula
fallos que nadie ve.

### 3.5 🔵 Limpieza menor

- **B-1**: procesos sin cerrar en Jest — investigar con `--detectOpenHandles`. Puede colgar
  un pipeline de CI.
- **B-2**: borrar `Tenant.nextOrderNumber`, huérfano y ya documentado en el esquema.
- Pasar Prettier a todo el repositorio: **85 ficheros** tienen errores de formato previos.
  Hazlo en un commit aparte, sin mezclarlo con cambios de lógica.

---

## Reglas para cualquier cambio a partir de aquí

1. **Copia de seguridad antes de tocar la base.** Siempre.
2. **Un cambio, una comprobación.** No agrupes cinco arreglos y luego intentes averiguar
   cuál rompió qué.
3. **Ejecuta las pruebas antes y después:**
   ```bash
   pnpm --filter @taller/api test              # 293 deben pasar
   pnpm --filter @taller/api test:concurrency  # las 4 carreras
   ```
4. **Recompilar no basta: hay que reiniciar** el proceso. Node carga el código en memoria
   al arrancar. Esto costó media hora de confusión durante la auditoría.
5. **Comprueba contra la base de datos, no contra la pantalla.** Una pantalla contenta no
   demuestra que el dato se guardó bien.
6. **Si una prueba falla, averigua por qué antes de "arreglarlo".** Dos veces en esta
   auditoría un fallo aparente era código defensivo funcionando correctamente.

---

## Lo que NO hay que tocar sin entenderlo primero

Está explicado en `ARCHITECTURE.md` sección 14. En corto:

| No toques | Por qué |
|---|---|
| El bloqueo `pg_advisory_xact_lock` de la numeración | Quitarlo reabre corrupción de datos **reproducible** |
| El descuento condicional de stock (`stock: { gte: n }`) | Volver a leer-y-luego-restar deja el stock en negativo |
| `Decimal` en los importes | Coma flotante = descuadres que nadie sabrá explicar |
| La separación de las dos bases | Es el aislamiento buscado, no un descuido |
| La relectura del rol en cada petición | Confiarlo al token hace que revocar no surta efecto |
| La reutilización de huecos en la numeración | Decisión fiscal deliberada del proyecto |
| Que las fotos de recepción no se borren | Son la evidencia que respalda la firma del cliente |
