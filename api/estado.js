/* Qué servicios tiene conectados el proyecto. El navegador lo consulta
   al arrancar para decidir si trabaja contra el servidor o en local. */
import { hayBlob, variablesPresentes } from '../lib/blob.js';

export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');

  const estado = {
    base: Boolean(process.env.DATABASE_URL
      || process.env.POSTGRES_URL
      || process.env.POSTGRES_PRISMA_URL),
    blob: hayBlob(),
  };

  /* Con ?diag=1 se añaden los nombres de las variables de
     almacenamiento presentes —nunca sus valores— para poder
     averiguar por qué vía enlazó Vercel cada store. */
  const consulta = req.query || Object.fromEntries(
    new URL(req.url, 'http://local').searchParams,
  );
  if (consulta.diag === '1') estado.variables = variablesPresentes();

  res.status(200).json(estado);
}
