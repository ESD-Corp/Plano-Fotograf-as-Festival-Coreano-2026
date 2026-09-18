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

**Un toque** en una marca roja enseña la fotografía ahí mismo, junto a su punto. Solo la
fotografía: ni título, ni rumbo, ni botones. Es una ojeada, y el dato ya está en el plano y en
la galería. El globo crece desde el punto que has tocado y se voltea solo si no cabe arriba.

Pulsando la imagen, o con **doble clic** en la marca, se abre a pantalla completa con su
título, su nota y el rumbo.

## Cómo se leen las marcas

Una marca es un punto, no un icono: a este tamaño un dibujo de cámara no se lee y solo
ensucia. El tipo lo dicen el color y la forma — **rojo redondo** una fotografía, **ámbar
cuadrado** una nota, **ámbar discontinuo** una foto sin situar.

Del rumbo sale siempre una **aguja**, una línea fina. El **cono** abierto, que es el campo de
visión, solo aparece en la marca que señalas o abres: con cuarenta fotos a la vez, cuarenta
conos superpuestos tapaban el plano entero.

Las marcas encogen y crecen con el zoom, entre un suelo y un techo. Así no se amontonan al
alejar el plano ni lo tapan al ampliarlo. En pantalla táctil el punto encoge pero el destino
del dedo no: sigue siendo de 44 px.

## La galería

El botón **Galería** de la barra superior (atajo **G**) despliega todas las fotografías juntas,
para repasar lo que hay sin ir marca por marca. Cada ficha lleva el título y el rumbo, y las que
todavía no tienen imagen —o apuntan a un archivo que falta— lo dicen en su recuadro.

Pulsar la miniatura abre la fotografía a pantalla completa. **Situar** hace lo contrario: cierra
la galería y lleva el plano hasta el punto desde donde se tomó, con la marca ya seleccionada.

A la derecha de la barra superior está siempre la cuenta de lo que hay marcado.

### Cargar fotografías de golpe

**Añadir fotografías**, en la cabecera de la galería, admite varias a la vez. Es el camino
cuando llegas con la tarjeta llena y todavía no has decidido de dónde salió cada toma.

Una foto cargada así no sabe desde dónde se tomó, y el plano no se lo inventa: entra como marca
**sin situar**, en ámbar y sin cono, aparcada en el centro de lo que estés viendo. Arrástrala
en el plano hasta el punto de la toma y pasa a ser una marca normal, en rojo y con su cono.

Las que faltan por situar salen primero en la galería y se cuentan aparte en la barra superior,
así que se ve de un vistazo lo que queda por colocar.

## Notas

Pulsa **Nota** (atajo **N**) y marca el punto. Salen en ámbar, sin cono, porque una nota no
mira a ninguna parte.

## Corregir una marca

Con la herramienta **Mover**: arrástrala para reubicarla, o selecciónala y usa el **tirador
blanco** para girar el cono. En una nota, un toque abre su panel; en una fotografía, **Editar**
dentro del globo. **Supr** borra la marca seleccionada.

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
sola la primera vez que se guarda una marca, y si ya existía de una versión anterior se le
añaden las columnas que le falten, sin tocar lo que hubiera dentro.

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

## El candado

Arriba a la derecha hay un candado, y de salida está **cerrado**. Con el candado echado las
marcas de fotografía no se mueven: arrastrar una desplaza el plano, no la marca, y el tirador
de giro no aparece. Lo normal es consultar el plano, no reordenarlo, y una marca corrida de un
roce es una toma perdida sin que nadie se entere.

Para abrirlo, **mantén pulsado** el candado hasta que se llene; un toque suelto no hace nada,
solo recuerda cómo se abre. Abierto se pone en rojo, que es el aviso de que ahí ya se puede
mover algo. El estado se recuerda en el navegador.

## La vista del plano

El botón **Plano** (atajo **P**) reúne lo que afecta al dibujo de fondo: el **deslizador de
opacidad**, que lo atenúa sin tocar las marcas —lo que hace falta cuando se dibuja el montaje
encima—, y **Encuadrar el plano**.

## Las capas del plano

El botón **Capas** de la barra superior (atajo **C**) abre el despiece del dibujo. El plano no
es una imagen plana: se vectorizó clasificando cada píxel, así que cada clase de superficie es
una capa con nombre propio.

| Capa | Qué es |
|---|---|
| Áreas verdes | el césped, con su trama de grama |
| Arbolado | la masa de las copas |
| Explanada | la superficie del recinto |
| Pavimento | las aceras y calzadas |
| Mar Caribe | el agua |
| Otras superficies | los dos tonos intermedios que no entran en la leyenda |
| Trazado | todo el dibujo de línea blanca: contornos, edificación y rótulos |
| Leyenda · Rótulo | la muestra de colores y el título, por si estorban al montar encima |

Pulsar el nombre la apaga y la vuelve a encender. **Aislar** deja esa sola a plena vista y
atenúa el resto, para comprobar una superficie sin perder de vista dónde cae.

Lo que apagues y la opacidad se recuerdan en el navegador. El aislamiento no: al volver, un
plano casi entero atenuado se lee como una avería y no como un modo.

Una salvedad: separar las capas exige leer el archivo del dibujo, y el navegador no lo permite
si abres el `index.html` directamente desde el disco. Así el plano se sigue viendo entero y la
opacidad funciona, pero el panel de capas lo dice en vez de fingir que puede. Con servidor
detrás, o publicado, funciona todo.

## En el móvil

La barra de herramientas se ancla abajo, donde cae el pulgar, con cuatro destinos del tamaño
de un dedo: **Mover**, **Foto**, **Nota** y **Más**. Todo lo que no se usa sobre el terreno
—encuadrar, zoom, exportar, importar y dónde se están guardando las marcas— vive detrás de
**Más**, en una hoja que sube desde el borde inferior.

Las marcas del plano conservan su tamaño en pantalla pero admiten el toque en un radio mucho
mayor, así que no hace falta afinar con la yema. El panel de una marca deja **Ver foto** y
**Borrar** pegados al pie, siempre a la vista, y el resto se desplaza por debajo.

## Atajos

| Tecla | Acción |
|---|---|
| **V** | mover y seleccionar |
| **F** | insertar fotografía |
| **N** | dejar una nota |
| **G** | abrir y cerrar la galería |
| **P** | abrir y cerrar la vista del plano |
| **C** | abrir y cerrar las capas |
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
