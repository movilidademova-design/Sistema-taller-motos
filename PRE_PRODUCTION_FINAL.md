# PRE_PRODUCTION_FINAL.md

**Fecha:** 2026-08-14 · **Rama:** `claude/ebike-workshop-saas-egicrb`

---

# 🟡 LISTO CON CONDICIONES

**No está listo para producción todavía**, y el motivo es concreto: quedan **tres cosas que
sólo se pueden hacer en un servidor real** y que nadie ha ejecutado aún. No son defectos
del código: son pasos del despliegue que faltan por dar.

Todo lo que se podía verificar sin servidor, **se verificó ejecutándolo**.

---

## Las 7 condiciones que pusiste

| Condición | Estado | Evidencia | Acción pendiente |
|---|:---:|---|---|
| **C-2 decidido** | 🟢 **CERRADO** | `C2_DECISION.md`. Las 9 vías de enumeración probadas una a una: sin listado de directorio, sin path traversal (6 variantes), UUID v4 de 122 bits, `404` indistinguible. Veredicto **Escenario A** | Ninguna. Decidido: aceptado conscientemente |
| **Secretos de producción corregidos** | 🟡 **PARCIAL** | `SECRETS.md`. 0 secretos en código, git, historial y logs. `.env.example` alineado con las 21 variables reales. Arranque seguro verificado dentro del contenedor | **Generar los secretos en TU servidor.** Nadie puede hacerlo por ti |
| **Staging desplegado** | 🟡 **PARCIAL** | Pila completa levantada y funcionando en local: 3 contenedores *healthy*, 19+2 migraciones, registro de taller, alta de cliente verificada en la base, persistencia tras reiniciar | **Desplegarlo en un servidor real.** Todo lo probado fue en local |
| **HTTPS funcionando** | 🔴 **NO VERIFICADO** | `nginx/staging.conf` y los comandos de certbot están escritos | **No tengo servidor.** Sin ejecutar |
| **Backup restaurado con éxito** | 🟢 **CERRADO** | Copia → verificación (`pg_restore --list`) → **`DROP DATABASE` real** → restauración → huella `md5` **idéntica** → login con credenciales previas → **escritura correcta** tras restaurar | Repetirlo una vez en el servidor real, antes de tener datos que perder |
| **SMTP probado** | 🟡 **PARCIAL** | Contra servidor SMTP real (Mailpit): conexión, autenticación, envío, **recepción**, adjunto PDF y servidor caído. Todo PASS | **Probar contra TU proveedor.** TLS, puertos 465/587, SPF/DKIM y límites de envío no se han tocado |
| **Fase 5 completada** | 🟢 **CERRADO** | **30/30 botones** con efecto verificado clic a clic, registrando qué API llama cada uno | Ninguna |

**Resumen: 3 cerradas, 3 parciales, 1 sin verificar.** Las 4 que no están cerradas dependen
todas de lo mismo: **un servidor real**.

---

## Lo que se corrigió en toda la auditoría

```
🔴 Críticos    6 encontrados  →  5 corregidos, 1 aceptado conscientemente (C-2)
🟠 Altos      11 encontrados  → 11 corregidos
🟡 Medios     11 encontrados  →  7 corregidos, 4 aplazados con criterio
🔵 Bajos       4 encontrados  →  2 corregidos
```

### Estado técnico verificado hoy

| Comprobación | Resultado |
|---|---|
| Tests unitarios | ✅ **297/297** (35 suites) |
| Prueba de concurrencia contra PostgreSQL real | ✅ las 4 carreras siguen cerradas |
| Errores de tipos | ✅ 44 = línea base (ninguno añadido) |
| Build de la API | ✅ |
| Typecheck del frontend | ✅ limpio |
| Imágenes Docker | ✅ API 1,08 GB · web 390 MB |

Se pasó de **251 a 297 tests**: 46 nuevos, todos de regresión sobre fallos reales
encontrados y reproducidos.

---

## Los 3 bloqueadores que quedan

### 1. 🔴 Desplegar staging en un servidor real

Todo se probó en local con Docker. Falta ejecutar `STAGING.md` de principio a fin en una
máquina de verdad.

**Riesgo si se salta:** el ensayo local ya encontró **tres fallos en mi propia guía**
—healthcheck roto, fichero que faltaba en la imagen, dos imágenes distintas por construir a
mano— que sólo se ven ejecutando. Un servidor real añade dominio, certificados, cortafuegos
y permisos: capas nuevas donde caben fallos nuevos.

### 2. 🔴 HTTPS y dominio

Sin ejecutar. Los comandos están en `STAGING.md` §8 y §9 y son los estándar de Nginx y
Certbot, pero **no los he probado** y no los voy a dar por buenos.

**Comprobación clave cuando lo hagas:** si `CORS_ORIGIN` no coincide EXACTAMENTE con el
dominio del frontend, el navegador bloquea todas las peticiones y **la aplicación parece
rota sin decir por qué**. Es el único fallo de configuración silencioso que encontré.

### 3. 🔴 Secretos de producción

Tu `.env` de desarrollo traía `JWT_ACCESS_SECRET=change_me` literal. Producción necesita
los suyos, **distintos de los de staging**.

La buena noticia: la aplicación **se niega a arrancar** con un secreto vacío, con
`change_me` o con menos de 32 caracteres. Verificado también dentro del contenedor. Un
despliegue mal configurado falla en el primer segundo, no en silencio.

---

## Lo que puedes dar por sólido

Verificado **ejecutándolo**, no leyéndolo:

**Seguridad del núcleo.** Registré un tenant atacante real e intenté leer, modificar y
borrar datos de otro: `404` en los tres casos. La matriz de roles da `403` en todos los
cruces indebidos. El XSS almacenado no se ejecuta. Los tokens rotan y el rol se relee de la
base en cada petición.

**El dinero cuadra.** Todo en `Decimal`, sin un solo cálculo en coma flotante. Verificado
de extremo a extremo: cotización 1.350.000 + IVA 19% = 1.606.500, y la factura coincidió al
céntimo. El IVA se calcula sobre el importe ya descontado, que es lo correcto.

**Los flujos completos no descuadran.** Recepción de orden, ciclo completo hasta factura,
venta del POS con anulación, separados, inventario, compras e importación masiva: todos
contrastados contra la base de datos, no contra la pantalla.

**La concurrencia está resuelta.** Tres carreras reproducidas contra PostgreSQL real
—stock negativo, número de factura duplicado, recibos de separado duplicados— corregidas y
protegidas por una prueba permanente (`pnpm --filter @taller/api test:concurrency`).

**Se puede recuperar de un desastre.** Probado destruyendo la base de verdad.

---

## Riesgo aceptado conscientemente

**C-2 — Opción A.** Los archivos de `/uploads` (fotos, firmas y PDF de cotización) son
accesibles para quien tenga el enlace. **No existe forma de descubrir archivos ajenos**:
eso está verificado, no supuesto. El enlace no caduca ni se puede revocar.

**Pendiente relacionado, y recomiendo hacerlo:** hoy **borrar una foto no borra el
archivo**. `StorageService` sólo tiene `upload()`. Si alguien sube por error un documento
personal, no hay forma de retirarlo desde la aplicación. Es un arreglo de horas y no toca
ninguna tabla.

---

## Qué NO se ha verificado — dicho sin adornos

| Área | Por qué |
|---|---|
| Dominio, Nginx, HTTPS, certificados | No hay servidor |
| SMTP contra tu proveedor real | No tengo tus credenciales |
| Comportamiento con volumen real de datos | Todo se midió con ~25 clientes y 3 órdenes. **M-5 (la numeración carga todas las ventas de la sucursal en cada cobro) es invisible con 20 ventas y se nota con 20.000** |
| Carga concurrente real de varios usuarios | Las carreras se probaron con 2-8 operaciones simultáneas, no con uso real sostenido |
| Copia de seguridad automática en producción | El script existe y está probado a mano; el `cron` no se ha configurado |

---

## Los 3 pasos siguientes, en orden

1. **Desplegar staging en un servidor real** siguiendo `STAGING.md`. Incluye dominio y
   HTTPS. Comprueba lo de la sección 7 y 10 de ese documento.
2. **Probar allí una restauración de copia**, con el procedimiento ya validado.
3. **Configurar tu SMTP** y mandar un correo de prueba real.

Cuando esas tres estén hechas, las 7 condiciones quedan cerradas y **la recomendación pasa
a 🟢 LISTO**. El despliegue de producción sería entonces el mismo procedimiento de staging
con otros secretos y otro dominio.

---

## Nota sobre el método

Durante esta auditoría, **cinco veces** un fallo aparente resultó no serlo: dos veces era
mi script de pruebas, dos veces eran defensas del sistema funcionando correctamente
(`forbidNonWhitelisted` y las máquinas de estados), y una vez fue mi propio `grep`. Los
cinco casos están documentados en `CODE_AUDIT.md`.

Lo menciono porque sostiene todo lo demás: **nada se marcó como hallazgo sin aislar antes
la causa, y nada se marcó como verificado sin ejecutarlo.** Cuando no pude probar algo,
está escrito que no pude.
