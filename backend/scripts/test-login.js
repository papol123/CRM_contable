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

async function testLogins() {
  console.log('🧪 Probando verificación de contraseñas de usuarios en BD...');
  await client.connect();

  const testCases = [
    { email: 'admin@crmcontable.com', pass: 'Admin123*', expectedRol: 'ADMIN' },
    { email: 'gerencia@crmcontable.com', pass: 'Admin123*', expectedRol: 'ADMIN' },
    { email: 'usuario@crmcontable.com', pass: 'Admin123*', expectedRol: 'USUARIO' },
    { email: 'vendedor@crmcontable.com', pass: 'Admin123*', expectedRol: 'USUARIO' },
    { email: 'operador@crmcontable.com', pass: 'Admin123*', expectedRol: 'USUARIO' },
    { email: 'caja@crmcontable.com', pass: 'Admin123*', expectedRol: 'USUARIO' },
  ];

  for (const tc of testCases) {
    const res = await client.query(`
      SELECT u.id_usuario, u.email, u.nombres, u.apellidos, u.password_hash, u.activo, r.codigo as rol
      FROM usuarios u
      JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.email = $1
    `, [tc.email]);

    if (res.rows.length === 0) {
      console.error(`❌ Usuario no encontrado: ${tc.email}`);
      continue;
    }

    const user = res.rows[0];
    const match = await bcrypt.compare(tc.pass, user.password_hash);
    if (match && user.activo && user.rol === tc.expectedRol) {
      console.log(`✅ [OK] ${user.email.padEnd(26)} | Rol: ${user.rol.padEnd(7)} | Nombre: ${user.nombres} ${user.apellidos} | Activo: ${user.activo}`);
    } else {
      console.error(`❌ [FALLO] ${tc.email}: Coincide pass: ${match}, Activo: ${user.activo}, Rol: ${user.rol}`);
    }
  }

  await client.end();
}

testLogins();
