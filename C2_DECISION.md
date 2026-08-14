# C2_DECISION.md — Acceso público a archivos: análisis y decisión

> ## ✅ DECISIÓN TOMADA: **Opción A — aceptado conscientemente**
> **Fecha:** 2026-08-13 · Decidido por el propietario tras leer este análisis.
>
> Se acepta que los archivos de `/uploads` sean accesibles para quien tenga el enlace,
> sabiendo que: (a) **no existe forma de descubrir archivos ajenos** —verificado, ver
> abajo—, (b) el enlace no caduca ni se puede revocar, y (c) los PDF de cotización ya
> circulan por WhatsApp por diseño.
>
> **Queda pendiente, como trabajo aparte:** el borrado real de archivos (matiz 3). No es
> parte de C-2 y se arregla igualmente.
>
> **La decisión es reversible:** migrar a enlaces firmados más adelante no exige cambiar el
> formato de las URLs ya guardadas.

**Fecha del análisis:** 2026-08-13 · Todo lo de este documento se comprobó **ejecutándolo**
contra la aplicación en marcha, no leyendo el código.

---

## VEREDICTO

# 🅰️ Escenario A

> **«Quien tenga el enlace puede ver solamente ese recurso.»**

**No encontré ninguna vía para descubrir archivos partiendo de uno conocido.** No es el
escenario B. Las nueve vías que pediste comprobar están cerradas, y abajo está la evidencia
de cada una.

Dicho eso, el escenario A **no es lo mismo que «no pasa nada»**. Hay tres matices que
debes conocer antes de decidir, y uno de ellos no lo esperaba (el punto 3).

---

## 1. Las nueve vías que pediste — resultado de cada una

| # | Vector | Resultado | Evidencia |
|---|---|---|---|
| 1 | **Cambiar un ID en la URL** | 🟢 Cerrado | Mutar un solo carácter del nombre → `404` |
| 2 | **Cambiar un número de orden** | 🟢 No aplica | El nombre del archivo **no contiene** el número de orden, ni el cliente, ni el tenant. Es `orders/<uuid>.jpg` y nada más |
| 3 | **Cambiar el nombre de archivo** | 🟢 Cerrado | UUID secuencial (`…-000000000001`) → `404` |
| 4 | **Modificar parámetros** | 🟢 No aplica | La ruta no acepta parámetros: es un fichero estático, sin query ni cabeceras que alteren qué se sirve |
| 5 | **Enumerar URLs** | 🟢 Cerrado | Sin listado de directorio: `/uploads/`, `/uploads/orders/`, `/uploads/quotations/` → todos `404` |
| 6 | **Archivos de otros clientes o empresas** | 🟢 Cerrado | Los nombres son aleatorios; la API sí separa por empresa (IDOR verificado: `404` en lectura, modificación y borrado) |
| 7 | **Documentos de otras sucursales** | 🟢 Cerrado | Igual que el anterior: no hay nada en la ruta que identifique sucursal |
| 8 | **Acceder sin conocer una URL válida** | 🟢 Inviable | Ver el cálculo de abajo |
| 9 | **Path traversal** | 🟢 Cerrado | 6 variantes probadas (`../`, `..%2f`, `%2e%2e`, anidadas) → todas `404` |

### Por qué la fuerza bruta no es una vía

Los nombres los genera `randomUUID()` de Node, que es un **UUID v4 criptográficamente
aleatorio**. Lo verifiqué sobre los archivos reales del disco: el dígito de versión es `4`
en todos.

```
122 bits aleatorios = 5,3 × 10³⁶ combinaciones

Con ~12 archivos y 10.000 peticiones por segundo (muy optimista para un atacante),
un solo acierto tardaría de media 1,4 × 10²⁴ años.
```

Para comparar: el universo tiene unos 1,4 × 10¹⁰ años.

**Una salvedad honesta:** los ficheros estáticos **no pasan por el limitador de peticiones**
(120 peticiones seguidas, cero respuestas `429`). Es irrelevante para adivinar 122 bits
—ningún límite cambia ese cálculo—, pero significa que `/uploads` sí es un punto por donde
saturar el servidor a base de peticiones. Es una consideración de disponibilidad, no de
confidencialidad.

### Diferencias de respuesta

Comprobé que el servidor **no distingue** entre «no existe» y «existe pero no puedes»:
todo devuelve `404` idéntico. No hay un canal lateral que confirme la existencia de un
archivo.

### Endpoints públicos

Sólo hay **5 endpoints sin sesión** en toda la API: `health`, `register-tenant`, `login`,
`refresh` y `logout`. **Ninguno devuelve rutas de archivos.** La única forma de obtener una
URL por la API es estando autenticado y con acceso a esa empresa.

---

## 2. Lo que sí implica el escenario A

### Matiz 1 — El enlace no caduca ni se puede revocar

Quien obtenga un enlace lo tiene **para siempre**. No hay caducidad, ni firma, ni forma de
invalidarlo. Si un cliente reenvía el PDF de su cotización a un tercero, ese tercero puede
volver a abrirlo dentro de dos años.

### Matiz 2 — Los enlaces circulan fuera del sistema por diseño

Los PDF de cotización **se envían al cliente por WhatsApp**. Eso significa que la URL vive
en:

- el historial de WhatsApp del cliente y del taller,
- las copias de seguridad de ese WhatsApp (que suelen ir a Google Drive o iCloud),
- el historial del navegador de quien lo abra,
- los registros de cualquier proxy corporativo por el que pase.

No es un secreto bien guardado: es un enlace pensado para compartirse. Eso es coherente con
su propósito —el cliente debe poder verlo sin tener cuenta— pero conviene decirlo claro.

### Matiz 3 — Borrar una foto NO borra el archivo ⚠️

**Esto no lo esperaba y creo que es lo más relevante para tu decisión.**

`StorageService` sólo tiene el método `upload()`. **No existe ningún método de borrado.**
Cuando alguien borra una foto de una orden, se elimina la fila de la base de datos y **el
archivo se queda en el disco, accesible en la misma URL de siempre**.

Consecuencias:

- «Borré esa foto» es falso: sigue ahí y sigue siendo descargable por quien tuviera el enlace.
- Si se subió una foto por error —un documento de identidad, una matrícula, algo personal—
  **no hay forma de retirarla desde la aplicación**. Hay que entrar al servidor y borrarla a mano.
- El disco crece indefinidamente con archivos que ya no referencia nadie.

Esto es independiente de C-2, pero **lo empeora**: sin borrado, un enlace filtrado no se
puede cortar de ninguna manera.

---

## 3. Qué hay expuesto exactamente

| Tipo | Contenido | Carpeta |
|---|---|---|
| Fotos de recepción e intervención | Estado del vehículo del cliente | `/uploads/orders/` |
| Firmas de recepción | La firma manuscrita del cliente | `/uploads/orders/` |
| PDF de cotización | **Nombre del cliente, su vehículo y el presupuesto detallado** | `/uploads/quotations/` |

El PDF de cotización es el más sensible de los tres: es un documento con datos personales
y económicos identificables. *(Verifiqué que se descarga sin sesión — `HTTP 200` sin
cabecera de autenticación. No pude extraer su texto comprimido en este entorno para
transcribirlo, así que describo su contenido a partir del código que lo genera, no de una
lectura del PDF.)*

---

## 4. La decisión es tuya. Estas son las opciones

### Opción A — Aceptarlo conscientemente

**Defendible si:** las fotos son de motos y daños, las firmas no te preocupan como dato
biométrico, y asumes que un presupuesto es algo que el cliente ya recibe por WhatsApp de
todos modos.

**Lo que estás aceptando:** que un enlace filtrado da acceso permanente a ese documento
concreto, sin posibilidad de cortarlo.

**Si eliges esto, te recomiendo hacer igualmente dos cosas pequeñas** (no son C-2, son
independientes y de bajo riesgo):
1. Añadir borrado real de archivos, para que «borrar una foto» signifique algo.
2. Poner un límite de peticiones a `/uploads` en Nginx, por disponibilidad.

### Opción B — Cerrarlo antes de producción

Endpoint autenticado + migración de las URLs guardadas. **2-3 días**, toca cuatro tablas y
el frontend. El detalle está en `PLAN_DE_CORRECCION.md` §1.1.

**Complicación que debes tener en cuenta:** el PDF de cotización **tiene que seguir siendo
accesible sin sesión**, porque el cliente no tiene cuenta en el sistema. Cerrarlo del todo
rompería el envío por WhatsApp. Para ese caso concreto la solución no es «exigir sesión»,
sino un **enlace firmado con caducidad** (por ejemplo 30 días), que sí se puede revocar.

Es decir: B no es un solo cambio, son dos caminos distintos según el tipo de archivo.

### Opción C — Intermedia, y probablemente la más sensata

1. **Fotos y firmas** → endpoint autenticado (nadie externo necesita verlas nunca).
2. **PDF de cotización** → enlace firmado con caducidad (el cliente sigue pudiendo abrirlo).
3. **Borrado real de archivos** en los dos casos.

Cubre el riesgo real sin romper el flujo de WhatsApp, que es el que aporta valor al cliente.

---

## 5. Mi recomendación

**El riesgo es A, no B: no hay forma de descubrir archivos ajenos.** Eso baja bastante la
gravedad respecto a lo que dejé escrito en `CODE_AUDIT.md`, y quiero decirlo con la misma
claridad con la que levanté la alarma.

Con eso sobre la mesa: **A es aceptable para arrancar** si las fotos son de vehículos y
daños. Lo que no dejaría sin resolver, decidas lo que decidas, es el **matiz 3**: que
borrar una foto no la borre es un problema por sí solo, y hoy no tienes forma de retirar
un archivo subido por error sin entrar al servidor.

**No he cambiado nada.** Dime qué opción eliges y lo implemento.
