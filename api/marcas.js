/* ==================================================================
   Las marcas del plano: leer todas, guardar una, borrar una.

   GET    /api/marcas          -> { nube: true, marcas: [...] }
   PUT    /api/marcas          -> guarda (inserta o actualiza) una marca
   DELETE /api/marcas?id=...   -> borra una marca

   Sin base de datos conectada responde 503 con nube:false, y el
   navegador sigue trabajando con su copia local.
   ================================================================== */
import { hayBase, preparar, sql } from '../lib/base.js';
import { permitido } from '../lib/acceso.js';

const TIPOS = new Set(['foto', 'nota']);
const LARGO_TEXTO = 2000;
const LARGO_ARCHIVO = 600;

function cuerpo(req) {
  if (!req.body) return null;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

/* Devuelve el mensaje del primer problema, o null si la marca es válida. */
function revisar(m) {
  if (!m || typeof m !== 'object') return 'No llegó ninguna marca';
  if (typeof m.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(m.id)) return 'Identificador inválido';
  if (!TIPOS.has(m.tipo)) return 'Tipo de marca inválido';
  for (const campo of ['x', 'y', 'rumbo']) {
    if (typeof m[campo] !== 'number' || !Number.isFinite(m[campo])) return `Valor inválido en ${campo}`;
  }
  if (String(m.titulo ?? '').length > LARGO_TEXTO) return 'El título es demasiado largo';
  if (String(m.nota ?? '').length > LARGO_TEXTO) return 'La nota es demasiado larga';
  if (String(m.archivo ?? '').length > LARGO_ARCHIVO) return 'La referencia del archivo es demasiado larga';
  return null;
}

const METODOS = ['GET', 'PUT', 'POST', 'DELETE'];

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  // Todo lo que se puede decidir mirando solo la petición se resuelve
  // antes de tocar la base: así un fallo de conexión no enmascara un
  // método erróneo ni un cuerpo inválido detrás de un 500.
  if (!METODOS.includes(req.method)) {
    res.setHeader('allow', METODOS.join(', '));
    return res.status(405).json({ error: 'Método no admitido' });
  }

  // La credencial se comprueba antes que el estado de los stores: quien
  // no tiene clave tampoco debe averiguar qué hay conectado detrás.
  if (!permitido(req, res)) return;

  if (!hayBase()) {
    return res.status(503).json({
      nube: false,
      razon: 'Este proyecto no tiene base de datos conectada',
    });
  }

  let marca = null, id = null;

  if (req.method === 'PUT' || req.method === 'POST') {
    marca = cuerpo(req);
    const problema = revisar(marca);
    if (problema) return res.status(400).json({ error: problema });
  }

  if (req.method === 'DELETE') {
    id = new URL(req.url, 'http://plano').searchParams.get('id');
    if (!id) return res.status(400).json({ error: 'Falta el identificador' });
  }

  try {
    await preparar();
    const q = sql();

    if (req.method === 'GET') {
      const marcas = await q`
        SELECT id, tipo, x, y, rumbo, titulo, nota, archivo
        FROM marcas ORDER BY actualizado ASC`;
      return res.status(200).json({ nube: true, marcas });
    }

    if (marca) {
      const m = marca;
      await q`
        INSERT INTO marcas (id, tipo, x, y, rumbo, titulo, nota, archivo, actualizado)
        VALUES (${m.id}, ${m.tipo}, ${m.x}, ${m.y}, ${m.rumbo},
                ${String(m.titulo ?? '')}, ${String(m.nota ?? '')},
                ${String(m.archivo ?? '')}, now())
        ON CONFLICT (id) DO UPDATE SET
          tipo    = EXCLUDED.tipo,
          x       = EXCLUDED.x,
          y       = EXCLUDED.y,
          rumbo   = EXCLUDED.rumbo,
          titulo  = EXCLUDED.titulo,
          nota    = EXCLUDED.nota,
          archivo = EXCLUDED.archivo,
          actualizado = now()`;
      return res.status(200).json({ ok: true });
    }

    if (id) {
      await q`DELETE FROM marcas WHERE id = ${id}`;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Petición incompleta' });

  } catch (err) {
    // El detalle queda en el registro de la función; hacia fuera solo
    // el hecho, porque el mensaje del driver nombra host y credenciales.
    console.error('[marcas]', err);
    return res.status(500).json({ error: 'No se pudo completar la operación en la base de datos' });
  }
}
