const { crearCliente } = require('./lib/db');

const client = crearCliente();

async function main() {
  try {
    await client.connect();
    console.log('Conexión exitosa a PostgreSQL!');

    // Consulta fija (GEMINI §4.5): filas vivas por tabla según las estadísticas de PostgreSQL
    const tablesRes = await client.query(`
      SELECT relname AS table_name, n_live_tup AS registros
        FROM pg_stat_user_tables
       WHERE schemaname = 'public'
       ORDER BY relname
    `);

    console.log(`Tablas encontradas: ${tablesRes.rows.length}`);
    for (const row of tablesRes.rows) {
      console.log(`- ${row.table_name}: ~${row.registros} registros`);
    }

    const usersRes = await client.query(`SELECT email, nombres, apellidos, id_rol FROM usuarios`);
    console.log('\nUsuarios existentes:', usersRes.rows);

    const rolesRes = await client.query(`SELECT id_rol, codigo, nombre FROM roles`);
    console.log('\nRoles existentes:', rolesRes.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

main();
