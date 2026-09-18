/* ==================================================================
   Sube una fotografía al Blob store y devuelve su URL pública.

   POST /api/subir  { nombre, tipo, datos }   datos = base64 sin cabecera

   El navegador reduce la imagen antes de enviarla, así que lo que
   llega aquí pesa unos cientos de kilobytes. El límite de cuerpo de
   una función de Vercel es 4,5 MB, y base64 infla un tercio: por eso
   el tope efectivo son 3 MB de imagen.
   ================================================================== */
import { put } from '@vercel/blob';
import { hayBlob, credenciales } from '../lib/blob.js';

const TOPE = 3 * 1024 * 1024;
const FORMATOS = /^image\/(jpeg|png|webp)$/;

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'Método no admitido' });
  }

  if (!hayBlob()) {
    return res.status(503).json({
      nube: false,
      razon: 'Este proyecto no tiene Blob store conectado',
    });
  }

  try {
    const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { nombre, tipo, datos } = cuerpo || {};

    if (typeof datos !== 'string' || !datos) {
      return res.status(400).json({ error: 'No llegó ninguna imagen' });
    }
    if (!FORMATOS.test(String(tipo || ''))) {
      return res.status(400).json({ error: 'Solo se admiten JPEG, PNG o WebP' });
    }

    const binario = Buffer.from(datos, 'base64');
    if (!binario.length) return res.status(400).json({ error: 'La imagen llegó vacía' });
    if (binario.length > TOPE) {
      return res.status(413).json({ error: 'La imagen excede el tamaño permitido' });
    }

    // Nombre legible en el panel de Vercel; el sufijo aleatorio evita choques.
    const limpio = String(nombre || 'foto')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.\-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'foto';

    const { url } = await put(`fotos/${limpio}`, binario, {
      ...credenciales(),
      access: 'public',
      contentType: tipo,
      addRandomSuffix: true,
    });

    return res.status(200).json({ url });

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
