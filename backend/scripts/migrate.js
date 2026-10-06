/**
 * Aplica el esquema base (si la base está vacía) y las migraciones pendientes
 * de backend/database/migrations, en orden alfabético.
 *
 *   npm run db:migrate
 */
const fs = require('fs');
const path = require('path');
const { crearCliente } = require('./lib/db');

const ESQUEMA_BASE = path.join(__dirname, '../../crm_contable_schema_postgresql_uuid.sql');
const CARPETA_MIGRACIONES = path.join(__dirname, '../database/migrations');

async function main() {
  const client = crearCliente();
  await client.connect();

  try {
    const { rows } = await client.query(`SELECT to_regclass('public.usuarios') AS tabla`);
    if (!rows[0].tabla) {
      console.log('📐 Base vacía: aplicando esquema base...');
      await client.query(fs.readFileSync(ESQUEMA_BASE, 'utf8'));
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migraciones (
        id_migracion UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nombre      VARCHAR(200) NOT NULL CONSTRAINT uq_schema_migraciones_nombre UNIQUE,
        aplicada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const aplicadas = new Set(
      (await client.query('SELECT nombre FROM schema_migraciones')).rows.map((r) => r.nombre),
    );

    const archivos = fs
      .readdirSync(CARPETA_MIGRACIONES)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let pendientes = 0;
    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      console.log(`⏩ Aplicando ${archivo}...`);
      await client.query(fs.readFileSync(path.join(CARPETA_MIGRACIONES, archivo), 'utf8'));
      await client.query('INSERT INTO schema_migraciones (nombre) VALUES ($1)', [archivo]);
      pendientes++;
    }

    console.log(
      pendientes === 0
        ? '✅ La base ya estaba al día.'
        : `✅ ${pendientes} migración(es) aplicada(s).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Error aplicando migraciones:', err.message);
  process.exit(1);
});
