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
const mapa    = $('#mapa');
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
  };
}

/* Guardar una marca: en local siempre, y en el servidor si lo hay. El
   envio se retrasa un poco para que escribir en el titulo no dispare
   una peticion por tecla. */
function guardar(m) {
  guardarLocal();
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

const ICONO_FOTO = '<svg viewBox="0 0 24 24"><path d="M9 3 7.5 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.5L15 3H9Zm3 5.5A5.5 5.5 0 1 1 6.5 14 5.5 5.5 0 0 1 12 8.5Zm0 2A3.5 3.5 0 1 0 15.5 14 3.5 3.5 0 0 0 12 10.5Z"/></svg>';
const ICONO_NOTA = '<svg viewBox="0 0 24 24"><path d="M4 3h16v13l-5 5H4V3Zm2 2v14h7v-4h4V5H6Z"/></svg>';

/* Cono de visión: indica hacia dónde apunta la cámara. */
function cono(rumbo) {
  return `<div class="cono"><svg width="124" height="124" style="transform:rotate(${rumbo}deg)">
    <path d="M62 62 L34 8 A62 62 0 0 1 90 8 Z"
          fill="rgba(228,50,43,.22)" stroke="rgba(228,50,43,.7)" stroke-width="1.2"/>
    <line x1="62" y1="62" x2="62" y2="12" stroke="rgba(228,50,43,.85)"
          stroke-width="1.2" stroke-dasharray="3 3"/>
  </svg></div>`;
}

function pintarMarcas() {
  capa.textContent = '';
  const lista = borrador ? marcas.concat([borrador]) : marcas;

  lista.forEach(m => {
    const [sx, sy] = aPantalla(m.x, m.y);
    if (sx < -120 || sx > innerWidth + 120 || sy < -120 || sy > innerHeight + 120) return;

    const d = document.createElement('div');
    d.className = 'marca' + (m.tipo === 'nota' ? ' es-nota' : '')
                + (seleccion === m.id ? ' activa' : '');
    d.style.left = sx + 'px';
    d.style.top  = sy + 'px';
    d.dataset.id = m.id;
    d.innerHTML = (m.tipo === 'foto' ? cono(m.rumbo || 0) : '')
      + '<div class="punto">' + (m.tipo === 'nota' ? ICONO_NOTA : ICONO_FOTO) + '</div>'
      + (m.titulo ? `<div class="rotulo">${escapar(m.titulo)}</div>` : '');
    capa.appendChild(d);

    // tirador para girar, solo en la marca seleccionada
    if (seleccion === m.id && m.tipo === 'foto') {
      const r = (m.rumbo || 0) * Math.PI / 180;
      const g = document.createElement('div');
      g.className = 'giro';
      g.dataset.giro = m.id;
      g.style.left = (sx + Math.sin(r) * 58) + 'px';
      g.style.top  = (sy - Math.cos(r) * 58) + 'px';
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

function encuadrar() {
  const m = 0.05;
  const ancho = innerWidth, alto = innerHeight;
  if (ancho < 1 || alto < 1) { encuadrePendiente = true; return; }
  vista.z = Math.min(ancho / (ANCHO * (1 + m)), alto / (ALTO * (1 + m)));
  vista.x = (ancho - ANCHO * vista.z) / 2;
  vista.y = (alto  - ALTO  * vista.z) / 2;
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
      titulo: '', nota: '', archivo: ''
    };
    if (herramienta === 'foto') orientando = borrador;
    pintarMarcas();
    return;
  }

  if (marca) {
    const m = marcas.find(x => x.id === marca.dataset.id);
    if (m) {
      moviendo = { m, sx: e.clientX, sy: e.clientY, ox: m.x, oy: m.y, movido: false };
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
    moviendo.m.x = moviendo.ox + dx;
    moviendo.m.y = moviendo.oy + dy;
    pintarMarcas();
    return;
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
    if (moviendo.movido) { guardar(m); }
    else if (esSegundoClic(m.id)) {
      seleccion = m.id;
      if (m.tipo === 'foto') abrirVisor(m); else abrirPanel();
    } else {
      seleccion = m.id; abrirPanel();
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
              titulo: '', nota: '', archivo: '' };
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
async function adjuntar(m, f) {
  recordarPreview(m.id, f);
  m.archivo = f.name;
  if (!m.titulo) m.titulo = f.name.replace(/\.[^.]+$/, '');
  guardar(m);
  abrirPanel();

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
  guardarLocal(); borrarEnNube(m.id); cerrarPanel();
});

/* --- visor -------------------------------------------------------- */
function abrirVisor(m) {
  const cuerpo = $('#visor-cuerpo');
  const ruta = rutaFoto(m);
  cuerpo.innerHTML = ruta
    ? `<img src="${escapar(ruta)}" alt="${escapar(m.titulo)}"
         onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'vacio',textContent:'No se encuentra la imagen de esta marca'}))">`
    : '<div class="vacio">Esta marca todavía no tiene fotografía</div>';
  $('#visor-titulo').textContent = m.titulo || 'Sin título';
  $('#visor-nota').textContent = m.nota || '';
  $('#visor-rumbo').textContent = m.tipo === 'foto'
    ? 'Cámara hacia ' + Math.round(m.rumbo || 0) + '° ' + cardinal(m.rumbo || 0) : '';
  $('#visor').classList.remove('oculto');
}
const cerrarVisor = () => $('#visor').classList.add('oculto');
$('#visor-cerrar').addEventListener('click', cerrarVisor);
$('#visor').addEventListener('click', e => { if (e.target.id === 'visor') cerrarVisor(); });

function cardinal(g) {
  return ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(g / 45) % 8];
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
      guardarLocal(); cerrarPanel(); pintarMarcas();
      avisar(marcas.length + ' marcas importadas', 2600);
      subirTodas();
    } catch (err) {
      avisar('Ese archivo no tiene marcas válidas', 3000);
    }
  };
  lector.readAsText(f);
});

/* --- botones y teclado -------------------------------------------- */
$('#h-mover').addEventListener('click', () => elegirHerramienta('mover'));
$('#h-foto').addEventListener('click',  () => elegirHerramienta('foto'));
$('#h-nota').addEventListener('click',  () => elegirHerramienta('nota'));
$('#encuadrar').addEventListener('click', encuadrar);
$('#mas').addEventListener('click',   () => zoom(1.4, innerWidth / 2, innerHeight / 2));
$('#menos').addEventListener('click', () => zoom(1 / 1.4, innerWidth / 2, innerHeight / 2));

addEventListener('keydown', e => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { cerrarVisor(); cerrarPanel(); elegirHerramienta('mover'); }
  if (k === 'v') elegirHerramienta('mover');
  if (k === 'f') elegirHerramienta('foto');
  if (k === 'n') elegirHerramienta('nota');
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
encuadrar();

(async () => {
  await detectarNube();
  if (nube.base) await cargarDeNube();
  indicarModo();
  pintarMarcas();
  if (!marcas.length) avisar('Pulsa FOTO y marca desde dónde se tomó cada imagen', 5200);
})();

})();
