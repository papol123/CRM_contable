const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');

// Mismo orden de búsqueda que app.module.ts: backend/.env y luego la raíz
dotenv.config({ path: path.join(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.join(__dirname, '../../../.env'), quiet: true });

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
