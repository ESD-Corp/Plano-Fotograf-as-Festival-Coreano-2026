/* Qué servicios tiene conectados el proyecto. El navegador lo consulta
   al arrancar para decidir si trabaja contra el servidor o en local. */
export default function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.status(200).json({
    base: Boolean(process.env.DATABASE_URL
      || process.env.POSTGRES_URL
      || process.env.POSTGRES_PRISMA_URL),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}
