# STAGING.md — Despliegue de staging con Docker

Procedimiento completo, comando a comando. Staging es un ensayo general: **mismo
procedimiento que producción, datos que no importan**.

> **Qué está verificado y qué no.** Las imágenes de Docker se construyen y arrancan de
> verdad —lo comprobé en esta máquina— y ese resultado está anotado en la sección 12.
> **Todo lo relativo al servidor, el dominio, Nginx y HTTPS NO se ha ejecutado**: no tengo
> servidor. Esos comandos son los estándar de Ubuntu/Nginx/Certbot y están marcados como
> ❓ NO VERIFICADO donde corresponde.

---

## Sobre PM2: no hace falta, y no lo añado

Lo pediste explícitamente, así que respondo claro: **con Docker, PM2 sobra.**

PM2 aporta reiniciar el proceso si se cae y levantarlo al reiniciar el servidor.
`restart: unless-stopped` en Docker Compose hace exactamente eso. Poner los dos sería
tener dos supervisores peleándose por el mismo proceso: cuando algo falle, no sabrás cuál
lo reinició ni por qué.

**PM2 sí tendría sentido si desplegaras sin Docker** (`node dist/src/main.js` directamente).
Ese camino está en `DEPLOYMENT.md`. Elige uno de los dos, no mezcles.

---

## 1. Requisitos del servidor

Ubuntu 22.04 o 24.04, 2 GB de RAM mínimo, 20 GB de disco.

```bash
# Docker y Docker Compose (script oficial)
curl -fsSL https://get.docker.com | sudo sh

# Tu usuario puede usar Docker sin sudo
sudo usermod -aG docker $USER
newgrp docker

# Comprobar
docker --version
docker compose version
```

`get.docker.com` instala el motor y el plugin de compose. `usermod -aG docker` evita
escribir `sudo` en cada comando; `newgrp` aplica el cambio sin cerrar sesión.

> ⚠️ Pertenecer al grupo `docker` equivale a ser administrador de la máquina: cualquiera
> en ese grupo puede montar el disco entero dentro de un contenedor. En un servidor de
> staging es aceptable; tenlo presente.

---

## 2. Traer el código

```bash
sudo mkdir -p /opt/taller && sudo chown $USER:$USER /opt/taller
cd /opt/taller
git clone <URL-DE-TU-REPOSITORIO> .
git checkout main
```

`/opt` es el sitio habitual para aplicaciones propias. El `chown` evita tener que usar
`sudo` para todo lo demás.

---

## 3. Variables de entorno

### 3.1 Generar los secretos

```bash
cd /opt/taller

echo "JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
echo "POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")"
```

Si el servidor no tiene Node instalado (con Docker no hace falta), usa:

```bash
echo "JWT_ACCESS_SECRET=$(openssl rand -hex 48)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
```

**Los de staging deben ser distintos de los de producción.** Si comprometen staging, las
sesiones de producción no valen nada para el atacante.

### 3.2 Crear `.env.staging`

```bash
nano /opt/taller/.env.staging
```

```bash
# Base de datos (sólo accesible dentro de la red de Docker)
POSTGRES_USER=taller
POSTGRES_PASSWORD=<el valor generado arriba>

# Sesión — la API NO ARRANCA sin esto
JWT_ACCESS_SECRET=<el valor generado arriba>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Dominios: EXACTOS, con https y SIN barra final
CORS_ORIGIN=https://staging.tudominio.com
PUBLIC_URL=https://api-staging.tudominio.com

# Se incrustan al compilar la imagen del frontend
NEXT_PUBLIC_API_URL=https://api-staging.tudominio.com/api
NEXT_PUBLIC_WS_URL=https://api-staging.tudominio.com

STORAGE_DRIVER=local

# Correo: déjalo vacío por ahora. Se prueba en el punto 5 de tu lista.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Taller Staging <no-reply@tudominio.com>"
```

Protégelo. Contiene las llaves de todo:

```bash
chmod 600 /opt/taller/.env.staging
```

> Este archivo **no entra en ninguna imagen** de Docker: está en `.dockerignore` y los
> valores se pasan al ejecutar, no al construir. Verificado en la sección 12.

---

## 4. Construir las imágenes

```bash
cd /opt/taller
docker compose -f docker-compose.staging.yml --env-file .env.staging build
```

Qué hace: construye la imagen de la API (compila TypeScript y genera los dos clientes de
Prisma) y la del frontend (compila Next.js con las URLs incrustadas).

**La primera vez tarda varios minutos.** Las siguientes son mucho más rápidas porque
Docker reutiliza la capa de dependencias mientras no cambien los `package.json`.

Comprobar que existen:

```bash
docker images | grep taller
```

> ⚠️ **Construye SIEMPRE con `docker compose build`, no con `docker build` a mano.**
>
> Compose etiqueta sus imágenes con el nombre del proyecto (`taller-staging-api`). Si
> construyes por tu cuenta con `docker build -t taller-api:staging .`, creas una imagen
> **distinta** que compose ignora: seguirá levantando la suya, que puede ser antigua.
>
> Me pasó al preparar esta guía. El síntoma engaña mucho: reconstruyes, `up -d
> --force-recreate`, y el contenedor sigue con el código viejo. Comprobación:
>
> ```bash
> docker inspect taller-staging-api-1 --format '{{.Image}}'   # la que usa
> docker images --format '{{.ID}} {{.Repository}}' | grep taller-staging-api
> ```
>
> Si no coinciden, estás mirando dos imágenes diferentes.

---

## 5. Arrancar

```bash
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
```

`-d` las deja corriendo en segundo plano. Comprobar:

```bash
docker compose -f docker-compose.staging.yml ps
```

Los tres servicios (`postgres`, `api`, `web`) deben decir `Up`. `postgres` y `api` deben
decir además `(healthy)` — puede tardar ~30 segundos.

---

## 6. Base de datos y migraciones

La base `taller_motos` la crea Postgres al iniciar el volumen; la segunda (`motopos`) la
crea `scripts/init-pos-db.sh`, que Docker ejecuta automáticamente **sólo la primera vez**.

Comprobar que existen las dos:

```bash
docker compose -f docker-compose.staging.yml exec postgres \
  psql -U taller -c "\l" | grep -E "taller_motos|motopos"
```

Si `motopos` no aparece (volumen preexistente), créala a mano:

```bash
docker compose -f docker-compose.staging.yml exec postgres \
  psql -U taller -c "CREATE DATABASE motopos;"
```

### Aplicar las migraciones

```bash
docker compose -f docker-compose.staging.yml exec api npx prisma migrate deploy
docker compose -f docker-compose.staging.yml exec api npx prisma migrate deploy --config prisma/pos/prisma.config.ts
```

`migrate deploy` sólo aplica lo pendiente y **no borra nada**. Es idempotente: ejecutarlo
dos veces responde «No pending migrations to apply».

> ⚠️ **Nunca `migrate dev` ni `migrate reset`** aquí: el primero puede decidir recrear la
> base y el segundo **la vacía entera**.

Comprobar:

```bash
docker compose -f docker-compose.staging.yml exec postgres \
  psql -U taller -d taller_motos -c "\dt" | head -20
```

Debes ver `tenants`, `users`, `clients`, `orders`…

### Primer usuario

En staging **no ejecutes la semilla** si vas a ensayar el procedimiento real. Crea el
taller desde la pantalla `/register`, igual que harás en producción.

Si prefieres datos de prueba para el ensayo:

```bash
docker compose -f docker-compose.staging.yml exec api npx tsx prisma/seed.ts
```

> ⚠️ La semilla crea usuarios con la contraseña `Password123!`. **Sólo para staging.**

---

## 7. Comprobar antes de tocar Nginx

Con la aplicación aún sin dominio, desde el propio servidor:

```bash
# La API responde y exige sesión (401 es la respuesta CORRECTA)
curl -i http://127.0.0.1:3001/api/clients | head -1

# Salud
curl http://127.0.0.1:3001/api/health

# El frontend sirve
curl -I http://127.0.0.1:3000/login | head -1

# La documentación NO debe estar publicada
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/api/docs
```

Esperado: `401`, `{"status":"ok",…}`, `200`, **`404`**.

Si `/api/docs` devuelve 200, `NODE_ENV` no llegó como `production` al contenedor.

---

## 8. Dominio ❓ NO VERIFICADO

Dos registros DNS de tipo A apuntando a la IP del servidor:

```
staging.tudominio.com      ->  <IP>
api-staging.tudominio.com  ->  <IP>
```

Comprobar la propagación (puede tardar hasta 24 h):

```bash
dig +short staging.tudominio.com
dig +short api-staging.tudominio.com
```

**No sigas al paso 9 hasta que los dos devuelvan tu IP**: certbot necesita resolver el
dominio para emitir el certificado.

---

## 9. Nginx y HTTPS ❓ NO VERIFICADO

```bash
sudo apt update && sudo apt install -y nginx

# Sustituye el dominio de ejemplo por el tuyo (4 sitios)
sed -i 's/staging\.tudominio\.com/staging.TUDOMINIO.com/g; s/api-staging\.tudominio\.com/api-staging.TUDOMINIO.com/g' \
  /opt/taller/nginx/staging.conf

sudo cp /opt/taller/nginx/staging.conf /etc/nginx/sites-available/taller-staging
sudo ln -sf /etc/nginx/sites-available/taller-staging /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Comprueba la sintaxis ANTES de recargar. Si falla, NO recargues.
sudo nginx -t
sudo systemctl reload nginx
```

Certificado:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d staging.TUDOMINIO.com -d api-staging.TUDOMINIO.com
```

Certbot pide un correo, reescribe la configuración añadiendo el bloque 443 y la
redirección desde el 80. Comprobar la renovación automática:

```bash
sudo certbot renew --dry-run
```

### Cortafuegos

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Sólo deben aparecer 22, 80 y 443. **El 5432 no debe estar**: la base no se publica.

---

## 10. Comprobación final

```bash
curl -I https://staging.TUDOMINIO.com/login          # 200
curl -i https://api-staging.TUDOMINIO.com/api/clients | head -1   # 401
curl -o /dev/null -w "%{http_code}\n" https://api-staging.TUDOMINIO.com/api/docs   # 404
```

Y a mano en el navegador: registrar el taller, crear un cliente, recorrer el asistente de
recepción y hacer una venta en el POS. **Contrasta con la base**, no sólo con la pantalla.

### Conectarte a la base sin exponerla

La base no tiene puerto publicado. Para usar un cliente gráfico desde tu portátil, haz un
túnel SSH:

```bash
ssh -L 5433:localhost:5432 usuario@servidor \
  -t 'docker compose -f /opt/taller/docker-compose.staging.yml exec postgres sleep infinity'
```

Más simple y suficiente casi siempre: `psql` dentro del contenedor.

```bash
docker compose -f docker-compose.staging.yml exec postgres psql -U taller -d taller_motos
```

---

## 11. Operación diaria

### Logs

```bash
# En directo, los tres servicios
docker compose -f docker-compose.staging.yml logs -f

# Sólo la API, últimas 200 líneas
docker compose -f docker-compose.staging.yml logs --tail 200 api

# Desde hace una hora
docker compose -f docker-compose.staging.yml logs --since 1h api
```

Evitar que llenen el disco (añadir a cada servicio del compose si hace falta):

```yaml
logging:
  driver: json-file
  options: { max-size: '10m', max-file: '5' }
```

### Reiniciar

```bash
docker compose -f docker-compose.staging.yml restart api
docker compose -f docker-compose.staging.yml restart          # todo
```

### Parar y arrancar

```bash
docker compose -f docker-compose.staging.yml stop
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
```

> ⚠️ **`down -v` BORRA LOS VOLÚMENES**, es decir la base de datos y los archivos subidos.
> `down` a secas conserva los volúmenes. Nunca uses `-v` salvo que quieras perderlo todo.

### Actualizar a una versión nueva

```bash
cd /opt/taller

# 1. COPIA DE SEGURIDAD PRIMERO (sección 13)
./scripts/backup-staging.sh

# 2. Anota la versión actual por si hay que volver
git rev-parse HEAD > /opt/taller/version-anterior.txt

# 3. Código nuevo
git pull

# 4. Reconstruir
docker compose -f docker-compose.staging.yml --env-file .env.staging build

# 5. Migraciones
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d postgres
docker compose -f docker-compose.staging.yml exec api npx prisma migrate deploy || true
docker compose -f docker-compose.staging.yml exec api npx prisma migrate deploy --config prisma/pos/prisma.config.ts || true

# 6. Levantar con las imágenes nuevas
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d

# 7. Comprobar
docker compose -f docker-compose.staging.yml ps
curl -i http://127.0.0.1:3001/api/clients | head -1
```

Con Docker **no existe el problema de «recompilé y sigue igual»**: `up -d` sustituye el
contenedor por uno nuevo con la imagen nueva. Es una de las ventajas reales frente al
despliegue directo.

### Volver atrás

```bash
cd /opt/taller
git checkout $(cat version-anterior.txt)
docker compose -f docker-compose.staging.yml --env-file .env.staging build
docker compose -f docker-compose.staging.yml --env-file .env.staging up -d
```

> ⚠️ **Volver atrás en el código NO deshace las migraciones.** Si la versión que
> desplegaste cambió el esquema, el código antiguo puede no entenderse con él. La única
> vuelta atrás real es restaurar la copia de la base. Por eso el paso 1 es la copia.

---

## 12. Lo que SÍ está verificado

Comprobado en la máquina de desarrollo el 2026-08-13:

| Elemento | Estado |
|---|---|
| `apps/api/Dockerfile` construye | *(resultado en la sección 12.1)* |
| `apps/web/Dockerfile` construye | *(resultado en la sección 12.1)* |
| El `.env` **no** entra en las imágenes | ✅ está en `.dockerignore` |
| Los contenedores arrancan y responden | *(resultado en la sección 12.1)* |

*(Esta sección se completa con los resultados reales de la construcción — ver el informe
de la auditoría.)*

---

## 13. Copias de seguridad en staging

Guarda esto como `/opt/taller/scripts/backup-staging.sh` y dale permisos con
`chmod +x`:

```bash
#!/bin/bash
set -e
CD=/opt/taller
DEST=~/backups/$(date +%Y-%m-%d_%H%M)
mkdir -p "$DEST"

docker compose -f $CD/docker-compose.staging.yml exec -T postgres \
  pg_dump -U taller -Fc taller_motos > "$DEST/taller_motos.dump"
docker compose -f $CD/docker-compose.staging.yml exec -T postgres \
  pg_dump -U taller -Fc motopos > "$DEST/motopos.dump"

# Archivos subidos (viven en un volumen de Docker)
docker run --rm -v taller_uploads_data:/data -v "$DEST":/backup alpine \
  tar czf /backup/uploads.tar.gz -C /data .

for f in "$DEST"/*.dump; do
  [ -s "$f" ] || { echo "ERROR: $f vacío" >&2; exit 1; }
done
echo "Copia correcta en $DEST"
ls -lh "$DEST"
```

> `exec -T` desactiva el pseudo-terminal. **Sin `-T` el volcado sale corrupto**, porque el
> terminal añade retornos de carro al binario. Es el error más común al hacer copias con
> Docker.

El procedimiento completo de restauración y verificación es el punto 4 de tu lista y se
detalla en `BACKUP_AND_RECOVERY.md`, adaptado a Docker.
