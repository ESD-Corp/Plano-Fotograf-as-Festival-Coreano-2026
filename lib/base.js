/* ==================================================================
   Conexión a la base de datos.

   Vercel inyecta la cadena de conexión cuando se enlaza un store de
   Postgres al proyecto. El nombre de la variable ha cambiado con las
   versiones de la integración, así que se aceptan las tres formas.

   Si no hay ninguna, `hayBase()` devuelve false y la aplicación
   trabaja solo con el almacenamiento del navegador.
   ================================================================== */
import { neon } from '@neondatabase/serverless';

const CADENA = process.env.DATABASE_URL
  || process.env.POSTGRES_URL
  || process.env.POSTGRES_PRISMA_URL
  || '';

export const hayBase = () => Boolean(CADENA);

let conexion = null;
let creando = null;

function sql() {
  if (!conexion) conexion = neon(CADENA);
  return conexion;
}

/* Crea la tabla la primera vez que se usa. Se guarda la promesa para
   que varias peticiones simultáneas no intenten crearla a la vez; si
   falla se descarta, para que el siguiente intento vuelva a probar. */
export function preparar() {
  if (!creando) {
    creando = sql()`
      CREATE TABLE IF NOT EXISTS marcas (
        id          TEXT PRIMARY KEY,
        tipo        TEXT             NOT NULL DEFAULT 'foto',
        x           DOUBLE PRECISION NOT NULL,
        y           DOUBLE PRECISION NOT NULL,
        rumbo       DOUBLE PRECISION NOT NULL DEFAULT 0,
        titulo      TEXT             NOT NULL DEFAULT '',
        nota        TEXT             NOT NULL DEFAULT '',
        archivo     TEXT             NOT NULL DEFAULT '',
        actualizado TIMESTAMPTZ      NOT NULL DEFAULT now()
      )`.catch(err => { creando = null; throw err; });
  }
  return creando;
}

export { sql };
