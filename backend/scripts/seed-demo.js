/**
 * SEED DE DEMOSTRACIÓN — simula varios meses de operación del negocio.
 *
 *   npm run seed:demo                  # falla si ya hay datos transaccionales
 *   npm run seed:demo -- --reset       # borra los datos de demo y los regenera (solo base local)
 *   npm run seed:demo -- --reset --force   # permite --reset contra una base remota
 *   npm run seed:demo -- --dias=120    # cantidad de días a simular (por defecto 180)
 *
 * Requiere el seed base (`npm run seed`). Genera proveedores, clientes,
 * productos con precios, compras, ventas, pagos, gastos, cotizaciones y
 * pedidos respetando las mismas reglas del backend: no hay stock negativo,
 * las salidas de kardex van a costo promedio, los pagos no superan el saldo
 * y los estados de facturas y pedidos son coherentes con sus pagos e historial.
 * La generación es determinística (semilla fija): siempre produce los mismos datos.
 */
const crypto = require('crypto');
const { crearCliente, esBaseLocal } = require('./lib/db');
const demo = require('./data/demo');

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const FORCE = args.includes('--force');
const DIAS = Number((args.find((a) => a.startsWith('--dias=')) || '--dias=180').split('=')[1]);

// ─── Utilidades ─────────────────────────────────────────────────────────────

function mulberry32(semilla) {
  let a = semilla;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260927);
const entero = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const elegir = (arr) => arr[Math.floor(rnd() * arr.length)];
const prob = (p) => rnd() < p;
const r2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const a100 = (v) => Math.round(v / 100) * 100;
const uuid = () => crypto.randomUUID();

const hoy = new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.APP_TIMEZONE || 'America/Bogota',
}).format(new Date());
function sumarDias(fecha, dias) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const diaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 = domingo
const inicio = sumarDias(hoy, -DIAS);

// Hora creciente dentro de cada día para que el kardex quede ordenado
const minutosPorDia = {};
function hora(fecha) {
  const m = (minutosPorDia[fecha] = (minutosPorDia[fecha] ?? 7 * 60 + 30) + entero(3, 12));
  const hh = String(Math.min(23, Math.floor(m / 60))).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${fecha} ${hh}:${mm}:00`;
}

// ─── Tablas en memoria ──────────────────────────────────────────────────────

const T = {};
const fila = (tabla, obj) => {
  (T[tabla] ||= []).push(obj);
  return obj;
};

const eventos = {}; // fecha → [fn]
const programar = (fecha, fn) => {
  if (fecha <= hoy) (eventos[fecha] ||= []).push(fn);
};

// ─── Carga de catálogos base ────────────────────────────────────────────────

async function cargarBase(client) {
  const mapa = async (sql, clave, valor) =>
    Object.fromEntries((await client.query(sql)).rows.map((r) => [r[clave], r[valor]]));

  const b = {
    tiposDoc: await mapa('SELECT codigo, id_tipo_documento FROM tipos_documento', 'codigo', 'id_tipo_documento'),
    ciudades: await mapa('SELECT nombre, id_ciudad FROM ciudades', 'nombre', 'id_ciudad'),
    categorias: await mapa('SELECT nombre, id_categoria FROM categorias_producto', 'nombre', 'id_categoria'),
    marcas: await mapa('SELECT nombre, id_marca FROM marcas', 'nombre', 'id_marca'),
    unidades: await mapa('SELECT codigo, id_unidad FROM unidades_medida', 'codigo', 'id_unidad'),
    impuestos: await mapa('SELECT porcentaje::int AS p, id_impuesto FROM impuestos', 'p', 'id_impuesto'),
    bodegas: await mapa('SELECT codigo, id_bodega FROM bodegas WHERE activo', 'codigo', 'id_bodega'),
    listas: await mapa('SELECT nombre, id_lista FROM listas_precios', 'nombre', 'id_lista'),
    estadosVenta: await mapa('SELECT codigo, id_estado FROM estados_factura_venta', 'codigo', 'id_estado'),
    estadosCompra: await mapa('SELECT codigo, id_estado FROM estados_factura_compra', 'codigo', 'id_estado'),
    estadosPago: await mapa('SELECT codigo, id_estado FROM estados_pago', 'codigo', 'id_estado'),
    metodos: await mapa('SELECT codigo, id_metodo_pago FROM metodos_pago', 'codigo', 'id_metodo_pago'),
    catGasto: await mapa('SELECT nombre, id_categoria_gasto FROM categorias_gasto', 'nombre', 'id_categoria_gasto'),
    usuarios: await mapa('SELECT email, id_usuario FROM usuarios WHERE activo', 'email', 'id_usuario'),
  };

  const requeridos = [
    ['bodegas', 'BOD-BOG-01'],
    ['estadosVenta', 'EMITIDA'],
    ['estadosCompra', 'RECIBIDA'],
    ['estadosPago', 'APLICADO'],
    ['metodos', 'EFECTIVO'],
    ['usuarios', 'admin@crmcontable.com'],
  ];
  for (const [grupo, clave] of requeridos) {
    if (!b[grupo][clave]) throw new Error(`Falta ${clave} en ${grupo}. Ejecute primero: npm run seed`);
  }

  const res = await client.query(
    `SELECT id_resolucion, prefijo, rango_desde FROM resoluciones_dian
      WHERE vigente_hasta IS NULL OR vigente_hasta >= $1
      ORDER BY fecha_expedicion DESC LIMIT 1`,
    [hoy],
  );
  b.resolucion = res.rows[0] || null;
  return b;
}

// ─── Simulación ─────────────────────────────────────────────────────────────

function simular(b) {
  const BOG = b.bodegas['BOD-BOG-01'];
  const MED = b.bodegas['BOD-MED-01'] || BOG;
  const CAL = b.bodegas['BOD-CAL-01'] || BOG;
  const bodegaPorCiudad = (ciudad) =>
    ['Medellín', 'Envigado', 'Bello', 'Itagüí'].includes(ciudad) ? MED
      : ['Cali', 'Palmira', 'Tuluá'].includes(ciudad) ? CAL
        : BOG;

  const admin = b.usuarios['admin@crmcontable.com'];
  const vendedores = ['vendedor@crmcontable.com', 'usuario@crmcontable.com', 'caja@crmcontable.com', 'operador@crmcontable.com']
    .map((e) => b.usuarios[e])
    .filter(Boolean);
  const todosUsuarios = Object.values(b.usuarios);

  const direccion = () =>
    `${elegir(['Calle', 'Carrera', 'Avenida', 'Transversal', 'Diagonal'])} ${entero(1, 170)} # ${entero(1, 99)} - ${entero(1, 99)}`;

  // ── Proveedores ──
  const proveedores = {};
  for (const [nit, nombre, ciudad, dias, contacto, cargo, tel, email] of demo.proveedores) {
    const idTercero = uuid();
    fila('terceros', {
      id_tercero: idTercero, id_tipo_documento: b.tiposDoc.NIT, numero_documento: nit,
      razon_social: nombre, tipo_persona: 'JURIDICA', id_ciudad: b.ciudades[ciudad] || null, activo: true,
    });
    const id = uuid();
    fila('proveedores', { id_proveedor: id, id_tercero: idTercero, dias_plazo: dias });
    const idContacto = uuid();
    fila('contactos', { id_contacto: idContacto, id_tercero: idTercero, nombre: contacto, cargo, principal: true });
    fila('telefonos', { id_telefono: uuid(), id_tercero: idTercero, id_contacto: null, numero: tel, tipo: 'FIJO', principal: true });
    fila('emails', { id_email: uuid(), id_tercero: idTercero, id_contacto: idContacto, email, tipo: 'VENTAS', principal: true });
    fila('direcciones', { id_direccion: uuid(), id_tercero: idTercero, id_ciudad: b.ciudades[ciudad] || null, direccion: direccion(), tipo: 'PRINCIPAL', principal: true });
    proveedores[nit] = { id, idTercero, dias, prefijo: nombre.split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase(), consecutivo: entero(1000, 9000) };
  }
  const listaProveedores = Object.values(proveedores);

  // ── Clientes ──
  const clientes = [];
  for (const [doc, nombre, ciudad, tipo, cupo, dias, tel, email] of demo.clientes) {
    const idTercero = uuid();
    const natural = tipo === 'NATURAL';
    fila('terceros', {
      id_tercero: idTercero, id_tipo_documento: natural ? b.tiposDoc.CC : b.tiposDoc.NIT, numero_documento: doc,
      razon_social: nombre, tipo_persona: natural ? 'NATURAL' : 'JURIDICA', id_ciudad: b.ciudades[ciudad] || null, activo: true,
    });
    const id = uuid();
    fila('clientes', { id_cliente: id, id_tercero: idTercero, cupo_credito: cupo, dias_plazo: dias });
    fila('telefonos', { id_telefono: uuid(), id_tercero: idTercero, id_contacto: null, numero: tel, tipo: 'MOVIL', principal: true });
    fila('emails', { id_email: uuid(), id_tercero: idTercero, id_contacto: null, email, tipo: natural ? 'PERSONAL' : 'FACTURACION', principal: true });
    fila('direcciones', { id_direccion: uuid(), id_tercero: idTercero, id_ciudad: b.ciudades[ciudad] || null, direccion: direccion(), tipo: 'PRINCIPAL', principal: true });
    if (!natural) {
      fila('contactos', { id_contacto: uuid(), id_tercero: idTercero, nombre: `${elegir(['Pedro', 'Alfonso', 'Liliana', 'Marta', 'Jaime', 'Sergio'])} ${elegir(['Navas', 'Gómez', 'Pardo', 'Rincón', 'Suárez'])}`, cargo: tipo === 'FLOTA' ? 'Jefe de Mantenimiento' : 'Jefe de Taller', principal: true });
    }
    clientes.push({
      id, idTercero, nombre, tipo, cupo, dias, bodega: bodegaPorCiudad(ciudad),
      moroso: demo.clientesMorosos.includes(doc),
      lista: tipo === 'FLOTA' ? 'Precio Flotas y Convenios' : tipo === 'TALLER' ? 'Precio Taller / Mayorista' : 'Precio Público / Mostrador',
      peso: tipo === 'NATURAL' ? 1 : tipo === 'TALLER' ? 3 : 2,
    });
  }
  const clientesPonderados = clientes.flatMap((c) => Array(c.peso).fill(c));

  // ── Productos, proveedores y precios ──
  const productos = [];
  const LISTAS = { 'Precio Público / Mostrador': 1.6, 'Precio Taller / Mayorista': 1.42, 'Precio Flotas y Convenios': 1.34 };
  const diaAumento = sumarDias(inicio, Math.floor(DIAS / 2));

  for (const [codigo, nombre, categoria, marca, unidad, costo, minimo, iva, nitProveedor] of demo.productos) {
    const id = uuid();
    fila('productos', {
      id_producto: id, codigo, nombre, id_categoria: b.categorias[categoria] || null, id_unidad: b.unidades[unidad] || null,
      id_impuesto_venta: b.impuestos[iva] || null, maneja_inventario: true, stock_minimo: minimo, activo: true,
      id_marca: b.marcas[marca] || null,
    });
    const principal = proveedores[nitProveedor];
    const pp = fila('producto_proveedor', {
      id_producto: id, id_proveedor: principal.id, codigo_proveedor: `${marca.slice(0, 3).toUpperCase()}-${entero(10000, 99999)}`,
      costo_actual: costo, dias_entrega: entero(2, 5), es_principal: true,
    });
    if (prob(0.4)) {
      const otro = elegir(listaProveedores.filter((p) => p !== principal));
      fila('producto_proveedor', {
        id_producto: id, id_proveedor: otro.id, codigo_proveedor: `ALT-${entero(10000, 99999)}`,
        costo_actual: a100(costo * (1.03 + rnd() * 0.05)), dias_entrega: entero(1, 7), es_principal: false,
      });
    }

    // Precios por lista; a un tercio de los productos se les sube el precio a mitad de periodo
    const precios = {};
    const conAumento = prob(0.33);
    for (const [lista, factor] of Object.entries(LISTAS)) {
      const base = a100(costo * factor);
      if (conAumento) {
        fila('precios_producto', { id_precio: uuid(), id_lista: b.listas[lista], id_producto: id, precio: base, vigente_desde: inicio, vigente_hasta: sumarDias(diaAumento, -1) });
        const nuevo = a100(base * 1.06);
        fila('precios_producto', { id_precio: uuid(), id_lista: b.listas[lista], id_producto: id, precio: nuevo, vigente_desde: diaAumento, vigente_hasta: null });
        precios[lista] = (fecha) => (fecha < diaAumento ? base : nuevo);
      } else {
        fila('precios_producto', { id_precio: uuid(), id_lista: b.listas[lista], id_producto: id, precio: base, vigente_desde: inicio, vigente_hasta: null });
        precios[lista] = () => base;
      }
    }

    productos.push({ id, codigo, costoActual: costo, minimo, iva, proveedor: principal, pp, precios, unidad });
  }

  // ── Estado de inventario ──
  const stock = {}; // `${prod}|${bodega}` → cantidad
  const reservado = {};
  const acumCosto = {}; // prod → { qty, val }
  const clave = (p, bod) => `${p}|${bod}`;
  const saldo = (p, bod) => stock[clave(p, bod)] || 0;
  const disponible = (p, bod) => saldo(p, bod) - (reservado[clave(p, bod)] || 0);
  const costoPromedio = (p) => {
    const a = acumCosto[p.id];
    return a && a.qty > 0 ? r2(a.val / a.qty) : p.costoActual;
  };
  const ENTRADAS = ['ENTRADA', 'AJUSTE_ENTRADA', 'TRASLADO_ENTRADA'];

  function mov(p, bod, tipo, cantidad, costo, fecha, origenTabla, origenId) {
    fila('movimientos_inventario', {
      id_movimiento: uuid(), id_producto: p.id, id_bodega: bod, tipo_movimiento: tipo, cantidad,
      costo_unitario: costo, fecha: hora(fecha), origen_tabla: origenTabla, origen_id: origenId,
    });
    stock[clave(p.id, bod)] = saldo(p.id, bod) + (ENTRADAS.includes(tipo) ? cantidad : -cantidad);
    if (saldo(p.id, bod) < 0) throw new Error(`Stock negativo simulado en ${p.codigo}`);
  }

  // ── Pagos ──
  const pagosPorFactura = {}; // id factura → [{fecha, monto}] (solo vigentes)

  function pago(fecha, idTercero, tipoPago, idFactura, monto, metodo, extra = {}) {
    if (fecha > hoy) return false;
    const id = uuid();
    fila('pagos', {
      id_pago: id, id_tercero: idTercero, id_metodo_pago: b.metodos[metodo] || b.metodos.TRANSFERENCIA,
      id_estado: b.estadosPago[extra.anulado ? 'ANULADO' : 'APLICADO'], tipo_pago: tipoPago, fecha_pago: fecha,
      monto, id_usuario: extra.usuario || elegir(vendedores.length ? vendedores : [admin]),
      observaciones: extra.observaciones || null, motivo_anulacion: extra.anulado ? extra.motivo : null,
    });
    if (tipoPago === 'factura de venta') {
      fila('aplicacion_pago_venta', { id_aplicacion: uuid(), id_pago: id, id_factura_venta: idFactura, monto_aplicado: monto });
    } else {
      fila('aplicacion_pago_compra', { id_aplicacion: uuid(), id_pago: id, id_factura_compra: idFactura, monto_aplicado: monto });
    }
    if (!extra.anulado) (pagosPorFactura[idFactura] ||= []).push({ fecha, monto });
    return true;
  }
  const pagadoHasta = (idFactura, fecha) =>
    (pagosPorFactura[idFactura] || []).filter((p) => p.fecha <= fecha).reduce((a, p) => a + p.monto, 0);

  // ── Compras ──
  const compras = [];
  function compra(fecha, proveedor, items, bodega) {
    const id = uuid();
    proveedor.consecutivo += entero(3, 40);
    const fechaVencimiento = sumarDias(fecha, proveedor.dias);
    const doc = fila('facturas_compra', {
      id_factura_compra: id, id_proveedor: proveedor.id, id_estado: b.estadosCompra.RECIBIDA,
      numero_factura: `${proveedor.prefijo}-${proveedor.consecutivo}`, cufe: crypto.randomBytes(24).toString('hex'),
      fecha_emision: fecha, fecha_vencimiento: fechaVencimiento, id_bodega: bodega, id_usuario: admin, motivo_anulacion: null,
    });
    let total = 0;
    for (const { p, cantidad } of items) {
      if (prob(0.3)) p.costoActual = a100(p.costoActual * (1 + rnd() * 0.025));
      fila('detalle_factura_compra', {
        id_detalle: uuid(), id_factura_compra: id, id_producto: p.id, cantidad, costo_unitario: p.costoActual, pct_iva: p.iva,
      });
      mov(p, bodega, 'ENTRADA', cantidad, p.costoActual, fecha, 'facturas_compra', id);
      const a = (acumCosto[p.id] ||= { qty: 0, val: 0 });
      a.qty += cantidad;
      a.val += cantidad * p.costoActual;
      p.pp.costo_actual = p.costoActual;
      total += cantidad * p.costoActual * (1 + p.iva / 100);
    }
    total = r2(total);

    // La mayoría se paga cerca del vencimiento; algunas recientes quedan pendientes
    const fechaPago = sumarDias(fechaVencimiento, entero(-6, 5));
    if (!prob(0.07)) {
      pago(fechaPago < fecha ? fecha : fechaPago, proveedor.idTercero, 'factura de compra', id, total, elegir(['TRANSFERENCIA', 'TRANSFERENCIA', 'CHEQUE']), { usuario: admin });
    }
    compras.push({ doc, id, total });
  }

  // Algunos productos dejan de reabastecerse el último mes (proveedor retrasado)
  // para que la demo muestre alertas de stock bajo
  const sinReposicionDesde = sumarDias(hoy, -75);
  const retrasados = new Set(productos.filter((_, i) => i % 9 === 4).map((p) => p.id));

  function reabastecer(fecha, factorObjetivo) {
    const porProveedor = new Map();
    for (const p of productos) {
      if (fecha >= sinReposicionDesde && retrasados.has(p.id)) continue;
      const actual = saldo(p.id, BOG);
      const objetivo = p.minimo * factorObjetivo;
      if (actual < p.minimo * 1.5) {
        const cantidad = Math.ceil(objetivo - actual);
        if (cantidad > 0) {
          if (!porProveedor.has(p.proveedor)) porProveedor.set(p.proveedor, []);
          porProveedor.get(p.proveedor).push({ p, cantidad });
        }
      }
    }
    for (const [proveedor, items] of porProveedor) compra(fecha, proveedor, items, BOG);
  }

  function trasladar(fecha, p, desde, hacia, cantidad) {
    if (cantidad <= 0 || disponible(p.id, desde) < cantidad) return;
    const costo = costoPromedio(p);
    const salida = uuid();
    fila('movimientos_inventario', {
      id_movimiento: salida, id_producto: p.id, id_bodega: desde, tipo_movimiento: 'TRASLADO_SALIDA', cantidad,
      costo_unitario: costo, fecha: hora(fecha), origen_tabla: 'traslado', origen_id: null,
    });
    stock[clave(p.id, desde)] = saldo(p.id, desde) - cantidad;
    mov(p, hacia, 'TRASLADO_ENTRADA', cantidad, costo, fecha, 'traslado', salida);
  }

  // ── Ventas ──
  const facturas = [];
  const saldoCliente = (cliente, fecha) =>
    facturas
      .filter((f) => f.cliente === cliente && !f.anulada)
      .reduce((acc, f) => acc + f.total - pagadoHasta(f.id, fecha), 0);

  function totales(lineas, retefuente = 0) {
    let neto = 0;
    let iva = 0;
    for (const l of lineas) {
      const n = l.cantidad * l.precio * (1 - l.descuento / 100);
      neto += n;
      iva += n * (l.p.iva / 100);
    }
    return { neto: r2(neto), total: r2(neto + iva - retefuente) };
  }

  function planDePagos(f) {
    const { cliente, fecha, fechaVencimiento, total, id } = f;
    const tercero = cliente.idTercero;
    if (fechaVencimiento === fecha) {
      pago(fecha, tercero, 'factura de venta', id, total, elegir(['EFECTIVO', 'EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'NEQUI', 'TRANSFERENCIA']));
      return;
    }
    if (cliente.moroso) {
      if (prob(0.45)) {
        const abono = r2(total * 0.5);
        pago(sumarDias(fechaVencimiento, entero(15, 50)), tercero, 'factura de venta', id, abono, 'TRANSFERENCIA', { observaciones: 'Abono parcial' });
      }
      return;
    }
    const r = rnd();
    if (r < 0.83) {
      const fechaPago = sumarDias(fechaVencimiento, entero(-8, 10));
      const f1 = fechaPago < fecha ? fecha : fechaPago;
      if (prob(0.03) && sumarDias(f1, 6) <= hoy) {
        // Cheque devuelto: el pago se anula y se reemplaza por una transferencia
        pago(f1, tercero, 'factura de venta', id, total, 'CHEQUE', { anulado: true, motivo: 'Cheque devuelto por fondos insuficientes' });
        pago(sumarDias(f1, 6), tercero, 'factura de venta', id, total, 'TRANSFERENCIA');
      } else {
        pago(f1, tercero, 'factura de venta', id, total, elegir(['TRANSFERENCIA', 'TRANSFERENCIA', 'CHEQUE', 'EFECTIVO']));
      }
    } else if (r < 0.95) {
      const abono = r2(total * (0.4 + rnd() * 0.2));
      pago(sumarDias(fecha, entero(5, 15)), tercero, 'factura de venta', id, abono, 'TRANSFERENCIA', { observaciones: 'Abono parcial' });
      pago(sumarDias(fechaVencimiento, entero(0, 15)), tercero, 'factura de venta', id, r2(total - abono), 'TRANSFERENCIA', { observaciones: 'Pago del saldo' });
    }
    // el 5 % restante queda pendiente
  }

  function facturar(fecha, cliente, bodega, lineas, opciones = {}) {
    const id = uuid();
    const neto = totales(lineas).neto;
    const retefuente = cliente.tipo !== 'NATURAL' && neto >= 1300000 ? r2(neto * 0.025) : 0;
    const total = totales(lineas, retefuente).total;

    // Crédito solo si el cupo alcanza; si no, la venta es de contado
    let fechaVencimiento = sumarDias(fecha, cliente.dias);
    if (cliente.dias > 0 && saldoCliente(cliente, fecha) + total > cliente.cupo) fechaVencimiento = fecha;

    const doc = fila('facturas_venta', {
      id_factura_venta: id, id_cliente: cliente.id, id_resolucion: b.resolucion?.id_resolucion || null,
      id_estado: b.estadosVenta.EMITIDA, numero_venta: null, fecha_expedicion: fecha, fecha_vencimiento: fechaVencimiento,
      retefuente, anulada: false, id_bodega: bodega, id_usuario: opciones.usuario || elegir(vendedores.length ? vendedores : [admin]),
      observaciones: opciones.observaciones || null, motivo_anulacion: null,
    });
    for (const l of lineas) {
      fila('detalle_factura_venta', {
        id_detalle: uuid(), id_factura_venta: id, id_producto: l.p.id, cantidad: l.cantidad,
        valor_unitario: l.precio, pct_descuento: l.descuento, pct_iva: l.p.iva,
      });
      mov(l.p, bodega, 'SALIDA', l.cantidad, costoPromedio(l.p), fecha, 'facturas_venta', id);
    }

    const f = { doc, id, cliente, fecha, fechaVencimiento, total, anulada: false, orden: facturas.length, lineas, bodega };
    facturas.push(f);

    // Algunas facturas a crédito se anulan a los pocos días (devolución total)
    if (!opciones.noAnular && fechaVencimiento > fecha && !cliente.moroso && prob(0.015)) {
      f.anulada = true;
      programar(sumarDias(fecha, entero(1, 4)), (dia) => {
        doc.anulada = true;
        doc.id_estado = b.estadosVenta.ANULADA;
        doc.motivo_anulacion = elegir(['Devolución total por garantía', 'Error en los datos del cliente', 'Cliente desistió de la compra']);
        for (const l of lineas) {
          const salida = T.movimientos_inventario.find(
            (m) => m.origen_id === id && m.id_producto === l.p.id && m.tipo_movimiento === 'SALIDA',
          );
          mov(l.p, bodega, 'AJUSTE_ENTRADA', l.cantidad, salida.costo_unitario, dia, 'anulacion_factura_venta', id);
        }
      });
    } else {
      planDePagos(f);
    }
    return f;
  }

  function armarLineas(cliente, bodega, fecha, cantidadLineas) {
    const candidatos = productos.filter((p) => disponible(p.id, bodega) >= 1);
    const lineas = [];
    const usados = new Set();
    for (let i = 0; i < cantidadLineas && candidatos.length > 0; i++) {
      const p = elegir(candidatos);
      if (usados.has(p.id)) continue;
      usados.add(p.id);
      const maxPorCosto = p.costoActual < 50000 ? 6 : p.costoActual < 200000 ? 3 : 1;
      const multiplicador = cliente.tipo === 'FLOTA' ? 2 : 1;
      const cantidad = Math.min(entero(1, maxPorCosto * multiplicador), disponible(p.id, bodega));
      if (cantidad <= 0) continue;
      lineas.push({
        p, cantidad, precio: p.precios[cliente.lista](fecha),
        descuento: cliente.tipo !== 'NATURAL' && prob(0.2) ? 5 : 0,
      });
    }
    return lineas;
  }

  // ── Cotizaciones y pedidos ──
  let secCotizacion = 0;
  let secPedido = 0;

  function historial(idPedido, estado, fecha, observacion) {
    fila('historial_estados_pedido', {
      id_historial: uuid(), id_pedido: idPedido, estado, fecha: `${hora(fecha)}-05`,
      id_usuario: elegir(vendedores.length ? vendedores : [admin]), observacion,
    });
  }

  function crearPedido(fecha, cliente, lineas, idCotizacion) {
    const bodega = cliente.bodega;
    if (lineas.some((l) => disponible(l.p.id, bodega) < l.cantidad)) return null;
    for (const l of lineas) reservado[clave(l.p.id, bodega)] = (reservado[clave(l.p.id, bodega)] || 0) + l.cantidad;

    const id = uuid();
    const doc = fila('pedidos', {
      id_pedido: id, numero: `PED-${String(++secPedido).padStart(5, '0')}`, id_cliente: cliente.id,
      id_cotizacion: idCotizacion, id_bodega: bodega, id_usuario: elegir(vendedores.length ? vendedores : [admin]),
      id_factura_venta: null, fecha, estado: 'RECIBIDO', observacion: idCotizacion ? 'Generado desde cotización' : null,
      motivo_anulacion: null, creado_en: `${fecha} 09:00:00-05`,
    });
    for (const l of lineas) {
      fila('detalle_pedido', {
        id_detalle: uuid(), id_pedido: id, id_producto: l.p.id, cantidad: l.cantidad,
        valor_unitario: l.precio, pct_descuento: l.descuento, pct_iva: l.p.iva,
      });
    }
    historial(id, 'RECIBIDO', fecha, 'Pedido creado');

    const liberar = () => {
      for (const l of lineas) reservado[clave(l.p.id, bodega)] -= l.cantidad;
    };

    if (prob(0.1)) {
      programar(sumarDias(fecha, entero(1, 3)), (dia) => {
        liberar();
        doc.estado = 'ANULADO';
        doc.motivo_anulacion = 'Cliente canceló la compra';
        historial(id, 'ANULADO', dia, 'Cliente canceló la compra');
      });
      return doc;
    }

    // Avanza un estado por evento mientras las fechas no pasen de hoy
    let dia = fecha;
    const pasos = ['EN_PROCESO', 'ENVIADO', 'ENTREGADO'];
    for (const estado of pasos) {
      dia = sumarDias(dia, entero(1, 2));
      programar(dia, (d) => {
        doc.estado = estado;
        historial(id, estado, d, estado === 'ENVIADO' ? `Guía ${entero(100000, 999999)}` : null);
      });
    }
    if (prob(0.85)) {
      programar(sumarDias(dia, entero(0, 2)), (d) => {
        liberar();
        const f = facturar(d, cliente, bodega, lineas, { noAnular: true, observaciones: `Factura del pedido ${doc.numero}` });
        doc.estado = 'FACTURADO';
        doc.id_factura_venta = f.id;
        historial(id, 'FACTURADO', d, 'Pedido facturado');
      });
    }
    return doc;
  }

  function crearCotizacion(fecha) {
    const cliente = elegir(clientes.filter((c) => c.tipo !== 'NATURAL'));
    const lineas = armarLineas(cliente, cliente.bodega, fecha, entero(1, 4));
    if (lineas.length === 0) return;
    const id = uuid();
    const doc = fila('cotizaciones', {
      id_cotizacion: id, numero: `COT-${String(++secCotizacion).padStart(5, '0')}`, id_cliente: cliente.id,
      id_usuario: elegir(vendedores.length ? vendedores : [admin]), fecha, vigente_hasta: sumarDias(fecha, 15),
      estado: 'BORRADOR', observacion: elegir(['Mantenimiento preventivo', 'Cambio de frenos y suspensión', 'Reposición de flota', null]),
      motivo_rechazo: null, creado_en: `${fecha} 10:00:00-05`,
    });
    for (const l of lineas) {
      fila('detalle_cotizacion', {
        id_detalle: uuid(), id_cotizacion: id, id_producto: l.p.id, cantidad: l.cantidad,
        valor_unitario: l.precio, pct_descuento: l.descuento, pct_iva: l.p.iva,
      });
    }

    const r = rnd();
    if (r < 0.28) {
      programar(sumarDias(fecha, entero(2, 6)), () => {
        doc.estado = 'RECHAZADA';
        doc.motivo_rechazo = elegir(['Cliente optó por repuesto de menor gama', 'Precio por encima de la competencia', 'Cliente aplazó el mantenimiento']);
      });
    } else {
      const aprobacion = sumarDias(fecha, entero(1, 3));
      programar(aprobacion, () => {
        doc.estado = 'APROBADA';
      });
      if (r < 0.78) {
        programar(sumarDias(aprobacion, entero(0, 2)), (dia) => {
          if (crearPedido(dia, cliente, lineas, id)) doc.estado = 'CONVERTIDA';
        });
      }
    }
  }

  // ── Gastos ──
  function gasto(fecha, categoria, descripcion, monto, usuario, anulado = false) {
    fila('gastos', {
      id_gasto: uuid(), id_categoria_gasto: b.catGasto[categoria], id_metodo_pago: b.metodos[elegir(['TRANSFERENCIA', 'EFECTIVO', 'TARJETA_DEBITO'])],
      descripcion, monto, fecha, soporte_url: null, id_usuario: usuario,
      anulado, motivo_anulacion: anulado ? 'Gasto registrado por duplicado' : null,
    });
  }
  const CAT = {
    servicios: 'Servicios Públicos (Energía, Agua, Internet)',
    arriendo: 'Arrendamiento de Bodegas y Locales',
    mantenimiento: 'Mantenimiento y Reparaciones Locativas',
    papeleria: 'Papelería, Útiles y Envíos',
    fletes: 'Gastos de Transporte y Fletes de Mercancía',
    publicidad: 'Publicidad y Mercadeo',
    honorarios: 'Honorarios Contables y Legales',
    seguros: 'Seguros',
    aseo: 'Aseo y Cafetería',
  };
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // ── Día 0: inventario inicial y distribución a bodegas regionales ──
  reabastecer(inicio, 7);
  for (const p of productos) {
    trasladar(sumarDias(inicio, 1), p, BOG, MED, Math.floor(saldo(p.id, BOG) * 0.25));
    trasladar(sumarDias(inicio, 1), p, BOG, CAL, Math.floor(saldo(p.id, BOG) * 0.15));
  }

  // ── Días simulados ──
  let gastoAnulado = false;
  for (let i = 2; i <= DIAS; i++) {
    const fecha = sumarDias(inicio, i);
    const dow = diaSemana(fecha);
    for (const fn of eventos[fecha] || []) fn(fecha);
    if (dow === 0) continue; // domingo cerrado

    // Reabastecimiento lunes y jueves; redistribución a regionales los lunes
    if (dow === 1 || dow === 4) reabastecer(fecha, 5);
    if (dow === 1) {
      for (const p of productos) {
        for (const reg of [MED, CAL]) {
          if (reg !== BOG && saldo(p.id, reg) < p.minimo * 0.5) trasladar(fecha, p, BOG, reg, p.minimo);
        }
      }
    }

    // Ventas del día
    const ventasHoy = dow === 6 ? entero(0, 2) : entero(1, 3);
    for (let v = 0; v < ventasHoy; v++) {
      const cliente = elegir(clientesPonderados);
      const nLineas = cliente.tipo === 'FLOTA' ? entero(2, 5) : cliente.tipo === 'TALLER' ? entero(1, 4) : entero(1, 2);
      let bodega = cliente.bodega;
      let lineas = armarLineas(cliente, bodega, fecha, nLineas);
      if (lineas.length === 0 && bodega !== BOG) {
        bodega = BOG;
        lineas = armarLineas(cliente, bodega, fecha, nLineas);
      }
      if (lineas.length > 0) facturar(fecha, cliente, bodega, lineas);
    }

    // Cotizaciones y pedidos directos en las últimas semanas
    if (i > DIAS - 45 && prob(0.45)) crearCotizacion(fecha);
    if (i > DIAS - 30 && prob(0.12)) {
      const cliente = elegir(clientes.filter((c) => c.tipo !== 'NATURAL'));
      const lineas = armarLineas(cliente, cliente.bodega, fecha, entero(1, 3));
      if (lineas.length > 0) crearPedido(fecha, cliente, lineas, null);
    }

    // Gastos fijos del mes y gastos variables
    const dia = Number(fecha.slice(8, 10));
    const mes = meses[Number(fecha.slice(5, 7)) - 1];
    if (dia <= 2 && !(T.gastos || []).some((g) => g.fecha.slice(0, 7) === fecha.slice(0, 7) && g.id_categoria_gasto === b.catGasto[CAT.arriendo])) {
      gasto(fecha, CAT.arriendo, `Canon de arrendamiento local y bodega principal ${mes}`, 4200000, admin);
      gasto(fecha, CAT.arriendo, `Arriendo bodega regional Medellín ${mes}`, 1850000, admin);
    }
    if (dia >= 5 && dia <= 6 && !(T.gastos || []).some((g) => g.fecha.slice(0, 7) === fecha.slice(0, 7) && g.id_categoria_gasto === b.catGasto[CAT.servicios])) {
      gasto(fecha, CAT.servicios, `Energía, agua e internet bodega principal ${mes}`, a100(entero(420000, 650000)), admin);
      gasto(fecha, CAT.honorarios, `Honorarios contador ${mes}`, 1200000, admin);
      gasto(fecha, CAT.seguros, `Póliza multirriesgo inventario ${mes}`, 380000, admin);
    }
    if (prob(0.22)) gasto(fecha, CAT.fletes, elegir(['Flete envío a cliente', 'Transporte de mercancía desde proveedor', 'Mensajería urbana']), a100(entero(60000, 420000)), elegir(todosUsuarios));
    if (prob(0.07)) gasto(fecha, CAT.papeleria, 'Papelería y útiles de oficina', a100(entero(30000, 160000)), elegir(todosUsuarios));
    if (prob(0.08)) gasto(fecha, CAT.aseo, 'Insumos de aseo y cafetería', a100(entero(25000, 95000)), elegir(todosUsuarios));
    if (prob(0.03)) gasto(fecha, CAT.mantenimiento, elegir(['Reparación de estantería', 'Mantenimiento montacargas', 'Arreglo eléctrico bodega']), a100(entero(150000, 900000)), admin);
    if (dia === 15) gasto(fecha, CAT.publicidad, `Pauta en redes sociales ${mes}`, a100(entero(300000, 800000)), admin);
    if (!gastoAnulado && i > DIAS / 2 && prob(0.05)) {
      gasto(fecha, CAT.papeleria, 'Papelería y útiles de oficina (duplicado)', 85000, admin, true);
      gastoAnulado = true;
    }

    // Conteo físico con pequeñas diferencias a mitad de periodo
    if (i === Math.floor(DIAS / 2)) {
      for (const p of productos.slice(0, 6)) {
        if (saldo(p.id, BOG) > 2) mov(p, BOG, 'AJUSTE_SALIDA', 1, costoPromedio(p), fecha, 'conteo_fisico', null);
      }
      mov(productos[10], BOG, 'AJUSTE_ENTRADA', 2, costoPromedio(productos[10]), fecha, 'conteo_fisico', null);
    }
  }

  // ── Cierre: numeración, estados y castigo de cartera ──
  const prefijo = b.resolucion?.prefijo || 'FAC';
  let consecutivo = Number(b.resolucion?.rango_desde || 1);
  facturas
    .sort((a, c) => (a.fecha === c.fecha ? a.orden - c.orden : a.fecha.localeCompare(c.fecha)))
    .forEach((f) => {
      f.doc.numero_venta = `${prefijo}-${String(consecutivo++).padStart(6, '0')}`;
      if (!f.anulada && pagadoHasta(f.id, hoy) >= f.total - 0.001) f.doc.id_estado = b.estadosVenta.PAGADA;
    });

  // La factura vencida más antigua de un cliente moroso se castiga
  if (b.estadosVenta.CASTIGADA) {
    const candidata = facturas.find(
      (f) => f.cliente.moroso && !f.anulada && f.fechaVencimiento < sumarDias(hoy, -90) && pagadoHasta(f.id, hoy) === 0,
    );
    if (candidata) candidata.doc.id_estado = b.estadosVenta.CASTIGADA;
  }

  for (const c of compras) {
    if (pagadoHasta(c.id, hoy) >= c.total - 0.001) c.doc.id_estado = b.estadosCompra.PAGADA;
  }

  // A los productos del proveedor retrasado se les subió el stock mínimo por
  // mayor demanda: quedan por debajo y aparecen en las alertas de stock
  for (const p of productos.filter((x) => retrasados.has(x.id))) {
    const total = [BOG, MED, CAL].filter((v, i, a) => a.indexOf(v) === i).reduce((acc, bod) => acc + saldo(p.id, bod), 0);
    const fila = T.productos.find((x) => x.id_producto === p.id);
    fila.stock_minimo = Math.max(fila.stock_minimo, Math.ceil(total * 1.2) + 1);
  }

  return { secCotizacion, secPedido };
}

// ─── Persistencia ───────────────────────────────────────────────────────────

const ORDEN_INSERCION = [
  'terceros', 'proveedores', 'clientes', 'contactos', 'telefonos', 'emails', 'direcciones',
  'productos', 'producto_proveedor', 'precios_producto',
  'facturas_compra', 'detalle_factura_compra', 'facturas_venta', 'detalle_factura_venta',
  'cotizaciones', 'detalle_cotizacion', 'pedidos', 'detalle_pedido', 'historial_estados_pedido',
  'movimientos_inventario', 'pagos', 'aplicacion_pago_venta', 'aplicacion_pago_compra', 'gastos',
];

/**
 * INSERT fijo por tabla (GEMINI §4.5: prohibido concatenar variables en SQL).
 * Las filas viajan como un único parámetro JSON ($1) y PostgreSQL las
 * convierte a los tipos de la tabla con jsonb_populate_recordset.
 */
const INSERCION = {
  terceros: {
    columnas: ['id_tercero', 'id_tipo_documento', 'numero_documento', 'razon_social', 'tipo_persona', 'id_ciudad', 'activo'],
    sql: `INSERT INTO terceros (id_tercero, id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo)
          SELECT id_tercero, id_tipo_documento, numero_documento, razon_social, tipo_persona, id_ciudad, activo FROM jsonb_populate_recordset(NULL::terceros, $1::jsonb)`,
  },
  proveedores: {
    columnas: ['id_proveedor', 'id_tercero', 'dias_plazo'],
    sql: `INSERT INTO proveedores (id_proveedor, id_tercero, dias_plazo)
          SELECT id_proveedor, id_tercero, dias_plazo FROM jsonb_populate_recordset(NULL::proveedores, $1::jsonb)`,
  },
  clientes: {
    columnas: ['id_cliente', 'id_tercero', 'cupo_credito', 'dias_plazo'],
    sql: `INSERT INTO clientes (id_cliente, id_tercero, cupo_credito, dias_plazo)
          SELECT id_cliente, id_tercero, cupo_credito, dias_plazo FROM jsonb_populate_recordset(NULL::clientes, $1::jsonb)`,
  },
  contactos: {
    columnas: ['id_contacto', 'id_tercero', 'nombre', 'cargo', 'principal'],
    sql: `INSERT INTO contactos (id_contacto, id_tercero, nombre, cargo, principal)
          SELECT id_contacto, id_tercero, nombre, cargo, principal FROM jsonb_populate_recordset(NULL::contactos, $1::jsonb)`,
  },
  telefonos: {
    columnas: ['id_telefono', 'id_tercero', 'id_contacto', 'numero', 'tipo', 'principal'],
    sql: `INSERT INTO telefonos (id_telefono, id_tercero, id_contacto, numero, tipo, principal)
          SELECT id_telefono, id_tercero, id_contacto, numero, tipo, principal FROM jsonb_populate_recordset(NULL::telefonos, $1::jsonb)`,
  },
  emails: {
    columnas: ['id_email', 'id_tercero', 'id_contacto', 'email', 'tipo', 'principal'],
    sql: `INSERT INTO emails (id_email, id_tercero, id_contacto, email, tipo, principal)
          SELECT id_email, id_tercero, id_contacto, email, tipo, principal FROM jsonb_populate_recordset(NULL::emails, $1::jsonb)`,
  },
  direcciones: {
    columnas: ['id_direccion', 'id_tercero', 'id_ciudad', 'direccion', 'tipo', 'principal'],
    sql: `INSERT INTO direcciones (id_direccion, id_tercero, id_ciudad, direccion, tipo, principal)
          SELECT id_direccion, id_tercero, id_ciudad, direccion, tipo, principal FROM jsonb_populate_recordset(NULL::direcciones, $1::jsonb)`,
  },
  productos: {
    columnas: ['id_producto', 'codigo', 'nombre', 'id_categoria', 'id_unidad', 'id_impuesto_venta', 'maneja_inventario', 'stock_minimo', 'activo', 'id_marca'],
    sql: `INSERT INTO productos (id_producto, codigo, nombre, id_categoria, id_unidad, id_impuesto_venta, maneja_inventario, stock_minimo, activo, id_marca)
          SELECT id_producto, codigo, nombre, id_categoria, id_unidad, id_impuesto_venta, maneja_inventario, stock_minimo, activo, id_marca FROM jsonb_populate_recordset(NULL::productos, $1::jsonb)`,
  },
  producto_proveedor: {
    columnas: ['id_producto', 'id_proveedor', 'codigo_proveedor', 'costo_actual', 'dias_entrega', 'es_principal'],
    sql: `INSERT INTO producto_proveedor (id_producto, id_proveedor, codigo_proveedor, costo_actual, dias_entrega, es_principal)
          SELECT id_producto, id_proveedor, codigo_proveedor, costo_actual, dias_entrega, es_principal FROM jsonb_populate_recordset(NULL::producto_proveedor, $1::jsonb)`,
  },
  precios_producto: {
    columnas: ['id_precio', 'id_lista', 'id_producto', 'precio', 'vigente_desde', 'vigente_hasta'],
    sql: `INSERT INTO precios_producto (id_precio, id_lista, id_producto, precio, vigente_desde, vigente_hasta)
          SELECT id_precio, id_lista, id_producto, precio, vigente_desde, vigente_hasta FROM jsonb_populate_recordset(NULL::precios_producto, $1::jsonb)`,
  },
  facturas_compra: {
    columnas: ['id_factura_compra', 'id_proveedor', 'id_estado', 'numero_factura', 'cufe', 'fecha_emision', 'fecha_vencimiento', 'id_bodega', 'id_usuario', 'motivo_anulacion'],
    sql: `INSERT INTO facturas_compra (id_factura_compra, id_proveedor, id_estado, numero_factura, cufe, fecha_emision, fecha_vencimiento, id_bodega, id_usuario, motivo_anulacion)
          SELECT id_factura_compra, id_proveedor, id_estado, numero_factura, cufe, fecha_emision, fecha_vencimiento, id_bodega, id_usuario, motivo_anulacion FROM jsonb_populate_recordset(NULL::facturas_compra, $1::jsonb)`,
  },
  detalle_factura_compra: {
    columnas: ['id_detalle', 'id_factura_compra', 'id_producto', 'cantidad', 'costo_unitario', 'pct_iva'],
    sql: `INSERT INTO detalle_factura_compra (id_detalle, id_factura_compra, id_producto, cantidad, costo_unitario, pct_iva)
          SELECT id_detalle, id_factura_compra, id_producto, cantidad, costo_unitario, pct_iva FROM jsonb_populate_recordset(NULL::detalle_factura_compra, $1::jsonb)`,
  },
  facturas_venta: {
    columnas: ['id_factura_venta', 'id_cliente', 'id_resolucion', 'id_estado', 'numero_venta', 'fecha_expedicion', 'fecha_vencimiento', 'retefuente', 'anulada', 'id_bodega', 'id_usuario', 'observaciones', 'motivo_anulacion'],
    sql: `INSERT INTO facturas_venta (id_factura_venta, id_cliente, id_resolucion, id_estado, numero_venta, fecha_expedicion, fecha_vencimiento, retefuente, anulada, id_bodega, id_usuario, observaciones, motivo_anulacion)
          SELECT id_factura_venta, id_cliente, id_resolucion, id_estado, numero_venta, fecha_expedicion, fecha_vencimiento, retefuente, anulada, id_bodega, id_usuario, observaciones, motivo_anulacion FROM jsonb_populate_recordset(NULL::facturas_venta, $1::jsonb)`,
  },
  detalle_factura_venta: {
    columnas: ['id_detalle', 'id_factura_venta', 'id_producto', 'cantidad', 'valor_unitario', 'pct_descuento', 'pct_iva'],
    sql: `INSERT INTO detalle_factura_venta (id_detalle, id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva)
          SELECT id_detalle, id_factura_venta, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva FROM jsonb_populate_recordset(NULL::detalle_factura_venta, $1::jsonb)`,
  },
  cotizaciones: {
    columnas: ['id_cotizacion', 'numero', 'id_cliente', 'id_usuario', 'fecha', 'vigente_hasta', 'estado', 'observacion', 'motivo_rechazo', 'creado_en'],
    sql: `INSERT INTO cotizaciones (id_cotizacion, numero, id_cliente, id_usuario, fecha, vigente_hasta, estado, observacion, motivo_rechazo, creado_en)
          SELECT id_cotizacion, numero, id_cliente, id_usuario, fecha, vigente_hasta, estado, observacion, motivo_rechazo, creado_en FROM jsonb_populate_recordset(NULL::cotizaciones, $1::jsonb)`,
  },
  detalle_cotizacion: {
    columnas: ['id_detalle', 'id_cotizacion', 'id_producto', 'cantidad', 'valor_unitario', 'pct_descuento', 'pct_iva'],
    sql: `INSERT INTO detalle_cotizacion (id_detalle, id_cotizacion, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva)
          SELECT id_detalle, id_cotizacion, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva FROM jsonb_populate_recordset(NULL::detalle_cotizacion, $1::jsonb)`,
  },
  pedidos: {
    columnas: ['id_pedido', 'numero', 'id_cliente', 'id_cotizacion', 'id_bodega', 'id_usuario', 'id_factura_venta', 'fecha', 'estado', 'observacion', 'motivo_anulacion', 'creado_en'],
    sql: `INSERT INTO pedidos (id_pedido, numero, id_cliente, id_cotizacion, id_bodega, id_usuario, id_factura_venta, fecha, estado, observacion, motivo_anulacion, creado_en)
          SELECT id_pedido, numero, id_cliente, id_cotizacion, id_bodega, id_usuario, id_factura_venta, fecha, estado, observacion, motivo_anulacion, creado_en FROM jsonb_populate_recordset(NULL::pedidos, $1::jsonb)`,
  },
  detalle_pedido: {
    columnas: ['id_detalle', 'id_pedido', 'id_producto', 'cantidad', 'valor_unitario', 'pct_descuento', 'pct_iva'],
    sql: `INSERT INTO detalle_pedido (id_detalle, id_pedido, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva)
          SELECT id_detalle, id_pedido, id_producto, cantidad, valor_unitario, pct_descuento, pct_iva FROM jsonb_populate_recordset(NULL::detalle_pedido, $1::jsonb)`,
  },
  historial_estados_pedido: {
    columnas: ['id_historial', 'id_pedido', 'estado', 'fecha', 'id_usuario', 'observacion'],
    sql: `INSERT INTO historial_estados_pedido (id_historial, id_pedido, estado, fecha, id_usuario, observacion)
          SELECT id_historial, id_pedido, estado, fecha, id_usuario, observacion FROM jsonb_populate_recordset(NULL::historial_estados_pedido, $1::jsonb)`,
  },
  movimientos_inventario: {
    columnas: ['id_movimiento', 'id_producto', 'id_bodega', 'tipo_movimiento', 'cantidad', 'costo_unitario', 'fecha', 'origen_tabla', 'origen_id'],
    sql: `INSERT INTO movimientos_inventario (id_movimiento, id_producto, id_bodega, tipo_movimiento, cantidad, costo_unitario, fecha, origen_tabla, origen_id)
          SELECT id_movimiento, id_producto, id_bodega, tipo_movimiento, cantidad, costo_unitario, fecha, origen_tabla, origen_id FROM jsonb_populate_recordset(NULL::movimientos_inventario, $1::jsonb)`,
  },
  pagos: {
    columnas: ['id_pago', 'id_tercero', 'id_metodo_pago', 'id_estado', 'tipo_pago', 'fecha_pago', 'monto', 'id_usuario', 'observaciones', 'motivo_anulacion'],
    sql: `INSERT INTO pagos (id_pago, id_tercero, id_metodo_pago, id_estado, tipo_pago, fecha_pago, monto, id_usuario, observaciones, motivo_anulacion)
          SELECT id_pago, id_tercero, id_metodo_pago, id_estado, tipo_pago, fecha_pago, monto, id_usuario, observaciones, motivo_anulacion FROM jsonb_populate_recordset(NULL::pagos, $1::jsonb)`,
  },
  aplicacion_pago_venta: {
    columnas: ['id_aplicacion', 'id_pago', 'id_factura_venta', 'monto_aplicado'],
    sql: `INSERT INTO aplicacion_pago_venta (id_aplicacion, id_pago, id_factura_venta, monto_aplicado)
          SELECT id_aplicacion, id_pago, id_factura_venta, monto_aplicado FROM jsonb_populate_recordset(NULL::aplicacion_pago_venta, $1::jsonb)`,
  },
  aplicacion_pago_compra: {
    columnas: ['id_aplicacion', 'id_pago', 'id_factura_compra', 'monto_aplicado'],
    sql: `INSERT INTO aplicacion_pago_compra (id_aplicacion, id_pago, id_factura_compra, monto_aplicado)
          SELECT id_aplicacion, id_pago, id_factura_compra, monto_aplicado FROM jsonb_populate_recordset(NULL::aplicacion_pago_compra, $1::jsonb)`,
  },
  gastos: {
    columnas: ['id_gasto', 'id_categoria_gasto', 'id_metodo_pago', 'descripcion', 'monto', 'fecha', 'soporte_url', 'id_usuario', 'anulado', 'motivo_anulacion'],
    sql: `INSERT INTO gastos (id_gasto, id_categoria_gasto, id_metodo_pago, descripcion, monto, fecha, soporte_url, id_usuario, anulado, motivo_anulacion)
          SELECT id_gasto, id_categoria_gasto, id_metodo_pago, descripcion, monto, fecha, soporte_url, id_usuario, anulado, motivo_anulacion FROM jsonb_populate_recordset(NULL::gastos, $1::jsonb)`,
  },
};

const FILAS_POR_LOTE = 5000;

async function insertar(client, tabla, filas) {
  if (!filas || filas.length === 0) return;
  const def = INSERCION[tabla];
  const sobrantes = [...new Set(filas.flatMap((f) => Object.keys(f)))].filter((c) => !def.columnas.includes(c));
  if (sobrantes.length) throw new Error(`Columnas no declaradas en INSERCION.${tabla}: ${sobrantes.join(', ')}`);
  for (let i = 0; i < filas.length; i += FILAS_POR_LOTE) {
    await client.query(def.sql, [JSON.stringify(filas.slice(i, i + FILAS_POR_LOTE))]);
  }
}

/**
 * Borra los datos transaccionales (y los maestros que genera la demo) en
 * orden de dependencias. Se conservan los terceros y empleados de los
 * usuarios del sistema. Sentencias fijas, sin variables.
 */
const SQL_BORRAR_DEMO = `
  DELETE FROM detalle_nomina;
  DELETE FROM periodos_nomina;
  DELETE FROM empleados WHERE id_tercero NOT IN (SELECT id_tercero FROM usuarios WHERE id_tercero IS NOT NULL);
  DELETE FROM detalle_conteo_inventario;
  DELETE FROM conteos_inventario;
  DELETE FROM historial_estados_pedido;
  DELETE FROM detalle_pedido;
  DELETE FROM pedidos;
  DELETE FROM detalle_cotizacion;
  DELETE FROM cotizaciones;
  DELETE FROM aplicacion_pago_venta;
  DELETE FROM aplicacion_pago_compra;
  DELETE FROM pagos;
  DELETE FROM gastos;
  DELETE FROM detalle_factura_venta;
  DELETE FROM facturas_venta;
  DELETE FROM detalle_factura_compra;
  DELETE FROM facturas_compra;
  DELETE FROM movimientos_inventario;
  DELETE FROM precios_producto;
  DELETE FROM producto_proveedor;
  DELETE FROM productos;
  DELETE FROM direcciones;
  DELETE FROM emails;
  DELETE FROM telefonos;
  DELETE FROM contactos;
  DELETE FROM clientes;
  DELETE FROM proveedores;
  DELETE FROM terceros WHERE id_tercero NOT IN (SELECT id_tercero FROM usuarios WHERE id_tercero IS NOT NULL);
`;

/**
 * setval no es transaccional (un ROLLBACK no lo deshace), por eso las
 * secuencias se alinean con los números realmente guardados después del COMMIT.
 */
const SQL_SINCRONIZAR_SECUENCIAS = `
  SELECT setval('seq_cotizaciones',
                COALESCE((SELECT MAX(CAST(substring(numero FROM '([0-9]+)$') AS BIGINT)) FROM cotizaciones), 0) + 1, false),
         setval('seq_pedidos',
                COALESCE((SELECT MAX(CAST(substring(numero FROM '([0-9]+)$') AS BIGINT)) FROM pedidos), 0) + 1, false)
`;

async function borrarDatosDemo(client) {
  await client.query(SQL_BORRAR_DEMO);
}

async function main() {
  console.log(`🎬 Seed de demostración: ${DIAS} días simulados (${inicio} → ${hoy})`);
  const client = crearCliente();
  await client.connect();

  try {
    const { rows } = await client.query(
      `SELECT (SELECT COUNT(*) FROM productos) + (SELECT COUNT(*) FROM facturas_venta) AS n`,
    );
    const hayDatos = Number(rows[0].n) > 0;
    if (hayDatos && !RESET) {
      throw new Error('La base ya tiene productos o facturas. Use --reset para borrarlos y regenerar la demo');
    }
    if (RESET && !esBaseLocal() && !FORCE) {
      throw new Error(`--reset contra ${process.env.DB_HOST} borraría datos reales. Agregue --force si está seguro`);
    }

    const base = await cargarBase(client);
    simular(base);

    await client.query('BEGIN');
    if (RESET) {
      console.log('🧹 Borrando datos transaccionales anteriores...');
      await borrarDatosDemo(client);
    }
    for (const tabla of ORDEN_INSERCION) await insertar(client, tabla, T[tabla]);

    // Verificación: ningún producto puede quedar con saldo negativo en ninguna bodega
    const negativos = await client.query(`
      SELECT p.codigo, b.codigo AS bodega, SUM(CASE WHEN m.tipo_movimiento IN ('ENTRADA','AJUSTE_ENTRADA','TRASLADO_ENTRADA')
                                               THEN m.cantidad ELSE -m.cantidad END) AS saldo
        FROM movimientos_inventario m
        JOIN productos p ON p.id_producto = m.id_producto
        JOIN bodegas b ON b.id_bodega = m.id_bodega
       GROUP BY p.codigo, b.codigo
      HAVING SUM(CASE WHEN m.tipo_movimiento IN ('ENTRADA','AJUSTE_ENTRADA','TRASLADO_ENTRADA')
                      THEN m.cantidad ELSE -m.cantidad END) < 0`);
    if (negativos.rowCount > 0) {
      throw new Error(`Saldos negativos generados: ${JSON.stringify(negativos.rows)}`);
    }
    await client.query('COMMIT');
    await client.query(SQL_SINCRONIZAR_SECUENCIAS);

    console.log('✅ Datos de demostración insertados:');
    for (const tabla of ORDEN_INSERCION) {
      if (T[tabla]?.length) console.log(`   - ${tabla.padEnd(26)} ${T[tabla].length}`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Error en el seed de demostración:', err.message);
  process.exit(1);
});
