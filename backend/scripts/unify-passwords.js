const bcrypt = require('bcryptjs');
const { crearCliente } = require('./lib/db');

const client = crearCliente();

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
