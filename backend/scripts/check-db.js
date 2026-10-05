const { crearCliente } = require('./lib/db');

const client = crearCliente();

async function main() {
  try {
    await client.connect();
    console.log('Conexión exitosa a PostgreSQL!');

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    console.log(`Tablas encontradas: ${tablesRes.rows.length}`);
    for (const row of tablesRes.rows) {
      const countRes = await client.query(`SELECT COUNT(*) FROM "${row.table_name}"`);
      console.log(`- ${row.table_name}: ${countRes.rows[0].count} registros`);
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
