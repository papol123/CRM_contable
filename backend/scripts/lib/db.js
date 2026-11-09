const path = require('path');
const { Client } = require('pg');

// Mismo criterio que app.module.ts. Por defecto se usa Cloud SQL (.env).
// Con --local (o DB_DESTINO=local) se lee primero .env.local: la base embebida de
// `npm run db:local` en 127.0.0.1:54329. Se busca en backend/ y luego en la raíz;
// dotenv no sobrescribe, así que gana el primero que defina cada variable.
// En Cloud Run no hay .env (las variables vienen del servicio), así que dotenv es opcional.
const USAR_LOCAL = process.argv.includes('--local') || process.env.DB_DESTINO === 'local';
try {
  const dotenv = require('dotenv');
  const archivos = USAR_LOCAL ? ['.env.local', '.env'] : ['.env'];
  for (const carpeta of ['../..', '../../..']) {
    for (const archivo of archivos) {
      dotenv.config({ path: path.join(__dirname, carpeta, archivo), quiet: true });
    }
  }
} catch {
  // sin dotenv: se usan las variables de entorno del proceso
}

function crearCliente() {
  return new Client({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'crm_contable',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

function esBaseLocal() {
  const host = process.env.DB_HOST || '127.0.0.1';
  return host === '127.0.0.1' || host === 'localhost';
}

/** Mensaje de ayuda cuando no se puede conectar a la base. */
function ayudaConexion(err) {
  const destino = `${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || '5432'}`;
  if (err && err.code === 'ECONNREFUSED' && esBaseLocal()) {
    return (
      `No hay base de datos escuchando en ${destino} (base local de .env.local).\n` +
      '   Abra otra terminal y ejecute  npm run db:local  o use Cloud SQL sin --local.'
    );
  }
  if (err && (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') && !esBaseLocal()) {
    return (
      `Cloud SQL (${destino}) no respondió. Lo más común: la IP pública de su red no está autorizada.\n` +
      '   1. Vea su IP en https://api.ipify.org\n' +
      '   2. Google Cloud Console → SQL → crm-contable-db → Conexiones → Redes →\n' +
      '      "Agregar una red" con esa IP terminada en /32 → Guardar (tarda 1-2 min).\n' +
      '   3. Verifique también que la instancia esté en estado "En ejecución".\n' +
      '   Detalle en TROUBLESHOOTING.md §1.1'
    );
  }
  return null;
}

module.exports = { crearCliente, esBaseLocal, ayudaConexion };
