/**
 * PostgreSQL 17 embebido para desarrollo y pruebas sin tocar Cloud SQL.
 *
 *   npm run db:local            # levanta la base en el puerto 54329 (Ctrl+C para detener)
 *
 * Luego, en otra terminal, apunte el backend a ella:
 *   DB_HOST=127.0.0.1 DB_PORT=54329 DB_USER=postgres DB_PASSWORD=postgres DB_SSL=false npm run db:setup
 */
const path = require('path');
const { default: EmbeddedPostgres } = require('embedded-postgres');

const PUERTO = parseInt(process.env.LOCAL_PG_PORT || '54329', 10);
const DIRECTORIO = process.env.LOCAL_PG_DIR || path.join(__dirname, '../.local-pg');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DIRECTORIO,
    user: 'postgres',
    password: 'postgres',
    port: PUERTO,
    persistent: true,
    // En Windows initdb toma WIN1252 por defecto y el esquema tiene caracteres UTF-8
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  });

  const fs = require('fs');
  if (!fs.existsSync(path.join(DIRECTORIO, 'PG_VERSION'))) await pg.initialise();
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const { rowCount } = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'crm_contable'`);
  if (!rowCount) await client.query('CREATE DATABASE crm_contable');
  await client.end();

  console.log(`🐘 PostgreSQL local listo en 127.0.0.1:${PUERTO} (base crm_contable, datos en ${DIRECTORIO})`);

  const detener = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', detener);
  process.on('SIGTERM', detener);
}

main().catch((err) => {
  console.error('❌ No se pudo iniciar PostgreSQL local:', err.message);
  process.exit(1);
});
