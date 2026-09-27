/**
 * SEED BASE — datos mínimos para que el sistema funcione.
 *
 *   npm run seed
 *
 * Es idempotente: se puede ejecutar las veces que se quiera; solo inserta lo
 * que falta (por código o nombre) y no borra nada. Incluye:
 *   geografía de Colombia, tipos de documento, unidades, impuestos,
 *   categorías, marcas, bodegas, listas de precios, estados de documentos,
 *   métodos de pago, categorías de gasto, resolución DIAN, roles/permisos
 *   y usuarios de prueba (contraseña Admin123*).
 *
 * Para datos transaccionales de demostración use `npm run seed:demo`.
 */
const bcrypt = require('bcryptjs');
const { crearCliente } = require('./lib/db');
const base = require('./data/base');

const client = crearCliente();
const resumen = {};

function contar(tabla, filas) {
  if (!filas) return;
  resumen[tabla] = (resumen[tabla] || 0) + filas;
}

/** INSERT ... ON CONFLICT DO NOTHING y devuelve el id (nuevo o existente). */
async function upsertPorClave(tabla, columnaId, columnaClave, valores) {
  const columnas = Object.keys(valores);
  const params = columnas.map((_, i) => `$${i + 1}`);
  const res = await client.query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${params.join(', ')})
     ON CONFLICT (${columnaClave}) DO NOTHING RETURNING ${columnaId}`,
    Object.values(valores),
  );
  if (res.rowCount > 0) {
    contar(tabla, 1);
    return res.rows[0][columnaId];
  }
  const existente = await client.query(
    `SELECT ${columnaId} FROM ${tabla} WHERE ${columnaClave} = $1`,
    [valores[columnaClave]],
  );
  return existente.rows[0][columnaId];
}

/** Para tablas sin restricción UNIQUE: busca por las columnas dadas y si no existe inserta. */
async function buscarOInsertar(tabla, columnaId, busqueda, valores = {}) {
  const claves = Object.keys(busqueda);
  const where = claves
    .map((c, i) => (busqueda[c] === null ? `${c} IS NULL` : `${c} = $${i + 1}`))
    .join(' AND ');
  const existente = await client.query(
    `SELECT ${columnaId} FROM ${tabla} WHERE ${where}`,
    claves.map((c) => busqueda[c]).filter((v) => v !== null),
  );
  if (existente.rowCount > 0) return existente.rows[0][columnaId];

  const todo = { ...busqueda, ...valores };
  const columnas = Object.keys(todo);
  const res = await client.query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})
     RETURNING ${columnaId}`,
    Object.values(todo),
  );
  contar(tabla, 1);
  return res.rows[0][columnaId];
}

async function seedGeografia() {
  const ciudades = {};
  for (const pais of base.paises) {
    const idPais = await buscarOInsertar('paises', 'id_pais', { nombre: pais.nombre });
    for (const [departamento, nombresCiudad] of Object.entries(pais.departamentos || {})) {
      const idDep = await buscarOInsertar('departamentos', 'id_departamento', {
        id_pais: idPais,
        nombre: departamento,
      });
      for (const ciudad of nombresCiudad) {
        ciudades[ciudad] = await buscarOInsertar('ciudades', 'id_ciudad', {
          id_departamento: idDep,
          nombre: ciudad,
        });
      }
    }
  }
  return ciudades;
}

async function seedCatalogos(ciudades) {
  for (const t of base.tiposDocumento) {
    await upsertPorClave('tipos_documento', 'id_tipo_documento', 'codigo', t);
  }
  for (const u of base.unidades) {
    await upsertPorClave('unidades_medida', 'id_unidad', 'codigo', u);
  }
  for (const imp of base.impuestos) {
    await buscarOInsertar('impuestos', 'id_impuesto', { codigo: imp.codigo }, {
      porcentaje: imp.porcentaje,
      tipo: imp.tipo,
      vigente_desde: imp.vigente_desde,
    });
  }

  for (const [padre, hijas] of Object.entries(base.categorias)) {
    const idPadre = await buscarOInsertar('categorias_producto', 'id_categoria', {
      nombre: padre,
      id_categoria_padre: null,
    });
    for (const hija of hijas) {
      await buscarOInsertar('categorias_producto', 'id_categoria', {
        nombre: hija,
        id_categoria_padre: idPadre,
      });
    }
  }

  for (const m of base.marcas) {
    await upsertPorClave('marcas', 'id_marca', 'nombre', { nombre: m.nombre, pais_origen: m.pais });
  }
  for (const b of base.bodegas) {
    await upsertPorClave('bodegas', 'id_bodega', 'codigo', {
      codigo: b.codigo,
      nombre: b.nombre,
      id_ciudad: ciudades[b.ciudad] || null,
      activo: true,
    });
  }
  for (const lista of base.listasPrecios) {
    await upsertPorClave('listas_precios', 'id_lista', 'nombre', { nombre: lista });
  }

  for (const e of base.estadosFacturaVenta) {
    await upsertPorClave('estados_factura_venta', 'id_estado', 'codigo', e);
  }
  for (const e of base.estadosFacturaCompra) {
    await upsertPorClave('estados_factura_compra', 'id_estado', 'codigo', e);
  }
  for (const e of base.estadosPago) {
    await upsertPorClave('estados_pago', 'id_estado', 'codigo', e);
  }
  for (const m of base.metodosPago) {
    await upsertPorClave('metodos_pago', 'id_metodo_pago', 'codigo', m);
  }
  for (const c of base.categoriasGasto) {
    await upsertPorClave('categorias_gasto', 'id_categoria_gasto', 'nombre', c);
  }

  const e = base.empresa;
  const empresa = await client.query(
    `INSERT INTO empresa (id, nit, razon_social, nombre_comercial, id_ciudad, direccion, telefono, email,
                          responsable_iva, responsabilidades_fiscales, actividad_economica)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO NOTHING`,
    [e.nit, e.razon_social, e.nombre_comercial, ciudades[e.ciudad] || null, e.direccion, e.telefono,
     e.email, e.responsable_iva, e.responsabilidades_fiscales, e.actividad_economica],
  );
  contar('empresa', empresa.rowCount);

  await buscarOInsertar(
    'resoluciones_dian',
    'id_resolucion',
    { numero_resolucion: base.resolucionDian.numero_resolucion },
    {
      prefijo: base.resolucionDian.prefijo,
      fecha_expedicion: base.resolucionDian.fecha_expedicion,
      rango_desde: base.resolucionDian.rango_desde,
      rango_hasta: base.resolucionDian.rango_hasta,
      vigente_hasta: base.resolucionDian.vigente_hasta,
    },
  );
}

async function seedSeguridad(ciudades) {
  for (const r of base.roles) {
    await upsertPorClave('roles', 'id_rol', 'codigo', r);
  }
  for (const p of base.permisos) {
    await upsertPorClave('permisos', 'id_permiso', 'codigo', p);
  }

  // ADMIN siempre tiene todos los permisos, incluidos los que se agreguen después
  const admin = await client.query(`
    INSERT INTO roles_permisos (id_rol, id_permiso)
    SELECT r.id_rol, p.id_permiso FROM roles r CROSS JOIN permisos p WHERE r.codigo = 'ADMIN'
    ON CONFLICT DO NOTHING`);
  contar('roles_permisos', admin.rowCount);

  const usuario = await client.query(
    `INSERT INTO roles_permisos (id_rol, id_permiso)
     SELECT r.id_rol, p.id_permiso FROM roles r JOIN permisos p ON p.codigo = ANY($1)
      WHERE r.codigo = 'USUARIO'
     ON CONFLICT DO NOTHING`,
    [base.permisosUsuarioOperativo],
  );
  contar('roles_permisos', usuario.rowCount);

  const roles = Object.fromEntries(
    (await client.query('SELECT codigo, id_rol FROM roles')).rows.map((r) => [r.codigo, r.id_rol]),
  );
  const idCC = (await client.query(`SELECT id_tipo_documento FROM tipos_documento WHERE codigo = 'CC'`))
    .rows[0].id_tipo_documento;
  const hash = bcrypt.hashSync(base.passwordUsuarios, 10);

  for (const u of base.usuarios) {
    // El empleado también es un tercero (para nómina y trazabilidad)
    const idTercero = await upsertPorClave('terceros', 'id_tercero', 'numero_documento', {
      id_tipo_documento: idCC,
      numero_documento: u.documento,
      razon_social: `${u.nombres} ${u.apellidos}`,
      tipo_persona: 'NATURAL',
      id_ciudad: ciudades[u.ciudad] || null,
      activo: true,
    });

    const res = await client.query(
      `INSERT INTO usuarios (id_rol, id_tercero, email, password_hash, nombres, apellidos, telefono, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (email) DO UPDATE
          SET password_hash = EXCLUDED.password_hash,
              id_rol = EXCLUDED.id_rol,
              id_tercero = COALESCE(usuarios.id_tercero, EXCLUDED.id_tercero),
              nombres = EXCLUDED.nombres,
              apellidos = EXCLUDED.apellidos,
              telefono = EXCLUDED.telefono,
              activo = true
       RETURNING (xmax = 0) AS insertado`,
      [roles[u.rol], idTercero, u.email, hash, u.nombres, u.apellidos, u.telefono],
    );
    if (res.rows[0].insertado) contar('usuarios', 1);
  }
}

async function main() {
  console.log('🌱 Seed base del CRM Contable');
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT to_regclass('public.marcas') AS tabla`);
    if (!rows[0].tabla) {
      throw new Error('Falta aplicar las migraciones. Ejecute primero: npm run db:migrate');
    }

    await client.query('BEGIN');
    const ciudades = await seedGeografia();
    await seedCatalogos(ciudades);
    await seedSeguridad(ciudades);
    await client.query('COMMIT');

    const insertados = Object.entries(resumen);
    if (insertados.length === 0) {
      console.log('✅ Todo estaba al día; no se insertó nada nuevo.');
    } else {
      console.log('✅ Registros nuevos:');
      for (const [tabla, n] of insertados) console.log(`   - ${tabla.padEnd(24)} ${n}`);
    }
    console.log(`🔑 Usuarios de prueba con contraseña "${base.passwordUsuarios}":`);
    for (const u of base.usuarios) console.log(`   - ${u.email.padEnd(28)} ${u.rol}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Error ejecutando el seed base:', err.message);
  process.exit(1);
});
