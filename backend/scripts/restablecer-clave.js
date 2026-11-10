/**
 * Lista los usuarios o restablece la contraseña de UNO (por defecto en Cloud SQL).
 *
 *   npm run usuarios                                    # lista correos, rol y estado
 *   npm run usuarios -- admin@crmcontable.com           # pone la clave Admin123* y activa la cuenta
 *   npm run usuarios -- admin@crmcontable.com --clave=OtraClave2026*
 *   (agregue --local para la base embebida de npm run db:local)
 *
 * Requiere conexión directa a la base: en Cloud SQL, la IP pública de este equipo
 * debe estar autorizada (scripts/autorizar-ip.ps1). El cambio queda en la bitácora.
 */
const bcrypt = require('bcryptjs');
const { crearCliente, ayudaConexion } = require('./lib/db');

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
const clave = (args.find((a) => a.startsWith('--clave=')) || '--clave=Admin123*').slice('--clave='.length);

async function main() {
  const client = crearCliente();
  await client.connect();
  console.log(`🔌 Base: ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'crm_contable'}\n`);
  try {
    if (!email) {
      const { rows } = await client.query(
        `SELECT u.email, r.codigo AS rol, u.activo, u.ultimo_login,
                NULLIF(TRIM(CONCAT(u.nombres, ' ', u.apellidos)), '') AS nombre
           FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
          ORDER BY r.codigo, u.email`,
      );
      if (!rows.length) {
        console.log('No hay usuarios. Cargue los datos iniciales con: npm run seed');
        return;
      }
      console.log('Usuarios registrados:');
      for (const u of rows) {
        const ultimo = u.ultimo_login ? new Date(u.ultimo_login).toLocaleString('es-CO') : 'nunca';
        console.log(`  ${u.activo ? '✔' : '✖'} ${u.email.padEnd(32)} ${u.rol.padEnd(9)} ${u.nombre || ''}  (último ingreso: ${ultimo})`);
      }
      console.log('\nPara restablecer una clave: npm run usuarios -- <correo> [--clave=NuevaClave]');
      return;
    }

    if (clave.length < 8) throw new Error('La clave debe tener al menos 8 caracteres');
    const hash = bcrypt.hashSync(clave, 10);
    const { rows } = await client.query(
      `UPDATE usuarios SET password_hash = $1, activo = true, actualizado_en = now()
        WHERE LOWER(email) = $2
        RETURNING id_usuario, email`,
      [hash, email],
    );
    if (!rows.length) {
      console.log(`❌ No existe el usuario ${email}. Ejecute "npm run usuarios" para ver los correos registrados.`);
      process.exitCode = 1;
      return;
    }
    await client
      .query(
        `INSERT INTO bitacora_auditoria (id_usuario, accion, recurso, id_recurso, motivo, resultado)
         VALUES (NULL, 'RESTABLECER_CLAVE_CONSOLA', 'usuarios', $1, 'Clave restablecida con scripts/restablecer-clave.js', 'EXITOSO')`,
        [rows[0].id_usuario],
      )
      .catch(() => {}); // la bitácora no debe impedir el restablecimiento
    console.log(`✅ Clave de ${rows[0].email} restablecida y cuenta activada.`);
    console.log('   Si la cuenta quedó bloqueada por intentos fallidos, espere 15 minutos o vuelva a desplegar.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  const ayuda = ayudaConexion(err);
  if (ayuda) console.error(`   ${ayuda}`);
  process.exit(1);
});
