/* ==================================================================
   Plano del Monumento a Fray Antón
   Marcas de fotografía con orientación, y notas de sitio.

   Las marcas se guardan en coordenadas del plano (el SVG mide
   1176 x 1338), no de pantalla, así que aguantan el zoom y el encuadre.
   ================================================================== */
(() => {
'use strict';

const ANCHO = 1176, ALTO = 1338;
const CLAVE = 'plano-fray-anton-marcas';

const $ = (s) => document.querySelector(s);
const lienzo  = $('#lienzo');
let   mapa    = $('#mapa');
const capa    = $('#marcas');

/* --- estado ------------------------------------------------------- */
const vista = { x: 0, y: 0, z: 1 };
let marcas = [];
let herramienta = 'mover';          // mover | foto | nota
let seleccion = null;               // id de la marca abierta en el panel
let borrador = null;                // marca a medio colocar

/* --- almacenamiento ------------------------------------------------
   Dos capas. El navegador guarda siempre una copia local, para que el
   plano funcione sin conexion y sin servidor detras. Si el proyecto
   tiene base de datos y Blob conectados, ademas se sincroniza con
   ellos y las marcas se ven desde cualquier dispositivo.
   ------------------------------------------------------------------ */
const nube = { base: false, blob: false, clave: false, autorizado: true };

/* --- clave de acceso -----------------------------------------------
   Si el despliegue define PLANO_CLAVE, el servidor la exige en cada
   peticion. Se entra una vez con ?clave=… en la direccion; queda
   guardada en este navegador y se borra de la barra de direcciones
   para que no acabe en el historial ni en un enlace compartido.
   ------------------------------------------------------------------ */
const CLAVE_ACCESO = 'plano-fray-anton-clave';
let claveAcceso = '';

try {
  const url = new URL(location.href);
  const dada = url.searchParams.get('clave');
  if (dada) {
    localStorage.setItem(CLAVE_ACCESO, dada);
    url.searchParams.delete('clave');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  claveAcceso = localStorage.getItem(CLAVE_ACCESO) || '';
} catch (e) {
  /* Almacenamiento bloqueado: se trabaja sin clave. */
}

const cabeceras = (extra) => Object.assign({},
  extra || {}, claveAcceso ? { 'x-plano-clave': claveAcceso } : {});

/* Una respuesta 401 significa credencial, no ausencia de servidor. */
function esClaveRechazada(r) {
  if (r.status !== 401) return false;
  nube.autorizado = false;
  avisar('La clave de acceso no es válida. Abre el plano con ?clave=… para entrar', 6000);
  return true;
}

async function detectarNube() {
  try {
    const r = await fetch('/api/estado', { cache: 'no-store', headers: cabeceras() });
    if (!r.ok) return;
    const d = await r.json();
    nube.clave = Boolean(d.clave);
    nube.autorizado = d.autorizado !== false;
    /* Sin autorización no se puede tocar ninguna de las dos rutas, así
       que el plano trabaja en local en vez de fallar petición a petición. */
    nube.base = Boolean(d.base) && nube.autorizado;
    nube.blob = Boolean(d.blob) && nube.autorizado;
    if (nube.clave && !nube.autorizado) {
      avisar('Este plano pide una clave de acceso. Ábrelo con ?clave=… para compartir marcas', 6000);
    }
  } catch (e) {
    /* Sin servidor: se trabaja solo en local. */
  }
}

function guardarLocal() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(marcas));
  } catch (e) {
    avisar('No se pudo guardar en este navegador');
  }
}

function cargarLocal() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) marcas = JSON.parse(crudo).map(normalizar);
  } catch (e) {
    marcas = [];
  }
}

/* Las marcas viajan por JSON y vuelven de Postgres: se normalizan para
   que los numeros sean numeros y los textos nunca sean nulos. */
function normalizar(m) {
  return {
    id: String(m.id),
    tipo: m.tipo === 'nota' ? 'nota' : 'foto',
    x: Number(m.x) || 0,
    y: Number(m.y) || 0,
    rumbo: Number(m.rumbo) || 0,
    titulo: String(m.titulo == null ? '' : m.titulo),
    nota: String(m.nota == null ? '' : m.nota),
    archivo: String(m.archivo == null ? '' : m.archivo),
    /* Una foto subida desde la galería todavía no sabe desde dónde se
       tomó. Lo que no lo diga se da por situado: es lo que eran todas
       las marcas antes de que existiera este campo. */
    situada: m.situada !== false,
  };
}

/* Guardar una marca: en local siempre, y en el servidor si lo hay. El
   envio se retrasa un poco para que escribir en el titulo no dispare
   una peticion por tecla. */
function guardar(m) {
  guardarLocal();
  refrescarInventario();
  if (m && nube.base) sincronizar(m);
}

const enCola = new Map();
function sincronizar(m, demora = 450) {
  clearTimeout(enCola.get(m.id));
  enCola.set(m.id, setTimeout(() => { enCola.delete(m.id); enviar(m); }, demora));
}

async function enviar(m) {
  try {
    const r = await fetch('/api/marcas', {
      method: 'PUT',
      headers: cabeceras({ 'content-type': 'application/json' }),
      body: JSON.stringify(normalizar(m)),
    });
    if (esClaveRechazada(r)) return;
    if (!r.ok) throw new Error('error ' + r.status);
  } catch (e) {
    avisar('No se pudo guardar en el servidor; la marca queda en este navegador', 4000);
  }
}

async function borrarEnNube(id) {
  if (!nube.base) return;
  try {
    await fetch('/api/marcas?id=' + encodeURIComponent(id),
                { method: 'DELETE', headers: cabeceras() });
  } catch (e) {
    /* Ya quedo borrada en local. */
  }
}

async function cargarDeNube() {
  try {
    const r = await fetch('/api/marcas', { cache: 'no-store', headers: cabeceras() });
    if (esClaveRechazada(r)) return;
    if (!r.ok) throw new Error('error ' + r.status);
    const d = await r.json();
    if (Array.isArray(d.marcas)) {
      marcas = d.marcas.map(normalizar);
      guardarLocal();
    }
  } catch (e) {
    avisar('No se pudieron leer las marcas del servidor; se usa la copia local', 4000);
  }
}

/* Envia todas las marcas una tras otra, sin rafaga. */
async function subirTodas() {
  if (!nube.base) return;
  for (const m of marcas) await enviar(m);
}

const nuevoId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* --- conversión de coordenadas ------------------------------------ */
const aPantalla = (x, y) => [x * vista.z + vista.x, y * vista.z + vista.y];
const aPlano    = (sx, sy) => [(sx - vista.x) / vista.z, (sy - vista.y) / vista.z];

/* --- pintado ------------------------------------------------------ */
function pintar() {
  mapa.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})`;
  $('#lectura').textContent = Math.round(vista.z * 100) + '%';
  pintarMarcas();
}

const ICONO_NOTA = '<svg viewBox="0 0 24 24"><path d="M4 3h16v13l-5 5H4V3Zm2 2v14h7v-4h4V5H6Z"/></svg>';

/* Las marcas se dibujan en píxeles de pantalla, no del plano: si no
   encogen al alejar, cuarenta marcas se juntan en una mancha. Se atan al
   zoom, con suelo para que no desaparezcan y techo para que no tapen el
   dibujo por más que se amplíe. */
const MARCA_MIN = 0.34, MARCA_MAX = 1.2;
const escalaMarca = () => Math.min(MARCA_MAX, Math.max(MARCA_MIN, vista.z));

/* Rumbo de la cámara. La aguja se ve siempre: es una línea y no estorba
   aunque haya cuarenta. El cono abierto solo sale en la marca que se
   señala o se abre, porque cuarenta cuñas superpuestas tapan el plano. */
const aguja = (rumbo) =>
  `<div class="aguja" style="transform:rotate(${rumbo}deg)"></div>`;

function cono(rumbo, e) {
  return `<div class="cono"><svg width="124" height="124"
       style="transform:rotate(${rumbo}deg) scale(${e})">
    <path d="M62 62 L34 8 A62 62 0 0 1 90 8 Z"
          fill="rgba(228,50,43,.16)" stroke="rgba(228,50,43,.55)" stroke-width="1.2"/>
    <line x1="62" y1="62" x2="62" y2="12" stroke="rgba(228,50,43,.8)"
          stroke-width="1.2" stroke-dasharray="3 3"/>
  </svg></div>`;
}

function pintarMarcas() {
  capa.textContent = '';
  const lista = borrador ? marcas.concat([borrador]) : marcas;
  const e = escalaMarca();

  lista.forEach(m => {
    if (capas.ocultas.includes(m.tipo === 'nota' ? 'notas' : 'fotos')) return;
    const [sx, sy] = aPantalla(m.x, m.y);
    if (sx < -120 || sx > innerWidth + 120 || sy < -120 || sy > innerHeight + 120) return;

    const d = document.createElement('div');
    /* Una foto sin situar no apunta a ninguna parte: se distingue y no
       se le dibuja el cono, que sería una dirección inventada. */
    const pendiente = m.tipo === 'foto' && !m.situada;
    d.className = 'marca' + (m.tipo === 'nota' ? ' es-nota' : '')
                + (pendiente ? ' pendiente' : '')
                + (seleccion === m.id ? ' activa' : '');
    d.style.left = sx + 'px';
    d.style.top  = sy + 'px';
    d.style.setProperty('--e', e);
    d.dataset.id = m.id;

    /* La marca de fotografía es un punto liso: a este tamaño un icono de
       cámara no se lee, solo ensucia. El tipo lo dicen el color y la
       forma, y el rótulo al señalarla. */
    const rumbo = m.rumbo || 0;
    d.innerHTML = (m.tipo === 'foto' && !pendiente ? aguja(rumbo) + cono(rumbo, e) : '')
      + '<div class="punto">' + (m.tipo === 'nota' ? ICONO_NOTA : '') + '</div>'
      + (m.titulo ? `<div class="rotulo">${escapar(m.titulo)}</div>` : '');
    capa.appendChild(d);

    // tirador para girar, solo en la marca seleccionada
    if (seleccion === m.id && m.tipo === 'foto' && !bloqueo) {
      const r = (m.rumbo || 0) * Math.PI / 180;
      const g = document.createElement('div');
      g.className = 'giro';
      g.dataset.giro = m.id;
      const radio = 58 * e;
      g.style.left = (sx + Math.sin(r) * radio) + 'px';
      g.style.top  = (sy - Math.cos(r) * radio) + 'px';
      capa.appendChild(g);
    }
  });
}

const escapar = (t) => String(t).replace(/[<>&"]/g,
  c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/* --- encuadre y zoom ----------------------------------------------
   Si la ventana todavía no tiene medidas —pestaña en segundo plano,
   panel oculto, arranque en móvil— la escala saldría 0 y el plano
   quedaría invisible para siempre, porque el `resize` solo repintaba.
   Cuando no se puede calcular, el encuadre queda pendiente y se
   reintenta en cuanto la ventana tiene tamaño. */
let encuadrePendiente = true;

const alturaMenu = () => $('#menu').getBoundingClientRect().height;

/* Lo que la barra de herramientas tapa por abajo: flotante con su margen
   en escritorio, anclada al borde en táctil. Sin descontarla, el plano se
   encuadraba en una caja que seguía por debajo de ella y quedaba empujado
   hacia abajo, con una banda negra arriba. */
const alturaBarra = () => {
  const b = $('.barra').getBoundingClientRect();
  return Math.max(0, innerHeight - b.top);
};

/* Centro del hueco que queda entre el menú y la barra. */
function centroLibre() {
  const sup = alturaMenu();
  return [innerWidth / 2, sup + (innerHeight - sup - alturaBarra()) / 2];
}

function encuadrar() {
  const m = 0.05;
  const ancho = innerWidth;
  const sup = alturaMenu();
  const libre = innerHeight - sup - alturaBarra();
  if (ancho < 1 || libre < 1) { encuadrePendiente = true; return; }
  vista.z = Math.min(ancho / (ANCHO * (1 + m)), libre / (ALTO * (1 + m)));
  vista.x = (ancho - ANCHO * vista.z) / 2;
  vista.y = sup + (libre - ALTO * vista.z) / 2;
  encuadrePendiente = false;
  pintar();
}

function zoom(factor, cx, cy) {
  const z = Math.min(20, Math.max(.06, vista.z * factor));
  const k = z / vista.z;
  vista.x = cx - (cx - vista.x) * k;
  vista.y = cy - (cy - vista.y) * k;
  vista.z = z;
  pintar();
}

/* --- herramientas -------------------------------------------------- */
function elegirHerramienta(cual) {
  herramienta = cual;
  ['mover', 'foto', 'nota'].forEach(h =>
    $('#h-' + h).classList.toggle('activo', h === cual));
  lienzo.classList.toggle('colocando', cual !== 'mover');
  if (cual === 'foto') avisar('Pulsa en el punto de toma y arrastra hacia donde apunta la cámara');
  else if (cual === 'nota') avisar('Pulsa donde quieras dejar la nota');
  else ocultarAviso();
}

let tempAviso;
function avisar(texto, ms) {
  clearTimeout(tempAviso);
  $('#aviso').textContent = texto;
  $('#aviso').classList.remove('oculto');
  if (ms) tempAviso = setTimeout(ocultarAviso, ms);
}
const ocultarAviso = () => $('#aviso').classList.add('oculto');

/* --- interacción con el lienzo ------------------------------------ */
const punteros = new Map();
let arrastre = null, pinza = null, orientando = null, moviendo = null, girando = null;

lienzo.addEventListener('pointerdown', e => {
  cerrarGlobo();
  const marca = e.target.closest('.marca');
  const tirador = e.target.closest('.giro');
  try { lienzo.setPointerCapture(e.pointerId); } catch (err) { /* puntero sintético */ }
  punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (punteros.size === 2) {
    const [a, b] = [...punteros.values()];
    pinza = { d: Math.hypot(b.x - a.x, b.y - a.y), z: vista.z };
    arrastre = orientando = moviendo = null;
    /* Si la pinza empieza con una marca a medio colocar, se descarta:
       de lo contrario quedaba suelta y se creaba al levantar los dedos. */
    if (borrador) { borrador = null; pintarMarcas(); }
    return;
  }

  if (tirador) { girando = tirador.dataset.giro; return; }

  // colocar una marca nueva
  if (herramienta !== 'mover' && !marca) {
    const [px, py] = aPlano(e.clientX, e.clientY);
    borrador = {
      id: nuevoId(), tipo: herramienta, x: px, y: py, rumbo: 0,
      titulo: '', nota: '', archivo: '', situada: true
    };
    if (herramienta === 'foto') orientando = borrador;
    pintarMarcas();
    return;
  }

  if (marca) {
    const m = marcas.find(x => x.id === marca.dataset.id);
    if (m) {
      /* Con el candado echado la marca no se mueve, pero el toque sigue
         abriéndola; el arrastre se lo queda el plano. */
      const fijo = bloqueo && m.tipo === 'foto';
      moviendo = { m, sx: e.clientX, sy: e.clientY, ox: m.x, oy: m.y,
                   movido: false, fijo };
      if (!fijo) return;
      arrastre = { sx: e.clientX, sy: e.clientY, x: vista.x, y: vista.y };
      lienzo.classList.add('arrastrando');
      return;
    }
  }

  arrastre = { sx: e.clientX, sy: e.clientY, x: vista.x, y: vista.y };
  lienzo.classList.add('arrastrando');
});

lienzo.addEventListener('pointermove', e => {
  if (punteros.has(e.pointerId)) punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (punteros.size === 2 && pinza) {
    const [a, b] = [...punteros.values()];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    zoom((pinza.z * (d / pinza.d)) / vista.z, (a.x + b.x) / 2, (a.y + b.y) / 2);
    return;
  }

  if (orientando) {
    const [sx, sy] = aPantalla(orientando.x, orientando.y);
    orientando.rumbo = angulo(sx, sy, e.clientX, e.clientY);
    pintarMarcas();
    return;
  }

  if (girando) {
    const m = marcas.find(x => x.id === girando);
    if (m) {
      const [sx, sy] = aPantalla(m.x, m.y);
      m.rumbo = angulo(sx, sy, e.clientX, e.clientY);
      pintarMarcas();
    }
    return;
  }

  if (moviendo) {
    const dx = (e.clientX - moviendo.sx) / vista.z;
    const dy = (e.clientY - moviendo.sy) / vista.z;
    if (Math.abs(dx) + Math.abs(dy) > 1.5) moviendo.movido = true;
    /* Bloqueada: no se toca su posición y el gesto sigue hasta el plano. */
    if (!moviendo.fijo) {
      moviendo.m.x = moviendo.ox + dx;
      moviendo.m.y = moviendo.oy + dy;
      pintarMarcas();
      return;
    }
  }

  if (arrastre) {
    vista.x = arrastre.x + (e.clientX - arrastre.sx);
    vista.y = arrastre.y + (e.clientY - arrastre.sy);
    pintar();
  }
});

/* Ángulo de brújula entre dos puntos de pantalla: 0 arriba, 90 derecha. */
function angulo(x1, y1, x2, y2) {
  return (Math.atan2(x2 - x1, y1 - y2) * 180 / Math.PI + 360) % 360;
}

function soltar(e) {
  punteros.delete(e.pointerId);
  if (punteros.size < 2) pinza = null;

  if (orientando || borrador) {
    // Al colocar una foto, orientando y borrador son la misma marca.
    const nueva = orientando || borrador;
    marcas.push(nueva);
    seleccion = nueva.id;
    borrador = null; orientando = null;
    guardar(nueva); abrirPanel(); elegirHerramienta('mover');
  } else if (girando) {
    const m = marcas.find(x => x.id === girando);
    girando = null;
    if (m) guardar(m);
  } else if (moviendo) {
    const m = moviendo.m;
    if (moviendo.movido) { if (!moviendo.fijo) { m.situada = true; guardar(m); } }
    else if (esSegundoClic(m.id)) {
      seleccion = m.id;
      if (m.tipo === 'foto') abrirVisor(m); else abrirPanel();
    } else {
      seleccion = m.id;
      if (m.tipo === 'foto') abrirGlobo(m); else abrirPanel();
    }
    moviendo = null;
  }

  arrastre = null;
  lienzo.classList.remove('arrastrando');
  pintarMarcas();
}
lienzo.addEventListener('pointerup', soltar);
lienzo.addEventListener('pointercancel', soltar);

lienzo.addEventListener('wheel', e => {
  e.preventDefault();
  cerrarGlobo();
  zoom(Math.exp(-e.deltaY * (e.ctrlKey ? .012 : .0022)), e.clientX, e.clientY);
}, { passive: false });

/* El doble clic sobre una marca no llega por el evento `dblclick`: cada
   clic repinta la capa y sustituye el nodo, así que el navegador nunca
   ve dos clics sobre el mismo elemento y no lo emite. Se cuenta a mano
   al soltar. El listener nativo se mantiene para el resto del lienzo. */
const MS_DOBLE = 400;
let ultimoClic = { id: null, t: 0 };

function esSegundoClic(id) {
  const ahora = Date.now();
  const doble = ultimoClic.id === id && (ahora - ultimoClic.t) < MS_DOBLE;
  ultimoClic = doble ? { id: null, t: 0 } : { id, t: ahora };
  return doble;
}

lienzo.addEventListener('dblclick', e => {
  const marca = e.target.closest('.marca');
  if (!marca) return;
  const m = marcas.find(x => x.id === marca.dataset.id);
  if (m && m.tipo === 'foto') abrirVisor(m);
});

/* --- arrastrar una imagen al plano -------------------------------- */
['dragenter', 'dragover'].forEach(ev =>
  lienzo.addEventListener(ev, e => {
    e.preventDefault(); lienzo.classList.add('soltando');
  }));
['dragleave', 'drop'].forEach(ev =>
  lienzo.addEventListener(ev, () => lienzo.classList.remove('soltando')));

lienzo.addEventListener('drop', e => {
  e.preventDefault();
  const f = [...(e.dataTransfer.files || [])].find(x => x.type.startsWith('image/'));
  if (!f) return;
  const [px, py] = aPlano(e.clientX, e.clientY);
  const m = { id: nuevoId(), tipo: 'foto', x: px, y: py, rumbo: 0,
              titulo: '', nota: '', archivo: '', situada: true };
  marcas.push(m); seleccion = m.id;
  pintarMarcas();
  adjuntar(m, f);
});

/* Las imágenes elegidas en esta sesión se muestran al momento. Una vez
   subidas, `archivo` guarda la URL del Blob; sin servidor guarda el
   nombre, y la foto se busca en la carpeta fotos/.

   La vista previa se guarda por marca y no por nombre de archivo: dos
   fotografías distintas que se llamaran igual se pisaban entre sí. El
   objeto URL se libera al sustituirlo y al borrar la marca, para que
   una sesión larga no acumule memoria. */
const previews = new Map();          // id de marca -> objeto URL

function recordarPreview(id, archivo) {
  olvidarPreview(id);
  previews.set(id, URL.createObjectURL(archivo));
}

function olvidarPreview(id) {
  const url = previews.get(id);
  if (url) { URL.revokeObjectURL(url); previews.delete(id); }
}

function olvidarTodasLasPreviews() {
  previews.forEach(url => URL.revokeObjectURL(url));
  previews.clear();
}

function rutaFoto(m) {
  if (!m) return '';
  const previa = previews.get(m.id);
  if (previa) return previa;
  if (!m.archivo) return '';
  return /^https?:\/\//i.test(m.archivo) ? m.archivo : 'fotos/' + m.archivo;
}

/* --- subida de fotografías -----------------------------------------
   La imagen se reduce en el navegador antes de enviarla: una foto de
   teléfono pasa de varios megabytes a unos cientos de kilobytes, entra
   de sobra en el límite de cuerpo de la función, y carga mucho más
   rápido al abrirla sobre el plano.
   ------------------------------------------------------------------ */
const LADO_MAX = 2200;
const CALIDAD = 0.85;

function reducir(archivo) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    const fuente = URL.createObjectURL(archivo);
    img.onload = () => {
      const k = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
      const ancho = Math.max(1, Math.round(img.width * k));
      const alto  = Math.max(1, Math.round(img.height * k));
      const tela = document.createElement('canvas');
      tela.width = ancho; tela.height = alto;
      tela.getContext('2d').drawImage(img, 0, 0, ancho, alto);
      URL.revokeObjectURL(fuente);
      tela.toBlob(b => b ? resolver(b) : rechazar(new Error('no se pudo convertir')),
                  'image/jpeg', CALIDAD);
    };
    img.onerror = () => { URL.revokeObjectURL(fuente); rechazar(new Error('imagen ilegible')); };
    img.src = fuente;
  });
}

const aBase64 = (blob) => new Promise((resolver, rechazar) => {
  const lector = new FileReader();
  lector.onload = () => resolver(String(lector.result).split(',')[1]);
  lector.onerror = () => rechazar(new Error('no se pudo leer'));
  lector.readAsDataURL(blob);
});

async function subir(archivo) {
  const reducida = await reducir(archivo);
  const datos = await aBase64(reducida);
  const r = await fetch('/api/subir', {
    method: 'POST',
    headers: cabeceras({ 'content-type': 'application/json' }),
    body: JSON.stringify({
      nombre: archivo.name.replace(/\.[^.]+$/, '') + '.jpg',
      tipo: 'image/jpeg',
      datos,
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || d.razon || 'error ' + r.status);
  return d.url;
}

/* Asocia una imagen a una marca: se ve al instante, y si hay Blob
   conectado se sube y la marca pasa a apuntar a la URL definitiva. */
async function adjuntar(m, f, opciones) {
  /* Modo callado: sin abrir el panel ni avisar por cada foto. */
  const callado = Boolean(opciones && opciones.callado);

  recordarPreview(m.id, f);
  m.archivo = f.name;
  if (!m.titulo) m.titulo = f.name.replace(/\.[^.]+$/, '');
  guardar(m);
  if (!callado) abrirPanel();

  if (callado && nube.blob) {
    try {
      m.archivo = await subir(f);
      guardar(m);
    } catch (e) {
      avisar('No se pudo subir «' + f.name + '» (' + e.message + ')', 5400);
    }
    return;
  }
  if (callado) return;

  if (!nube.blob) {
    /* Sin Blob la marca solo guarda el nombre y la foto se busca en
       fotos/, así que dos archivos homónimos no pueden convivir ahí. */
    const choque = marcas.some(o => o.id !== m.id && o.archivo === f.name);
    avisar(choque
      ? `Otra marca ya usa «${f.name}». Renombra una de las dos antes de copiarlas a fotos/`
      : 'Foto añadida. Arrastra el tirador para orientarla', 5400);
    return;
  }

  avisar('Subiendo la fotografía…');
  try {
    const url = await subir(f);
    m.archivo = url;
    guardar(m);
    abrirPanel();
    avisar('Foto guardada en el servidor. Arrastra el tirador para orientarla', 4200);
  } catch (e) {
    avisar('No se pudo subir (' + e.message + '). La foto queda solo en este navegador', 5400);
  }
}

/* --- panel de la marca -------------------------------------------- */
function abrirPanel() {
  const m = marcas.find(x => x.id === seleccion);
  if (!m) return cerrarPanel();

  /* Los dos ocupan la misma esquina: quien abre el panel deja de mirar
     la galería. Es la simétrica de abrir la galería, que cierra el panel. */
    alternarHoja(false);
  alternarCapas(false);
  alternarPlano(false);
  cerrarGlobo();
  $('#panel').classList.remove('oculto');
  $('#panel-titulo').textContent = m.tipo === 'foto' ? 'Fotografía' : 'Nota';
  $('#f-titulo').value = m.titulo || '';
  $('#f-nota').value = m.nota || '';
  $('#bloque-foto').style.display = m.tipo === 'foto' ? '' : 'none';
  /* Una nota no tiene imagen: ofrecer «Ver foto» solo abría el visor vacío. */
  $('#ver-foto').style.display = m.tipo === 'foto' ? '' : 'none';

  const zona = $('#zona-archivo');
  if (m.tipo === 'foto') {
    const ruta = rutaFoto(m);
    zona.innerHTML = ruta
      ? `<img src="${escapar(ruta)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('p'),{innerHTML:'<b>Imagen no disponible</b>La marca apunta a un archivo que no se encuentra'}))">`
      : '<p><b>Elegir fotografía</b>o arrastra la imagen sobre el plano</p>';
  }
  pintarMarcas();
}

function cerrarPanel() {
  $('#panel').classList.add('oculto');
  seleccion = null;
  pintarMarcas();
}

$('#cerrar-panel').addEventListener('click', cerrarPanel);

$('#f-titulo').addEventListener('input', e => {
  const m = marcas.find(x => x.id === seleccion);
  if (m) { m.titulo = e.target.value; guardar(m); pintarMarcas(); }
});
$('#f-nota').addEventListener('input', e => {
  const m = marcas.find(x => x.id === seleccion);
  if (m) { m.nota = e.target.value; guardar(m); }
});

$('#zona-archivo').addEventListener('click', () => $('#entrada-archivo').click());
$('#entrada-archivo').addEventListener('change', e => {
  const f = e.target.files[0];
  const m = marcas.find(x => x.id === seleccion);
  e.target.value = '';                 // permite reelegir el mismo archivo
  if (!f || !m) return;
  adjuntar(m, f);
});

$('#ver-foto').addEventListener('click', () => {
  const m = marcas.find(x => x.id === seleccion);
  if (m) abrirVisor(m);
});

$('#borrar-marca').addEventListener('click', () => {
  const m = marcas.find(x => x.id === seleccion);
  if (!m) return;
  marcas = marcas.filter(x => x.id !== m.id);
  olvidarPreview(m.id);
  cerrarGlobo();
  guardarLocal(); borrarEnNube(m.id); cerrarPanel(); refrescarInventario();
});

/* --- globo de la marca ---------------------------------------------
   Tocar una fotografía la muestra junto a su punto, y nada más: sin
   título, sin rumbo y sin botones. Es una ojeada, no una ficha; el dato
   ya está en el plano y en la galería. Al pulsarla se abre a pantalla
   completa; para editarla, la galería lleva a su panel.
   ------------------------------------------------------------------ */
const MARGEN_GLOBO = 12;

function abrirGlobo(m) {
  const globo = $('#globo');
  const [sx, sy] = aPantalla(m.x, m.y);

  const imagen = $('#globo-imagen');
  const ruta = rutaFoto(m);
  imagen.textContent = '';
  if (ruta) {
    const img = document.createElement('img');
    img.src = ruta;
    img.alt = m.titulo || '';
    img.addEventListener('error',
      () => imagen.replaceChildren(sinImagen('No se encuentra el archivo')));
    imagen.appendChild(img);
  } else {
    imagen.appendChild(sinImagen('Todavía sin fotografía'));
  }

  /* Se mide con el globo ya visible: antes no tiene alto. */
  globo.classList.remove('oculto');
  globo.style.visibility = 'hidden';
  const { width: an, height: al } = globo.getBoundingClientRect();

  const izq = Math.min(innerWidth - an - MARGEN_GLOBO,
                       Math.max(MARGEN_GLOBO, sx - an / 2));
  /* Encima del punto si cabe; si no, debajo. */
  const arribaLibre = sy - alturaMenu() - MARGEN_GLOBO;
  const encima = arribaLibre >= al + 14;
  const sup = encima ? sy - al - 14 : Math.min(innerHeight - al - MARGEN_GLOBO, sy + 18);

  globo.style.left = izq + 'px';
  globo.style.top = sup + 'px';
  /* El origen de la escala apunta al punto tocado: el globo crece
     desde la marca y no desde su propio centro. */
  globo.style.setProperty('--ox', (sx - izq) + 'px');
  globo.style.setProperty('--oy', (encima ? al : 0) + 'px');
  globo.style.visibility = '';

  /* Reiniciar la animación aunque ya estuviera abierto en otra marca. */
  globo.style.animation = 'none';
  void globo.offsetWidth;
  globo.style.animation = '';
}

function cerrarGlobo() {
  $('#globo').classList.add('oculto');
}

const globoAbierto = () => !$('#globo').classList.contains('oculto');

$('#globo-imagen').addEventListener('click', () => {
  const m = marcas.find(x => x.id === seleccion);
  if (m) abrirVisor(m);
});
/* --- visor -------------------------------------------------------- */
let visorActual = null;

function abrirVisor(m, paso) {
  visorActual = m.id;
  const cuerpo = $('#visor-cuerpo');
  /* La siguiente entra desde el lado hacia el que se ha deslizado. */
  cuerpo.style.setProperty('--dx', paso ? (paso > 0 ? '26px' : '-26px') : '0px');
  const ruta = rutaFoto(m);
  cuerpo.innerHTML = ruta
    ? `<img src="${escapar(ruta)}" alt="${escapar(m.titulo)}"
         onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'vacio',textContent:'No se encuentra la imagen de esta marca'}))">`
    : '<div class="vacio">Esta marca todavía no tiene fotografía</div>';
  $('#visor-titulo').textContent = m.titulo || 'Sin título';
  $('#visor-nota').textContent = m.nota || '';
  $('#visor-rumbo').textContent = m.tipo === 'foto'
    ? 'Cámara hacia ' + Math.round(m.rumbo || 0) + '° ' + cardinal(m.rumbo || 0) : '';

  /* Cuántas hay y en cuál se está: sin eso, deslizar es a ciegas. */
  const lista = fotosEnOrden();
  const i = lista.findIndex(x => x.id === m.id);
  $('#visor-cuenta').textContent = (m.tipo === 'foto' && lista.length > 1)
    ? (i + 1) + ' / ' + lista.length : '';

  $('#visor-bajar').disabled = !rutaFoto(m);
  $('#visor').classList.remove('oculto');
}
const cerrarVisor = () => $('#visor').classList.add('oculto');
$('#visor-cerrar').addEventListener('click', cerrarVisor);

$('#visor-bajar').addEventListener('click', async () => {
  const m = marcas.find(x => x.id === visorActual);
  if (!m) return;
  const ruta = rutaFoto(m);
  if (!ruta) return avisar('Esta marca todavía no tiene fotografía', 3000);
  avisar('Descargando…');
  const limpia = await PL.descargar(m, ruta);
  avisar(limpia
    ? 'Descargada como ' + PL.nombreDeDescarga(m)
    : 'Se abrió en otra pestaña: guárdala desde ahí', 3600);
});

/* --- recorrer las fotografías desde el visor ------------------------
   Con una foto abierta a pantalla completa, lo natural es pasar a la
   siguiente sin volver al plano y buscar la marca de al lado.
   ------------------------------------------------------------------ */
const fotosEnOrden = () => marcas.filter(m => m.tipo === 'foto');

function visorPasar(paso) {
  const lista = fotosEnOrden();
  if (lista.length < 2) return;
  const i = lista.findIndex(m => m.id === visorActual);
  const siguiente = lista[(((i < 0 ? 0 : i) + paso) % lista.length + lista.length) % lista.length];
  seleccion = siguiente.id;
  abrirVisor(siguiente, paso);
  pintarMarcas();
}

/* Un desplazamiento lateral pasa de foto; uno corto o vertical, no. El
   toque suelto sobre el fondo sigue cerrando, pero un gesto no. */
const DESLIZ_MINIMO = 55;
let tocandoVisor = null, huboDesliz = false;

$('#visor').addEventListener('pointerdown', e => {
  tocandoVisor = { x: e.clientX, y: e.clientY };
  huboDesliz = false;
});

$('#visor').addEventListener('pointerup', e => {
  if (!tocandoVisor) return;
  const dx = e.clientX - tocandoVisor.x;
  const dy = e.clientY - tocandoVisor.y;
  tocandoVisor = null;
  if (Math.abs(dx) > DESLIZ_MINIMO && Math.abs(dx) > Math.abs(dy) * 1.6) {
    huboDesliz = true;
    visorPasar(dx < 0 ? 1 : -1);
  }
});

$('#visor').addEventListener('click', e => {
  if (huboDesliz) { huboDesliz = false; return; }
  if (e.target.id === 'visor') cerrarVisor();
});

function cardinal(g) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(g / 45) % 8];
}

/* --- lo que va a la galería -----------------------------------------
   La galería vive en su propia página (galeria.html). Aquí solo queda
   llevar el plano hasta una marca y mantener la cuenta del menú.
   ------------------------------------------------------------------ */
const sinImagen = (texto) => Object.assign(document.createElement('span'),
  { className: 'sin', textContent: texto });

/* Centra el plano en una marca y la deja abierta en el panel. */
function situar(m) {
  const [cx, cy] = centroLibre();
  const z = Math.max(vista.z, 1);
  vista.x = cx - m.x * z;
  vista.y = cy - m.y * z;
  vista.z = z;
  seleccion = m.id;
  pintar();
  abrirPanel();
}

/* Cuántas marcas hay, para el menú. */
function indicarCuenta() {
  const fotos = marcas.filter(m => m.tipo === 'foto').length;
  const notas = marcas.length - fotos;
  const pendientes = marcas.filter(m => m.tipo === 'foto' && !m.situada).length;
  const partes = [fotos === 1 ? '1 fotografía' : fotos + ' fotografías'];
  if (notas) partes.push(notas === 1 ? '1 nota' : notas + ' notas');
  if (pendientes) partes.push(pendientes + ' sin situar');
  const etiqueta = $('#cuenta');
  etiqueta.textContent = partes.join(' · ');
  etiqueta.classList.toggle('pendiente', pendientes > 0);
}

function refrescarInventario() {
  indicarCuenta();
  if (capasAbiertas()) pintarCapas();
}

/* La galería enlaza aquí con #situar=<id> cuando pide ver una marca en
   el plano. Se consume el fragmento para que recargar no vuelva a
   saltar al mismo sitio. */
function atenderEnlace() {
  const m = /^#situar=(.+)$/.exec(location.hash);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const marca = marcas.find(x => x.id === decodeURIComponent(m[1]));
  if (marca) situar(marca);
}

/* --- exportar e importar ------------------------------------------ */
$('#exportar').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(marcas, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'marcas-plano.json';
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#importar').addEventListener('click', () => $('#entrada-json').click());
$('#entrada-json').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const datos = JSON.parse(lector.result);
      if (!Array.isArray(datos)) throw new Error();
      /* Las marcas anteriores desaparecen: sus vistas previas ya no
         apuntan a nada y hay que liberarlas. */
      olvidarTodasLasPreviews();
      marcas = datos.map(normalizar);
      guardarLocal(); cerrarPanel(); pintarMarcas(); refrescarInventario();
      avisar(marcas.length + ' marcas importadas', 2600);
      subirTodas();
    } catch (err) {
      avisar('Ese archivo no tiene marcas válidas', 3000);
    }
  };
  lector.readAsText(f);
});

/* --- capas del plano ------------------------------------------------
   El plano base es un SVG con una ruta por clase de superficie, así que
   las capas ya existen dentro del dibujo: aquí solo se encienden, se
   apagan y se atenúan. También se le baja la opacidad al conjunto, para
   que las marcas destaquen sobre el fondo.
   ------------------------------------------------------------------ */
const CLAVE_CAPAS = 'plano-fray-anton-capas';

/* Lo que va encima del dibujo. No son rutas del SVG sino marcas, así
   que se apagan al pintarlas; van primero porque están arriba. */
const CAPAS_MARCAS = [
  { clave: 'fotos', nombre: 'Fotografías', muestra: '#e4322b', tipo: 'foto' },
  { clave: 'notas', nombre: 'Notas',       muestra: '#d9b85c', tipo: 'nota' },
];

/* Los identificadores son los que escribe el vectorizador; los nombres,
   los de la leyenda del propio plano. */
const CAPAS = [
  { clave: 'verde',     nombre: 'Áreas verdes',      muestra: '#12251a', ids: ['verde'] },
  { clave: 'arbolado',  nombre: 'Arbolado',          muestra: '#0c0c0d', ids: ['oscuro'] },
  { clave: 'explanada', nombre: 'Explanada',         muestra: '#16161a', ids: ['medio'] },
  { clave: 'pavimento', nombre: 'Pavimento',         muestra: '#24252a', ids: ['claro2'] },
  { clave: 'mar',       nombre: 'Mar Caribe',        muestra: '#0a1622', ids: ['mar'] },
  { clave: 'otras',     nombre: 'Otras superficies', muestra: '#1c1d21', ids: ['oscuro2', 'claro1'] },
  { clave: 'trazado',   nombre: 'Trazado',           muestra: '#ffffff', ids: ['blanco'] },
  { clave: 'leyenda',   nombre: 'Leyenda',           muestra: '#8d8d90', ids: ['leyenda'] },
  { clave: 'rotulo',    nombre: 'Rótulo',            muestra: '#8d8d90', ids: ['rotulo'] },
];

let svgPlano = null;                 // el plano en línea, si se consigue
const capas = { ocultas: [], aislada: null, opacidad: 100 };

function cargarCapas() {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE_CAPAS) || '{}');
    if (Array.isArray(d.ocultas)) capas.ocultas = d.ocultas.filter(
      c => CAPAS.concat(CAPAS_MARCAS).some(x => x.clave === c));
    if (Number.isFinite(d.opacidad)) capas.opacidad = Math.min(100, Math.max(10, d.opacidad));
  } catch (e) {
    /* Sin preferencias guardadas: todo visible al 100 %. */
  }
  /* El aislamiento no se guarda: al volver, un plano casi entero
     atenuado se lee como una avería, no como un modo. */
}

function guardarCapas() {
  try {
    localStorage.setItem(CLAVE_CAPAS, JSON.stringify(
      { ocultas: capas.ocultas, opacidad: capas.opacidad }));
  } catch (e) { /* almacenamiento bloqueado */ }
}

/* El plano se sirve en un <img>, que no deja tocar su interior. Se
   intenta traer el mismo archivo en línea para poder separar las capas.
   Abierto desde el disco sin servidor, el navegador no deja leerlo: en
   ese caso se queda la imagen, el plano se ve igual y el panel lo dice. */
async function ponerPlanoEnLinea() {
  const img = $('#mapa');
  if (!img || img.tagName !== 'IMG') return;
  try {
    const r = await fetch(img.getAttribute('src'), { cache: 'force-cache' });
    if (!r.ok) throw new Error('error ' + r.status);
    const doc = new DOMParser().parseFromString(await r.text(), 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName !== 'svg' || doc.querySelector('parsererror')) {
      throw new Error('el archivo no es un SVG legible');
    }
    svg.id = 'mapa';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', img.alt || 'Plano');
    img.replaceWith(svg);
    mapa = svg;
    svgPlano = svg;
    pintar();                        // el nodo es otro: hay que repintar
  } catch (e) {
    /* Se queda el <img>. */
  }
}

function aplicarCapas() {
  if (!svgPlano) return;
  CAPAS.forEach(capa => {
    const oculta = capas.ocultas.includes(capa.clave);
    const atenuada = capas.aislada && capas.aislada !== capa.clave;
    capa.ids.forEach(id => {
      const nodo = svgPlano.querySelector('#' + id);
      if (!nodo) return;
      nodo.style.display = oculta ? 'none' : '';
      nodo.style.opacity = atenuada ? '.1' : '';
    });
  });
}

function aplicarOpacidad() {
  if (mapa) mapa.style.opacity = capas.opacidad / 100;
  $('#opacidad').value = capas.opacidad;
  $('#opacidad-valor').textContent = capas.opacidad + '%';
}

function filaCapa(capa, sinAislar) {
  const oculta = capas.ocultas.includes(capa.clave);
  const aislada = capas.aislada === capa.clave;

  const fila = document.createElement('div');
  fila.className = 'capa' + (oculta ? ' apagada' : '') + (aislada ? ' aislada' : '');

  const muestra = document.createElement('span');
  muestra.className = 'capa-muestra';
  muestra.style.background = capa.muestra;

  const nombre = document.createElement('span');
  nombre.className = 'capa-nombre';
  nombre.textContent = capa.nombre;

  const ver = document.createElement('button');
  ver.className = 'capa-ver';
  ver.setAttribute('aria-pressed', String(!oculta));
  ver.title = oculta ? 'Mostrar esta capa' : 'Ocultar esta capa';
  ver.append(muestra, nombre);
  ver.addEventListener('click', () => alternarCapa(capa.clave));

  const solo = document.createElement('button');
  solo.className = 'capa-solo';
  solo.textContent = aislada ? 'Ver todo' : 'Aislar';
  solo.title = aislada ? 'Volver a mostrar el resto' : 'Ver solo esta capa';
  solo.addEventListener('click', () => aislarCapa(capa.clave));

  fila.append(ver);
  if (!sinAislar) fila.append(solo);
  return fila;
}

function pintarCapas() {
  const lista = $('#capas-lista');
  lista.textContent = '';

  /* Estas funcionan aunque el dibujo no se haya podido traer en línea. */
  CAPAS_MARCAS.forEach(capa => lista.appendChild(filaCapa(capa, true)));

  const franja = document.createElement('span');
  franja.className = 'capas-sep';
  lista.appendChild(franja);

  if (!svgPlano) {
    const aviso = document.createElement('p');
    aviso.className = 'capas-aviso';
    aviso.textContent = 'Las capas necesitan que el plano se abra desde un servidor. '
      + 'Abierto directamente desde el disco, el navegador no deja leer el archivo del '
      + 'dibujo y solo puede mostrarlo entero. La opacidad sí funciona.';
    lista.appendChild(aviso);
    return;
  }
  CAPAS.forEach(capa => lista.appendChild(filaCapa(capa)));
}

function alternarCapa(clave) {
  const i = capas.ocultas.indexOf(clave);
  if (i === -1) capas.ocultas.push(clave); else capas.ocultas.splice(i, 1);
  capas.aislada = null;              // encender algo sale del aislamiento
  guardarCapas(); aplicarCapas(); pintarMarcas(); pintarCapas();
}

function aislarCapa(clave) {
  capas.aislada = capas.aislada === clave ? null : clave;
  aplicarCapas(); pintarCapas();
}

/* --- candado --------------------------------------------------------
   Cerrado de salida y para siempre: lo normal es consultar el plano, no
   reordenarlo, y una marca desplazada de un roce es una toma perdida sin
   que nadie se entere. Se abre con pulsación sostenida, no con un toque,
   para que no ocurra por accidente al manejarlo con una mano.
   ------------------------------------------------------------------ */
const CLAVE_BLOQUEO = 'plano-fray-anton-bloqueo';
const ESPERA_CANDADO = 600;

let bloqueo = true;
try { bloqueo = localStorage.getItem(CLAVE_BLOQUEO) !== 'abierto'; } catch (e) { /* sin memoria */ }

function pintarCandado() {
  const b = $('#candado');
  b.classList.toggle('bloqueado', bloqueo);
  b.setAttribute('aria-pressed', String(bloqueo));
  b.title = bloqueo
    ? 'Posición de las fotografías bloqueada. Mantén pulsado para desbloquear'
    : 'Posición desbloqueada. Mantén pulsado para bloquear';
}

function alternarBloqueo() {
  bloqueo = !bloqueo;
  try {
    localStorage.setItem(CLAVE_BLOQUEO, bloqueo ? 'cerrado' : 'abierto');
  } catch (e) { /* sin memoria */ }
  pintarCandado();
  avisar(bloqueo
    ? 'Posición bloqueada: las marcas ya no se mueven al arrastrarlas'
    : 'Posición desbloqueada: ya puedes arrastrar las marcas', 3400);
}

let tempCandado = null;

$('#candado').addEventListener('pointerdown', e => {
  e.preventDefault();
  $('#candado').classList.add('presionando');
  tempCandado = setTimeout(() => {
    tempCandado = null;
    $('#candado').classList.remove('presionando');
    alternarBloqueo();
  }, ESPERA_CANDADO);
});

/* Soltar antes de tiempo no cambia nada: solo recuerda cómo se abre. */
function soltarCandado() {
  $('#candado').classList.remove('presionando');
  if (!tempCandado) return;
  clearTimeout(tempCandado);
  tempCandado = null;
  avisar('Mantén pulsado el candado para '
    + (bloqueo ? 'desbloquear' : 'bloquear') + ' la posición', 3000);
}
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
  $('#candado').addEventListener(ev, soltarCandado));

pintarCandado();

/* --- vista del plano ----------------------------------------------- */
const planoAbierto = () => !$('#panel-plano').classList.contains('oculta');

function alternarPlano(abrir) {
  const mostrar = abrir === undefined ? !planoAbierto() : abrir;
  $('#panel-plano').classList.toggle('oculta', !mostrar);
  $('#abrir-plano').classList.toggle('activo', mostrar);
  if (mostrar) {
    cerrarPanel(); cerrarGlobo(); alternarCapas(false);
    alternarHoja(false);
  }
}

$('#abrir-plano').addEventListener('click', () => alternarPlano());
$('#cerrar-plano').addEventListener('click', () => alternarPlano(false));
$('#plano-encuadrar').addEventListener('click', () => { alternarPlano(false); encuadrar(); });

const capasAbiertas = () => !$('#capas').classList.contains('oculta');

function alternarCapas(abrir) {
  const mostrar = abrir === undefined ? !capasAbiertas() : abrir;
  $('#capas').classList.toggle('oculta', !mostrar);
  $('#abrir-capas').classList.toggle('activo', mostrar);
  if (mostrar) {
    cerrarPanel(); cerrarGlobo(); alternarHoja(false);
    alternarPlano(false); pintarCapas();
  }
}

$('#abrir-capas').addEventListener('click', () => alternarCapas());
$('#cerrar-capas').addEventListener('click', () => alternarCapas(false));
$('#opacidad').addEventListener('input', e => {
  capas.opacidad = Number(e.target.value);
  aplicarOpacidad();
});
$('#opacidad').addEventListener('change', guardarCapas);

/* --- hoja inferior en táctil ---------------------------------------
   En el móvil no caben en la barra los controles secundarios sin
   partirla en filas de botones diminutos. En vez de duplicarlos, se
   mudan los mismos nodos a la hoja: conservan su id y sus escuchas.
   ------------------------------------------------------------------ */
const ESTRECHO = matchMedia('(max-width: 820px)');
const secundarios = $('#secundarios');

function colocarSecundarios() {
  const destino = ESTRECHO.matches ? $('#hoja-cuerpo') : $('.barra');
  if (secundarios.parentElement !== destino) destino.appendChild(secundarios);
  if (!ESTRECHO.matches) alternarHoja(false);
}

function alternarHoja(abrir) {
  const hoja = $('#hoja');
  const mostrar = abrir === undefined ? hoja.classList.contains('oculta') : abrir;
  hoja.classList.toggle('oculta', !mostrar);
  $('#abrir-hoja').setAttribute('aria-expanded', String(mostrar));
}

$('#abrir-hoja').addEventListener('click', () => alternarHoja());
$('#cerrar-hoja').addEventListener('click', () => alternarHoja(false));
/* Tocar fuera del panel la cierra. */
$('#hoja').addEventListener('click', e => {
  if (e.target.id === 'hoja') alternarHoja(false);
});
/* Elegir una opción la cierra: la acción ya ocurre en el plano. */
$('#hoja-cuerpo').addEventListener('click', e => {
  const boton = e.target.closest('.btn');
  if (boton && !boton.closest('.zoom')) alternarHoja(false);
});

ESTRECHO.addEventListener('change', colocarSecundarios);
colocarSecundarios();

/* --- botones y teclado -------------------------------------------- */
$('#h-mover').addEventListener('click', () => elegirHerramienta('mover'));
$('#h-foto').addEventListener('click',  () => elegirHerramienta('foto'));
$('#h-nota').addEventListener('click',  () => elegirHerramienta('nota'));
$('#encuadrar').addEventListener('click', encuadrar);
$('#mas').addEventListener('click',   () => zoom(1.4, innerWidth / 2, innerHeight / 2));
$('#menos').addEventListener('click', () => zoom(1 / 1.4, innerWidth / 2, innerHeight / 2));

addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;

  /* Con el visor abierto, las flechas recorren las fotografías. */
  if (!$('#visor').classList.contains('oculto')) {
    if (e.key === 'ArrowRight') { e.preventDefault(); visorPasar(1); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); visorPasar(-1); return; }
  }

  const k = e.key.toLowerCase();
  if (k === 'escape') {
    cerrarVisor(); cerrarGlobo(); cerrarPanel();     alternarHoja(false); alternarCapas(false); alternarPlano(false);
    elegirHerramienta('mover');
  }
  if (k === 'v') elegirHerramienta('mover');
  if (k === 'f') elegirHerramienta('foto');
  if (k === 'n') elegirHerramienta('nota');
  if (k === 'g') location.href = 'galeria.html';
  if (k === 'c') alternarCapas();
  if (k === 'p') alternarPlano();
  if (k === 'e') encuadrar();
  if (k === 'h') $('#ayuda').classList.toggle('oculta');
  if ((k === 'delete' || k === 'backspace') && seleccion) $('#borrar-marca').click();
});

addEventListener('resize', () => { encuadrePendiente ? encuadrar() : pintar(); });

/* La ventana puede ganar tamaño sin emitir `resize` —al mostrarse una
   pestaña que arrancó oculta, por ejemplo—, así que el encuadre
   pendiente se vigila también por observador. */
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(() => { if (encuadrePendiente) encuadrar(); })
    .observe(document.documentElement);
}

/* --- arranque ------------------------------------------------------
   Se pinta de inmediato con la copia local, y en cuanto se sabe si hay
   servidor detrás se recargan las marcas compartidas.
   ------------------------------------------------------------------ */
function indicarModo() {
  const etiqueta = $('#modo');
  if (!etiqueta) return;
  if (nube.base && nube.blob) {
    etiqueta.textContent = 'en línea';
    etiqueta.title = 'Las marcas y las fotos se guardan en el servidor';
  } else if (nube.base) {
    etiqueta.textContent = 'marcas en línea';
    etiqueta.title = 'Las marcas se comparten, pero falta el Blob store para las fotos';
  } else if (nube.blob) {
    etiqueta.textContent = 'fotos en línea';
    etiqueta.title = 'Las fotos se suben, pero falta la base de datos para las marcas';
  } else {
    etiqueta.textContent = 'solo este navegador';
    etiqueta.title = 'Nada se comparte todavía. Usa Exportar para no perder las marcas';
  }
  etiqueta.classList.toggle('conectado', nube.base || nube.blob);
}

cargarLocal();
cargarCapas();
encuadrar();
aplicarOpacidad();

(async () => {
  /* El plano ya se ve como imagen; esto solo lo sustituye por el SVG en
     línea para poder separar las capas. */
  await ponerPlanoEnLinea();
  aplicarCapas();
  aplicarOpacidad();

  await detectarNube();
  if (nube.base) await cargarDeNube();
  indicarModo();
  refrescarInventario();
  pintarMarcas();
  atenderEnlace();
  if (!marcas.length) avisar('Pulsa FOTO y marca desde dónde se tomó cada imagen', 5200);
})();

})();
