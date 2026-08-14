# ADMIN_GUIDE.md — Guía para el responsable del taller

Esta guía está escrita **sin dar por supuesto ningún conocimiento de programación**.
Explica cómo saber si el sistema está bien, qué hacer cuando algo falla, y qué contarle a
un técnico si necesitas ayuda.

---

## 1. Cómo está montado, en dos minutos

Tu sistema son **cuatro piezas**. Entender esto te ahorra la mitad de los problemas,
porque casi siempre falla **una** y basta con saber cuál.

| Pieza | Qué hace | Comparación |
|---|---|---|
| **Frontend** | Las pantallas que ves y donde haces clic | El mostrador |
| **API (backend)** | Piensa, calcula y decide qué se guarda | El encargado |
| **Base de datos** | Guarda todo: clientes, órdenes, ventas | El archivador |
| **Archivos** | Las fotos de los vehículos y las firmas | La carpeta de fotos |

Cuando pides algo, el recorrido es: **pantalla → encargado → archivador → y vuelta**.
Si se corta en algún punto, verás un fallo distinto. La sección 6 te dice cuál.

Hay **dos archivadores separados a propósito**: uno para el taller (clientes, órdenes) y
otro para el punto de venta (productos, ventas). Es importante recordarlo sobre todo al
hacer copias de seguridad: **hay que copiar los dos**.

---

## 2. Cómo iniciar el sistema

Conéctate al servidor y escribe:

```bash
pm2 start all
```

Espera unos 15 segundos y comprueba:

```bash
pm2 status
```

Debes ver dos líneas, **`taller-api` y `taller-web`, las dos en verde y con la palabra
`online`**. Si alguna dice `errored` o `stopped`, ve a la sección 5.

---

## 3. Cómo saber si está funcionando

### La comprobación de 10 segundos

```bash
pm2 status
```

Las dos en `online` = el sistema está arriba.

### La comprobación de verdad

Abre el navegador, entra en tu dirección (por ejemplo `https://taller.tudominio.com`) e
**inicia sesión**. Si entras y ves tus clientes, funciona de verdad.

`pm2 status` sólo dice que los programas están encendidos; no que estén haciendo bien su
trabajo. Es la diferencia entre «hay luz en el local» y «el negocio está atendiendo».

### Comprobación intermedia, sin navegador

```bash
curl -i http://localhost:3001/api/clients
```

Si la primera línea dice **`HTTP/1.1 401`**, está **bien**. Parece un error pero no lo es:
significa «te oigo perfectamente, pero no me has dicho quién eres». Es la respuesta
correcta, y prueba que el encargado está despierto.

Si dice `connection refused`, la API está caída.

---

## 4. Cómo mirar los registros (el diario del sistema)

El registro es donde el sistema apunta lo que hace y, sobre todo, **lo que le sale mal**.
Es el primer sitio donde mirar siempre.

```bash
pm2 logs taller-api --lines 100
```

Salir: `Ctrl + C`.

Sólo los errores:

```bash
pm2 logs --err --lines 50
```

**No necesitas entender todo lo que aparece.** Busca las líneas que digan `ERROR` y **copia
esa parte tal cual**: es exactamente lo que un técnico necesita.

Errores frecuentes y qué significan:

| Lo que dice el registro | Qué significa | Qué hacer |
|---|---|---|
| `JWT_ACCESS_SECRET no está definido…` | Falta una clave de configuración | Sección 8 |
| `Can't reach database server` | El archivador no responde | Sección 5.2 |
| `EADDRINUSE` | Ya hay algo usando ese puerto | `pm2 restart all` |
| `Unauthorized` / `401` | Normal: alguien sin sesión | No es un problema |

---

## 5. Qué hacer cuando algo falla

### 5.1 «La página no carga»

En orden. **No saltes pasos.**

```bash
# 1. ¿Están encendidos los programas?
pm2 status

# 2. ¿Qué dice el diario? (aquí está la respuesta el 80% de las veces)
pm2 logs taller-api --lines 100

# 3. Reinicia
pm2 restart all

# 4. Espera 20 segundos y vuelve a mirar
pm2 status
```

Si tras esto sigue sin funcionar, ve a la sección 9 y llama a un técnico.

### 5.2 «Sale un error de base de datos»

```bash
# ¿Está encendido el archivador?
docker ps
```

Debes ver una línea con `postgres`. Si no aparece:

```bash
docker compose up -d postgres
sleep 10
pm2 restart all
```

### 5.3 «Entro pero no veo mis datos»

**Para y no toques nada más.** Que el sistema funcione pero los datos no aparezcan es el
caso más delicado de todos, porque cada minuto que sigue funcionando puede escribir encima
de lo que quieres recuperar.

1. Avisa a todo el mundo de que deje de usar el sistema.
2. Párala: `pm2 stop all`
3. Llama a un técnico con la información de la sección 9.

**No reinicies repetidamente «a ver si se arregla».** Con los datos, insistir a ciegas
puede empeorar lo que todavía se podía salvar.

### 5.4 «Va muy lento»

```bash
pm2 status          # mira la columna de memoria
df -h               # ¿queda espacio en disco?
```

Si el disco está por encima del 90%, es casi seguro la causa. Lo que más ocupa suelen ser
los registros antiguos y las copias de seguridad viejas.

---

## 6. Cómo saber si el problema es del mostrador, del encargado o del archivador

Esta tabla es la que más tiempo te va a ahorrar:

| Lo que ves | Pieza que falla | Primer paso |
|---|---|---|
| La página no abre siquiera | **Frontend** | `pm2 restart taller-web` |
| La página abre pero todo sale vacío, o avisa «No se pudo conectar con el servidor» | **API** | `pm2 restart taller-api` y mira el registro |
| Avisa «No tienes permiso para ver esta información» | **Ninguna: es normal** | Ese usuario no tiene acceso a esa sección |
| Todo carga pero al guardar da error | **API o base de datos** | `pm2 logs taller-api` |
| Sale «Error en el servidor» | **API** | `pm2 logs --err` |
| Las fotos no se ven pero el resto sí | **Archivos** | Comprueba la carpeta `uploads` |
| Va lentísimo | **Base de datos o disco** | `df -h` |

El sistema está preparado para avisarte con un mensaje claro en cada uno de estos casos.
**Si alguna pantalla se queda muda, sin explicar nada, eso sí es un fallo**: apúntalo y
cuéntaselo a un técnico.

---

## 7. Copias de seguridad

### Hacer una copia ahora mismo

```bash
~/backup-taller.sh
```

Comprueba que se creó y **que no está vacía**:

```bash
ls -lh ~/backups/$(date +%Y-%m-%d)/
```

Debes ver **dos archivos `.dump`** (uno del taller y otro del punto de venta), los dos con
un tamaño mayor que cero. **Un archivo de 0 bytes es una copia rota**, aunque el comando no
se haya quejado.

### Comprobar que las copias automáticas se están haciendo

```bash
ls -lh ~/backups/
cat ~/backup.log
```

Debe haber una carpeta por día. **Míralo una vez por semana.** Una copia automática que
lleva un mes fallando en silencio es peor que no tener ninguna, porque crees que estás
protegido.

### Restaurar una copia

**Esto borra los datos actuales y los sustituye por los de la copia.** Procedimiento
completo en `BACKUP_AND_RECOVERY.md`, sección 3. Si no lo has hecho nunca, **que lo haga
un técnico**: hacerlo mal en el momento equivocado puede destruir lo que aún se podía
salvar.

### Lo más importante de todo

**Una vez al mes, comprueba que una copia se puede restaurar de verdad.** El procedimiento
está en `BACKUP_AND_RECOVERY.md`, sección 4, y **no toca los datos reales**.

Casi nadie lo hace, y es cómo la gente descubre —el peor día posible— que llevaba meses
guardando archivos que no servían.

---

## 8. Actualizar a una versión nueva

**Nunca actualices sin copia de seguridad previa, y nunca un viernes por la tarde.**

El procedimiento completo está en `DEPLOYMENT.md`, sección 12. Resumen:

1. Copia de seguridad.
2. Traer el código nuevo.
3. Actualizar la base de datos.
4. Compilar.
5. **Reiniciar** (sin esto, sigue funcionando la versión vieja).
6. Comprobar entrando en la aplicación.

Si algo sale mal, `DEPLOYMENT.md` sección 13 explica cómo volver a la versión anterior.

Un detalle que confunde mucho: **compilar no basta, hay que reiniciar.** El programa carga
las instrucciones en memoria al arrancar. Si actualizas y no reinicias, sigue trabajando
con las viejas. Si alguien te dice «ya lo arreglé» y sigue fallando igual, lo primero que
hay que descartar es que no se reinició.

---

## 9. Qué información darle a un técnico

Cuando pidas ayuda, manda **todo esto de una vez**. Ahorra horas de ida y vuelta:

**1. Qué querías hacer**
> «Estaba creando una orden nueva para un cliente.»

**2. Qué esperabas y qué pasó**
> «Esperaba que se guardara. Salió un mensaje rojo que decía "Error en el servidor".»

**3. Cuándo empezó**
> «Hoy sobre las 10 de la mañana. Ayer funcionaba.»

**4. Si cambió algo antes**
> «Actualizamos el sistema anoche» / «No cambiamos nada.»

**5. A cuántos afecta**
> «A todos» / «Sólo a mí» / «Sólo en el punto de venta.»

**6. El estado de los programas**
```bash
pm2 status
```
(copia el resultado)

**7. El registro** — esto es lo más importante
```bash
pm2 logs taller-api --lines 100 > ~/error.txt
```
Y envía el archivo `error.txt`.

**8. Una captura de pantalla** del error tal como lo ves.

> ⚠️ **Antes de mandar nada, revisa que no incluya contraseñas.** El archivo `.env` del
> servidor contiene las llaves del sistema entero. **No lo mandes nunca completo**; si un
> técnico necesita saber cómo está configurado, que te pida variables concretas.

---

## 10. Comandos que puedes usar sin miedo

Estos **sólo consultan**, no cambian nada:

```bash
pm2 status                        # ¿están encendidos?
pm2 logs taller-api --lines 50    # ver el diario
docker ps                         # ¿está encendida la base de datos?
df -h                             # ¿queda espacio en disco?
ls -lh ~/backups/                 # ¿se están haciendo copias?
```

Este **reinicia** (seguro, pero corta el servicio unos segundos):

```bash
pm2 restart all
```

## 11. Comandos que NO debes ejecutar sin un técnico

| Comando | Por qué |
|---|---|
| Cualquiera con `DROP` | Borra tablas o bases enteras |
| Cualquiera con `DELETE FROM` | Borra registros, sin papelera |
| `pg_restore` | Sobrescribe los datos actuales |
| `prisma migrate reset` | **Vacía la base entera** |
| `rm -rf` | Borra archivos sin posibilidad de recuperarlos |
| `git checkout` / `git reset` | Cambia la versión del programa |

Si una guía de internet o un chat te dice que ejecutes algo de esta lista, **pregunta
antes**. Ninguno de estos comandos avisa ni pide confirmación.

---

## 12. Rutina recomendada

| Cuándo | Qué |
|---|---|
| **Cada día** | Entrar en la aplicación y comprobar que funciona |
| **Cada semana** | `ls -lh ~/backups/` — que haya una carpeta por día, y `df -h` para el disco |
| **Cada mes** | Probar que una copia se puede restaurar (`BACKUP_AND_RECOVERY.md` §4) |
| **Antes de cada actualización** | Copia de seguridad manual |

---

## 13. Una cosa que debes saber sobre las fotos

Las fotos de los vehículos y las firmas de recepción **se pueden ver sin iniciar sesión**
si alguien conoce su dirección exacta. Las direcciones son largas y aleatorias, así que no
se adivinan por casualidad, pero **eso no es lo mismo que estar protegidas**.

Está documentado como pendiente en `CODE_AUDIT.md` (hallazgo C-2). Cerrarlo del todo
requiere un cambio con cierto riesgo que conviene hacer con calma y probar entero.

**Es una decisión tuya** tomarla antes o después de abrir al público, pero debes tomarla
sabiendo que hoy es así.
