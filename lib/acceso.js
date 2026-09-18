/* ==================================================================
   Clave de acceso de las funciones.

   Sin `PLANO_CLAVE` definida las rutas quedan abiertas y el proyecto
   se comporta como antes. Es lo cómodo mientras el plano vive en un
   despliegue de prueba y no hay nada que perder.

   Con `PLANO_CLAVE` definida, toda petición a /api/marcas y /api/subir
   debe traer la misma clave en la cabecera `x-plano-clave`. Sin ella
   cualquiera que diera con la URL del despliegue podía borrar las
   marcas del festival o llenar el Blob store, porque las funciones no
   distinguían quién llamaba.
   ================================================================== */
import { createHash, timingSafeEqual } from 'node:crypto';

const CLAVE = process.env.PLANO_CLAVE || '';

export const hayClave = () => Boolean(CLAVE);

/* Se comparan los resúmenes y no las cadenas: así la comparación dura
   lo mismo acierte o falle, y no se filtra la clave —ni su longitud—
   por el tiempo que tarda en responder. */
const resumen = (texto) => createHash('sha256').update(String(texto)).digest();

export function claveCorrecta(req) {
  if (!CLAVE) return true;
  const dada = req.headers['x-plano-clave'];
  if (typeof dada !== 'string' || !dada) return false;
  return timingSafeEqual(resumen(dada), resumen(CLAVE));
}

/* Deja pasar, o responde 401 y devuelve false. El campo `clave` le
   dice al navegador que el problema es la credencial y no el store,
   para que pueda pedirla en vez de darse por desconectado. */
export function permitido(req, res) {
  if (claveCorrecta(req)) return true;
  res.status(401).json({
    clave: true,
    error: 'Este plano necesita una clave de acceso',
  });
  return false;
}
