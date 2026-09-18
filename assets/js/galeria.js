/* ==================================================================
   Galería de fotografías.

   Página aparte del plano, con las mismas marcas: el plano sirve para
   situar, y esto para repasar lo que hay. Comparte con él el modelo, el
   transporte y la subida, que viven en comun.js.
   ================================================================== */
(() => {
'use strict';

const $ = (s) => document.querySelector(s);

let marcas = [];
let nube = { base: false, blob: false, clave: false, autorizado: true };

/* Las fotos elegidas en esta sesión se ven al momento, antes incluso de
   que termine la subida. Se guardan por marca, no por nombre. */
const previews = new Map();

function rutaFoto(m) {
  return previews.get(m.id) || PL.rutaDeArchivo(m.archivo);
}

/* --- avisos -------------------------------------------------------- */
let tempAviso;
function avisar(texto, ms) {
  clearTimeout(tempAviso);
  $('#aviso').textContent = texto;
  $('#aviso').classList.remove('oculto');
  if (ms) tempAviso = setTimeout(() => $('#aviso').classList.add('oculto'), ms);
}

/* --- guardado ------------------------------------------------------ */
function guardar(m) {
  PL.escribirMarcas(marcas);
  indicarCuenta();
  if (m && nube.base) {
    PL.enviarMarca(m).catch(() =>
      avisar('No se pudo guardar en el servidor; queda en este navegador', 4000));
  }
}

/* --- fichas -------------------------------------------------------- */
const sinImagen = (texto) => Object.assign(document.createElement('span'),
  { className: 'sin', textContent: texto });

function ficha(m) {
  const art = document.createElement('article');
  art.className = 'ficha' + (m.situada ? '' : ' pendiente');

  const marco = document.createElement('span');
  marco.className = 'ficha-imagen';
  const ruta = rutaFoto(m);
  if (ruta) {
    const img = document.createElement('img');
    img.src = ruta;
    img.alt = m.titulo || '';
    img.loading = 'lazy';
    img.addEventListener('error',
      () => marco.replaceChildren(sinImagen('No se encuentra el archivo')));
    marco.appendChild(img);
  } else {
    marco.appendChild(sinImagen('Sin fotografía'));
  }

  const titulo = document.createElement('span');
  titulo.className = 'ficha-titulo';
  titulo.textContent = m.titulo || 'Sin título';

  const ver = document.createElement('button');
  ver.className = 'ficha-ver';
  ver.title = 'Ver la fotografía';
  ver.append(marco, titulo);
  ver.addEventListener('click', () => abrirVisor(m));

  const rumbo = document.createElement('span');
  rumbo.className = 'ficha-rumbo' + (m.situada ? '' : ' pendiente');
  rumbo.textContent = m.situada
    ? Math.round(m.rumbo || 0) + '° ' + PL.cardinal(m.rumbo || 0)
    : 'Sin situar';

  const datos = document.createElement('div');
  datos.className = 'ficha-datos';
  datos.append(rumbo);

  /* Situar abre el plano centrado en esta marca. */
  const situar = document.createElement('a');
  situar.className = 'situar';
  situar.href = 'index.html#situar=' + encodeURIComponent(m.id);
  situar.textContent = 'Situar';
  situar.title = 'Ver dónde está en el plano';

  const bajar = document.createElement('button');
  bajar.className = 'situar bajar';
  bajar.title = 'Descargar esta fotografía';
  bajar.innerHTML = '<svg viewBox="0 0 24 24"><path d="M11 3h2v9.6l3.3-3.3 1.4 1.4L12 16.4 6.3 10.7l1.4-1.4L11 12.6V3ZM5 19h14v2H5v-2Z"/></svg>';
  bajar.disabled = !ruta;
  bajar.addEventListener('click', () => descargar(m));

  const botones = document.createElement('div');
  botones.className = 'ficha-botones';
  botones.append(situar, bajar);

  art.append(ver, datos, botones);
  return art;
}

function pintar() {
  const rejilla = $('#galeria-rejilla');
  rejilla.textContent = '';
  /* Las que faltan por situar van delante: son las que piden trabajo. */
  const fotos = marcas.filter(m => m.tipo === 'foto')
    .sort((a, b) => Number(a.situada) - Number(b.situada));

  if (!fotos.length) {
    const vacia = document.createElement('p');
    vacia.className = 'galeria-vacia';
    vacia.textContent = 'Todavía no hay fotografías. '
      + 'Añádelas aquí, o márcalas en el plano desde donde se tomaron.';
    rejilla.appendChild(vacia);
    return;
  }
  fotos.forEach(m => rejilla.appendChild(ficha(m)));
}

function indicarCuenta() {
  const fotos = marcas.filter(m => m.tipo === 'foto').length;
  const pendientes = marcas.filter(m => m.tipo === 'foto' && !m.situada).length;
  const partes = [fotos === 1 ? '1 fotografía' : fotos + ' fotografías'];
  if (pendientes) partes.push(pendientes + ' sin situar');
  const etiqueta = $('#cuenta');
  etiqueta.textContent = partes.join(' · ');
  etiqueta.classList.toggle('pendiente', pendientes > 0);
}

/* --- descarga ------------------------------------------------------ */
async function descargar(m) {
  const ruta = rutaFoto(m);
  if (!ruta) return avisar('Esta marca todavía no tiene fotografía', 3000);
  avisar('Descargando…');
  const limpia = await PL.descargar(m, ruta);
  avisar(limpia
    ? 'Descargada como ' + PL.nombreDeDescarga(m)
    : 'Se abrió en otra pestaña: guárdala desde ahí', 3600);
}

/* --- visor ---------------------------------------------------------
   El mismo que el del plano: deslizar de lado pasa a la siguiente.
   ------------------------------------------------------------------ */
let visorActual = null;

const fotosEnOrden = () => marcas.filter(m => m.tipo === 'foto')
  .sort((a, b) => Number(a.situada) - Number(b.situada));

function abrirVisor(m, paso) {
  visorActual = m.id;
  const cuerpo = $('#visor-cuerpo');
  cuerpo.style.setProperty('--dx', paso ? (paso > 0 ? '26px' : '-26px') : '0px');

  const ruta = rutaFoto(m);
  cuerpo.innerHTML = ruta
    ? `<img src="${PL.escapar(ruta)}" alt="${PL.escapar(m.titulo)}"
         onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'vacio',textContent:'No se encuentra la imagen de esta marca'}))">`
    : '<div class="vacio">Esta marca todavía no tiene fotografía</div>';

  $('#visor-titulo').textContent = m.titulo || 'Sin título';
  $('#visor-nota').textContent = m.nota || '';
  $('#visor-rumbo').textContent = m.situada
    ? 'Cámara hacia ' + Math.round(m.rumbo || 0) + '° ' + PL.cardinal(m.rumbo || 0)
    : 'Sin situar';

  const lista = fotosEnOrden();
  const i = lista.findIndex(x => x.id === m.id);
  $('#visor-cuenta').textContent = lista.length > 1 ? (i + 1) + ' / ' + lista.length : '';
  $('#visor-bajar').disabled = !ruta;

  $('#visor').classList.remove('oculto');
}

const cerrarVisor = () => $('#visor').classList.add('oculto');

function visorPasar(paso) {
  const lista = fotosEnOrden();
  if (lista.length < 2) return;
  const i = lista.findIndex(m => m.id === visorActual);
  const siguiente = lista[(((i < 0 ? 0 : i) + paso) % lista.length + lista.length) % lista.length];
  abrirVisor(siguiente, paso);
}

const DESLIZ_MINIMO = 55;
let tocando = null, huboDesliz = false;

$('#visor').addEventListener('pointerdown', e => {
  tocando = { x: e.clientX, y: e.clientY };
  huboDesliz = false;
});
$('#visor').addEventListener('pointerup', e => {
  if (!tocando) return;
  const dx = e.clientX - tocando.x, dy = e.clientY - tocando.y;
  tocando = null;
  if (Math.abs(dx) > DESLIZ_MINIMO && Math.abs(dx) > Math.abs(dy) * 1.6) {
    huboDesliz = true;
    visorPasar(dx < 0 ? 1 : -1);
  }
});
$('#visor').addEventListener('click', e => {
  if (huboDesliz) { huboDesliz = false; return; }
  if (e.target.id === 'visor') cerrarVisor();
});

$('#visor-cerrar').addEventListener('click', cerrarVisor);
$('#visor-bajar').addEventListener('click', () => {
  const m = marcas.find(x => x.id === visorActual);
  if (m) descargar(m);
});

addEventListener('keydown', e => {
  if (!$('#visor').classList.contains('oculto')) {
    if (e.key === 'ArrowRight') { e.preventDefault(); visorPasar(1); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); visorPasar(-1); return; }
    if (e.key === 'Escape') cerrarVisor();
  }
});

/* --- añadir fotografías --------------------------------------------
   Entran sin situar, apiladas en el centro del plano; se colocan luego
   arrastrándolas allí.
   ------------------------------------------------------------------ */
const CENTRO = [588, 669];          // el centro del plano, en su sistema

function aparcar(indice) {
  const paso = 42, porFila = 5;
  return [
    CENTRO[0] + ((indice % porFila) - (porFila - 1) / 2) * paso,
    CENTRO[1] + (Math.floor(indice / porFila) - 1) * paso,
  ];
}

async function anadirFotos(archivos) {
  const yaPendientes = marcas.filter(m => m.tipo === 'foto' && !m.situada).length;
  let n = 0;

  for (const f of archivos) {
    const [x, y] = aparcar(yaPendientes + n);
    const m = { id: PL.nuevoId(), tipo: 'foto', x, y, rumbo: 0,
                titulo: f.name.replace(/\.[^.]+$/, ''), nota: '',
                archivo: f.name, situada: false };
    previews.set(m.id, URL.createObjectURL(f));
    marcas.push(m);
    n++;
    guardar(m);
    pintar();

    if (nube.blob) {
      avisar(`Subiendo ${n} de ${archivos.length}…`);
      try {
        m.archivo = await PL.subir(f);
        guardar(m);
      } catch (e) {
        avisar('No se pudo subir «' + f.name + '» (' + e.message + ')', 5400);
      }
    }
  }

  pintar();
  avisar(n === 1
    ? 'Una fotografía añadida. Sitúala en el plano desde donde se tomó'
    : `${n} fotografías añadidas. Sitúalas en el plano desde donde se tomaron`,
    6500);
}

$('#anadir-fotos').addEventListener('click', () => $('#entrada-fotos').click());
$('#entrada-fotos').addEventListener('change', e => {
  const archivos = [...e.target.files].filter(f => f.type.startsWith('image/'));
  e.target.value = '';
  if (archivos.length) anadirFotos(archivos);
});

/* --- arranque ------------------------------------------------------ */
marcas = PL.leerMarcas();
indicarCuenta();
pintar();

(async () => {
  nube = await PL.estadoNube();
  if (nube.clave && !nube.autorizado) {
    avisar('Este plano pide una clave de acceso. Ábrelo con ?clave=… para ver las fotos', 6000);
  }
  if (!nube.base) return;
  try {
    const deNube = await PL.leerDeNube();
    if (deNube) {
      marcas = deNube;
      PL.escribirMarcas(marcas);
      indicarCuenta();
      pintar();
    }
  } catch (e) {
    avisar('No se pudieron leer las marcas del servidor; se usa la copia local', 4000);
  }
})();

})();
