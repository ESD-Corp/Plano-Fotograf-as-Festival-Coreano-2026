/* ==================================================================
   Lo que comparten el plano y la galería.

   Van como guion clásico y no como módulo: un módulo ES no se puede
   cargar desde `file://`, y el plano tiene que seguir abriéndose con
   doble clic en el index, sin servidor.
   ================================================================== */
window.PL = (() => {
'use strict';

const CLAVE = 'plano-fray-anton-marcas';
const CLAVE_ACCESO = 'plano-fray-anton-clave';

/* --- clave de acceso -----------------------------------------------
   Si el despliegue define PLANO_CLAVE, el servidor la exige en cada
   peticion. Se entra una vez con ?clave=… en la direccion; queda
   guardada en este navegador y se borra de la barra de direcciones
   para que no acabe en el historial ni en un enlace compartido.
   ------------------------------------------------------------------ */
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

/* --- modelo --------------------------------------------------------
   Las marcas viajan por JSON y vuelven de Postgres: se normalizan para
   que los numeros sean numeros y los textos nunca sean nulos.
   ------------------------------------------------------------------ */
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

function leerMarcas() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? JSON.parse(crudo).map(normalizar) : [];
  } catch (e) {
    return [];
  }
}

function escribirMarcas(marcas) {
  try { localStorage.setItem(CLAVE, JSON.stringify(marcas)); return true; }
  catch (e) { return false; }
}

const nuevoId = () =>
  'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* --- servidor ------------------------------------------------------ */
async function estadoNube() {
  const nube = { base: false, blob: false, clave: false, autorizado: true };
  try {
    const r = await fetch('/api/estado', { cache: 'no-store', headers: cabeceras() });
    if (!r.ok) return nube;
    const d = await r.json();
    nube.clave = Boolean(d.clave);
    nube.autorizado = d.autorizado !== false;
    nube.base = Boolean(d.base) && nube.autorizado;
    nube.blob = Boolean(d.blob) && nube.autorizado;
  } catch (e) {
    /* Sin servidor: se trabaja solo en local. */
  }
  return nube;
}

async function leerDeNube() {
  const r = await fetch('/api/marcas', { cache: 'no-store', headers: cabeceras() });
  if (!r.ok) throw new Error('error ' + r.status);
  const d = await r.json();
  return Array.isArray(d.marcas) ? d.marcas.map(normalizar) : null;
}

async function enviarMarca(m) {
  const r = await fetch('/api/marcas', {
    method: 'PUT',
    headers: cabeceras({ 'content-type': 'application/json' }),
    body: JSON.stringify(normalizar(m)),
  });
  if (!r.ok) throw new Error('error ' + r.status);
}

/* --- subida de fotografías -----------------------------------------
   La imagen se reduce en el navegador antes de enviarla: una foto de
   teléfono pasa de varios megabytes a unos cientos de kilobytes.
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

/* --- rutas y descarga ---------------------------------------------- */
function rutaDeArchivo(archivo) {
  if (!archivo) return '';
  return /^https?:\/\//i.test(archivo) ? archivo : 'fotos/' + archivo;
}

/* Nombre con el que se guarda en el disco: el título si lo tiene, y si
   no el del archivo. Sin acentos ni signos, que viajan mal. */
function nombreDeDescarga(m) {
  const base = (m.titulo || String(m.archivo || 'fotografia').split('/').pop())
    .replace(/\.[^.]+$/, '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-')
    .slice(0, 80) || 'fotografia';
  const ext = (String(m.archivo || '').match(/\.(jpe?g|png|webp)(?:$|\?)/i) || [, 'jpg'])[1];
  return base + '.' + ext.toLowerCase();
}

/* Descarga la imagen de una marca. Se trae como blob para poder darle
   nombre; si el origen no lo permite, se cae a abrir el enlace, que al
   menos deja guardarla a mano. */
async function descargar(m, ruta) {
  const url = ruta || rutaDeArchivo(m.archivo);
  if (!url) return false;
  const nombre = nombreDeDescarga(m);
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw new Error('error ' + r.status);
    const blob = await r.blob();
    const tmp = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = tmp; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(tmp), 1000);
    return true;
  } catch (e) {
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    return false;
  }
}

const cardinal = (g) =>
  ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(g / 45) % 8];

const escapar = (t) => String(t).replace(/[<>&"]/g,
  c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

return {
  CLAVE, CLAVE_ACCESO, cabeceras,
  normalizar, leerMarcas, escribirMarcas, nuevoId,
  estadoNube, leerDeNube, enviarMarca,
  reducir, aBase64, subir,
  rutaDeArchivo, nombreDeDescarga, descargar,
  cardinal, escapar,
};
})();
