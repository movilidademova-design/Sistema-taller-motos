# PRE_PRODUCTION_REPORT.md — Informe previo a producción

**Fecha:** 2026-08-13 · **Rama:** `claude/ebike-workshop-saas-egicrb`

---

## RESUMEN EJECUTIVO

### ¿Está lista para producción?

# 🟡 LISTA CON CONDICIONES

Al empezar la auditoría **no lo estaba**: el comando estándar de arranque en producción
no funcionaba, así que la aplicación literalmente no se podía desplegar por la vía
documentada. Eso, y otros tres problemas críticos, están corregidos y verificados
ejecutándolos.

Queda **una condición que debes decidir tú** antes de abrir al público, y varias áreas que
no he podido probar y que están marcadas como tales.

### Estado actual

| Aspecto | Valoración |
|---|---|
| **Núcleo de seguridad** (autenticación, permisos, aislamiento entre empresas) | 🟢 **Sólido.** Verificado ejecutándolo, no leyéndolo |
| **Corrección del dinero** (totales, IVA, pagos, inventario) | 🟢 **Correcto.** Todo en `Decimal`, cuadra al céntimo |
| **Flujos de negocio principales** | 🟢 Verificados de extremo a extremo contra la base |
| **Concurrencia** | 🟢 Tres carreras reproducidas y corregidas; prueba permanente |
| **Operación** (arranque, registros, despliegue) | 🟡 Corregido, pero sin rodaje en un servidor real |
| **Privacidad de las imágenes de clientes** | 🔴 **Pendiente de decisión** |
| **Cobertura de pruebas** | 🟡 293 tests; áreas sin verificar documentadas |

### Riesgos principales

1. **Las fotos de vehículos y las firmas de clientes son públicas.** Cualquiera con la
   dirección puede verlas, sin sesión. (C-2 parcial)
2. **Nada de esto se ha probado en un servidor real.** Todo se verificó en local, con
   PostgreSQL en Docker. El despliegue, el dominio y HTTPS están documentados pero sin
   ejecutar.
3. **Áreas sin verificar**: un envío real contra un servidor SMTP, y la comprobación
   botón por botón de la Fase 5.

### Bloqueadores

**Ninguno.** Los cuatro bloqueadores encontrados están corregidos y verificados.

---

## RESULTADOS DE LAS PRUEBAS

### Lo que se ejecutó de verdad

| Prueba | Resultado |
|---|---|
| Tests unitarios de la API | ✅ **293/293** (36 suites) |
| Prueba de concurrencia contra PostgreSQL real | ✅ Las 4 carreras pasan |
| Compilación de la API | ✅ |
| Compilación del frontend | ✅ 28 rutas |
| Migraciones (19 taller + 2 POS) | ✅ Aplicadas |
| API arrancada con el comando de producción | ✅ |
| Arranque con `NODE_ENV=production` | ✅ Swagger desactivado (404) |
| 20 pantallas en navegador real | ✅ Todas cargan, 0 errores de JavaScript |
| Responsive (3 tamaños) | ✅ 0 desbordamientos tras corregir |
| Aislamiento entre empresas (IDOR) | ✅ 404 en lectura, modificación y borrado |
| Matriz de permisos por rol | ✅ 403 en todos los cruces indebidos |
| Fuerza bruta en el login | ✅ 429 desde el octavo intento |
| Flujo de recepción de orden (7 pasos) | ✅ Verificado contra la base |
| Ciclo completo de la orden | ✅ Verificado contra la base |
| Venta del POS + anulación | ✅ Verificado contra la base |
| Separados del POS (apartar, abonar, saldar, cancelar) | ✅ Verificado contra la base |
| Inventario: ajustes de stock y movimientos | ✅ Verificado contra la base |
| Compras: crear, pedir, recibir, doble recepción | ✅ Verificado contra la base |
| Importación masiva de productos (3 pasos) | ✅ Verificado contra la base |
| Agenda: crear, mover, estados, datos inválidos | ✅ Verificado contra la base |
| Correo sin SMTP + escapado de HTML | ✅ Verificado y corregido |
| WebSocket: alcanzable, autenticado, aislado por empresa | ✅ Verificado y corregido |
| PDF de cotización: generación, descarga y aritmética con descuento | ✅ Verificado |
| Exportaciones a Excel (clientes, órdenes, facturas) | ✅ xlsx válidos |
| Auditoría de dependencias (`pnpm audit`) | ✅ 35 avisos clasificados |
| Formularios de clientes (validación, cancelar, duplicados, XSS) | ✅ |
| Copia de seguridad **y restauración** de las dos bases | ✅ 0 huérfanos |

### Lo que NO se pudo verificar

Marcado explícitamente, sin inventar resultados:

- Un envío real contra un servidor SMTP (no hay ninguno configurado)
- **Cualquier cosa en un servidor real**: dominio, HTTPS, Nginx, PM2

---

## ERRORES ENCONTRADOS

### 🔴 CRÍTICOS — 6, todos corregidos salvo C-2 (parcial)

| # | Problema | Estado |
|---|---|---|
| **C-1** | `pnpm start:prod` no arrancaba: la app se compila en `dist/src/main.js` y el script ejecutaba `dist/main`. **Bloqueaba el despliegue por completo** | ✅ Corregido y verificado |
| **C-2** | Subida de ficheros sin validar: se podía subir un `.html` con script y quedaba servido como `text/html` desde el origen de la API, **sin autenticación** | ⚠️ **Parcial** — ver abajo |
| **C-3** | Dos abonos simultáneos a separados distintos guardaban el **mismo número de recibo**, sin error y sin registro. Corrupción fiscal silenciosa | ✅ Corregido y verificado |
| **C-4** | Secreto JWT de reserva escrito en el repositorio: si faltaba la variable, la API aceptaba tokens firmados con una cadena pública | ✅ Corregido y verificado |
| **F-3** | **No se podía crear un cliente sin correo** aunque el campo no es obligatorio. Afectaba a 38 campos en 24 DTOs | ✅ Corregido y verificado |
| **C-4 bis** | El secreto JWT de reserva **seguía vivo en el WebSocket**: estaba duplicado y sólo se corrigió una copia | ✅ Corregido y verificado |

### 🟠 ALTOS — 10, todos corregidos

| # | Problema | Estado |
|---|---|---|
| **A-1** | El stock podía quedar **negativo** bajo concurrencia (reproducido: −1) | ✅ Corregido |
| **A-2** | Dos ventas simultáneas colisionaban en el número de factura y una moría con error de servidor | ✅ Corregido |
| **A-3** | Sin protección de fuerza bruta: 40 intentos de contraseña, 0 bloqueos | ✅ Corregido |
| **A-4** | Los errores internos de Prisma (con nombres de tabla y restricción) se devolvían al navegador | ✅ Corregido |
| **A-5** | `bufferLogs` sin `flushLogs()`: **la API arrancaba y fallaba sin escribir una sola línea de registro** | ✅ Corregido |
| **A-6** | `refresh_tokens` sin índice de búsqueda ni limpieza: recorrido secuencial en cada renovación, sobre una tabla que sólo crece | ✅ Corregido |
| **A-7** | **Se podía reescribir una cotización ya APROBADA por el cliente**, dejándola en estado imposible y descuadrada con el inventario | ✅ Corregido |
| **A-8** | **Marcaba las notificaciones como «enviadas por correo» sin enviar nada** (SMTP sin configurar) | ✅ Corregido |
| **F-1** | Un fallo de carga (403, 500, sin red) se pintaba como **«lista vacía»** en las 24 pantallas | ✅ Corregido |
| **F-2** | La página desbordaba en horizontal: 6 pantallas en tableta, 8 en móvil (hasta +391 px) | ✅ Corregido |

### 🟡 MEDIOS — 9

| # | Problema | Estado |
|---|---|---|
| **M-1** | Swagger publicado en producción | ✅ Corregido |
| **M-3** | Frontend sin cabeceras de seguridad (CSP, HSTS…) | ✅ Corregido |
| **M-4** | `fetchAuthedBlob` no mandaba sucursal ni renovaba el token en 401 | ✅ Corregido |
| **M-2** | Tokens (incluido el de 7 días) en `localStorage` | ⏸️ Aplazado — decisión de arquitectura |
| **M-5** | La numeración carga **todas** las ventas de la sucursal en cada cobro | ⏸️ Aplazado — se degrada con el volumen |
| **M-6** | 44 errores de tipos previos: `tsc` nunca está en verde | ⏸️ Aplazado |
| **M-7** | Subir un fichero que no es Excel devolvía 500 en vez de un 400 útil | ✅ Corregido |
| **M-8** | El WebSocket aceptaba conexiones desde cualquier origen | ✅ Corregido |
| **M-9** | Mi propio arreglo de A-4 tapaba los mensajes 5xx escritos a propósito | ✅ Corregido |
| **F-4** | Sin longitud máxima en los campos de texto (600 caracteres aceptados) | ⏸️ Aplazado |

### 🔵 BAJOS — 4

**B-1** Jest avisa de procesos sin cerrar · **B-2** Campo `Tenant.nextOrderNumber` huérfano ·
**B-3** La semilla creaba un proveedor con un id no-UUID que la propia API rechazaba
(✅ corregido) · **B-4** El tiempo real está a medias: el backend emite y el frontend nunca
se conecta (⏸️ decisión tuya: terminarlo o retirarlo). Ninguno afecta a producción.

---

## SEGURIDAD

### Lo que está bien, y está comprobado

Esto es lo más caro de arreglar a posteriori, y aquí está bien hecho:

- **Aislamiento entre empresas ✅** — Registré un tenant atacante real e intenté leer,
  modificar y borrar datos de otro: `404` en los tres casos, dato intacto.
- **Autorización en el servidor ✅** — No depende de esconder botones. El cajero no alcanza
  el taller, el técnico no administra, el admin del taller no entra al POS: `403` en todos.
- **Contraseñas con Argon2**, tokens de refresco rotados y guardados hasheados.
- **El rol se relee de la base en cada petición**: revocar surte efecto de inmediato.
- **XSS ✅** — Probado inyectando `<img src=x onerror=alert(1)>` y guardándolo: no se
  ejecuta, se muestra como texto. No hay `dangerouslySetInnerHTML` ni `eval` en el frontend.
- **`tenantId` nunca llega del cuerpo de la petición**: sale del token verificado.

### El problema que queda abierto

**🔴 C-2 parcial — las imágenes de clientes son públicas.**

La entrada está cerrada: ya no se puede subir nada que no sea imagen, y la extensión se
deriva del tipo validado, así que no se puede volver a servir contenido ejecutable.

**Lo que sigue abierto:** `/uploads` no pide autenticación. Las fotos de los vehículos, las
firmas de recepción **y los PDF de cotización** los puede ver cualquiera que tenga la
dirección — y las direcciones de los PDF se envían al cliente por WhatsApp, así que
circulan fuera del sistema por diseño. Los nombres son
aleatorios —lo que dificulta adivinarlos— pero eso es ocultamiento, no control de acceso, y
las direcciones aparecen en las respuestas de la API y en los PDF de cotización.

**Por qué no lo cerré:** hacerlo bien rompe las direcciones ya guardadas en cuatro tablas
(`OrderPhoto.url`, `Motorcycle.photoUrl`, `Order.signatureUrl`, `Quotation.pdfUrl`) y exige
un endpoint autenticado, migración de datos y cambios en el frontend. Es un cambio con
riesgo real que merece hacerse con calma y probarse entero, no como último retoque antes
de desplegar.

**Es tu decisión** abrirlo así o cerrarlo antes. Pero tómala a sabiendas.

---

## PRODUCCIÓN

| Comprobación | Estado |
|---|---|
| El comando de arranque funciona | ✅ Verificado |
| La aplicación registra lo que hace | ✅ Verificado (antes no escribía nada) |
| Un fallo de arranque sale por el registro y devuelve código ≠ 0 | ✅ |
| No arranca con secretos inseguros | ✅ Verificado con secreto vacío y con `change_me` |
| Swagger desactivado con `NODE_ENV=production` | ✅ Verificado: 404 |
| Los errores no filtran interioridades | ✅ 6 tests lo garantizan |
| Cabeceras de seguridad en el frontend | ✅ CSP, HSTS, X-Frame-Options |
| Copia de seguridad y restauración | ✅ **Probadas de verdad** |
| Sin configuración apuntando a `localhost` en los ejemplos de producción | ✅ Documentado |
| **Probado en un servidor real** | ❌ **NO** |

**Aviso encontrado durante la auditoría:** el `.env` de desarrollo traía
`JWT_ACCESS_SECRET=change_me` literal. El guard nuevo se negó a arrancar — exactamente el
escenario de C-4. **Producción necesita secretos propios y nuevos.**

---

## DOCUMENTACIÓN CREADA

| Documento | Para qué |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Cómo funciona: tecnologías, estructura, recorrido de una petición, decisiones de diseño |
| [DATABASE.md](DATABASE.md) | Las dos bases, integridad, migraciones, concurrencia, consultas de salud |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Despliegue paso a paso, actualización y vuelta atrás |
| [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) | Copias, restauración y emergencias. **Comandos probados** |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | Para el responsable del taller, sin tecnicismos |
| [CODE_AUDIT.md](CODE_AUDIT.md) | Cada hallazgo con archivo, línea, evidencia, impacto y solución |
| [PLAN_DE_CORRECCION.md](PLAN_DE_CORRECCION.md) | Qué queda, en qué orden |
| [ENGINEER_HANDOFF.md](ENGINEER_HANDOFF.md) | Entrega a otro ingeniero |

Pruebas añadidas: **42 tests nuevos** (251 → 293) y una prueba de concurrencia permanente
(`pnpm --filter @taller/api test:concurrency`) que falla si alguna de las tres carreras
vuelve a abrirse.

---

## Nota sobre el método

Dos veces durante esta auditoría un fallo aparente resultó **no ser un fallo**:

1. Un `400` en el flujo de recepción que iba a reportar como crítico era **mi script de
   prueba** escribiendo texto no válido en el campo de correo.
2. Diecisiete fallos en el ciclo de la orden eran **las defensas del sistema funcionando**:
   `forbidNonWhitelisted` rechazando campos de más y dos máquinas de estados impidiendo
   transiciones inválidas.

Los dos casos están documentados en `CODE_AUDIT.md`. Van aquí porque sostienen el criterio
del informe: **nada se marcó como hallazgo sin aislar antes la causa, y nada se marcó como
correcto sin ejecutarlo.**

---

## RECOMENDACIÓN FINAL

# 🟡 LISTA CON CONDICIONES

**Condiciones antes de abrir a clientes reales:**

1. **Decidir sobre C-2**: o aceptas conscientemente que las imágenes de clientes son
   públicas, o lo cierras antes (2-3 días de trabajo con migración de datos).
2. **Generar secretos JWT nuevos** en el servidor de producción.
3. **Hacer un despliegue de prueba completo** siguiendo `DEPLOYMENT.md`. Nada de esto se
   ha ejecutado en un servidor real.
4. **Probar una restauración** de copia de seguridad en ese servidor, antes de tener datos
   que perder.

**Recomendado, no bloqueante:** probar a mano las áreas sin verificar —separados del POS,
inventario, compras, importación y exportaciones— antes de que las use el personal.

**Valoración de conjunto.** La base de este proyecto es mejor de lo que sugiere el número
de hallazgos. El código muestra criterio real: comentarios que explican **por qué** se tomó
cada decisión, dinero en `Decimal` sin excepciones, guards que cierran por defecto,
máquinas de estados explícitas, aislamiento entre empresas correcto en todas las capas.

Los fallos graves no estaban en la lógica de negocio: estaban en el **borde operativo**
—arranque, registros, subida de ficheros, concurrencia— que es justo lo que no se ve hasta
que hay dos personas usando el sistema a la vez y un servidor de por medio. Es el patrón
típico de un proyecto bien pensado que aún no había salido de la máquina de desarrollo.
