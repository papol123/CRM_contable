const bcrypt = require('bcryptjs');
const { crearCliente } = require('./lib/db');

const client = crearCliente();

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
