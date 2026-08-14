# DEPLOYMENT.md — Puesta en producción

Comandos exactos, en orden. Cada uno explica qué hace y cómo comprobar que funcionó.

**Todos los comandos de este documento se han ejecutado durante la auditoría del
2026-08-13** contra la aplicación real, salvo los marcados explícitamente como
*no probados en un servidor real* (los de Nginx, dominio y HTTPS, que dependen de tu
proveedor).

---

## 1. Requisitos

| Componente | Versión | Por qué |
|---|---|---|
| Node.js | **20 o superior** | Lo exige `engines` en `package.json` |
| pnpm | **9.15.0** | Es el gestor declarado en `packageManager`; npm o yarn no montan bien el *workspace* |
| PostgreSQL | **16** | Es la versión de `docker-compose.yml` y con la que está probado |
| RAM | 2 GB mínimo | La API y el frontend en el mismo servidor |
| Disco | 20 GB | Base, imágenes subidas y copias de seguridad |

Comprueba lo que tienes:

```bash
node --version      # debe decir v20.x o superior
pnpm --version      # debe decir 9.15.0
psql --version      # debe decir 16.x
```

Si falta pnpm:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
```

---

## 2. Preparar el servidor

### 2.1 Usuario sin privilegios de administrador

Nunca ejecutes la aplicación como `root`: si alguien la compromete, se lleva el servidor entero.

```bash
sudo adduser taller
sudo usermod -aG docker taller     # sólo si vas a usar Docker para PostgreSQL
su - taller
```

### 2.2 Traer el código

```bash
cd ~
git clone <URL-DE-TU-REPOSITORIO> sistema-taller-motos
cd sistema-taller-motos
git checkout main                  # o la rama que uses en producción
```

### 2.3 Instalar dependencias

```bash
pnpm install --frozen-lockfile
```

`--frozen-lockfile` obliga a instalar exactamente las versiones de `pnpm-lock.yaml`. Sin
esa opción, pnpm puede instalar versiones más nuevas y desplegarías algo distinto de lo
que probaste.

---

## 3. Base de datos

### 3.1 Crear las dos bases

**Recuerda: son DOS bases separadas.** Olvidar la del POS es el error más común aquí.

Con Docker (usa el `docker-compose.yml` del proyecto):

```bash
docker compose up -d postgres
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "CREATE DATABASE motopos;"
```

`taller_motos` ya la crea el propio `docker-compose.yml`; `motopos` hay que crearla a mano.

Con PostgreSQL instalado en el sistema:

```bash
sudo -u postgres psql -c "CREATE USER taller WITH PASSWORD 'PON_AQUI_UNA_CONTRASENA_FUERTE';"
sudo -u postgres psql -c "CREATE DATABASE taller_motos OWNER taller;"
sudo -u postgres psql -c "CREATE DATABASE motopos OWNER taller;"
```

Comprueba que existen las dos:

```bash
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "\l" | grep -E "taller_motos|motopos"
```

> ⚠️ **Cambia la contraseña por defecto.** El `docker-compose.yml` trae
> `POSTGRES_PASSWORD: postgres`, que vale para desarrollar y es inaceptable en producción.
> Si expones el puerto 5432 a internet con esa contraseña, la base es pública.
> Lo más seguro es **no publicar el puerto**: borra las líneas `ports: - '5432:5432'`
> del `docker-compose.yml` para que sólo se llegue a la base desde el propio servidor.

---

## 4. Variables de entorno

### 4.1 Generar los secretos

**No reutilices los del ejemplo ni los de desarrollo.** Genera dos valores nuevos:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # para JWT_ACCESS_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"   # para JWT_REFRESH_SECRET
```

La API **se niega a arrancar** si el secreto falta, si es `change_me` o si tiene menos de
32 caracteres. Es deliberado: mejor un fallo ruidoso al arrancar que un agujero silencioso.

### 4.2 `apps/api/.env`

```bash
nano apps/api/.env
```

```bash
DATABASE_URL="postgresql://taller:TU_CONTRASENA@localhost:5432/taller_motos?schema=public"
POS_DATABASE_URL="postgresql://taller:TU_CONTRASENA@localhost:5432/motopos?schema=public"

NODE_ENV=production          # IMPORTANTE: desactiva /api/docs y oculta los errores internos
PORT=3001

JWT_ACCESS_SECRET=<el primer valor generado arriba>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=<el segundo valor generado arriba>
JWT_REFRESH_EXPIRES_IN=7d

# Dominio EXACTO de tu frontend, con https y sin barra final.
# Si esto está mal, el navegador bloquea todas las peticiones y la aplicación
# parece rota sin decir por qué.
CORS_ORIGIN=https://taller.tudominio.com

STORAGE_DRIVER=local
PUBLIC_URL=https://api.tudominio.com

SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM="Taller <no-reply@tudominio.com>"

WHATSAPP_PROVIDER=none
```

Protege el archivo: contiene las llaves de todo el sistema.

```bash
chmod 600 apps/api/.env
```

### 4.3 `apps/web/.env.local`

```bash
nano apps/web/.env.local
```

```bash
NEXT_PUBLIC_API_URL=https://api.tudominio.com/api
NEXT_PUBLIC_WS_URL=https://api.tudominio.com
```

> ⚠️ Estas dos variables se **incrustan en el código durante la compilación**, no se leen
> al arrancar. Si las cambias después, **hay que recompilar el frontend**; reiniciarlo no
> sirve de nada.

---

## 5. Migraciones

Las dos bases tienen su propio juego de migraciones. Hay que aplicar los dos.

```bash
# Genera los clientes de Prisma (código que habla con cada base)
pnpm --filter @taller/api prisma:generate
pnpm --filter @taller/api pos:generate

# Aplica las migraciones
pnpm --filter @taller/api prisma:deploy     # base del taller
pnpm --filter @taller/api pos:migrate       # base del POS
```

> Usa `prisma:deploy` (que es `prisma migrate deploy`), **nunca `prisma migrate dev`** en
> producción: el modo `dev` puede proponer borrar y recrear la base.

Comprueba que se aplicaron:

```bash
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "\dt" | head -20
```

Debes ver tablas como `tenants`, `users`, `clients`, `orders`.

### Primer usuario administrador

En una instalación nueva no hay ningún usuario. Se crea registrando el taller desde la
pantalla `/register` de la aplicación, que crea el tenant, el usuario ADMIN y una sucursal
«Principal».

> ⚠️ **`prisma:seed` es sólo para desarrollo.** Crea usuarios de demostración con la
> contraseña `Password123!`. **Nunca lo ejecutes en producción.**

---

## 6. Compilar

```bash
pnpm --filter @taller/api build      # emite apps/api/dist/
pnpm --filter @taller/web build      # emite apps/web/.next/
```

Comprueba que el punto de entrada de la API existe donde se espera:

```bash
ls apps/api/dist/src/main.js
```

> **Por qué esta comprobación.** La ruta es `dist/src/main.js`, no `dist/main.js`, porque
> la compilación incluye archivos de fuera de `src/`. Durante la auditoría, el script
> `start:prod` apuntaba a `dist/main` y **la aplicación no arrancaba en producción aunque
> el build daba éxito**. Ya está corregido; esta comprobación evita que vuelva a pasar
> inadvertido.

---

## 7. Arrancar

Se recomienda PM2, que reinicia los procesos si se caen y sobrevive a un reinicio del servidor.

```bash
sudo npm install -g pm2

cd ~/sistema-taller-motos/apps/api
pm2 start "node dist/src/main.js" --name taller-api

cd ~/sistema-taller-motos/apps/web
pm2 start "pnpm start" --name taller-web

pm2 save                 # recuerda estos procesos
pm2 startup              # imprime un comando: cópialo y ejecútalo para arrancar al reiniciar
```

Comprueba que están vivos:

```bash
pm2 status                                    # ambos en "online"
curl -i http://localhost:3001/api/clients     # debe responder 401 (sin sesión) — significa que la API vive
curl -I http://localhost:3000/login           # debe responder 200
```

**Un 401 en `/api/clients` es la respuesta correcta**: prueba que la API funciona y que la
autenticación está activa. Si sale «connection refused», la API no arrancó: mira los
registros con `pm2 logs taller-api --lines 50`.

---

## 8. Dominio y HTTPS

> *Esta sección no se ha probado en un servidor real durante la auditoría; depende de tu
> proveedor de dominio y de tu servidor. Los comandos son los estándar de Nginx y Certbot.*

Apunta dos registros DNS de tipo A a la IP del servidor:

```
taller.tudominio.com  ->  IP
api.tudominio.com     ->  IP
```

Instala Nginx y crea `/etc/nginx/sites-available/taller`:

```nginx
server {
    listen 80;
    server_name taller.tudominio.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name api.tudominio.com;
    # Las fotos de las órdenes pueden pesar; 8 MB es el tope que aplica la propia API.
    client_max_body_size 10M;
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # Necesario para las notificaciones en tiempo real (WebSocket)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Actívalo y añade el certificado:

```bash
sudo ln -s /etc/nginx/sites-available/taller /etc/nginx/sites-enabled/
sudo nginx -t                 # comprueba la sintaxis ANTES de recargar
sudo systemctl reload nginx

sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d taller.tudominio.com -d api.tudominio.com
```

Certbot renueva solo. Compruébalo con:

```bash
sudo certbot renew --dry-run
```

---

## 9. Comprobación final

Recórrelo entero antes de dar el sistema por operativo:

```bash
# 1. Los dos procesos vivos
pm2 status

# 2. La API responde y exige sesión
curl -i https://api.tudominio.com/api/clients      # 401

# 3. La documentación NO debe estar publicada en producción
curl -o /dev/null -w "%{http_code}\n" https://api.tudominio.com/api/docs   # debe dar 404

# 4. El frontend carga
curl -I https://taller.tudominio.com/login          # 200

# 5. Se puede iniciar sesión
curl -X POST https://api.tudominio.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"TU_CORREO","password":"TU_CONTRASENA"}'
```

Si el punto 3 devuelve 200, `NODE_ENV` no está en `production`. Corrígelo y reinicia.

Y a mano, en el navegador: iniciar sesión, crear un cliente, crear una orden y comprobar
que aparece en el listado.

---

## 10. Registros

```bash
pm2 logs taller-api          # en directo
pm2 logs taller-api --lines 200
pm2 logs --err               # sólo errores
```

Evita que los registros llenen el disco:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
```

---

## 11. Reiniciar

```bash
pm2 restart taller-api
pm2 restart taller-web
pm2 restart all
```

---

## 12. Actualizar a una versión nueva

**Sigue el orden. El paso 1 no es opcional.**

```bash
# 1. COPIA DE SEGURIDAD PRIMERO (ver BACKUP_AND_RECOVERY.md)
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc taller_motos > ~/pre-deploy-taller.dump
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc motopos > ~/pre-deploy-pos.dump

# 2. Anota en qué versión estás, por si hay que volver
cd ~/sistema-taller-motos
git rev-parse HEAD > ~/version-anterior.txt

# 3. Trae el código nuevo
git pull

# 4. Dependencias
pnpm install --frozen-lockfile

# 5. Migraciones (las dos bases)
pnpm --filter @taller/api prisma:generate
pnpm --filter @taller/api pos:generate
pnpm --filter @taller/api prisma:deploy
pnpm --filter @taller/api pos:migrate

# 6. Compila
pnpm --filter @taller/api build
pnpm --filter @taller/web build

# 7. Reinicia
pm2 restart taller-api taller-web

# 8. Comprueba
pm2 status
curl -i https://api.tudominio.com/api/clients     # 401
```

> ⚠️ **Recompilar no basta: hay que reiniciar el proceso.** Node carga el código en memoria
> al arrancar; recompilar cambia los archivos del disco pero el proceso en marcha sigue
> ejecutando el código viejo. Durante la auditoría esto causó media hora de confusión
> persiguiendo un fallo que ya estaba corregido. **Si arreglaste algo y sigue fallando
> igual, lo primero que hay que descartar es que no reiniciaste.**

---

## 13. Volver atrás

```bash
cd ~/sistema-taller-motos
git checkout $(cat ~/version-anterior.txt)
pnpm install --frozen-lockfile
pnpm --filter @taller/api build
pnpm --filter @taller/web build
pm2 restart taller-api taller-web
```

> ⚠️ **Volver atrás en el código NO deshace las migraciones de la base.** Si la versión que
> desplegaste aplicó una migración que cambia el esquema, el código antiguo puede no
> funcionar contra él. En ese caso hay que restaurar también la copia de la base
> (`BACKUP_AND_RECOVERY.md`, sección 3). Por eso el paso 1 de la actualización es la copia.

---

## 14. Procesos en segundo plano

**No hay ninguno.** No hay colas, ni tareas programadas, ni trabajadores aparte. Todo
ocurre dentro del proceso de la API:

- La limpieza de sesiones caducadas se hace al emitir tokens, no en una tarea aparte.
- Las notificaciones en tiempo real van por WebSocket dentro del mismo proceso de la API.
- El envío de correo (si se configura SMTP) es directo, sin cola.

Lo único que sí debes programar tú es **la copia de seguridad diaria**
(`BACKUP_AND_RECOVERY.md`, sección 2).

---

## 15. Diferencias entre desarrollo y producción

| Ajuste | Desarrollo | Producción |
|---|---|---|
| `NODE_ENV` | `development` | **`production`** |
| `/api/docs` (Swagger) | Publicado | **Desactivado** (lo controla `NODE_ENV`) |
| Errores internos en las respuestas | Detalle completo | **Mensaje genérico** (el detalle va al registro) |
| `CORS_ORIGIN` | `http://localhost:3000` | **Tu dominio con https** |
| `PUBLIC_URL` | `http://localhost:3001` | **Tu dominio de API con https** |
| Secretos JWT | Locales | **Nuevos y distintos** |
| Contraseña de PostgreSQL | `postgres` | **Fuerte, y sin publicar el puerto** |
| Datos de demostración | `prisma:seed` | **Nunca** |
| Arranque | `pnpm dev:api` | `pm2 start "node dist/src/main.js"` |

---

## 16. Riesgo conocido que debes decidir antes de abrir al público

**Las imágenes subidas son públicas.** Con `STORAGE_DRIVER=local`, las fotos de los
vehículos y las firmas de recepción se sirven en `/uploads/...` **sin pedir sesión**:
cualquiera que tenga o adivine la dirección puede verlas. Los nombres son aleatorios, lo
que dificulta adivinarlas, pero eso es ocultamiento, no control de acceso — y las
direcciones aparecen en las respuestas de la API y en los PDF de cotización.

Está documentado como hallazgo **C-2 (parcial)** en `CODE_AUDIT.md`. Cerrarlo del todo
exige un endpoint autenticado y migrar las direcciones ya guardadas, lo que toca cuatro
tablas y el frontend. **Es una decisión tuya tomarla antes o después de abrir**, pero
tienes que tomarla a sabiendas.
