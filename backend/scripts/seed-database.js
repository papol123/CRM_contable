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

/**
 * Sentencias fijas por tabla (GEMINI §4.5: prohibido concatenar variables en
 * SQL). Cada entrada declara sus columnas; los valores van solo como $n.
 *   buscar:   SELECT id por la clave natural ($n en el orden de "clave")
 *   insertar: INSERT ... RETURNING id ($n en el orden de "columnas")
 */
const SEMILLA = {
  paises: {
    columnas: ['nombre'],
    clave: ['nombre'],
    buscar: `SELECT id_pais AS id FROM paises WHERE nombre = $1`,
    insertar: `INSERT INTO paises (nombre) VALUES ($1) RETURNING id_pais AS id`,
  },
  departamentos: {
    columnas: ['id_pais', 'nombre'],
    clave: ['id_pais', 'nombre'],
    buscar: `SELECT id_departamento AS id FROM departamentos WHERE id_pais = $1 AND nombre = $2`,
    insertar: `INSERT INTO departamentos (id_pais, nombre) VALUES ($1, $2) RETURNING id_departamento AS id`,
  },
  ciudades: {
    columnas: ['id_departamento', 'nombre'],
    clave: ['id_departamento', 'nombre'],
    buscar: `SELECT id_ciudad AS id FROM ciudades WHERE id_departamento = $1 AND nombre = $2`,
    insertar: `INSERT INTO ciudades (id_departamento, nombre) VALUES ($1, $2) RETURNING id_ciudad AS id`,
  },
  tipos_documento: {
    columnas: ['codigo', 'nombre'],
    clave: ['codigo'],
    buscar: `SELECT id_tipo_documento AS id FROM tipos_documento WHERE codigo = $1`,
    insertar: `INSERT INTO tipos_documento (codigo, nombre) VALUES ($1, $2)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_tipo_documento AS id`,
  },
  unidades_medida: {
    columnas: ['codigo', 'nombre', 'decimales'],
    clave: ['codigo'],
    buscar: `SELECT id_unidad AS id FROM unidades_medida WHERE codigo = $1`,
    insertar: `INSERT INTO unidades_medida (codigo, nombre, decimales) VALUES ($1, $2, $3)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_unidad AS id`,
  },
  impuestos: {
    columnas: ['codigo', 'porcentaje', 'tipo', 'vigente_desde'],
    clave: ['codigo'],
    buscar: `SELECT id_impuesto AS id FROM impuestos WHERE codigo = $1`,
    insertar: `INSERT INTO impuestos (codigo, porcentaje, tipo, vigente_desde) VALUES ($1, $2, $3, $4)
               RETURNING id_impuesto AS id`,
  },
  categorias_producto: {
    columnas: ['nombre', 'id_categoria_padre'],
    clave: ['nombre', 'id_categoria_padre'],
    buscar: `SELECT id_categoria AS id FROM categorias_producto
              WHERE nombre = $1 AND id_categoria_padre IS NOT DISTINCT FROM $2::uuid`,
    insertar: `INSERT INTO categorias_producto (nombre, id_categoria_padre) VALUES ($1, $2)
               RETURNING id_categoria AS id`,
  },
  marcas: {
    columnas: ['nombre', 'pais_origen'],
    clave: ['nombre'],
    buscar: `SELECT id_marca AS id FROM marcas WHERE nombre = $1`,
    insertar: `INSERT INTO marcas (nombre, pais_origen) VALUES ($1, $2)
               ON CONFLICT (nombre) DO NOTHING RETURNING id_marca AS id`,
  },
  bodegas: {
    columnas: ['codigo', 'nombre', 'id_ciudad', 'activo'],
    clave: ['codigo'],
    buscar: `SELECT id_bodega AS id FROM bodegas WHERE codigo = $1`,
    insertar: `INSERT INTO bodegas (codigo, nombre, id_ciudad, activo) VALUES ($1, $2, $3, $4)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_bodega AS id`,
  },
  listas_precios: {
    columnas: ['nombre'],
    clave: ['nombre'],
    buscar: `SELECT id_lista AS id FROM listas_precios WHERE nombre = $1`,
    insertar: `INSERT INTO listas_precios (nombre) VALUES ($1)
               ON CONFLICT (nombre) DO NOTHING RETURNING id_lista AS id`,
  },
  estados_factura_venta: {
    columnas: ['codigo', 'nombre', 'es_final'],
    clave: ['codigo'],
    buscar: `SELECT id_estado AS id FROM estados_factura_venta WHERE codigo = $1`,
    insertar: `INSERT INTO estados_factura_venta (codigo, nombre, es_final) VALUES ($1, $2, $3)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_estado AS id`,
  },
  estados_factura_compra: {
    columnas: ['codigo', 'nombre'],
    clave: ['codigo'],
    buscar: `SELECT id_estado AS id FROM estados_factura_compra WHERE codigo = $1`,
    insertar: `INSERT INTO estados_factura_compra (codigo, nombre) VALUES ($1, $2)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_estado AS id`,
  },
  estados_pago: {
    columnas: ['codigo', 'nombre'],
    clave: ['codigo'],
    buscar: `SELECT id_estado AS id FROM estados_pago WHERE codigo = $1`,
    insertar: `INSERT INTO estados_pago (codigo, nombre) VALUES ($1, $2)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_estado AS id`,
  },
  metodos_pago: {
    columnas: ['codigo', 'nombre', 'afecta_caja'],
    clave: ['codigo'],
    buscar: `SELECT id_metodo_pago AS id FROM metodos_pago WHERE codigo = $1`,
    insertar: `INSERT INTO metodos_pago (codigo, nombre, afecta_caja) VALUES ($1, $2, $3)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_metodo_pago AS id`,
  },
  categorias_gasto: {
    columnas: ['nombre', 'codigo_puc'],
    clave: ['nombre'],
    buscar: `SELECT id_categoria_gasto AS id FROM categorias_gasto WHERE nombre = $1`,
    insertar: `INSERT INTO categorias_gasto (nombre, codigo_puc) VALUES ($1, $2)
               ON CONFLICT (nombre) DO NOTHING RETURNING id_categoria_gasto AS id`,
  },
  resoluciones_dian: {
    columnas: ['numero_resolucion', 'prefijo', 'fecha_expedicion', 'rango_desde', 'rango_hasta', 'vigente_hasta'],
    clave: ['numero_resolucion'],
    buscar: `SELECT id_resolucion AS id FROM resoluciones_dian WHERE numero_resolucion = $1`,
    insertar: `INSERT INTO resoluciones_dian (numero_resolucion, prefijo, fecha_expedicion, rango_desde, rango_hasta, vigente_hasta)
               VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_resolucion AS id`,
  },
  roles: {
    columnas: ['codigo', 'nombre', 'descripcion'],
    clave: ['codigo'],
    buscar: `SELECT id_rol AS id FROM roles WHERE codigo = $1`,
    insertar: `INSERT INTO roles (codigo, nombre, descripcion) VALUES ($1, $2, $3)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_rol AS id`,
  },
  permisos: {
    columnas: ['modulo', 'codigo', 'nombre', 'descripcion'],
    clave: ['codigo'],
    buscar: `SELECT id_permiso AS id FROM permisos WHERE codigo = $1`,
    insertar: `INSERT INTO permisos (modulo, codigo, nombre, descripcion) VALUES ($1, $2, $3, $4)
               ON CONFLICT (codigo) DO NOTHING RETURNING id_permiso AS id`,
  },
  terceros: {
    columnas: ['id_tipo_documento', 'numero_documento', 'razon_social', 'tipo_persona', 'id_ciudad', 'activo'],
    clave: ['numero_documento'],
    buscar: `SELECT id_tercero AS id FROM terceros WHERE numero_documento = $1`,
    insertar: `INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (numero_documento) DO NOTHING RETURNING id_tercero AS id`,
  },
};

/**
 * Devuelve el id del registro con esa clave natural; si no existe lo inserta.
 * Los datos solo pueden traer las columnas declaradas para la tabla.
 */
async function asegurar(tabla, valores) {
  const def = SEMILLA[tabla];
  const sobrantes = Object.keys(valores).filter((c) => !def.columnas.includes(c));
  if (sobrantes.length) throw new Error(`Columnas no declaradas para ${tabla}: ${sobrantes.join(', ')}`);
  const clave = def.clave.map((c) => valores[c] ?? null);

  const existente = await client.query(def.buscar, clave);
  if (existente.rowCount > 0) return existente.rows[0].id;

  const res = await client.query(def.insertar, def.columnas.map((c) => valores[c] ?? null));
  if (res.rowCount > 0) {
    contar(tabla, 1);
    return res.rows[0].id;
  }
  // Otro proceso lo insertó entre la búsqueda y el INSERT (ON CONFLICT DO NOTHING)
  return (await client.query(def.buscar, clave)).rows[0].id;
}

async function seedGeografia() {
  const ciudades = {};
  for (const pais of base.paises) {
    const idPais = await asegurar('paises', { nombre: pais.nombre });
    for (const [departamento, nombresCiudad] of Object.entries(pais.departamentos || {})) {
      const idDep = await asegurar('departamentos', {
        id_pais: idPais,
        nombre: departamento,
      });
      for (const ciudad of nombresCiudad) {
        ciudades[ciudad] = await asegurar('ciudades', {
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
    await asegurar('tipos_documento', t);
  }
  for (const u of base.unidades) {
    await asegurar('unidades_medida', u);
  }
  for (const imp of base.impuestos) {
    await asegurar('impuestos', {
      codigo: imp.codigo,
      porcentaje: imp.porcentaje,
      tipo: imp.tipo,
      vigente_desde: imp.vigente_desde,
    });
  }

  for (const [padre, hijas] of Object.entries(base.categorias)) {
    const idPadre = await asegurar('categorias_producto', {
      nombre: padre,
      id_categoria_padre: null,
    });
    for (const hija of hijas) {
      await asegurar('categorias_producto', {
        nombre: hija,
        id_categoria_padre: idPadre,
      });
    }
  }

  for (const m of base.marcas) {
    await asegurar('marcas', { nombre: m.nombre, pais_origen: m.pais });
  }
  for (const b of base.bodegas) {
    await asegurar('bodegas', {
      codigo: b.codigo,
      nombre: b.nombre,
      id_ciudad: ciudades[b.ciudad] || null,
      activo: true,
    });
  }
  for (const lista of base.listasPrecios) {
    await asegurar('listas_precios', { nombre: lista });
  }

  for (const e of base.estadosFacturaVenta) {
    await asegurar('estados_factura_venta', e);
  }
  for (const e of base.estadosFacturaCompra) {
    await asegurar('estados_factura_compra', e);
  }
  for (const e of base.estadosPago) {
    await asegurar('estados_pago', e);
  }
  for (const m of base.metodosPago) {
    await asegurar('metodos_pago', m);
  }
  for (const c of base.categoriasGasto) {
    await asegurar('categorias_gasto', c);
  }

  const e = base.empresa;
  const empresa = await client.query(
    `INSERT INTO empresa (fila, nit, razon_social, nombre_comercial, id_ciudad, direccion, telefono, email,
                          responsable_iva, responsabilidades_fiscales, actividad_economica)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (fila) DO NOTHING`,
    [e.nit, e.razon_social, e.nombre_comercial, ciudades[e.ciudad] || null, e.direccion, e.telefono,
     e.email, e.responsable_iva, e.responsabilidades_fiscales, e.actividad_economica],
  );
  contar('empresa', empresa.rowCount);

  await asegurar('resoluciones_dian', {
    numero_resolucion: base.resolucionDian.numero_resolucion,
    prefijo: base.resolucionDian.prefijo,
    fecha_expedicion: base.resolucionDian.fecha_expedicion,
    rango_desde: base.resolucionDian.rango_desde,
    rango_hasta: base.resolucionDian.rango_hasta,
    vigente_hasta: base.resolucionDian.vigente_hasta,
  });
}

async function seedSeguridad(ciudades) {
  for (const r of base.roles) {
    await asegurar('roles', r);
  }
  for (const p of base.permisos) {
    await asegurar('permisos', p);
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
    const idTercero = await asegurar('terceros', {
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
