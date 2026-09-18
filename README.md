# Plano del Monumento a Fray Antón

Plano de la explanada del monumento, en el Malecón de Santo Domingo, para ver cada fotografía
**desde el punto donde se tomó** y dejar notas ancladas al sitio.

## Abrir

Doble clic en **`index.html`**. Sin servidor, sin internet, sin instalar nada.

## Marcar una fotografía

1. Pulsa **Foto**.
2. **Mantén pulsado** en el punto exacto desde donde se tomó la imagen.
3. **Arrastra** hacia donde apuntaba la cámara: el cono rojo sigue al cursor.
4. Suelta. Se abre el panel para elegir la imagen y escribir el título y la nota.

El atajo es **F**. También puedes **arrastrar una imagen** directamente sobre el plano: cae con
su marca en ese punto y solo queda orientarla.

## Ver las fotografías

**Doble clic** en cualquier marca roja abre la imagen a pantalla completa, con su título, su
nota y el rumbo de la cámara.

## La galería

El botón **Galería** de la barra superior (atajo **G**) despliega todas las fotografías juntas,
para repasar lo que hay sin ir marca por marca. Cada ficha lleva el título y el rumbo, y las que
todavía no tienen imagen —o apuntan a un archivo que falta— lo dicen en su recuadro.

Pulsar la miniatura abre la fotografía a pantalla completa. **Situar** hace lo contrario: cierra
la galería y lleva el plano hasta el punto desde donde se tomó, con la marca ya seleccionada.

A la derecha de la barra superior está siempre la cuenta de lo que hay marcado.

## Notas

Pulsa **Nota** (atajo **N**) y marca el punto. Salen en ámbar, sin cono, porque una nota no
mira a ninguna parte.

## Corregir una marca

Con la herramienta **Mover**: arrástrala para reubicarla, o selecciónala y usa el **tirador
blanco** para girar el cono. Un clic abre su panel; **Supr** la borra.

## Dónde viven las fotos

Depende de si el plano corre con servidor detrás. La esquina derecha de la barra lo dice
siempre, y el punto se pone verde cuando hay servidor.

**Sin servidor** (`solo este navegador`) — abriendo el `index.html` desde el disco, o en un
alojamiento estático. Copia las imágenes a la carpeta **`fotos/`** con el mismo nombre con el
que las elegiste; el plano las busca ahí al abrirse. Durante la sesión las ves al momento
aunque no estén todavía en la carpeta: el navegador solo conoce el nombre del archivo, no la
carpeta del disco de donde salió. Si al recargar una marca aparece como *no encontrada*, es que
falta ese archivo en `fotos/`.

**Con servidor** (`en línea`) — al elegir una foto se sube sola al Blob store y la marca pasa a
apuntar a su URL. Ya no hay que copiar nada a mano, y las fotos se ven desde cualquier
dispositivo. Antes de subirla, el navegador reduce la imagen a 2200 px de lado y JPEG de
calidad 0,85: una foto de teléfono pasa de varios megabytes a unos cientos de kilobytes.

## Guardado

Las marcas se guardan siempre en el navegador, así que el plano funciona sin conexión. Si hay
base de datos conectada, además se sincronizan con ella y las ve todo el mundo.

**Exportar** descarga un `marcas-plano.json` e **Importar** lo recupera. Con servidor detrás,
importar también manda todas las marcas a la base.

## Publicar en Vercel

El proyecto trae `api/` y `vercel.json`, así que se despliega tal cual: sin compilación, los
archivos estáticos desde la raíz y tres funciones en `api/`.

El plano funciona sin nada de esto conectado. Lo que hace falta es solo para compartir marcas y
fotos entre dispositivos, y se crea desde el panel de Vercel, en **Storage**:

| Store | Variable que inyecta | Para qué |
|---|---|---|
| Postgres | `DATABASE_URL` (o `POSTGRES_URL`) | Las marcas |
| Blob | `BLOB_READ_WRITE_TOKEN` | Las fotografías |

Hay una tercera variable, `PLANO_CLAVE`, que no la pone Vercel: se escribe a mano y cierra las
rutas con contraseña. Más abajo.

Al enlazarlos al proyecto, Vercel pone las variables solo. No hay que crear la tabla: se crea
sola la primera vez que se guarda una marca.

Las rutas:

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/estado` | GET | Dice qué stores hay conectados |
| `/api/marcas` | GET | Devuelve todas las marcas |
| `/api/marcas` | PUT | Guarda una marca (inserta o actualiza) |
| `/api/marcas?id=…` | DELETE | Borra una marca |
| `/api/subir` | POST | Sube una imagen y devuelve su URL |

Sin store conectado, `/api/marcas` y `/api/subir` responden **503** con `nube:false`, y el
plano sigue trabajando en local sin romperse.

## Quién puede escribir

Tal cual se despliega, cualquiera que dé con la dirección puede añadir, cambiar o borrar
marcas y subir fotos. Para un plano de trabajo interno suele bastar, pero la URL de Vercel no
es secreta.

Para cerrarlo, añade en **Settings → Environment Variables** una variable `PLANO_CLAVE` con la
contraseña que quieras. A partir de ahí `/api/marcas` y `/api/subir` responden **401** a quien
no la traiga.

Se entra una vez con la clave en la dirección:

```
https://<el-despliegue>.vercel.app/?clave=la-que-pusiste
```

El plano la guarda en ese navegador y la borra de la barra de direcciones, así que no queda en
el historial ni viaja en un enlace copiado. Quien abra el plano sin ella lo ve igual pero
trabajando solo en local, con un aviso que lo explica.

Sin `PLANO_CLAVE` definida nada cambia: las rutas quedan abiertas como hasta ahora.

## Atajos

| Tecla | Acción |
|---|---|
| **V** | mover y seleccionar |
| **F** | insertar fotografía |
| **N** | dejar una nota |
| **G** | abrir y cerrar la galería |
| **E** | encuadrar el plano |
| **H** | ocultar la ayuda |
| **Supr** | borrar la marca seleccionada |
| **Esc** | cerrar y volver a Mover |

## El plano

`fondo/plano-fondo.svg`, 1176 × 1338. Las marcas se guardan en ese sistema de coordenadas, no
en píxeles de pantalla, así que no se mueven al hacer zoom.

Está dibujado como una planta técnica sobre negro: las superficies se apagan casi hasta el
fondo y el dibujo lo sostienen las líneas blancas. El césped es lo único con color, con una
trama de grama fina.

Se generó vectorizando una lámina de referencia con `herramientas/vectorizar.py`, sin
dependencias externas: decodifica el PNG con un lector propio, clasifica cada píxel por color,
detecta los trazos por contraste local, aplana el grano de las superficies, extrae los
contornos siguiendo las aristas entre píxeles y los regulariza a rectas y curvas Bézier.

Para regenerarlo:

```
python3 herramientas/vectorizar.py referencia/ref.png fondo/plano-fondo.svg 1.0
```

La paleta está en el diccionario `ESTILO` y la opacidad del conjunto en `OPACIDAD`.

## Lo que falta

**La escala.** El plano tiene proporciones correctas pero ninguna medida: la barra de escala no
venía en la imagen de referencia recibida. Con una sola distancia real medida en sitio, entre
dos puntos identificables, se convierte a metros.
