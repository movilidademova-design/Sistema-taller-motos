# BACKUP_AND_RECOVERY.md — Copias de seguridad y recuperación

**Todos los comandos de este documento se han ejecutado de verdad**, contra la base real
de este proyecto, el 2026-08-13. No están escritos de memoria.

Resultado de la prueba de restauración completa: 25 clientes, 3 órdenes y 21 usuarios
restaurados idénticos en una base vacía, **0 registros huérfanos**, 60 claves foráneas y
70 índices conservados.

---

## 0. Lo primero que hay que entender: son DOS bases de datos

Esta aplicación usa **dos bases separadas a propósito**:

| Base | Qué contiene | Si la pierdes… |
|---|---|---|
| `taller_motos` | Clientes, vehículos, órdenes, cotizaciones, facturas, usuarios, sucursales | Pierdes el taller entero |
| `motopos` | Productos del POS, ventas, separados, recibos | Pierdes la caja y el inventario del POS |

**Una copia de seguridad que sólo incluya una de las dos no sirve de nada.** Es el error
más fácil de cometer aquí. Todos los procedimientos de este documento tratan las dos.

---

## 1. Hacer una copia de seguridad

### Si PostgreSQL corre en Docker (la configuración de `docker-compose.yml`)

```bash
# Crea la carpeta del día
mkdir -p ~/backups/$(date +%Y-%m-%d)
cd ~/backups/$(date +%Y-%m-%d)

# Copia de la base del taller
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc taller_motos > taller_motos.dump

# Copia de la base del POS
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc motopos > motopos.dump
```

Qué hace cada parte:
- `docker exec <contenedor>` ejecuta el comando dentro del contenedor de PostgreSQL.
- `pg_dump` es la herramienta oficial de copia de PostgreSQL.
- `-U postgres` es el usuario de la base.
- `-Fc` genera un formato comprimido que `pg_restore` sabe leer. **No uses `-Fp`**: el
  formato plano ocupa mucho más y no permite restaurar tablas sueltas.
- `> archivo.dump` guarda el resultado en tu disco, fuera del contenedor.

**Verifica siempre que la copia no está vacía:**

```bash
ls -lh *.dump
```

Referencia de tamaños reales medidos en este proyecto con datos de demostración:
`taller_motos.dump` ≈ 130 KB, `motopos.dump` ≈ 28 KB. **Un archivo de 0 bytes significa
que la copia falló**, aunque el comando no se quejara.

### Si PostgreSQL es un servicio gestionado (Railway, Neon, Supabase, RDS)

```bash
pg_dump -Fc "postgresql://USUARIO:CONTRASENA@HOST:5432/taller_motos" > taller_motos.dump
pg_dump -Fc "postgresql://USUARIO:CONTRASENA@HOST:5432/motopos" > motopos.dump
```

Usa exactamente las mismas URLs que tienes en `DATABASE_URL` y `POS_DATABASE_URL` del
archivo `.env` del servidor.

### Los archivos subidos también hay que copiarlos

Si `STORAGE_DRIVER=local`, las fotos de los vehículos y las firmas están en el **disco del
servidor**, no en la base de datos. Una copia de la base sin esto deja las órdenes
apuntando a imágenes que ya no existen:

```bash
tar czf uploads.tar.gz -C /ruta/al/proyecto/apps/api uploads
```

Si usas S3 o Cloudflare R2 (`STORAGE_DRIVER=s3`), esto no hace falta: los archivos ya
viven fuera del servidor.

---

## 2. Copia automática diaria

Guarda este archivo como `~/backup-taller.sh`:

```bash
#!/bin/bash
set -e                      # si algo falla, para; no sigas como si nada
DESTINO=~/backups/$(date +%Y-%m-%d)
mkdir -p "$DESTINO"

docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc taller_motos > "$DESTINO/taller_motos.dump"
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc motopos       > "$DESTINO/motopos.dump"
tar czf "$DESTINO/uploads.tar.gz" -C /ruta/al/proyecto/apps/api uploads 2>/dev/null || true

# Una copia de 0 bytes es una copia rota: mejor enterarse hoy que el día del desastre.
for f in "$DESTINO"/*.dump; do
  if [ ! -s "$f" ]; then echo "ERROR: $f está vacío" >&2; exit 1; fi
done

# Conserva 30 días
find ~/backups -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null || true
echo "Copia correcta en $DESTINO"
```

Dale permisos y prográmala a las 3 de la madrugada:

```bash
chmod +x ~/backup-taller.sh
crontab -e
```

Añade esta línea:

```
0 3 * * * /home/TU_USUARIO/backup-taller.sh >> /home/TU_USUARIO/backup.log 2>&1
```

**Comprueba a los dos días que el archivo de registro no tiene errores:**

```bash
cat ~/backup.log
ls -lh ~/backups/*/
```

### Regla de las 3 copias

Una copia en el mismo servidor **no protege de nada**: si el servidor se pierde, se pierde
con él. Copia los `.dump` a otro sitio:

```bash
# A tu ordenador
scp -r usuario@servidor:~/backups/2026-08-13 ~/backups-locales/

# O a un almacenamiento remoto con rclone (Google Drive, Dropbox, S3…)
rclone copy ~/backups remoto:backups-taller
```

---

## 3. Restaurar una copia

> ⚠️ **Restaurar SOBRESCRIBE los datos actuales.** Antes de restaurar, haz una copia de lo
> que hay ahora mismo, aunque creas que está roto: si la restauración sale mal, es lo único
> que te queda.

### Paso 1 — Copia de seguridad de lo que hay ahora

```bash
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc taller_motos > ~/antes-de-restaurar-taller.dump
docker exec sistema-taller-motos-postgres-1 pg_dump -U postgres -Fc motopos > ~/antes-de-restaurar-pos.dump
```

### Paso 2 — Para la aplicación

Nadie debe escribir en la base mientras se restaura.

```bash
pm2 stop taller-api taller-web      # si usas PM2
# o
docker compose stop api web         # si usas Docker
```

### Paso 3 — Restaura

```bash
cd ~/backups/2026-08-13     # la carpeta de la fecha que quieras recuperar

# --clean elimina los objetos existentes antes de recrearlos.
# --if-exists evita que se queje de lo que no existe.
# --no-owner evita errores si el usuario de la base es distinto al del origen.
docker exec -i sistema-taller-motos-postgres-1 \
  pg_restore -U postgres -d taller_motos --clean --if-exists --no-owner < taller_motos.dump

docker exec -i sistema-taller-motos-postgres-1 \
  pg_restore -U postgres -d motopos --clean --if-exists --no-owner < motopos.dump
```

Y los archivos subidos, si los tenías en disco:

```bash
tar xzf uploads.tar.gz -C /ruta/al/proyecto/apps/api
```

### Paso 4 — Comprueba ANTES de dar por buena la restauración

```bash
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "
SELECT 'clientes: '||count(*) FROM clients;
SELECT 'ordenes: '||count(*) FROM orders;
SELECT 'usuarios: '||count(*) FROM users;"
```

Los números deben parecerse a los que tenías. **Si sale 0 en todo, la restauración falló**
aunque no hayas visto ningún error.

Comprueba también que no quedaron datos sueltos:

```bash
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -d taller_motos -c "
SELECT 'ordenes sin cliente: '||count(*) FROM orders o
  LEFT JOIN clients c ON o.\"clientId\"=c.id WHERE c.id IS NULL;
SELECT 'ordenes sin vehiculo: '||count(*) FROM orders o
  LEFT JOIN motorcycles m ON o.\"motorcycleId\"=m.id WHERE m.id IS NULL;"
```

**Las dos cifras deben ser 0.** En la prueba real de este proyecto lo fueron.

### Paso 5 — Vuelve a arrancar

```bash
pm2 start taller-api taller-web
```

Entra en la aplicación y comprueba a mano que ves clientes y órdenes.

---

## 4. Probar la copia SIN tocar producción

Esto es lo más importante de todo el documento y casi nadie lo hace: **una copia que nunca
has restaurado no es una copia, es un archivo del que no sabes nada.**

Hazlo una vez al mes. No toca los datos reales:

```bash
# 1. Crea una base de prueba, vacía y aparte
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "DROP DATABASE IF EXISTS prueba_restauracion;"
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "CREATE DATABASE prueba_restauracion;"

# 2. Restaura ahí la copia
docker exec -i sistema-taller-motos-postgres-1 \
  pg_restore -U postgres -d prueba_restauracion --no-owner < ~/backups/2026-08-13/taller_motos.dump

# 3. Cuenta los registros
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -d prueba_restauracion -c "
SELECT 'clientes: '||count(*) FROM clients;
SELECT 'ordenes: '||count(*) FROM orders;"

# 4. Borra la base de prueba
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "DROP DATABASE prueba_restauracion;"
```

Si el paso 3 devuelve números razonables, tu copia sirve. **Este procedimiento exacto se
ejecutó al redactar este documento y funcionó.**

---

## 5. Procedimiento de emergencia

### «La aplicación no carga»

```bash
# 1. ¿Están vivos los procesos?
pm2 status

# 2. ¿Qué dice el registro? (aquí está casi siempre la respuesta)
pm2 logs taller-api --lines 100

# 3. ¿Responde la base de datos?
docker exec -i sistema-taller-motos-postgres-1 psql -U postgres -c "SELECT 1;"

# 4. Reinicia
pm2 restart taller-api
```

Si la API no arranca, el registro dirá el motivo. Los dos más frecuentes:
- `JWT_ACCESS_SECRET no está definido…` → falta una variable en el `.env`.
- `Can't reach database server` → PostgreSQL está caído o la `DATABASE_URL` es incorrecta.

### «La base de datos está corrupta o he borrado algo sin querer»

1. **Para la aplicación inmediatamente**: `pm2 stop taller-api taller-web`.
   Cada minuto que siga funcionando escribe encima de lo que quieres recuperar.
2. Copia el estado actual, roto y todo: `pg_dump … > ~/estado-roto.dump`.
3. Restaura la última copia buena (sección 3).
4. Comprueba los datos antes de volver a arrancar.

**No reinicies «a ver si se arregla».** Con la base de datos, cada intento a ciegas puede
empeorar lo que aún se podía salvar.

### «El despliegue salió mal»

Ver `DEPLOYMENT.md`, sección de vuelta atrás. Resumen:

```bash
cd /ruta/al/proyecto
git log --oneline -5              # localiza la versión anterior que funcionaba
git checkout <hash-anterior>
pnpm install
pnpm --filter @taller/api build
pm2 restart taller-api
```

> ⚠️ **Volver atrás en el código NO deshace las migraciones de la base de datos.** Si la
> versión que despliegaste aplicó una migración, el código antiguo puede no entenderse con
> el esquema nuevo. Por eso la sección 3 del despliegue insiste en copiar la base **antes**
> de migrar: esa copia es la única vuelta atrás real.

---

## 6. Cada cuánto y cuánto se conserva

| Qué | Cada cuánto | Se conserva | Dónde |
|---|---|---|---|
| Copia automática de las dos bases | Diaria, 3:00 | 30 días | Servidor + copia externa |
| Copia manual antes de desplegar | En cada despliegue | Hasta el siguiente | Servidor |
| Archivos subidos (`uploads/`) | Diaria | 30 días | Servidor + copia externa |
| **Prueba de restauración** | **Mensual** | — | Base desechable |

**Cuánto puedes perder:** con copia diaria a las 3:00, hasta 24 horas de trabajo. Si eso
es demasiado para el taller, sube la frecuencia a cada 6 horas cambiando el `cron` a
`0 */6 * * *`.

---

## 7. Los tres errores que hacen inútil una copia

1. **Copiar sólo una de las dos bases.** Muy fácil de cometer y no se nota hasta el desastre.
2. **Guardar las copias sólo en el mismo servidor.** Si el servidor se pierde, se pierde todo.
3. **No haber restaurado nunca una copia.** Es el error más caro: te enteras de que no
   sirve justo el día en que la necesitas.
