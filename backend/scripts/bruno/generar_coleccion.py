# -*- coding: utf-8 -*-
"""Genera la colección Bruno del CRM Contable."""
import base64, json, os, shutil, textwrap

# La colección se escribe en CRM_contable/bruno (se borra y se regenera completa, excepto README.md)
RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'bruno'))
os.makedirs(RAIZ, exist_ok=True)
for entrada in os.listdir(RAIZ):
    if entrada == 'README.md':
        continue
    ruta = os.path.join(RAIZ, entrada)
    shutil.rmtree(ruta) if os.path.isdir(ruta) else os.remove(ruta)

ADMIN, USUARIO, VENDEDOR = '{{tokenAdmin}}', '{{tokenUsuario}}', '{{tokenVendedor}}'

def bloque(nombre, contenido):
    contenido = textwrap.dedent(contenido).strip('\n')
    return f"{nombre} {{\n" + textwrap.indent(contenido, '  ') + "\n}\n"

carpetas = []

def carpeta(nombre):
    lista = []
    carpetas.append((nombre, lista))
    return lista

def req(lista, nombre, metodo, ruta, token=None, json_body=None, multipart=None, headers=None,
        pre=None, post=None, tests=None, docs=None, publico=False):
    lista.append(dict(nombre=nombre, metodo=metodo, ruta=ruta, token=token, json=json_body,
                      multipart=multipart, headers=headers or {}, pre=pre, post=post,
                      tests=tests, docs=docs, publico=publico))

def status(*codigos, msg=None):
    if len(codigos) == 1:
        return f'test("responde {codigos[0]}", function () {{\n  expect(res.getStatus()).to.equal({codigos[0]});\n}});\n'
    lista = ', '.join(map(str, codigos))
    return f'test("responde {" o ".join(map(str, codigos))}", function () {{\n  expect([{lista}]).to.include(res.getStatus());\n}});\n'

PROBLEMA = '''test("error en formato RFC 9457 (application/problem+json)", function () {
  expect(res.getHeader("content-type")).to.contain("application/problem+json");
  expect(res.getBody()).to.have.property("type");
  expect(res.getBody()).to.have.property("instance");
});
'''
PDF = '''test("devuelve un PDF", function () {
  expect(res.getHeader("content-type")).to.contain("application/pdf");
});
'''
FECHAS = '''// Fecha de hoy en Colombia (en UTC, después de las 7 p. m. ya sería mañana)
// Colombia es UTC-5 todo el año (sin horario de verano)
bru.setEnvVar("hoy", new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10));
'''
CLAVE = 'bru.setEnvVar("claveIdem", "bruno-" + Date.now() + "-" + Math.random().toString(16).slice(2));\n'

# ─── 01 Autenticación ──────────────────────────────────────────────────────
f = carpeta('01 Autenticacion')
for quien, email, var in [('Administrador', 'admin@crmcontable.com', 'tokenAdmin'),
                          ('Usuario', 'usuario@crmcontable.com', 'tokenUsuario'),
                          ('Vendedor (otro Usuario)', 'vendedor@crmcontable.com', 'tokenVendedor')]:
    req(f, f'Login {quien}', 'post', '/auth/login', publico=True,
        json_body={'email': email, 'password': '{{claveSemilla}}'},
        post=f'bru.setEnvVar("{var}", res.getBody().accessToken);\n',
        tests=status(200) + 'test("entrega accessToken y permisos", function () {\n  expect(res.getBody().accessToken).to.be.a("string");\n  expect(res.getBody().user.permisos).to.be.an("array");\n});\n')
req(f, 'Perfil propio (me)', 'get', '/auth/me', USUARIO,
    tests=status(200) + 'test("Usuario tiene permisos operativos", function () {\n  expect(res.getBody().permisos).to.include("ventas.crear");\n  expect(res.getBody().permisos).to.include("inventario.movimientos");\n  expect(res.getBody().permisos).to.not.include("ventas.anular");\n});\n')
req(f, 'Login con correo inexistente - 401 generico', 'post', '/auth/login', publico=True,
    json_body={'email': 'noexiste@crmcontable.com', 'password': 'Cualquiera123'},
    tests=status(401) + PROBLEMA + 'test("no revela si el correo existe", function () {\n  expect(res.getBody().detail).to.equal("Correo o contraseña incorrectos");\n});\n')
req(f, 'Sin token - 401', 'get', '/clientes', publico=True, tests=status(401) + PROBLEMA)
req(f, 'Usuario en endpoint de administrador - 403', 'get', '/usuarios', USUARIO,
    tests=status(403) + PROBLEMA)
req(f, 'Validacion de DTO - 400 con lista de errores', 'post', '/clientes', ADMIN, json_body={'campoInventado': 1},
    tests=status(400) + 'test("lista los errores en errors[]", function () {\n  expect(res.getBody().errors).to.be.an("array").that.is.not.empty;\n});\n')

# ─── 02 Datos base ─────────────────────────────────────────────────────────
f = carpeta('02 Datos base')
req(f, 'Bodegas', 'get', '/bodegas', USUARIO,
    post='const b = res.getBody().filter((x) => x.activo);\nbru.setEnvVar("idBodega2", (b[1] || b[0]).id);\n',
    tests=status(200))
req(f, 'Saldos de inventario (elige producto y bodega con stock)', 'get', '/inventario?limit=100', USUARIO,
    post='''const fila = res.getBody().data.find((s) => s.disponible > 10);
if (fila) {
  bru.setEnvVar("idProducto", fila.idProducto);
  bru.setEnvVar("codigoProducto", fila.codigo);
  bru.setEnvVar("idBodega", fila.idBodega);
}
''',
    tests=status(200) + 'test("hay un producto con más de 10 unidades disponibles", function () {\n  expect(res.getBody().data.some((s) => s.disponible > 10)).to.equal(true);\n});\n',
    docs='Guarda idProducto e idBodega de la primera fila con más de 10 unidades disponibles. Las demás pruebas usan esas variables.')
req(f, 'Medios de pago', 'get', '/medios-pago', USUARIO,
    post='bru.setEnvVar("idMetodoPago", res.getBody()[0].id);\n', tests=status(200))
req(f, 'Categorias de gasto', 'get', '/categorias-gasto', USUARIO,
    post='bru.setEnvVar("idCategoriaGasto", res.getBody()[0].id);\n', tests=status(200))
req(f, 'Tipos de documento', 'get', '/tipos-documento', USUARIO,
    post='bru.setEnvVar("idTipoDocumento", res.getBody()[0].id);\n', tests=status(200))
req(f, 'Clientes (paginado, Administrador)', 'get', '/clientes?limit=50', ADMIN,
    post='''const c = res.getBody().data.find((x) => x.tercero.activo);
bru.setEnvVar("idCliente", c.id);
bru.setEnvVar("documentoCliente", c.tercero.numeroDocumento);
bru.setEnvVar("idTipoDocCliente", c.tercero.idTipoDocumento);
''',
    tests=status(200) + 'test("respuesta paginada", function () {\n  expect(res.getBody()).to.have.property("meta");\n  expect(res.getBody().meta.total).to.be.above(0);\n});\n')
req(f, 'Proveedores (paginado, Administrador)', 'get', '/proveedores?limit=50', ADMIN,
    post='bru.setEnvVar("idProveedor", res.getBody().data.find((x) => x.tercero.activo).id);\n', tests=status(200))
req(f, 'Usuario lista el directorio de clientes - 403', 'get', '/clientes?limit=50', USUARIO, tests=status(403) + PROBLEMA)
req(f, 'Usuario busca clientes (sin contacto ni cupo)', 'get', '/clientes/buscar?q={{documentoCliente}}', USUARIO,
    tests=status(200) + '''test("solo id, nombre, documento y estado", function () {
  expect(res.getBody().length).to.be.above(0);
  expect(Object.keys(res.getBody()[0]).sort()).to.eql(["activo", "creditoBloqueado", "id", "numeroDocumento", "razonSocial"]);
});
''')
req(f, 'Usuario busca proveedores', 'get', '/proveedores/buscar?q=sa', USUARIO, tests=status(200))
req(f, 'Productos (paginado)', 'get', '/productos?limit=20', USUARIO, tests=status(200))
req(f, 'Busqueda rapida de productos', 'get', '/productos/buscar?q={{codigoProducto}}', USUARIO, tests=status(200))

# ─── 03 Remisiones ─────────────────────────────────────────────────────────
f = carpeta('03 Remisiones')
venta = {'idCliente': '{{idCliente}}', 'idBodega': '{{idBodega}}', 'fechaVencimiento': '{{hoy}}',
         'items': [{'idProducto': '{{idProducto}}', 'cantidad': 1, 'valorUnitario': 100000, 'pctDescuento': 10, 'pctIva': 19}]}
req(f, 'Siguiente consecutivo', 'get', '/facturas-venta/siguiente-consecutivo', USUARIO,
    tests=status(200) + 'test("consecutivo REM", function () {\n  expect(res.getBody().siguienteNumero).to.match(/^REM-/);\n});\n')
req(f, 'Simular totales (calcular)', 'post', '/facturas-venta/calcular', USUARIO,
    json_body={'items': venta['items'], 'porcentajeRetefuente': 2.5},
    tests=status(200) + 'test("100000 - 10% + 19% IVA", function () {\n  expect(res.getBody().subtotalNeto).to.equal(90000);\n  expect(res.getBody().totalIva).to.equal(17100);\n});\n')
req(f, 'Crear remision de contado (idempotente)', 'post', '/facturas-venta', USUARIO, json_body=venta,
    headers={'Idempotency-Key': '{{claveIdem}}'}, pre=FECHAS + CLAVE,
    post='bru.setEnvVar("idRemision", res.getBody().id);\n',
    tests=status(201) + 'test("numero REM y total 107100", function () {\n  expect(res.getBody().numeroVenta).to.match(/^REM-\\d{6}$/);\n  expect(res.getBody().total).to.equal(107100);\n  expect(res.getBody().estadoDian).to.equal("NO_APLICA");\n});\n')
req(f, 'Repetir con la misma Idempotency-Key - misma remision', 'post', '/facturas-venta', USUARIO, json_body=venta,
    headers={'Idempotency-Key': '{{claveIdem}}'},
    tests=status(201) + 'test("devuelve la misma remisión sin crear otra", function () {\n  expect(res.getBody().id).to.equal(bru.getEnvVar("idRemision"));\n  expect(res.getHeader("idempotent-replayed")).to.equal("true");\n});\n',
    docs='Debe ejecutarse justo después de "Crear remisión de contado": reutiliza la misma clave.')
req(f, 'Misma Idempotency-Key con otro cuerpo - 422', 'post', '/facturas-venta', USUARIO,
    json_body={**venta, 'observaciones': 'cuerpo distinto'}, headers={'Idempotency-Key': '{{claveIdem}}'},
    tests=status(422) + PROBLEMA)
req(f, 'Stock insuficiente - 409', 'post', '/facturas-venta', USUARIO,
    json_body={**venta, 'items': [{'idProducto': '{{idProducto}}', 'cantidad': 9999999, 'valorUnitario': 1}]},
    tests=status(409) + PROBLEMA + '''test("type y title específicos (GEMINI §6)", function () {
  expect(res.getBody().type).to.match(/\\/stock-insuficiente$/);
  expect(res.getBody().title).to.equal("Stock insuficiente");
});
''')
req(f, 'Listar remisiones (filtros y paginado)', 'get', '/facturas-venta?limit=10&clienteId={{idCliente}}', USUARIO, tests=status(200))
req(f, 'Detalle de remision', 'get', '/facturas-venta/{{idRemision}}', USUARIO, tests=status(200))
req(f, 'PDF de remision', 'get', '/facturas-venta/{{idRemision}}/pdf', USUARIO, tests=status(200) + PDF)
req(f, 'Editar campos no financieros', 'patch', '/facturas-venta/{{idRemision}}', USUARIO,
    json_body={'observaciones': 'Entregar en mostrador'}, tests=status(200))
req(f, 'Usuario intenta anular - 403', 'post', '/facturas-venta/{{idRemision}}/anular', USUARIO,
    json_body={'motivo': 'Prueba de permisos'}, tests=status(403))
req(f, 'Anular sin motivo - 400', 'post', '/facturas-venta/{{idRemision}}/anular', ADMIN, json_body={}, tests=status(400))
req(f, 'Administrador anula la remision', 'post', '/facturas-venta/{{idRemision}}/anular', ADMIN,
    json_body={'motivo': 'Prueba de anulación desde Bruno'},
    tests=status(200) + 'test("anulada con movimientos compensatorios", function () {\n  expect(res.getBody().anulada).to.equal(true);\n});\n')
req(f, 'Anular dos veces - 409', 'post', '/facturas-venta/{{idRemision}}/anular', ADMIN,
    json_body={'motivo': 'Prueba de anulación desde Bruno'}, tests=status(409) + PROBLEMA)
req(f, 'Remision inexistente - 404', 'get', '/facturas-venta/00000000-0000-4000-8000-000000000000', USUARIO, tests=status(404) + PROBLEMA)

# ─── 04 Crédito de clientes ────────────────────────────────────────────────
f = carpeta('04 Credito de clientes')
req(f, 'Estado de cuenta del cliente', 'get', '/clientes/{{idCliente}}/cartera', USUARIO,
    post='bru.setEnvVar("cupoAntes", res.getBody().cupoCredito);\n', tests=status(200))
req(f, 'Bloquear credito', 'post', '/clientes/{{idCliente}}/bloquear-credito', ADMIN,
    json_body={'motivo': 'Mora mayor a 90 días (prueba Bruno)'},
    tests=status(200) + 'test("crédito bloqueado", function () {\n  expect(res.getBody().creditoBloqueado).to.equal(true);\n});\n')
req(f, 'Venta a credito con bloqueo - 422', 'post', '/facturas-venta', USUARIO,
    json_body={**venta, 'fechaVencimiento': '2099-12-31'},
    tests=status(422) + 'test("tipo credito-bloqueado", function () {\n  expect(res.getBody().type).to.match(/credito-bloqueado$/);\n});\n')
req(f, 'Desbloquear credito (conserva el cupo)', 'post', '/clientes/{{idCliente}}/desbloquear-credito', ADMIN,
    json_body={'motivo': 'Acuerdo de pago (prueba Bruno)'},
    tests=status(200) + 'test("conserva el cupo anterior", function () {\n  expect(res.getBody().creditoBloqueado).to.equal(false);\n  expect(Number(res.getBody().cupoCredito)).to.equal(Number(bru.getEnvVar("cupoAntes")));\n});\n')
req(f, 'Usuario intenta cambiar el cupo por PATCH - 400', 'patch', '/clientes/{{idCliente}}', USUARIO,
    json_body={'cupoCredito': 1}, tests=status(400))
req(f, 'Usuario intenta definir cupo - 403', 'patch', '/clientes/{{idCliente}}/cupo-credito', USUARIO,
    json_body={'cupoCredito': 1, 'diasPlazo': 1}, tests=status(403))
req(f, 'Documento duplicado - 409', 'post', '/clientes', USUARIO,
    json_body={'idTipoDocumento': '{{idTipoDocCliente}}', 'numeroDocumento': '{{documentoCliente}}', 'razonSocial': 'Duplicado', 'tipoPersona': 'JURIDICA'},
    tests=status(409) + PROBLEMA)

# ─── 05 Cotizaciones y pedidos ─────────────────────────────────────────────
f = carpeta('05 Cotizaciones y pedidos')
req(f, 'Crear cotizacion', 'post', '/cotizaciones', USUARIO,
    json_body={'idCliente': '{{idCliente}}', 'items': [{'idProducto': '{{idProducto}}', 'cantidad': 1, 'valorUnitario': 50000, 'pctIva': 19}]},
    post='bru.setEnvVar("idCotizacion", res.getBody().id);\n',
    tests=status(201) + 'test("numero COT", function () {\n  expect(res.getBody().numero).to.match(/^COT-/);\n});\n')
req(f, 'PDF de cotizacion', 'get', '/cotizaciones/{{idCotizacion}}/pdf', USUARIO, tests=status(200) + PDF)
req(f, 'Enviar cotizacion por correo (asincrono)', 'post', '/cotizaciones/{{idCotizacion}}/enviar', USUARIO,
    json_body={'email': 'cliente.prueba@example.com'},
    post='if (res.getStatus() === 202) bru.setEnvVar("idJobCotizacion", res.getBody().jobId);\n',
    tests=status(202, 422),
    docs='202 si el correo está configurado (o CORREO_MODO=log fuera de producción). 422 si falta configurar /configuracion/correo y SMTP_PASSWORD.')
req(f, 'Aprobar cotizacion', 'post', '/cotizaciones/{{idCotizacion}}/aprobar', USUARIO, tests=status(200))
req(f, 'Editar cotizacion aprobada - 409', 'patch', '/cotizaciones/{{idCotizacion}}', USUARIO,
    json_body={'observacion': 'cambio'}, tests=status(409))
req(f, 'Convertir en pedido (reserva stock)', 'post', '/cotizaciones/{{idCotizacion}}/convertir-pedido', USUARIO,
    json_body={'idBodega': '{{idBodega}}'},
    post='bru.setEnvVar("idPedido", res.getBody().pedido.id);\n',
    tests=status(201) + 'test("numero PED", function () {\n  expect(res.getBody().pedido.numero).to.match(/^PED-/);\n});\n')
req(f, 'Transicion de estado invalida - 409', 'patch', '/pedidos/{{idPedido}}/estado', USUARIO,
    json_body={'estado': 'ENTREGADO'}, tests=status(409))
req(f, 'Avanzar estado a EN_PROCESO', 'patch', '/pedidos/{{idPedido}}/estado', USUARIO,
    json_body={'estado': 'EN_PROCESO', 'observacion': 'Alistando'}, tests=status(200))
req(f, 'Trazabilidad del pedido', 'get', '/pedidos/{{idPedido}}/trazabilidad', USUARIO, tests=status(200))
req(f, 'Generar remision del pedido (idempotente)', 'post', '/pedidos/{{idPedido}}/facturar', USUARIO,
    json_body={}, headers={'Idempotency-Key': '{{claveIdem}}'}, pre=CLAVE,
    tests=status(201) + 'test("crea una remisión REM", function () {\n  expect(res.getBody().numeroVenta).to.match(/^REM-/);\n});\n')
req(f, 'Anular pedido sin motivo - 400', 'post', '/pedidos/{{idPedido}}/anular', ADMIN, json_body={}, tests=status(400))

# ─── 06 Compras y pagos ────────────────────────────────────────────────────
f = carpeta('06 Compras y pagos')
compra = {'idProveedor': '{{idProveedor}}', 'numeroFactura': '{{numeroCompra}}', 'fechaEmision': '{{hoy}}',
          'idBodega': '{{idBodega}}', 'pctRetefuente': 2.5, 'pctReteIva': 15, 'tarifaReteIcaPorMil': 9.66,
          'items': [{'idProducto': '{{idProducto}}', 'cantidad': 10, 'costoUnitario': 10000, 'pctDescuento': 10, 'pctIva': 19}]}
req(f, 'Registrar compra con descuento y retenciones (idempotente)', 'post', '/facturas-compra', USUARIO,
    json_body=compra, headers={'Idempotency-Key': '{{claveIdem}}'},
    pre=FECHAS + CLAVE + 'bru.setEnvVar("numeroCompra", "BRU-" + Date.now());\n',
    post='bru.setEnvVar("idCompra", res.getBody().id);\nbru.setEnvVar("totalCompra", res.getBody().total);\n',
    tests=status(201) + '''test("base, IVA, ReteFuente, ReteIVA, ReteICA y total", function () {
  const c = res.getBody();
  expect(c.base).to.equal(90000);
  expect(c.totalIva).to.equal(17100);
  expect(c.retefuente).to.equal(2250);
  expect(c.reteiva).to.equal(2565);
  expect(c.reteica).to.equal(869.4);
  expect(c.total).to.equal(101415.6);
  expect(c.saldo).to.equal(101415.6);
});
test("guarda las tarifas aplicadas (NUMERIC(5,2))", function () {
  const c = res.getBody();
  expect(c.pctRetefuente).to.equal(2.5);
  expect(c.pctReteIva).to.equal(15);
  expect(c.tarifaReteIcaPorMil).to.equal(9.66);
});
''')
req(f, 'Numero de factura duplicado - 409', 'post', '/facturas-compra', USUARIO,
    json_body={**compra, 'items': [{'idProducto': '{{idProducto}}', 'cantidad': 1, 'costoUnitario': 1}]},
    tests=status(409) + PROBLEMA)
req(f, 'Subir PDF de la factura del proveedor', 'post', '/facturas-compra/{{idCompra}}/adjuntos', USUARIO,
    multipart={'archivo': '@file(archivos/factura-prueba.pdf)'}, tests=status(201))
req(f, 'Subir archivo con contenido falso - 415', 'post', '/facturas-compra/{{idCompra}}/adjuntos', USUARIO,
    multipart={'archivo': '@file(archivos/no-es-pdf.pdf)'}, tests=status(415) + PROBLEMA,
    docs='El archivo tiene extensión .pdf pero no es un PDF: se valida la firma del contenido, no solo el tipo.')
req(f, 'Listar adjuntos', 'get', '/facturas-compra/{{idCompra}}/adjuntos', USUARIO,
    post='if (res.getBody()[0]) bru.setEnvVar("idAdjunto", res.getBody()[0].id);\n', tests=status(200))
req(f, 'Descargar adjunto', 'get', '/facturas-compra/{{idCompra}}/adjuntos/{{idAdjunto}}', USUARIO, tests=status(200) + PDF)
req(f, 'Leer XML de factura electronica del proveedor', 'post', '/facturas-compra/importar-xml', USUARIO,
    multipart={'archivo': '@file(archivos/factura-proveedor.xml)'},
    tests=status(200) + '''test("identifica proveedor por NIT y producto por código", function () {
  const p = res.getBody().precarga;
  expect(p.idProveedor).to.be.a("string");
  expect(p.items[0].idProducto).to.be.a("string");
  expect(p.items[0].pctDescuento).to.equal(10);
  expect(p.items[0].pctIva).to.equal(19);
});
''', docs='XML UBL con el NIT de un proveedor y el código de un producto reales de la base. No guarda nada: devuelve la precarga para POST /facturas-compra.')
req(f, 'XML con DOCTYPE (XXE) - 422', 'post', '/facturas-compra/importar-xml', USUARIO,
    multipart={'archivo': '@file(archivos/xxe.xml)'}, tests=status(422))
req(f, 'Pago mayor al saldo - 422', 'post', '/pagos', USUARIO,
    json_body={'tipoPago': 'factura de compra', 'idFactura': '{{idCompra}}', 'idMetodoPago': '{{idMetodoPago}}', 'monto': 999999999},
    tests=status(422) + PROBLEMA)
req(f, 'Pagar el total de la compra (idempotente)', 'post', '/pagos', USUARIO,
    json_body={'tipoPago': 'factura de compra', 'idFactura': '{{idCompra}}', 'idMetodoPago': '{{idMetodoPago}}', 'monto': '{{totalCompra}}'},
    headers={'Idempotency-Key': '{{claveIdem}}'}, pre=CLAVE,
    post='bru.setEnvVar("idPago", res.getBody().id);\n', tests=status(201))
req(f, 'Comprobante de egreso PDF', 'get', '/pagos/{{idPago}}/recibo', USUARIO, tests=status(200) + PDF)
req(f, 'Otro Usuario consulta el pago ajeno - 404', 'get', '/pagos/{{idPago}}', VENDEDOR, tests=status(404) + PROBLEMA,
    docs='Pagos propios (GEMINI §5.2/§5.4): sin pagos.consultar_todos solo se ven los pagos que uno registró. Un pago ajeno responde 404, igual que uno inexistente.')
req(f, 'Otro Usuario pide el recibo ajeno - 404', 'get', '/pagos/{{idPago}}/recibo', VENDEDOR, tests=status(404))
req(f, 'Administrador ve el pago de cualquier usuario', 'get', '/pagos/{{idPago}}', ADMIN, tests=status(200))
req(f, 'Compra queda con saldo cero', 'get', '/facturas-compra/{{idCompra}}', USUARIO,
    tests=status(200) + 'test("saldo 0", function () {\n  expect(res.getBody().saldo).to.equal(0);\n});\n')
req(f, 'Anular compra con pagos - 409', 'post', '/facturas-compra/{{idCompra}}/anular', ADMIN,
    json_body={'motivo': 'Factura errada'}, tests=status(409))
req(f, 'Reversar el pago (reabre el saldo)', 'post', '/pagos/{{idPago}}/anular', ADMIN,
    json_body={'motivo': 'Pago duplicado (prueba Bruno)'}, tests=status(200))
req(f, 'Cuentas por pagar proximas a vencer', 'get', '/cuentas-por-pagar/proximas-vencer?dias=30', ADMIN, tests=status(200))
req(f, 'Usuario ve cuentas por pagar globales - 403', 'get', '/cuentas-por-pagar', USUARIO, tests=status(403))
req(f, 'Usuario ve cuentas por pagar del proveedor', 'get', '/cuentas-por-pagar?proveedorId={{idProveedor}}', USUARIO, tests=status(200))
req(f, 'Listar pagos (filtros y paginado)', 'get', '/pagos?limit=10&tipoPago=factura de compra', USUARIO, tests=status(200))
req(f, 'Otro Usuario no ve el pago en su listado', 'get', '/pagos?limit=100', VENDEDOR,
    tests=status(200) + '''test("el pago del Usuario no aparece", function () {
  const ids = res.getBody().data.map((p) => p.id);
  expect(ids).to.not.include(bru.getEnvVar("idPago"));
});
''')
req(f, 'Usuario ve productos del proveedor sin costos', 'get', '/proveedores/{{idProveedor}}/productos', USUARIO,
    tests=status(200) + '''test("no incluye costoActual (costos: solo Administrador)", function () {
  res.getBody().productosSuministrados.forEach((p) => expect(p).to.not.have.property("costoActual"));
});
''')
req(f, 'Administrador ve productos del proveedor con costos', 'get', '/proveedores/{{idProveedor}}/productos', ADMIN,
    tests=status(200) + '''test("incluye costoActual", function () {
  res.getBody().productosSuministrados.forEach((p) => expect(p).to.have.property("costoActual"));
});
''')
req(f, 'Usuario compara costos entre proveedores - 403', 'get', '/proveedores/comparar-precios?productoId={{idProducto}}', USUARIO,
    tests=status(403) + PROBLEMA)
req(f, 'Comparar costos entre proveedores (Administrador)', 'get', '/proveedores/comparar-precios?productoId={{idProducto}}', ADMIN,
    tests=status(200))
req(f, 'Usuario pide reporte de compras - 403', 'get', '/reportes/compras', USUARIO, tests=status(403))

# ─── 07 Inventario ─────────────────────────────────────────────────────────
f = carpeta('07 Inventario')
req(f, 'Entrada sin motivo - 400', 'post', '/inventario/entradas', USUARIO,
    json_body={'idProducto': '{{idProducto}}', 'idBodega': '{{idBodega}}', 'cantidad': 2}, tests=status(400))
req(f, 'Registrar entrada', 'post', '/inventario/entradas', USUARIO,
    json_body={'idProducto': '{{idProducto}}', 'idBodega': '{{idBodega}}', 'cantidad': 2, 'motivo': 'Prueba Bruno: entrada'},
    tests=status(201))
req(f, 'Registrar salida', 'post', '/inventario/salidas', USUARIO,
    json_body={'idProducto': '{{idProducto}}', 'idBodega': '{{idBodega}}', 'cantidad': 1, 'motivo': 'Prueba Bruno: salida'},
    tests=status(201))
req(f, 'Traslado entre bodegas', 'post', '/inventario/traslados', USUARIO,
    json_body={'idProducto': '{{idProducto}}', 'idBodegaOrigen': '{{idBodega}}', 'idBodegaDestino': '{{idBodega2}}', 'cantidad': 1, 'observacion': 'Prueba Bruno: traslado'},
    tests=status(201, 400), docs='400 solo si la base tiene una única bodega activa (origen y destino iguales).')
req(f, 'Usuario intenta ajustar - 403', 'post', '/inventario/ajustes', USUARIO,
    json_body={'idProducto': '{{idProducto}}', 'idBodega': '{{idBodega}}', 'cantidadFisica': 1, 'motivo': 'Conteo'}, tests=status(403))
req(f, 'Kardex como Usuario (sin costos)', 'get', '/inventario/{{idProducto}}/kardex', USUARIO,
    tests=status(200) + 'test("no expone costos al Usuario", function () {\n  expect(res.getBody().movimientos[0]).to.not.have.property("costoUnitario");\n});\n')
req(f, 'Kardex como Administrador (con costos)', 'get', '/inventario/{{idProducto}}/kardex', ADMIN,
    tests=status(200) + 'test("incluye costos", function () {\n  expect(res.getBody().movimientos[0]).to.have.property("costoUnitario");\n});\n')
req(f, 'Saldo del producto por bodega', 'get', '/inventario/{{idProducto}}', USUARIO, tests=status(200))
req(f, 'Alertas de stock minimo', 'get', '/inventario/alertas-stock', USUARIO, tests=status(200))
req(f, 'Inventario valorizado (Usuario - 403)', 'get', '/inventario/valorizado', USUARIO, tests=status(403))
req(f, 'Abrir conteo ciclico', 'post', '/inventario/conteos', ADMIN,
    json_body={'idBodega': '{{idBodega2}}', 'observacion': 'Prueba Bruno'},
    post='''if (res.getStatus() === 201) {
  bru.setEnvVar("idConteo", res.getBody().id_conteo);
  const item = res.getBody().items[0];
  bru.setEnvVar("idProductoConteo", item.id_producto);
  bru.setEnvVar("fisicoConteo", Number(item.stock_sistema) + 1);
}
''', tests=status(201, 409), docs='409 si la bodega ya tiene un conteo abierto (de una corrida anterior): ciérrelo o use otra bodega.')
req(f, 'Cerrar conteo con ajuste', 'post', '/inventario/conteos/{{idConteo}}/cerrar', ADMIN,
    json_body={'motivo': 'Conteo de prueba Bruno', 'conteosFisicos': [{'idProducto': '{{idProductoConteo}}', 'stockFisico': '{{fisicoConteo}}'}]},
    tests=status(200))
req(f, 'Cerrar el mismo conteo otra vez - 409', 'post', '/inventario/conteos/{{idConteo}}/cerrar', ADMIN,
    json_body={'motivo': 'Conteo de prueba Bruno', 'conteosFisicos': [{'idProducto': '{{idProductoConteo}}', 'stockFisico': 1}]},
    tests=status(409))
req(f, 'Eliminar bodega con existencias - 409', 'delete', '/bodegas/{{idBodega}}', ADMIN, tests=status(409))
req(f, 'Eliminar producto con stock - 409', 'delete', '/productos/{{idProducto}}', ADMIN, tests=status(409))

# ─── 08 Gastos ─────────────────────────────────────────────────────────────
f = carpeta('08 Gastos')
req(f, 'Registrar gasto propio', 'post', '/gastos', USUARIO,
    json_body={'idCategoriaGasto': '{{idCategoriaGasto}}', 'descripcion': 'Gasolina moto mensajero (Bruno)', 'monto': 45000},
    post='bru.setEnvVar("idGasto", res.getBody().id);\n', tests=status(201))
req(f, 'Subir soporte (imagen)', 'post', '/gastos/{{idGasto}}/soporte', USUARIO,
    multipart={'archivo': '@file(archivos/recibo.jpg)'}, tests=status(201))
req(f, 'Descargar soporte', 'get', '/gastos/{{idGasto}}/soporte', USUARIO, tests=status(200))
req(f, 'Otro Usuario ve el gasto ajeno - 404', 'get', '/gastos/{{idGasto}}', VENDEDOR, tests=status(404))
req(f, 'Usuario intenta anular gasto - 403', 'post', '/gastos/{{idGasto}}/anular', USUARIO,
    json_body={'motivo': 'Error de digitación'}, tests=status(403))
req(f, 'Administrador anula el gasto', 'post', '/gastos/{{idGasto}}/anular', ADMIN,
    json_body={'motivo': 'Prueba Bruno'}, tests=status(200))

# ─── 09 Periodos contables ─────────────────────────────────────────────────
f = carpeta('09 Periodos contables')
MES = '''const d = new Date();
const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 2, 15));
bru.setEnvVar("mesCerrado", m.toISOString().slice(0, 7));
'''
req(f, 'Cerrar el mes de hace dos meses', 'post', '/reportes/cierre-mensual', ADMIN,
    json_body={'periodo': '{{mesCerrado}}', 'observaciones': 'Prueba Bruno (se reabre al final de la carpeta)'},
    pre=MES, tests=status(200, 409),
    docs='Cierra un mes real de la base. La última petición de esta carpeta lo reabre. 409 si ya estaba cerrado.')
req(f, 'Gasto con fecha en periodo cerrado - 422', 'post', '/gastos', USUARIO,
    json_body={'idCategoriaGasto': '{{idCategoriaGasto}}', 'descripcion': 'Gasto retroactivo', 'monto': 10000, 'fecha': '{{mesCerrado}}-10'},
    tests=status(422) + 'test("tipo periodo-cerrado", function () {\n  expect(res.getBody().type).to.match(/periodo-cerrado$/);\n});\n')
req(f, 'No se cierra el mes en curso - 422', 'post', '/reportes/cierre-mensual', ADMIN,
    json_body={'periodo': '{{mesActual}}'}, pre='bru.setEnvVar("mesActual", new Date().toISOString().slice(0, 7));\n', tests=status(422))
req(f, 'Listar periodos', 'get', '/periodos-contables', ADMIN,
    post='''const mes = bru.getEnvVar("mesCerrado");
const p = res.getBody().find((x) => `${x.anio}-${String(x.mes).padStart(2, "0")}` === mes);
if (p) bru.setEnvVar("idPeriodo", p.id_periodo);
''', tests=status(200))
req(f, 'Reabrir sin motivo - 400', 'post', '/periodos-contables/{{idPeriodo}}/reabrir', ADMIN, json_body={}, tests=status(400))
req(f, 'Reabrir el periodo (deja la base como estaba)', 'post', '/periodos-contables/{{idPeriodo}}/reabrir', ADMIN,
    json_body={'motivo': 'Fin de la prueba Bruno'}, tests=status(200, 409))

# ─── 10 Usuarios y roles ───────────────────────────────────────────────────
f = carpeta('10 Usuarios y roles')
req(f, 'Listar usuarios', 'get', '/usuarios?limit=100', ADMIN,
    post='''const u = res.getBody().data;
bru.setEnvVar("idGerencia", u.find((x) => x.email === "gerencia@crmcontable.com").id);
bru.setEnvVar("idAdminPrincipal", u.find((x) => x.email === "admin@crmcontable.com").id);
''', tests=status(200))
req(f, 'Desactivarse a si mismo - 400', 'post', '/usuarios/{{idAdminPrincipal}}/desactivar', ADMIN, tests=status(400))
req(f, 'Desactivar al otro administrador', 'post', '/usuarios/{{idGerencia}}/desactivar', ADMIN, tests=status(200))
req(f, 'Reactivar al otro administrador', 'post', '/usuarios/{{idGerencia}}/activar', ADMIN, tests=status(200),
    docs='Deja gerencia@crmcontable.com activo otra vez.')
req(f, 'Roles y permisos', 'get', '/roles', ADMIN,
    post='bru.setEnvVar("idRolUsuario", res.getBody().find((r) => r.codigo === "USUARIO").id);\n', tests=status(200))
req(f, 'Catalogo de permisos', 'get', '/permisos', ADMIN, tests=status(200))
req(f, 'Crear usuario por invitacion (sin contrasena)', 'post', '/usuarios', ADMIN,
    json_body={'email': 'invitado.{{marca}}@example.com', 'nombres': 'Invitado', 'apellidos': 'Bruno', 'idRol': '{{idRolUsuario}}'},
    pre='bru.setEnvVar("marca", Date.now());\n',
    tests=status(201) + 'test("envía invitación", function () {\n  expect(res.getBody().invitacionEnviada).to.equal(true);\n});\n')
req(f, 'Actividad del usuario', 'get', '/usuarios/{{idAdminPrincipal}}/actividad', ADMIN, tests=status(200))

# ─── 11 Recuperación de contraseña ─────────────────────────────────────────
f = carpeta('11 Recuperacion de contrasena')
req(f, 'Olvido con correo inexistente', 'post', '/auth/forgot-password', publico=True,
    json_body={'email': 'noexiste@crmcontable.com'},
    post='bru.setEnvVar("mensajeOlvido", res.getBody().message);\n', tests=status(200))
req(f, 'Olvido con correo existente (misma respuesta)', 'post', '/auth/forgot-password', publico=True,
    json_body={'email': 'caja@crmcontable.com'},
    tests=status(200) + 'test("no revela si el correo existe", function () {\n  expect(res.getBody().message).to.equal(bru.getEnvVar("mensajeOlvido"));\n});\n')
req(f, 'Restablecer con token falso - 400', 'post', '/auth/reset-password', publico=True,
    json_body={'token': 'token-falso-123456', 'newPassword': 'NuevaClave2026'}, tests=status(400))
req(f, 'MANUAL - Restablecer con el token del correo', 'post', '/auth/reset-password', publico=True,
    json_body={'token': '{{tokenRecuperacion}}', 'newPassword': 'Admin123*Nueva'}, tests=status(200),
    docs='Manual: copie el token del enlace que llega al correo de caja@crmcontable.com (con CORREO_MODO=log aparece en la consola del backend) en la variable tokenRecuperacion del entorno. Cambia la contraseña de caja@crmcontable.com.')

# ─── 12 Consecutivos ───────────────────────────────────────────────────────
f = carpeta('12 Consecutivos')
req(f, 'Estado de consecutivos', 'get', '/consecutivos', ADMIN, tests=status(200))
req(f, 'Retroceder consecutivo - 409', 'patch', '/consecutivos/REMISION', ADMIN,
    json_body={'siguiente': 1, 'motivo': 'Intento de retroceso'}, tests=status(409))
req(f, 'Usuario intenta ajustar consecutivo - 403', 'patch', '/consecutivos/REMISION', USUARIO,
    json_body={'siguiente': 99999, 'motivo': 'Sin permiso'}, tests=status(403))
req(f, 'Resoluciones DIAN fuera de alcance - 404', 'get', '/resoluciones', ADMIN, tests=status(404))

# ─── 13 Nómina ─────────────────────────────────────────────────────────────
f = carpeta('13 Nomina')
req(f, 'Usuario consulta nomina - 403', 'get', '/nomina', USUARIO, tests=status(403) + PROBLEMA,
    docs='La nómina es solo del Administrador (nomina.consultar). El resto de esta carpeta usa {{tokenAdmin}}.')
req(f, 'Usuario consulta empleados - 403', 'get', '/empleados', USUARIO, tests=status(403))
req(f, 'Registrar empleado', 'post', '/empleados', ADMIN,
    json_body={'idTipoDocumento': '{{idTipoDocumento}}', 'numeroDocumento': '{{documentoEmpleado}}', 'nombreCompleto': 'Empleado Prueba Bruno',
               'cargo': 'Bodeguero', 'salarioBase': 1423500, 'fechaIngreso': '2026-01-01'},
    pre='bru.setEnvVar("documentoEmpleado", String(Date.now()).slice(-10));\n',
    post='bru.setEnvVar("idEmpleado", res.getBody().id);\n', tests=status(201))
req(f, 'Abrir y liquidar nomina', 'post', '/nomina', ADMIN,
    json_body={'mes': '{{mesNomina}}', 'anio': '{{anioNomina}}'},
    pre='bru.setEnvVar("mesNomina", 1 + Math.floor(Math.random() * 12));\nbru.setEnvVar("anioNomina", 2030 + Math.floor(Math.random() * 60));\n',
    post='bru.setEnvVar("idNomina", res.getBody().id);\n',
    tests=status(201) + '''test("liquidación con SMMLV, auxilio y aportes del 4 %", function () {
  const d = res.getBody().detalles.find((x) => x.idEmpleado === bru.getEnvVar("idEmpleado"));
  expect(d.auxilioTransporte).to.equal(200000);
  expect(d.deduccionSalud).to.equal(56940);
  expect(d.netoPagar).to.equal(1509620);
});
''', docs='Usa un mes y año futuros aleatorios para no chocar con nóminas reales. Los valores esperados asumen NOMINA_SMMLV=1423500 y auxilio 200000.')
req(f, 'Nomina duplicada - 409', 'post', '/nomina', ADMIN,
    json_body={'mes': '{{mesNomina}}', 'anio': '{{anioNomina}}'}, tests=status(409))
req(f, 'Calcular con novedades', 'post', '/nomina/{{idNomina}}/calcular', ADMIN,
    json_body={'novedades': [{'idEmpleado': '{{idEmpleado}}', 'diasTrabajados': 15, 'horasExtras': 100000}]},
    tests=status(200) + '''test("15 días + horas extras", function () {
  const d = res.getBody().detalles.find((x) => x.idEmpleado === bru.getEnvVar("idEmpleado"));
  expect(d.netoPagar).to.equal(846810);
});
''')
req(f, 'Desprendibles PDF', 'get', '/nomina/{{idNomina}}/desprendibles', ADMIN, tests=status(200) + PDF)
req(f, 'Pagar nomina (genera gasto)', 'post', '/nomina/{{idNomina}}/pagar', ADMIN, json_body={},
    tests=status(200) + 'test("genera el gasto", function () {\n  expect(res.getBody().idGasto).to.be.a("string");\n});\n')
req(f, 'Pagar dos veces - 409', 'post', '/nomina/{{idNomina}}/pagar', ADMIN, json_body={}, tests=status(409))

# ─── 14 Reportes y tareas asíncronas ───────────────────────────────────────
f = carpeta('14 Reportes y exportaciones')
req(f, 'Dashboard operativo (Administrador)', 'get', '/dashboard/resumen', ADMIN, tests=status(200))
req(f, 'Usuario ve el dashboard global - 403', 'get', '/dashboard/resumen', USUARIO, tests=status(403))
req(f, 'Guardar configuracion propia del dashboard', 'put', '/dashboard/config', USUARIO,
    json_body={'graficas': ['ventas_mes', 'top_productos']}, tests=status(200))
req(f, 'Reporte de ventas (sin margenes)', 'get', '/reportes/ventas', ADMIN, tests=status(200))
req(f, 'Usuario pide reporte de ventas global - 403', 'get', '/reportes/ventas', USUARIO, tests=status(403))
req(f, 'Reporte de cartera por edades', 'get', '/reportes/cartera', ADMIN,
    tests=status(200) + 'test("totales por tramo", function () {\n  expect(res.getBody().totales).to.have.property("mas90");\n});\n')
req(f, 'Usuario pide rentabilidad - 403', 'get', '/reportes/rentabilidad', USUARIO, tests=status(403))
req(f, 'Rentabilidad (Administrador)', 'get', '/reportes/rentabilidad', ADMIN, tests=status(200))
req(f, 'Estado de resultados', 'get', '/reportes/estado-resultados', ADMIN, tests=status(200))
req(f, 'Usuario exporta utilidad - 403', 'post', '/reportes/exportar', USUARIO, json_body={'tipo': 'utilidad'}, tests=status(403))
req(f, 'Exportar inventario a CSV (asincrono)', 'post', '/reportes/exportar', USUARIO, json_body={'tipo': 'inventario'},
    post='bru.setEnvVar("idJob", res.getBody().jobId);\n', tests=status(202))
req(f, 'Consultar la exportacion', 'get', '/reportes/jobs/{{idJob}}', USUARIO,
    tests=status(200) + 'test("estado del job", function () {\n  expect(["PENDIENTE", "EN_PROCESO", "COMPLETADO"]).to.include(res.getBody().estado);\n});\n',
    docs='Si aún está PENDIENTE, espere unos segundos y repita: el worker procesa la cola cada 3 s.')
req(f, 'Descargar el CSV', 'get', '/reportes/jobs/{{idJob}}/descargar', USUARIO, tests=status(200, 409),
    docs='409 si la exportación todavía no termina; repita la consulta anterior.')
req(f, 'Otro Usuario consulta el job ajeno - 404', 'get', '/reportes/jobs/{{idJob}}', VENDEDOR, tests=status(404))

# ─── 15 Auditoría, configuración y operación ───────────────────────────────
f = carpeta('15 Auditoria configuracion y operacion')
req(f, 'Bitacora de anulaciones', 'get', '/auditoria/anulaciones', ADMIN, tests=status(200))
req(f, 'Accesos fallidos y denegados', 'get', '/auditoria/accesos?resultado=FALLO', ADMIN,
    tests=status(200) + 'test("registra LOGIN_FALLIDO y ACCESO_DENEGADO", function () {\n  const acciones = res.getBody().data.map((a) => a.accion);\n  expect(acciones).to.include("LOGIN_FALLIDO");\n  expect(acciones).to.include("ACCESO_DENEGADO");\n});\n')
req(f, 'Usuario consulta auditoria - 403', 'get', '/auditoria', USUARIO, tests=status(403))
req(f, 'Configuracion de correo (sin contrasena)', 'get', '/configuracion/correo', ADMIN,
    tests=status(200) + 'test("nunca devuelve la contraseña", function () {\n  expect(res.getBody()).to.not.have.property("password");\n});\n')
req(f, 'Intentar guardar un secreto por PATCH - 403', 'patch', '/configuracion', ADMIN,
    json_body={'CORREO_PASSWORD': 'x'}, tests=status(403))
req(f, 'Subir logo de la empresa', 'post', '/configuracion/empresa/logo', ADMIN,
    multipart={'archivo': '@file(archivos/logo.png)'}, tests=status(200),
    docs='Reemplaza el logo real de la empresa (aparece en los PDF). Súbalo de nuevo con el logo verdadero si hace falta.')
req(f, 'Datos de empresa (cualquier usuario)', 'get', '/configuracion/empresa', USUARIO, tests=status(200))
req(f, 'Health (publico)', 'get', '/health', publico=True, tests=status(200))
req(f, 'Readiness Cloud SQL y almacenamiento', 'get', '/health/ready', publico=True,
    tests=status(200) + 'test("base y almacenamiento arriba", function () {\n  expect(res.getBody().checks.database.status).to.equal("up");\n  expect(res.getBody().checks.storage.status).to.equal("up");\n});\n')
req(f, 'Version', 'get', '/version', publico=True, tests=status(200))
req(f, 'Metricas', 'get', '/admin/metricas', ADMIN, tests=status(200))
req(f, 'Tareas asincronas', 'get', '/admin/jobs?limit=20', ADMIN, tests=status(200))
req(f, 'Uso de almacenamiento', 'get', '/admin/almacenamiento', ADMIN, tests=status(200))
req(f, 'Respaldos de Cloud SQL', 'get', '/admin/backups', ADMIN, tests=status(200))
req(f, 'Ejecutar respaldo', 'post', '/admin/backups', ADMIN, json_body={'motivo': 'Prueba Bruno'},
    tests=status(202, 409, 503), docs='202 si GCP_PROJECT_ID y CLOUD_SQL_INSTANCE están configurados; 503 si no; 409 si ya hay uno en curso. Crea un respaldo real de Cloud SQL.')

# ─── 99 Límite de peticiones ───────────────────────────────────────────────
f = carpeta('99 Limite de peticiones (al final)')
req(f, 'Login fallido - repetir 11 veces para ver 429', 'post', '/auth/login', publico=True,
    json_body={'email': 'noexiste@crmcontable.com', 'password': 'Mala12345'},
    tests=status(401, 429),
    docs='Envíela 11 veces seguidas: las 10 primeras dan 401 y la 11.ª da 429. Luego su IP queda bloqueada para login durante 1 minuto.')

# ─── Escritura de archivos ─────────────────────────────────────────────────
def escribir_request(dir_carpeta, seq, r):
    tipo_body = 'json' if r['json'] is not None else ('multipartForm' if r['multipart'] else 'none')
    auth = 'none' if r['publico'] or not r['token'] else 'bearer'
    s = bloque('meta', f"name: {r['nombre']}\ntype: http\nseq: {seq}") + '\n'
    s += bloque(r['metodo'], f"url: {{{{baseUrl}}}}{r['ruta']}\nbody: {tipo_body}\nauth: {auth}") + '\n'
    if r['headers']:
        s += bloque('headers', '\n'.join(f'{k}: {v}' for k, v in r['headers'].items())) + '\n'
    if auth == 'bearer':
        s += bloque('auth:bearer', f"token: {r['token']}") + '\n'
    if r['json'] is not None:
        cuerpo = json.dumps(r['json'], ensure_ascii=False, indent=2)
        # Variables numéricas sin comillas
        for var in ['totalCompra', 'mesNomina', 'anioNomina', 'fisicoConteo']:
            cuerpo = cuerpo.replace(f'"{{{{{var}}}}}"', f'{{{{{var}}}}}')
        s += bloque('body:json', cuerpo) + '\n'
    if r['multipart']:
        s += bloque('body:multipart-form', '\n'.join(f'{k}: {v}' for k, v in r['multipart'].items())) + '\n'
    if r['pre']:
        s += bloque('script:pre-request', r['pre']) + '\n'
    if r['post']:
        s += bloque('script:post-response', r['post']) + '\n'
    if r['tests']:
        s += bloque('tests', r['tests']) + '\n'
    if r['docs']:
        s += bloque('docs', r['docs']) + '\n'
    nombre_archivo = f"{seq:02d} {r['nombre']}.bru".replace('/', '-')
    with open(os.path.join(dir_carpeta, nombre_archivo), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(s.rstrip('\n') + '\n')

total = 0
for i, (nombre, lista) in enumerate(carpetas, start=1):
    d = os.path.join(RAIZ, nombre)
    os.makedirs(d)
    with open(os.path.join(d, 'folder.bru'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(bloque('meta', f'name: {nombre}\nseq: {i}'))
    for seq, r in enumerate(lista, start=1):
        escribir_request(d, seq, r)
        total += 1

SCRIPT_COLECCION = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'collection_script.js'), encoding='utf-8').read()
with open(os.path.join(RAIZ, 'collection.bru'), 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(bloque('script:pre-request', SCRIPT_COLECCION))

with open(os.path.join(RAIZ, 'bruno.json'), 'w', encoding='utf-8', newline='\n') as fh:
    json.dump({'version': '1', 'name': 'CRM Contable API', 'type': 'collection', 'ignore': ['node_modules', '.git']}, fh, indent=2)
    fh.write('\n')

os.makedirs(os.path.join(RAIZ, 'environments'))
ENTORNOS = {
    'Cloud SQL - backend local': 'http://localhost:3000/api/v1',
    'Cloud Run': 'https://crm-contable-api-916812392845.us-east1.run.app/api/v1',
}
for nombre, url in ENTORNOS.items():
    with open(os.path.join(RAIZ, 'environments', f'{nombre}.bru'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(bloque('vars', f'baseUrl: {url}\nclaveSemilla: Admin123*\ntokenRecuperacion: pegue-aqui-el-token-del-correo'))

# Archivos de prueba
arch = os.path.join(RAIZ, 'archivos')
os.makedirs(arch)
with open(os.path.join(arch, 'factura-prueba.pdf'), 'wb') as fh:
    fh.write(b'%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
with open(os.path.join(arch, 'no-es-pdf.pdf'), 'wb') as fh:
    fh.write(b'MZ Esto no es un PDF, solo tiene la extension .pdf\n')
with open(os.path.join(arch, 'logo.png'), 'wb') as fh:
    fh.write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))
with open(os.path.join(arch, 'recibo.jpg'), 'wb') as fh:
    fh.write(bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]) + b'JFIF\x00' + bytes(20) + bytes([0xFF, 0xD9]))
xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>FE-BRUNO-001</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">cufe-de-prueba-bruno-001</cbc:UUID>
  <cbc:IssueDate>2026-10-01</cbc:IssueDate>
  <cbc:DueDate>2026-10-31</cbc:DueDate>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyTaxScheme>
    <cbc:RegistrationName>Correas y Rodamientos Andinos Ltda</cbc:RegistrationName>
    <cbc:CompanyID schemeID="8" schemeName="31">901334455-8</cbc:CompanyID>
  </cac:PartyTaxScheme></cac:Party></cac:AccountingSupplierParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="COP">5130.00</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="COP">27000.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="COP">5130.00</cbc:TaxAmount>
      <cac:TaxCategory><cbc:Percent>19.00</cbc:Percent><cac:TaxScheme><cbc:ID>01</cbc:ID><cbc:Name>IVA</cbc:Name></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">27000.00</cbc:LineExtensionAmount>
    <cbc:PayableAmount currencyID="COP">32130.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="94">3</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">27000.00</cbc:LineExtensionAmount>
    <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="COP">3000.00</cbc:Amount></cac:AllowanceCharge>
    <cac:TaxTotal><cbc:TaxAmount currencyID="COP">5130.00</cbc:TaxAmount>
      <cac:TaxSubtotal><cbc:TaxAmount currencyID="COP">5130.00</cbc:TaxAmount>
        <cac:TaxCategory><cbc:Percent>19.00</cbc:Percent><cac:TaxScheme><cbc:ID>01</cbc:ID></cac:TaxScheme></cac:TaxCategory>
      </cac:TaxSubtotal></cac:TaxTotal>
    <cac:Item><cbc:Description>Plumillas Limpiaparabrisas 22"</cbc:Description>
      <cac:SellersItemIdentification><cbc:ID>REP-ACC-001</cbc:ID></cac:SellersItemIdentification></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="COP">10000.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>
'''
with open(os.path.join(arch, 'factura-proveedor.xml'), 'w', encoding='utf-8', newline='\n') as fh:
    fh.write(xml)
with open(os.path.join(arch, 'xxe.xml'), 'w', encoding='utf-8', newline='\n') as fh:
    fh.write('<?xml version="1.0"?>\n<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>\n<Invoice>&e;</Invoice>\n')

print('requests:', total, 'carpetas:', len(carpetas))
