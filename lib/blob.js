/* ==================================================================
   Credenciales del Blob store.

   Vercel enlaza el store de dos maneras distintas según cómo se haya
   conectado al proyecto, y las variables que inyecta no son las
   mismas:

     - token estático →  BLOB_READ_WRITE_TOKEN
     - identidad OIDC →  BLOB_STORE_ID (junto con un token OIDC que
                         el propio SDK obtiene y renueva)

   Al principio este proyecto solo miraba el token estático, así que
   daba el store por ausente cuando Vercel lo había enlazado por la
   segunda vía. Aquí se aceptan las dos.
   ================================================================== */

const TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';
const STORE = process.env.BLOB_STORE_ID || '';

export const hayBlob = () => Boolean(TOKEN || STORE);

/* Lo que se le pasa a put(). Con token estático se entrega tal cual.
   Con OIDC basta el identificador del store: el token lo busca el SDK
   por su cuenta y lo renueva si ha caducado, cosa que no ocurriría si
   lo leyéramos nosotros de VERCEL_OIDC_TOKEN y lo pasáramos fijo. */
export function credenciales() {
  if (TOKEN) return { token: TOKEN };
  if (STORE) return { storeId: STORE };
  return {};
}

/* Los NOMBRES de las variables de almacenamiento presentes, nunca sus
   valores. Permite ver desde fuera por qué vía enlazó Vercel el store
   sin depender de capturas del panel. */
export function variablesPresentes() {
  return Object.keys(process.env)
    .filter((n) => /^(BLOB_|POSTGRES_|NEON_|DATABASE_URL|VERCEL_OIDC_TOKEN)/.test(n))
    .sort();
}
