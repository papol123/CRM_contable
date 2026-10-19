const path = require('path');
const { Client } = require('pg');

// Mismo orden de búsqueda que app.module.ts: backend/.env y luego la raíz.
// En Cloud Run no hay .env (las variables vienen del servicio), así que dotenv es opcional.
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '../../.env'), quiet: true });
  dotenv.config({ path: path.join(__dirname, '../../../.env'), quiet: true });
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

module.exports = { crearCliente, esBaseLocal };
