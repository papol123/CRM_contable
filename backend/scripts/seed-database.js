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

async function runSeed() {
  console.log('====================================================');
  console.log('🚀 Iniciando script de Seed para CRM Contable');
  console.log('====================================================');

  try {
    await client.connect();
    console.log('✅ Conectado exitosamente a PostgreSQL.');

    await client.query('BEGIN');

    // =========================================================================
    // 1. GEOGRAFÍA
    // =========================================================================
    console.log('📍 1/13. Insertando datos de geografía...');
    const pCol = await client.query(`INSERT INTO paises (nombre) VALUES ('Colombia') RETURNING id_pais;`);
    const pEcu = await client.query(`INSERT INTO paises (nombre) VALUES ('Ecuador') RETURNING id_pais;`);
    const pPer = await client.query(`INSERT INTO paises (nombre) VALUES ('Perú') RETURNING id_pais;`);
    const colId = pCol.rows[0].id_pais;

    const dBog = await client.query(`INSERT INTO departamentos (id_pais, nombre) VALUES ($1, 'Bogotá D.C.') RETURNING id_departamento;`, [colId]);
    const dAnt = await client.query(`INSERT INTO departamentos (id_pais, nombre) VALUES ($1, 'Antioquia') RETURNING id_departamento;`, [colId]);
    const dVal = await client.query(`INSERT INTO departamentos (id_pais, nombre) VALUES ($1, 'Valle del Cauca') RETURNING id_departamento;`, [colId]);
    const dSan = await client.query(`INSERT INTO departamentos (id_pais, nombre) VALUES ($1, 'Santander') RETURNING id_departamento;`, [colId]);
    const dAtl = await client.query(`INSERT INTO departamentos (id_pais, nombre) VALUES ($1, 'Atlántico') RETURNING id_departamento;`, [colId]);

    const cBog = await client.query(`INSERT INTO ciudades (id_departamento, nombre) VALUES ($1, 'Bogotá') RETURNING id_ciudad;`, [dBog.rows[0].id_departamento]);
    const cMed = await client.query(`INSERT INTO ciudades (id_departamento, nombre) VALUES ($1, 'Medellín') RETURNING id_ciudad;`, [dAnt.rows[0].id_departamento]);
    const cBel = await client.query(`INSERT INTO ciudades (id_departamento, nombre) VALUES ($1, 'Bello') RETURNING id_ciudad;`, [dAnt.rows[0].id_departamento]);
    const cCal = await client.query(`INSERT INTO ciudades (id_departamento, nombre) VALUES ($1, 'Cali') RETURNING id_ciudad;`, [dVal.rows[0].id_departamento]);
    const cBuc = await client.query(`INSERT INTO ciudades (id_departamento, nombre) VALUES ($1, 'Bucaramanga') RETURNING id_ciudad;`, [dSan.rows[0].id_departamento]);
    const cBar = await client.query(`INSERT INTO ciudades (id_departamento, nombre) VALUES ($1, 'Barranquilla') RETURNING id_ciudad;`, [dAtl.rows[0].id_departamento]);

    const ciudadBogota = cBog.rows[0].id_ciudad;
    const ciudadMedellin = cMed.rows[0].id_ciudad;
    const ciudadCali = cCal.rows[0].id_ciudad;
    const ciudadBucaramanga = cBuc.rows[0].id_ciudad;

    // =========================================================================
    // 2. TIPOS DE DOCUMENTO
    // =========================================================================
    console.log('🪪 2/13. Insertando tipos de documento...');
    const tNit = await client.query(`INSERT INTO tipos_documento (codigo, nombre) VALUES ('NIT', 'Número de Identificación Tributaria') RETURNING id_tipo_documento;`);
    const tCC = await client.query(`INSERT INTO tipos_documento (codigo, nombre) VALUES ('CC', 'Cédula de Ciudadanía') RETURNING id_tipo_documento;`);
    const tCE = await client.query(`INSERT INTO tipos_documento (codigo, nombre) VALUES ('CE', 'Cédula de Extranjería') RETURNING id_tipo_documento;`);
    const tPas = await client.query(`INSERT INTO tipos_documento (codigo, nombre) VALUES ('PAS', 'Pasaporte') RETURNING id_tipo_documento;`);

    const nitTipo = tNit.rows[0].id_tipo_documento;
    const ccTipo = tCC.rows[0].id_tipo_documento;

    // =========================================================================
    // 3. TERCEROS, CLIENTES, PROVEEDORES, CONTACTOS, TELÉFONOS, EMAILS, DIRECCIONES
    // =========================================================================
    console.log('🏢 3/13. Insertando terceros, clientes, proveedores y contactos...');

    // Proveedores
    const p1 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '900123456-1', 'Distribuidora Automotriz de Colombia SAS', 'JURIDICA', $2, true) RETURNING id_tercero;`, [nitTipo, ciudadBogota]);
    const p2 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '900789012-3', 'Importadora Frenos & Suspensiones del Valle SAS', 'JURIDICA', $2, true) RETURNING id_tercero;`, [nitTipo, ciudadCali]);
    const p3 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '900456123-5', 'Lubricantes y Filtros Industriales SA', 'JURIDICA', $2, true) RETURNING id_tercero;`, [nitTipo, ciudadMedellin]);

    const provDistribuidora = p1.rows[0].id_tercero;
    const provFrenos = p2.rows[0].id_tercero;
    const provLubricantes = p3.rows[0].id_tercero;

    // Clientes
    const c1 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '901234567-8', 'Taller Mecánico Especializado El Pistón SAS', 'JURIDICA', $2, true) RETURNING id_tercero;`, [nitTipo, ciudadBogota]);
    const c2 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '901876543-2', 'Flota de Transporte Metropolitano SA', 'JURIDICA', $2, true) RETURNING id_tercero;`, [nitTipo, ciudadMedellin]);
    const c3 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '901999888-9', 'AutoServicios Santander SAS', 'JURIDICA', $2, true) RETURNING id_tercero;`, [nitTipo, ciudadBucaramanga]);
    const c4 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '1018456789', 'Juan Pablo Montoya Pérez', 'NATURAL', $2, true) RETURNING id_tercero;`, [ccTipo, ciudadBogota]);
    const c5 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '1020304050', 'Carlos Alberto Rodríguez Ruiz', 'NATURAL', $2, true) RETURNING id_tercero;`, [ccTipo, ciudadMedellin]);
    const c6 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '1032405060', 'Diana Marcela Torres Gómez', 'NATURAL', $2, true) RETURNING id_tercero;`, [ccTipo, ciudadBogota]);

    const clientePiston = c1.rows[0].id_tercero;
    const clienteFlota = c2.rows[0].id_tercero;
    const clienteSantander = c3.rows[0].id_tercero;
    const clienteMontoya = c4.rows[0].id_tercero;
    const clienteRodriguez = c5.rows[0].id_tercero;
    const clienteTorres = c6.rows[0].id_tercero;

    // Terceros asociados a Usuarios / Personal
    const u1 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '1014234567', 'Carlos Andrés Pérez Gómez', 'NATURAL', $2, true) RETURNING id_tercero;`, [ccTipo, ciudadBogota]);
    const u2 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '1020567890', 'María Fernanda Morales Castro', 'NATURAL', $2, true) RETURNING id_tercero;`, [ccTipo, ciudadBogota]);
    const u3 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '1035678901', 'Juan Camilo Gómez Restrepo', 'NATURAL', $2, true) RETURNING id_tercero;`, [ccTipo, ciudadMedellin]);
    const u4 = await client.query(`INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo) VALUES ($1, '1047890123', 'Laura Daniela Ortiz Prada', 'NATURAL', $2, true) RETURNING id_tercero;`, [ccTipo, ciudadBogota]);

    const empleadoAdmin = u1.rows[0].id_tercero;
    const empleadoGerente = u2.rows[0].id_tercero;
    const empleadoUsuario = u3.rows[0].id_tercero;
    const empleadoVendedor = u4.rows[0].id_tercero;

    // Inserción en tabla proveedores
    const pr1 = await client.query(`INSERT INTO proveedores (id_tercero, dias_plazo) VALUES ($1, 30) RETURNING id_proveedor;`, [provDistribuidora]);
    const pr2 = await client.query(`INSERT INTO proveedores (id_tercero, dias_plazo) VALUES ($1, 45) RETURNING id_proveedor;`, [provFrenos]);
    const pr3 = await client.query(`INSERT INTO proveedores (id_tercero, dias_plazo) VALUES ($1, 60) RETURNING id_proveedor;`, [provLubricantes]);

    const provDistribuidoraId = pr1.rows[0].id_proveedor;
    const provFrenosId = pr2.rows[0].id_proveedor;
    const provLubricantesId = pr3.rows[0].id_proveedor;

    // Inserción en tabla clientes
    const cl1 = await client.query(`INSERT INTO clientes (id_tercero, cupo_credito, dias_plazo) VALUES ($1, 25000000.00, 30) RETURNING id_cliente;`, [clientePiston]);
    const cl2 = await client.query(`INSERT INTO clientes (id_tercero, cupo_credito, dias_plazo) VALUES ($1, 50000000.00, 45) RETURNING id_cliente;`, [clienteFlota]);
    const cl3 = await client.query(`INSERT INTO clientes (id_tercero, cupo_credito, dias_plazo) VALUES ($1, 15000000.00, 15) RETURNING id_cliente;`, [clienteSantander]);
    const cl4 = await client.query(`INSERT INTO clientes (id_tercero, cupo_credito, dias_plazo) VALUES ($1, 5000000.00, 0) RETURNING id_cliente;`, [clienteMontoya]);
    const cl5 = await client.query(`INSERT INTO clientes (id_tercero, cupo_credito, dias_plazo) VALUES ($1, 3000000.00, 0) RETURNING id_cliente;`, [clienteRodriguez]);
    const cl6 = await client.query(`INSERT INTO clientes (id_tercero, cupo_credito, dias_plazo) VALUES ($1, 2000000.00, 0) RETURNING id_cliente;`, [clienteTorres]);

    const clientePistonId = cl1.rows[0].id_cliente;
    const clienteFlotaId = cl2.rows[0].id_cliente;
    const clienteMontoyaId = cl4.rows[0].id_cliente;

    // Contactos
    const ct1 = await client.query(`INSERT INTO contactos (id_tercero, nombre, cargo, principal) VALUES ($1, 'Roberto Méndez', 'Director de Ventas Mayoristas', true) RETURNING id_contacto;`, [provDistribuidora]);
    const ct2 = await client.query(`INSERT INTO contactos (id_tercero, nombre, cargo, principal) VALUES ($1, 'Camila Sandoval', 'Jefe de Logística y Despachos', true) RETURNING id_contacto;`, [provFrenos]);
    const ct3 = await client.query(`INSERT INTO contactos (id_tercero, nombre, cargo, principal) VALUES ($1, 'Mauricio Henao', 'Gerente de Cuentas Corporativas', true) RETURNING id_contacto;`, [provLubricantes]);
    const ct4 = await client.query(`INSERT INTO contactos (id_tercero, nombre, cargo, principal) VALUES ($1, 'Pedro Navas', 'Jefe de Taller', true) RETURNING id_contacto;`, [clientePiston]);
    const ct5 = await client.query(`INSERT INTO contactos (id_tercero, nombre, cargo, principal) VALUES ($1, 'Alfonso Gómez', 'Director de Mantenimiento de Flota', true) RETURNING id_contacto;`, [clienteFlota]);

    const contactoPiston = ct4.rows[0].id_contacto;

    // Teléfonos
    await client.query(`INSERT INTO telefonos (id_tercero, id_contacto, numero, tipo, principal) VALUES ($1, null, '6013456789', 'FIJO', true);`, [provDistribuidora]);
    await client.query(`INSERT INTO telefonos (id_tercero, id_contacto, numero, tipo, principal) VALUES ($1, null, '6042345678', 'FIJO', true);`, [provFrenos]);
    await client.query(`INSERT INTO telefonos (id_tercero, id_contacto, numero, tipo, principal) VALUES ($1, null, '6028765432', 'FIJO', true);`, [provLubricantes]);
    await client.query(`INSERT INTO telefonos (id_tercero, id_contacto, numero, tipo, principal) VALUES ($1, $2, '3109876543', 'MOVIL', true);`, [clientePiston, contactoPiston]);
    await client.query(`INSERT INTO telefonos (id_tercero, id_contacto, numero, tipo, principal) VALUES ($1, null, '3157891234', 'MOVIL', true);`, [clienteMontoya]);
    await client.query(`INSERT INTO telefonos (id_tercero, id_contacto, numero, tipo, principal) VALUES ($1, null, '3001234567', 'MOVIL', true);`, [empleadoAdmin]);

    // Emails
    await client.query(`INSERT INTO emails (id_tercero, id_contacto, email, tipo, principal) VALUES ($1, null, 'ventas@distribuidoraauto.com.co', 'VENTAS', true);`, [provDistribuidora]);
    await client.query(`INSERT INTO emails (id_tercero, id_contacto, email, tipo, principal) VALUES ($1, null, 'pedidos@frenosdelvalle.com', 'PEDIDOS', true);`, [provFrenos]);
    await client.query(`INSERT INTO emails (id_tercero, id_contacto, email, tipo, principal) VALUES ($1, null, 'contacto@lubricantesind.com', 'GENERAL', true);`, [provLubricantes]);
    await client.query(`INSERT INTO emails (id_tercero, id_contacto, email, tipo, principal) VALUES ($1, $2, 'pedro.navas@tallerpiston.com', 'FACTURACION', true);`, [clientePiston, contactoPiston]);
    await client.query(`INSERT INTO emails (id_tercero, id_contacto, email, tipo, principal) VALUES ($1, null, 'jp.montoya@gmail.com', 'PERSONAL', true);`, [clienteMontoya]);

    // Direcciones
    await client.query(`INSERT INTO direcciones (id_tercero, id_ciudad, direccion, tipo, principal) VALUES ($1, $2, 'Calle 72 # 24 - 15 Barrio 7 de Agosto', 'PRINCIPAL', true);`, [provDistribuidora, ciudadBogota]);
    await client.query(`INSERT INTO direcciones (id_tercero, id_ciudad, direccion, tipo, principal) VALUES ($1, $2, 'Carrera 50 # 32 - 10 Autopista Sur', 'BODEGA', true);`, [provFrenos, ciudadCali]);
    await client.query(`INSERT INTO direcciones (id_tercero, id_ciudad, direccion, tipo, principal) VALUES ($1, $2, 'Avenida 6 Norte # 28 - 45', 'OFICINA', true);`, [provLubricantes, ciudadMedellin]);
    await client.query(`INSERT INTO direcciones (id_tercero, id_ciudad, direccion, tipo, principal) VALUES ($1, $2, 'Carrera 28 # 63G - 12 Zona Industrial', 'TALLER', true);`, [clientePiston, ciudadBogota]);
    await client.query(`INSERT INTO direcciones (id_tercero, id_ciudad, direccion, tipo, principal) VALUES ($1, $2, 'Calle 134 # 45 - 20 Apto 402', 'RESIDENCIAL', true);`, [clienteMontoya, ciudadBogota]);

    // =========================================================================
    // 4. UNIDADES DE MEDIDA E IMPUESTOS
    // =========================================================================
    console.log('📦 4/13. Insertando unidades de medida e impuestos...');
    const uUnd = await client.query(`INSERT INTO unidades_medida (codigo, nombre, decimales) VALUES ('UND', 'Unidad', 0) RETURNING id_unidad;`);
    const uJgo = await client.query(`INSERT INTO unidades_medida (codigo, nombre, decimales) VALUES ('JGO', 'Juego / Kit', 0) RETURNING id_unidad;`);
    const uGal = await client.query(`INSERT INTO unidades_medida (codigo, nombre, decimales) VALUES ('GAL', 'Galón', 2) RETURNING id_unidad;`);
    const uLit = await client.query(`INSERT INTO unidades_medida (codigo, nombre, decimales) VALUES ('LIT', 'Litro', 2) RETURNING id_unidad;`);
    const uPar = await client.query(`INSERT INTO unidades_medida (codigo, nombre, decimales) VALUES ('PAR', 'Par', 0) RETURNING id_unidad;`);

    const undId = uUnd.rows[0].id_unidad;
    const jgoId = uJgo.rows[0].id_unidad;
    const litId = uLit.rows[0].id_unidad;
    const galId = uGal.rows[0].id_unidad;

    const imp19 = await client.query(`INSERT INTO impuestos (codigo, porcentaje, tipo, vigente_desde) VALUES ('IVA_19', 19.00, 'IVA GENERAL', '2020-01-01') RETURNING id_impuesto;`);
    const imp5 = await client.query(`INSERT INTO impuestos (codigo, porcentaje, tipo, vigente_desde) VALUES ('IVA_5', 5.00, 'IVA REDUCIDO', '2020-01-01') RETURNING id_impuesto;`);
    const imp0 = await client.query(`INSERT INTO impuestos (codigo, porcentaje, tipo, vigente_desde) VALUES ('IVA_0', 0.00, 'EXENTO', '2020-01-01') RETURNING id_impuesto;`);

    const iva19Id = imp19.rows[0].id_impuesto;

    // =========================================================================
    // 5. CATEGORÍAS DE PRODUCTO Y BODEGAS
    // =========================================================================
    console.log('🏷️ 5/13. Insertando categorías y bodegas...');
    const cat1 = await client.query(`INSERT INTO categorias_producto (nombre) VALUES ('Repuestos Mecánicos') RETURNING id_categoria;`);
    const cat2 = await client.query(`INSERT INTO categorias_producto (nombre) VALUES ('Lubricantes y Químicos') RETURNING id_categoria;`);
    const cat3 = await client.query(`INSERT INTO categorias_producto (nombre) VALUES ('Eléctricos y Electrónica') RETURNING id_categoria;`);

    const catMecanicos = cat1.rows[0].id_categoria;
    const catLubricantes = cat2.rows[0].id_categoria;
    const catElectricos = cat3.rows[0].id_categoria;

    const sub1 = await client.query(`INSERT INTO categorias_producto (id_categoria_padre, nombre) VALUES ($1, 'Frenos y Discos') RETURNING id_categoria;`, [catMecanicos]);
    const sub2 = await client.query(`INSERT INTO categorias_producto (id_categoria_padre, nombre) VALUES ($1, 'Suspensión y Dirección') RETURNING id_categoria;`, [catMecanicos]);
    const sub3 = await client.query(`INSERT INTO categorias_producto (id_categoria_padre, nombre) VALUES ($1, 'Motor y Transmisión') RETURNING id_categoria;`, [catMecanicos]);
    const sub4 = await client.query(`INSERT INTO categorias_producto (id_categoria_padre, nombre) VALUES ($1, 'Aceites de Motor') RETURNING id_categoria;`, [catLubricantes]);
    const sub5 = await client.query(`INSERT INTO categorias_producto (id_categoria_padre, nombre) VALUES ($1, 'Baterías y Alternadores') RETURNING id_categoria;`, [catElectricos]);
    const sub6 = await client.query(`INSERT INTO categorias_producto (id_categoria_padre, nombre) VALUES ($1, 'Bujías e Ignición') RETURNING id_categoria;`, [catElectricos]);

    const catFrenos = sub1.rows[0].id_categoria;
    const catSuspension = sub2.rows[0].id_categoria;
    const catMotor = sub3.rows[0].id_categoria;
    const catAceites = sub4.rows[0].id_categoria;
    const catBaterias = sub5.rows[0].id_categoria;
    const catBujias = sub6.rows[0].id_categoria;

    const bod1 = await client.query(`INSERT INTO bodegas (codigo, nombre, id_ciudad, activo) VALUES ('BOD-BOG-01', 'Bodega Principal Bogotá 7 de Agosto', $1, true) RETURNING id_bodega;`, [ciudadBogota]);
    const bod2 = await client.query(`INSERT INTO bodegas (codigo, nombre, id_ciudad, activo) VALUES ('BOD-MED-01', 'Bodega Regional Antioquia Calle 33', $1, true) RETURNING id_bodega;`, [ciudadMedellin]);
    const bod3 = await client.query(`INSERT INTO bodegas (codigo, nombre, id_ciudad, activo) VALUES ('BOD-CAL-01', 'Bodega Valle del Cauca Acopi', $1, true) RETURNING id_bodega;`, [ciudadCali]);

    const bodegaBogota = bod1.rows[0].id_bodega;
    const bodegaMedellin = bod2.rows[0].id_bodega;

    // =========================================================================
    // 6. PRODUCTOS, PRODUCTO_PROVEEDOR, LISTAS DE PRECIOS Y PRECIOS
    // =========================================================================
    console.log('🔧 6/13. Insertando catálogo de repuestos y precios...');

    const prodDefs = [
      { codigo: 'REP-FRE-001', nombre: 'Pastillas de Freno Delanteras Brembo Cerámica', cat: catFrenos, uni: jgoId, min: 10, costo: 120000.00, pPub: 185000.00, pMay: 150000.00, pFlo: 140000.00, prov: provFrenosId, codProv: 'BRM-P06024N' },
      { codigo: 'REP-FRE-002', nombre: 'Disco de Freno Ventilado Delantero Fremax', cat: catFrenos, uni: undId, min: 6, costo: 185000.00, pPub: 275000.00, pMay: 225000.00, pFlo: 210000.00, prov: provFrenosId, codProv: 'FMX-BD5421' },
      { codigo: 'REP-SUS-001', nombre: 'Amortiguador Delantero a Gas Monroe OESpectrum', cat: catSuspension, uni: undId, min: 8, costo: 210000.00, pPub: 320000.00, pMay: 260000.00, pFlo: 245000.00, prov: provFrenosId, codProv: 'MNR-72345' },
      { codigo: 'REP-SUS-002', nombre: 'Terminal de Dirección Izquierda 555 Japón', cat: catSuspension, uni: undId, min: 12, costo: 65000.00, pPub: 105000.00, pMay: 85000.00, pFlo: 80000.00, prov: provDistribuidoraId, codProv: '555-SE3451' },
      { codigo: 'REP-MOT-001', nombre: 'Kit de Embrague Completo (Disco, Prensa, Balinera) Valeo', cat: catMotor, uni: jgoId, min: 4, costo: 430000.00, pPub: 620000.00, pMay: 510000.00, pFlo: 480000.00, prov: provDistribuidoraId, codProv: 'VAL-826350' },
      { codigo: 'REP-LUB-001', nombre: 'Aceite Sintético para Motor Mobil 1 5W-30 (1 Litro)', cat: catAceites, uni: litId, min: 24, costo: 38000.00, pPub: 58000.00, pMay: 46000.00, pFlo: 43000.00, prov: provLubricantesId, codProv: 'MOB-15W30-1L' },
      { codigo: 'REP-LUB-002', nombre: 'Aceite Semisintético Castrol Magnatec 10W-40 (1 Galón)', cat: catAceites, uni: galId, min: 15, costo: 115000.00, pPub: 175000.00, pMay: 145000.00, pFlo: 135000.00, prov: provLubricantesId, codProv: 'CAS-10W40-1G' },
      { codigo: 'REP-ELE-001', nombre: 'Batería Automotriz Mac Silver Plus 12V 800AMP', cat: catBaterias, uni: undId, min: 5, costo: 310000.00, pPub: 440000.00, pMay: 365000.00, pFlo: 350000.00, prov: provDistribuidoraId, codProv: 'MAC-NS60-800' },
      { codigo: 'REP-ELE-002', nombre: 'Juego de 4 Bujías de Iridio NGK Laser Iridium', cat: catBujias, uni: jgoId, min: 16, costo: 110000.00, pPub: 160000.00, pMay: 130000.00, pFlo: 125000.00, prov: provDistribuidoraId, codProv: 'NGK-ILKAR7B11' },
      { codigo: 'REP-FIL-001', nombre: 'Filtro de Aceite de Alto Rendimiento Bosch', cat: catMotor, uni: undId, min: 20, costo: 22000.00, pPub: 36000.00, pMay: 28000.00, pFlo: 26000.00, prov: provLubricantesId, codProv: 'BOS-0986AF0' }
    ];

    const lp1 = await client.query(`INSERT INTO listas_precios (nombre) VALUES ('Precio Público / Mostrador') RETURNING id_lista;`);
    const lp2 = await client.query(`INSERT INTO listas_precios (nombre) VALUES ('Precio Taller / Mayorista') RETURNING id_lista;`);
    const lp3 = await client.query(`INSERT INTO listas_precios (nombre) VALUES ('Precio Flotas y Convenios') RETURNING id_lista;`);

    const idLpPub = lp1.rows[0].id_lista;
    const idLpMay = lp2.rows[0].id_lista;
    const idLpFlo = lp3.rows[0].id_lista;

    const productosMap = {};

    for (const p of prodDefs) {
      const pRes = await client.query(`
        INSERT INTO productos (codigo, nombre, id_categoria, id_unidad, id_impuesto_venta, maneja_inventario, stock_minimo, activo)
        VALUES ($1, $2, $3, $4, $5, true, $6, true)
        RETURNING id_producto;
      `, [p.codigo, p.nombre, p.cat, p.uni, iva19Id, p.min]);

      const idProd = pRes.rows[0].id_producto;
      productosMap[p.codigo] = idProd;

      // Proveedor del producto
      await client.query(`
        INSERT INTO producto_proveedor (id_producto, id_proveedor, codigo_proveedor, costo_actual, dias_entrega, es_principal)
        VALUES ($1, $2, $3, $4, 3, true);
      `, [idProd, p.prov, p.codProv, p.costo]);

      // Precios
      await client.query(`INSERT INTO precios_producto (id_lista, id_producto, precio, vigente_desde) VALUES ($1, $2, $3, '2026-01-01');`, [idLpPub, idProd, p.pPub]);
      await client.query(`INSERT INTO precios_producto (id_lista, id_producto, precio, vigente_desde) VALUES ($1, $2, $3, '2026-01-01');`, [idLpMay, idProd, p.pMay]);
      await client.query(`INSERT INTO precios_producto (id_lista, id_producto, precio, vigente_desde) VALUES ($1, $2, $3, '2026-01-01');`, [idLpFlo, idProd, p.pFlo]);
    }

    // =========================================================================
    // 7. MOVIMIENTOS DE INVENTARIO
    // =========================================================================
    console.log('📊 7/13. Insertando movimientos de inventario...');
    const movs = [
      { prod: productosMap['REP-FRE-001'], bod: bodegaBogota, tipo: 'ENTRADA_COMPRA', cant: 50.000, costo: 120000.00 },
      { prod: productosMap['REP-FRE-002'], bod: bodegaBogota, tipo: 'ENTRADA_COMPRA', cant: 30.000, costo: 185000.00 },
      { prod: productosMap['REP-SUS-001'], bod: bodegaBogota, tipo: 'ENTRADA_COMPRA', cant: 25.000, costo: 210000.00 },
      { prod: productosMap['REP-MOT-001'], bod: bodegaBogota, tipo: 'ENTRADA_COMPRA', cant: 15.000, costo: 430000.00 },
      { prod: productosMap['REP-LUB-001'], bod: bodegaBogota, tipo: 'ENTRADA_COMPRA', cant: 100.000, costo: 38000.00 },
      { prod: productosMap['REP-ELE-001'], bod: bodegaBogota, tipo: 'ENTRADA_COMPRA', cant: 20.000, costo: 310000.00 },
      { prod: productosMap['REP-ELE-002'], bod: bodegaBogota, tipo: 'ENTRADA_COMPRA', cant: 40.000, costo: 110000.00 },
      { prod: productosMap['REP-FRE-001'], bod: bodegaMedellin, tipo: 'TRASLADO_ENTRADA', cant: 15.000, costo: 120000.00 },
      { prod: productosMap['REP-LUB-001'], bod: bodegaMedellin, tipo: 'TRASLADO_ENTRADA', cant: 30.000, costo: 38000.00 }
    ];

    for (const m of movs) {
      await client.query(`
        INSERT INTO movimientos_inventario (id_producto, id_bodega, tipo_movimiento, cantidad, costo_unitario, fecha, origen_tabla)
        VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '5 days', 'facturas_compra');
      `, [m.prod, m.bod, m.tipo, m.cant, m.costo]);
    }

    // =========================================================================
    // 8. RESOLUCIONES DIAN Y ESTADOS DE DOCUMENTOS
    // =========================================================================
    console.log('📜 8/13. Insertando resoluciones DIAN y estados...');
    const rDian = await client.query(`
      INSERT INTO resoluciones_dian (prefijo, numero_resolucion, fecha_expedicion, rango_desde, rango_hasta, vigente_hasta)
      VALUES ('FAC', '18764000001234', '2026-01-01', 1, 10000, '2027-12-31')
      RETURNING id_resolucion;
    `);
    const resolucionDian = rDian.rows[0].id_resolucion;

    const ev1 = await client.query(`INSERT INTO estados_factura_venta (codigo, nombre, es_final) VALUES ('BORRADOR', 'Borrador / Cotización', false) RETURNING id_estado;`);
    const ev2 = await client.query(`INSERT INTO estados_factura_venta (codigo, nombre, es_final) VALUES ('EMITIDA', 'Emitida / Por Cobrar', false) RETURNING id_estado;`);
    const ev3 = await client.query(`INSERT INTO estados_factura_venta (codigo, nombre, es_final) VALUES ('PAGADA', 'Pagada Totalmente', true) RETURNING id_estado;`);
    const ev4 = await client.query(`INSERT INTO estados_factura_venta (codigo, nombre, es_final) VALUES ('ANULADA', 'Anulada', true) RETURNING id_estado;`);

    const estadoVentaEmitida = ev2.rows[0].id_estado;
    const estadoVentaPagada = ev3.rows[0].id_estado;

    const ec1 = await client.query(`INSERT INTO estados_factura_compra (codigo, nombre) VALUES ('RECIBIDA', 'Recibida / Por Pagar') RETURNING id_estado;`);
    const ec2 = await client.query(`INSERT INTO estados_factura_compra (codigo, nombre) VALUES ('PAGADA', 'Pagada Totalmente') RETURNING id_estado;`);
    const ec3 = await client.query(`INSERT INTO estados_factura_compra (codigo, nombre) VALUES ('ANULADA', 'Anulada') RETURNING id_estado;`);

    const estadoCompraRecibida = ec1.rows[0].id_estado;
    const estadoCompraPagada = ec2.rows[0].id_estado;

    // =========================================================================
    // 9. FACTURAS DE COMPRA Y DETALLES
    // =========================================================================
    console.log('📥 9/13. Insertando facturas de compra y detalles...');
    const fcRes1 = await client.query(`
      INSERT INTO facturas_compra (id_proveedor, id_estado, numero_factura, cufe, fecha_emision, fecha_vencimiento)
      VALUES ($1, $2, 'FC-98214', 'cufe-compra-frenos-valle-001-2026', '2026-03-01', '2026-03-31')
      RETURNING id_factura_compra;
    `, [provFrenosId, estadoCompraPagada]);

    const fcRes2 = await client.query(`
      INSERT INTO facturas_compra (id_proveedor, id_estado, numero_factura, cufe, fecha_emision, fecha_vencimiento)
      VALUES ($1, $2, 'FC-54120', 'cufe-compra-distribuidora-002-2026', '2026-03-05', '2026-04-05')
      RETURNING id_factura_compra;
    `, [provDistribuidoraId, estadoCompraRecibida]);

    const fc1 = fcRes1.rows[0].id_factura_compra;
    const fc2 = fcRes2.rows[0].id_factura_compra;

    await client.query(`INSERT INTO detalle_factura_compra (id_factura_compra, id_producto, cantidad, costo_unitario, pct_iva) VALUES ($1, $2, 20.000, 120000.00, 19.00);`, [fc1, productosMap['REP-FRE-001']]);
    await client.query(`INSERT INTO detalle_factura_compra (id_factura_compra, id_producto, cantidad, costo_unitario, pct_iva) VALUES ($1, $2, 15.000, 185000.00, 19.00);`, [fc1, productosMap['REP-FRE-002']]);
    await client.query(`INSERT INTO detalle_factura_compra (id_factura_compra, id_producto, cantidad, costo_unitario, pct_iva) VALUES ($1, $2, 10.000, 430000.00, 19.00);`, [fc2, productosMap['REP-MOT-001']]);
    await client.query(`INSERT INTO detalle_factura_compra (id_factura_compra, id_producto, cantidad, costo_unitario, pct_iva) VALUES ($1, $2, 12.000, 310000.00, 19.00);`, [fc2, productosMap['REP-ELE-001']]);

    // =========================================================================
    // 10. FACTURAS DE VENTA Y DETALLES
    // =========================================================================
    console.log('📤 10/13. Insertando facturas de venta y detalles...');
    const fvRes1 = await client.query(`
      INSERT INTO facturas_venta (id_cliente, id_resolucion, id_estado, numero_venta, fecha_expedicion, fecha_vencimiento, retefuente, anulada)
      VALUES ($1, $2, $3, 'FAC-0001', '2026-03-10', '2026-04-10', 0.00, false)
      RETURNING id_factura_venta;
    `, [clientePistonId, resolucionDian, estadoVentaPagada]);

    const fvRes2 = await client.query(`
      INSERT INTO facturas_venta (id_cliente, id_resolucion, id_estado, numero_venta, fecha_expedicion, fecha_vencimiento, retefuente, anulada)
      VALUES ($1, $2, $3, 'FAC-0002', '2026-03-12', '2026-04-26', 150000.00, false)
      RETURNING id_factura_venta;
    `, [clienteFlotaId, resolucionDian, estadoVentaEmitida]);

    const fvRes3 = await client.query(`
      INSERT INTO facturas_venta (id_cliente, id_resolucion, id_estado, numero_venta, fecha_expedicion, fecha_vencimiento, retefuente, anulada)
      VALUES ($1, $2, $3, 'FAC-0003', '2026-03-15', '2026-03-15', 0.00, false)
      RETURNING id_factura_venta;
    `, [clienteMontoyaId, resolucionDian, estadoVentaPagada]);

    const fv1 = fvRes1.rows[0].id_factura_venta;
    const fv2 = fvRes2.rows[0].id_factura_venta;
    const fv3 = fvRes3.rows[0].id_factura_venta;

    await client.query(`INSERT INTO detalle_factura_venta (id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva) VALUES ($1, $2, 4.000, 150000.00, 5.00, 19.00);`, [fv1, productosMap['REP-FRE-001']]);
    await client.query(`INSERT INTO detalle_factura_venta (id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva) VALUES ($1, $2, 2.000, 225000.00, 5.00, 19.00);`, [fv1, productosMap['REP-FRE-002']]);
    await client.query(`INSERT INTO detalle_factura_venta (id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva) VALUES ($1, $2, 4.000, 245000.00, 0.00, 19.00);`, [fv2, productosMap['REP-SUS-001']]);
    await client.query(`INSERT INTO detalle_factura_venta (id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva) VALUES ($1, $2, 2.000, 480000.00, 0.00, 19.00);`, [fv2, productosMap['REP-MOT-001']]);
    await client.query(`INSERT INTO detalle_factura_venta (id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva) VALUES ($1, $2, 4.000, 58000.00, 0.00, 19.00);`, [fv3, productosMap['REP-LUB-001']]);
    await client.query(`INSERT INTO detalle_factura_venta (id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva) VALUES ($1, $2, 1.000, 160000.00, 0.00, 19.00);`, [fv3, productosMap['REP-ELE-002']]);

    // =========================================================================
    // 11. MÉTODOS DE PAGO, ESTADOS DE PAGO Y PAGOS
    // =========================================================================
    console.log('💳 11/13. Insertando métodos de pago, pagos y aplicaciones...');
    const mp1 = await client.query(`INSERT INTO metodos_pago (codigo, nombre, afecta_caja) VALUES ('EFECTIVO', 'Efectivo en Caja', true) RETURNING id_metodo_pago;`);
    const mp2 = await client.query(`INSERT INTO metodos_pago (codigo, nombre, afecta_caja) VALUES ('TRANSFERENCIA', 'Transferencia Bancolombia / Davivienda', false) RETURNING id_metodo_pago;`);
    const mp3 = await client.query(`INSERT INTO metodos_pago (codigo, nombre, afecta_caja) VALUES ('TARJETA_CREDITO', 'Tarjeta de Crédito', false) RETURNING id_metodo_pago;`);
    const mp4 = await client.query(`INSERT INTO metodos_pago (codigo, nombre, afecta_caja) VALUES ('TARJETA_DEBITO', 'Tarjeta Débito', false) RETURNING id_metodo_pago;`);
    const mp5 = await client.query(`INSERT INTO metodos_pago (codigo, nombre, afecta_caja) VALUES ('CHEQUE', 'Cheque al Día', true) RETURNING id_metodo_pago;`);

    const metodoEfectivo = mp1.rows[0].id_metodo_pago;
    const metodoTransferencia = mp2.rows[0].id_metodo_pago;

    const ep1 = await client.query(`INSERT INTO estados_pago (codigo, nombre) VALUES ('APLICADO', 'Aplicado') RETURNING id_estado;`);
    const ep2 = await client.query(`INSERT INTO estados_pago (codigo, nombre) VALUES ('PENDIENTE', 'Pendiente de Conciliación') RETURNING id_estado;`);
    const ep3 = await client.query(`INSERT INTO estados_pago (codigo, nombre) VALUES ('ANULADO', 'Anulado') RETURNING id_estado;`);

    const estadoPagoAplicado = ep1.rows[0].id_estado;

    // Pagos
    const pVentaRes1 = await client.query(`
      INSERT INTO pagos (id_tercero, id_metodo_pago, id_estado, tipo_pago, fecha_pago, monto)
      VALUES ($1, $2, $3, 'factura de venta', '2026-03-11', 1175720.00)
      RETURNING id_pago;
    `, [clientePiston, metodoTransferencia, estadoPagoAplicado]);

    const pCompraRes1 = await client.query(`
      INSERT INTO pagos (id_tercero, id_metodo_pago, id_estado, tipo_pago, fecha_pago, monto)
      VALUES ($1, $2, $3, 'factura de compra', '2026-03-20', 6158250.00)
      RETURNING id_pago;
    `, [provFrenos, metodoTransferencia, estadoPagoAplicado]);

    const pVentaRes3 = await client.query(`
      INSERT INTO pagos (id_tercero, id_metodo_pago, id_estado, tipo_pago, fecha_pago, monto)
      VALUES ($1, $2, $3, 'factura de venta', '2026-03-15', 466480.00)
      RETURNING id_pago;
    `, [clienteMontoya, metodoEfectivo, estadoPagoAplicado]);

    const pagoVenta1 = pVentaRes1.rows[0].id_pago;
    const pagoCompra1 = pCompraRes1.rows[0].id_pago;
    const pagoVenta3 = pVentaRes3.rows[0].id_pago;

    await client.query(`INSERT INTO aplicacion_pago_venta (id_pago, id_factura_venta, monto_aplicado) VALUES ($1, $2, 1175720.00);`, [pagoVenta1, fv1]);
    await client.query(`INSERT INTO aplicacion_pago_venta (id_pago, id_factura_venta, monto_aplicado) VALUES ($1, $2, 466480.00);`, [pagoVenta3, fv3]);
    await client.query(`INSERT INTO aplicacion_pago_compra (id_pago, id_factura_compra, monto_aplicado) VALUES ($1, $2, 6158250.00);`, [pagoCompra1, fc1]);

    // =========================================================================
    // 12. CATEGORÍAS DE GASTO Y GASTOS
    // =========================================================================
    console.log('📑 12/13. Insertando categorías de gasto y gastos...');
    const cg1 = await client.query(`INSERT INTO categorias_gasto (nombre, codigo_puc) VALUES ('Servicios Públicos (Energía, Agua, Internet)', '5135') RETURNING id_categoria_gasto;`);
    const cg2 = await client.query(`INSERT INTO categorias_gasto (nombre, codigo_puc) VALUES ('Arrendamiento de Bodegas y Locales', '5120') RETURNING id_categoria_gasto;`);
    const cg3 = await client.query(`INSERT INTO categorias_gasto (nombre, codigo_puc) VALUES ('Mantenimiento y Reparaciones Locativas', '5145') RETURNING id_categoria_gasto;`);
    const cg4 = await client.query(`INSERT INTO categorias_gasto (nombre, codigo_puc) VALUES ('Papelería, Útiles y Envíos', '5195') RETURNING id_categoria_gasto;`);
    const cg5 = await client.query(`INSERT INTO categorias_gasto (nombre, codigo_puc) VALUES ('Gastos de Transporte y Fletes de Mercancía', '5235') RETURNING id_categoria_gasto;`);

    const catServicios = cg1.rows[0].id_categoria_gasto;
    const catArriendo = cg2.rows[0].id_categoria_gasto;
    const catFletes = cg5.rows[0].id_categoria_gasto;

    await client.query(`
      INSERT INTO gastos (id_categoria_gasto, id_metodo_pago, descripcion, monto, fecha, soporte_url)
      VALUES ($1, $2, 'Pago recibo energía Enel Codensa bodega 7 de agosto', 485000.00, '2026-03-05', 'https://storage.crmcontable.com/facturas/energia_marzo_2026.pdf');
    `, [catServicios, metodoTransferencia]);

    await client.query(`
      INSERT INTO gastos (id_categoria_gasto, id_metodo_pago, descripcion, monto, fecha, soporte_url)
      VALUES ($1, $2, 'Flete transporte de mercancía repuestos desde Buenaventura', 850000.00, '2026-03-08', 'https://storage.crmcontable.com/facturas/flete_buenaventura.pdf');
    `, [catFletes, metodoTransferencia]);

    await client.query(`
      INSERT INTO gastos (id_categoria_gasto, id_metodo_pago, descripcion, monto, fecha, soporte_url)
      VALUES ($1, $2, 'Canon de arrendamiento local comercial y bodega principal', 4200000.00, '2026-03-01', 'https://storage.crmcontable.com/facturas/arriendo_marzo.pdf');
    `, [catArriendo, metodoTransferencia]);

    // =========================================================================
    // 13. USUARIOS Y ROLES (ADMINISTRADORES Y USUARIOS NORMALES)
    // =========================================================================
    console.log('👤 13/13. Configurando usuarios (Administradores y Usuarios Normales)...');

    const resRoles = await client.query(`SELECT id_rol, codigo FROM roles;`);
    const rolAdmin = resRoles.rows.find(r => r.codigo === 'ADMIN').id_rol;
    const rolUsuario = resRoles.rows.find(r => r.codigo === 'USUARIO').id_rol;

    const defaultPasswordHash = bcrypt.hashSync('Admin123*', 10);

    // Actualizar usuario admin existente
    await client.query(`
      UPDATE usuarios 
      SET password_hash = $1, id_tercero = $2, nombres = 'Carlos Andrés', apellidos = 'Pérez Gómez', telefono = '3001234567', activo = true
      WHERE email = 'admin@crmcontable.com';
    `, [defaultPasswordHash, empleadoAdmin]);

    const usuariosNuevos = [
      {
        email: 'gerencia@crmcontable.com',
        password_hash: defaultPasswordHash,
        nombres: 'María Fernanda',
        apellidos: 'Morales Castro',
        telefono: '3109876543',
        id_rol: rolAdmin,
        id_tercero: empleadoGerente
      },
      {
        email: 'usuario@crmcontable.com',
        password_hash: defaultPasswordHash,
        nombres: 'Juan Camilo',
        apellidos: 'Gómez Restrepo',
        telefono: '3156789012',
        id_rol: rolUsuario,
        id_tercero: empleadoUsuario
      },
      {
        email: 'vendedor@crmcontable.com',
        password_hash: defaultPasswordHash,
        nombres: 'Laura Daniela',
        apellidos: 'Ortiz Prada',
        telefono: '3203456789',
        id_rol: rolUsuario,
        id_tercero: empleadoVendedor
      },
      {
        email: 'operador@crmcontable.com',
        password_hash: defaultPasswordHash,
        nombres: 'Andrés Felipe',
        apellidos: 'Rojas Medina',
        telefono: '3187654321',
        id_rol: rolUsuario,
        id_tercero: null
      },
      {
        email: 'caja@crmcontable.com',
        password_hash: defaultPasswordHash,
        nombres: 'Sandra Milena',
        apellidos: 'Vargas Cárdenas',
        telefono: '3112345678',
        id_rol: rolUsuario,
        id_tercero: null
      }
    ];

    for (const u of usuariosNuevos) {
      await client.query(`
        INSERT INTO usuarios (id_rol, id_tercero, email, password_hash, nombres, apellidos, telefono, activo)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true)
        ON CONFLICT (email) DO UPDATE 
        SET password_hash = EXCLUDED.password_hash,
            id_rol = EXCLUDED.id_rol,
            nombres = EXCLUDED.nombres,
            apellidos = EXCLUDED.apellidos,
            telefono = EXCLUDED.telefono,
            activo = true;
      `, [u.id_rol, u.id_tercero, u.email, u.password_hash, u.nombres, u.apellidos, u.telefono]);
    }

    await client.query('COMMIT');
    console.log('✨ Transacción completada y confirmada (COMMIT).');

    // =========================================================================
    // RECUENTO FINAL DE TABLAS
    // =========================================================================
    console.log('\n📊 Conteo y verificación final de registros por tabla:');
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    for (const row of tablesRes.rows) {
      const countRes = await client.query(`SELECT COUNT(*) FROM "${row.table_name}"`);
      console.log(`  - ${row.table_name.padEnd(28)}: ${countRes.rows[0].count} registros`);
    }

    console.log('\n====================================================');
    console.log('🎉 PROCESO DE SEED FINALIZADO EXITOSAMENTE');
    console.log('====================================================');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error ejecutando el seed:', err);
    throw err;
  } finally {
    await client.end();
  }
}

runSeed();
