# SECRETS.md — Variables sensibles y preparación para producción

**Fecha:** 2026-08-13 · Todo lo de este documento se comprobó ejecutándolo o inspeccionando
el código real, no de memoria.

---

## 1. Resultado de la auditoría

| Comprobación | Resultado |
|---|---|
| ¿Queda algún `change_me` operativo? | 🟢 **No.** Sólo en la lista negra que lo rechaza y en su test |
| ¿Hay secretos escritos a mano en el código? | 🟢 **No** (búsqueda por patrones sobre `apps/*/src`) |
| ¿Hay algún `.env` rastreado en git? | 🟢 **No.** Sólo los `.env.example` |
| ¿Se coló algún `.env` en el historial de git? | 🟢 **No** (`git log --all --diff-filter=A`) |
| ¿Hay secretos expuestos al navegador? | 🟢 **No.** Sólo 2 variables `NEXT_PUBLIC_`, ambas URLs |
| ¿Hay secretos dentro de imágenes Docker? | 🟢 **No aplica hoy** — ver §5 |
| ¿Se filtra algún secreto por los logs? | 🟢 **No.** 0 ocurrencias del secreto JWT, de la contraseña de base y de la URL de conexión |
| ¿El endpoint de salud filtra configuración? | 🟢 **No.** Devuelve `{status, timestamp}` y nada más |
| ¿`.env.example` coincide con lo que el código lee? | 🟢 **Sí, exactamente.** 21 variables, ni una de más ni de menos |

**Dos cosas se corrigieron durante esta auditoría**, y están en §3.

---

## 2. Las 21 variables que la API lee de verdad

Extraídas del código, no del archivo de ejemplo. 🔑 = secreto.

### Obligatorias — la aplicación no funciona sin ellas

| Variable | Para qué | 🔑 |
|---|---|:--:|
| `DATABASE_URL` | Base del taller. Contiene la contraseña de PostgreSQL | 🔑 |
| `POS_DATABASE_URL` | Base del punto de venta. **Es una base distinta** | 🔑 |
| `JWT_ACCESS_SECRET` | Firma de los tokens de sesión. **Sin él la API no arranca** | 🔑 |
| `CORS_ORIGIN` | Dominios del frontend autorizados | |
| `PUBLIC_URL` | Base de los enlaces que recibe el cliente | |
| `NODE_ENV` | `production` desactiva Swagger y oculta errores internos | |

### Con valor por defecto razonable

| Variable | Por defecto | Notas |
|---|---|---|
| `PORT` | `3001` | |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Vida del token de acceso |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Vida de la sesión |
| `STORAGE_DRIVER` | `local` | `local` o `s3` |

### Sólo con `STORAGE_DRIVER=s3`

| Variable | 🔑 |
|---|:--:|
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_PUBLIC_URL` | |
| `S3_ACCESS_KEY_ID` | 🔑 |
| `S3_SECRET_ACCESS_KEY` | 🔑 |

### Correo saliente (opcional)

| Variable | 🔑 |
|---|:--:|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_FROM` | |
| `SMTP_PASSWORD` | 🔑 |

Si `SMTP_HOST` está vacío, el correo queda desactivado y la aplicación **lo dice
claramente** (error 503 con explicación). No finge haber enviado nada — eso se corrigió en
esta auditoría (hallazgo A-8).

### Frontend — sólo 2, y ninguna es secreta

| Variable | Advertencia |
|---|---|
| `NEXT_PUBLIC_API_URL` | Se incrusta en el código del navegador |
| `NEXT_PUBLIC_WS_URL` | Idem. **Hoy no hace nada**: el frontend no se conecta al WebSocket (hallazgo B-4) |

> ⚠️ **Todo lo que empiece por `NEXT_PUBLIC_` es visible para cualquiera** con las
> herramientas de desarrollador del navegador. Nunca pongas un secreto ahí.
>
> ⚠️ Se leen **al compilar**, no al arrancar. Cambiarlas exige **recompilar** el frontend.

---

## 3. Lo que se corrigió

### 3.1 `JWT_REFRESH_SECRET` estaba declarada y **ningún código la leía**

`grep -rn "JWT_REFRESH_SECRET" src/ prisma/` → **sin resultados**.

Estaba en el `.env.example` y en tu `.env` local, dando a entender que protegía algo. No
protegía nada: el token de refresco **no es un JWT**, es un valor aleatorio opaco que se
guarda hasheado con SHA-256 en la base, así que no hay nada que firmar.

Es peor que inútil: una variable de aspecto crítico que nadie usa hace que alguien la
configure con cuidado y crea que ha asegurado algo. **Retirada del ejemplo, con la
explicación escrita al lado.**

### 3.2 Las variables `WHATSAPP_*` tampoco se leen

`WHATSAPP_PROVIDER`, `WHATSAPP_API_URL` y `WHATSAPP_API_TOKEN` estaban declaradas.
Ningún código las lee. El envío por WhatsApp se hace hoy abriendo WhatsApp Web con el
mensaje ya escrito, sin ninguna integración de servidor. **Retiradas del ejemplo**, con la
nota correspondiente.

### 3.3 Los `change_me` del `.env.example`

Sustituidos por **campos vacíos** más las instrucciones para generar el valor. Es más
seguro que un texto de relleno: un campo vacío no puede confundirse con un valor válido, y
la aplicación falla igual al arrancar. `change_me` **sigue en la lista negra del código**,
que es donde debe estar, para que se rechace si alguien lo escribe.

---

## 4. Limpieza pendiente en TU `.env` local

Tu `apps/api/.env` conserva 4 variables ya obsoletas. **No hacen daño** (nadie las lee),
pero conviene borrarlas para que el archivo diga la verdad:

```
JWT_REFRESH_SECRET
WHATSAPP_PROVIDER
WHATSAPP_API_URL
WHATSAPP_API_TOKEN
```

---

## 5. Docker: hoy no hay riesgo, mañana sí

**No existe ningún `Dockerfile` en el proyecto.** Sólo hay un `docker-compose.yml` que
levanta PostgreSQL. Por eso hoy no hay imágenes propias que puedan llevar secretos dentro.

**Esto cambia en cuanto montemos el staging con Docker** (punto 3 de tu lista). Cuando se
creen imágenes, hay dos reglas que no se pueden saltar:

1. **Nunca `COPY .env` dentro de la imagen.** Una imagen es un archivo que se puede
   descargar y abrir capa por capa: cualquiera que la tenga puede leer ese `.env`, aunque
   luego lo borres en una capa posterior — la capa anterior sigue ahí.
2. **Nunca `ARG` para secretos.** Los argumentos de construcción quedan grabados en el
   historial de la imagen (`docker history`).

Los secretos se pasan **al ejecutar**, con `--env-file` o `environment:` en compose, nunca
al construir. Lo tendré en cuenta al preparar el staging.

### Y una que sí hay que cambiar ya

`docker-compose.yml` trae `POSTGRES_PASSWORD: postgres`. Vale para desarrollar y **es
inaceptable en staging o producción**. Además publica el puerto 5432 hacia fuera. En el
procedimiento de staging va con contraseña propia y **sin publicar el puerto**.

---

## 6. Qué necesitas para producción, en concreto

```bash
# 1. Genera el secreto de sesión (uno NUEVO, distinto del de desarrollo)
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 2. Genera la contraseña de PostgreSQL
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Y rellena en el `.env` del servidor:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | con la contraseña generada |
| `POS_DATABASE_URL` | idem, base `motopos` |
| `JWT_ACCESS_SECRET` | el secreto generado |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | `https://tu-dominio` (exacto, sin barra final) |
| `PUBLIC_URL` | `https://api.tu-dominio` |

> **Un secreto por entorno.** El de staging y el de producción deben ser distintos: si
> comprometen staging, las sesiones de producción no valen nada para el atacante.

### Cómo se comporta si te equivocas

Comprobado ejecutándolo:

| Error | Qué pasa |
|---|---|
| `JWT_ACCESS_SECRET` vacío | La API **no arranca**, con mensaje explicando cómo generarlo |
| `JWT_ACCESS_SECRET=change_me` | La API **no arranca** |
| Secreto de menos de 32 caracteres | La API **no arranca**, diciendo cuántos tiene |
| `CORS_ORIGIN` mal | La API arranca, y **el navegador bloquea todo** sin explicación clara ⚠️ |
| `NODE_ENV` no es `production` | Swagger queda **publicado** en `/api/docs` |

El único fallo silencioso de la lista es `CORS_ORIGIN`. Se comprueba con la verificación
final de `DEPLOYMENT.md` §9.
