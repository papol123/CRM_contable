const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const client = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function setStandardPasswords() {
  try {
    await client.connect();
    console.log('✅ Conectado a PostgreSQL.');

    const standardPassword = 'Admin123*';
    const passwordHash = bcrypt.hashSync(standardPassword, 10);

    const updateRes = await client.query(`
      UPDATE usuarios 
      SET password_hash = $1, activo = true
      RETURNING email, nombres, apellidos;
    `, [passwordHash]);

    console.log(`🔑 Contraseña actualizada exitosamente a "${standardPassword}" para ${updateRes.rows.length} usuarios:`);
    for (const u of updateRes.rows) {
      console.log(`  - ${u.email} (${u.nombres} ${u.apellidos})`);
    }

  } catch (err) {
    console.error('❌ Error actualizando contraseñas:', err);
  } finally {
    await client.end();
  }
}

setStandardPasswords();
