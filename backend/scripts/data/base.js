/**
 * Datos del seed base. Editar aquí para agregar ciudades, marcas, bodegas, etc.
 * seed-database.js solo inserta lo que falte.
 */
module.exports = {
  passwordUsuarios: 'Admin123*',

  paises: [
    {
      nombre: 'Colombia',
      departamentos: {
        'Bogotá D.C.': ['Bogotá'],
        Cundinamarca: ['Soacha', 'Chía', 'Zipaquirá', 'Fusagasugá', 'Facatativá'],
        Antioquia: ['Medellín', 'Bello', 'Itagüí', 'Envigado', 'Rionegro'],
        'Valle del Cauca': ['Cali', 'Palmira', 'Buenaventura', 'Tuluá'],
        Santander: ['Bucaramanga', 'Floridablanca', 'Barrancabermeja'],
        Atlántico: ['Barranquilla', 'Soledad'],
        Bolívar: ['Cartagena'],
        Boyacá: ['Tunja', 'Duitama', 'Sogamoso'],
        Tolima: ['Ibagué'],
        Risaralda: ['Pereira', 'Dosquebradas'],
        Caldas: ['Manizales'],
        Quindío: ['Armenia'],
        Meta: ['Villavicencio'],
        Huila: ['Neiva'],
        'Norte de Santander': ['Cúcuta'],
        Nariño: ['Pasto'],
      },
    },
    { nombre: 'Ecuador' },
    { nombre: 'Perú' },
  ],

  tiposDocumento: [
    { codigo: 'NIT', nombre: 'Número de Identificación Tributaria' },
    { codigo: 'CC', nombre: 'Cédula de Ciudadanía' },
    { codigo: 'CE', nombre: 'Cédula de Extranjería' },
    { codigo: 'PAS', nombre: 'Pasaporte' },
    { codigo: 'TI', nombre: 'Tarjeta de Identidad' },
    { codigo: 'PPT', nombre: 'Permiso por Protección Temporal' },
  ],

  unidades: [
    { codigo: 'UND', nombre: 'Unidad', decimales: 0 },
    { codigo: 'JGO', nombre: 'Juego / Kit', decimales: 0 },
    { codigo: 'PAR', nombre: 'Par', decimales: 0 },
    { codigo: 'LIT', nombre: 'Litro', decimales: 2 },
    { codigo: 'GAL', nombre: 'Galón', decimales: 2 },
    { codigo: 'MTR', nombre: 'Metro', decimales: 2 },
  ],

  impuestos: [
    { codigo: 'IVA_19', porcentaje: 19, tipo: 'IVA GENERAL', vigente_desde: '2017-01-01' },
    { codigo: 'IVA_5', porcentaje: 5, tipo: 'IVA REDUCIDO', vigente_desde: '2017-01-01' },
    { codigo: 'IVA_0', porcentaje: 0, tipo: 'EXENTO', vigente_desde: '2017-01-01' },
  ],

  // Categoría padre → subcategorías
  categorias: {
    'Repuestos Mecánicos': [
      'Frenos y Discos',
      'Suspensión y Dirección',
      'Motor y Transmisión',
      'Filtros',
      'Refrigeración',
    ],
    'Lubricantes y Químicos': ['Aceites de Motor', 'Aditivos y Líquidos'],
    'Eléctricos y Electrónica': ['Baterías y Alternadores', 'Bujías e Ignición', 'Iluminación'],
    Accesorios: ['Plumillas y Exteriores'],
  },

  marcas: [
    { nombre: 'Brembo', pais: 'Italia' },
    { nombre: 'Fremax', pais: 'Brasil' },
    { nombre: 'Monroe', pais: 'Estados Unidos' },
    { nombre: '555 Sankei', pais: 'Japón' },
    { nombre: 'Valeo', pais: 'Francia' },
    { nombre: 'Mobil', pais: 'Estados Unidos' },
    { nombre: 'Castrol', pais: 'Reino Unido' },
    { nombre: 'Baterías MAC', pais: 'Colombia' },
    { nombre: 'NGK', pais: 'Japón' },
    { nombre: 'Bosch', pais: 'Alemania' },
    { nombre: 'Gates', pais: 'Estados Unidos' },
    { nombre: 'Mann Filter', pais: 'Alemania' },
    { nombre: 'Philips', pais: 'Países Bajos' },
    { nombre: 'Terpel', pais: 'Colombia' },
    { nombre: 'SKF', pais: 'Suecia' },
    { nombre: 'Denso', pais: 'Japón' },
  ],

  bodegas: [
    { codigo: 'BOD-BOG-01', nombre: 'Bodega Principal Bogotá 7 de Agosto', ciudad: 'Bogotá' },
    { codigo: 'BOD-MED-01', nombre: 'Bodega Regional Antioquia Calle 33', ciudad: 'Medellín' },
    { codigo: 'BOD-CAL-01', nombre: 'Bodega Valle del Cauca Acopi', ciudad: 'Cali' },
  ],

  listasPrecios: ['Precio Público / Mostrador', 'Precio Taller / Mayorista', 'Precio Flotas y Convenios'],

  estadosFacturaVenta: [
    { codigo: 'BORRADOR', nombre: 'Borrador', es_final: false },
    { codigo: 'EMITIDA', nombre: 'Emitida / Por Cobrar', es_final: false },
    { codigo: 'PAGADA', nombre: 'Pagada Totalmente', es_final: true },
    { codigo: 'ANULADA', nombre: 'Anulada', es_final: true },
    { codigo: 'CASTIGADA', nombre: 'Castigada por incobrable', es_final: true },
  ],
  estadosFacturaCompra: [
    { codigo: 'RECIBIDA', nombre: 'Recibida / Por Pagar' },
    { codigo: 'PAGADA', nombre: 'Pagada Totalmente' },
    { codigo: 'ANULADA', nombre: 'Anulada' },
  ],
  estadosPago: [
    { codigo: 'APLICADO', nombre: 'Aplicado' },
    { codigo: 'PENDIENTE', nombre: 'Pendiente de Conciliación' },
    { codigo: 'ANULADO', nombre: 'Anulado' },
  ],

  metodosPago: [
    { codigo: 'EFECTIVO', nombre: 'Efectivo en Caja', afecta_caja: true },
    { codigo: 'TRANSFERENCIA', nombre: 'Transferencia bancaria', afecta_caja: false },
    { codigo: 'TARJETA_CREDITO', nombre: 'Tarjeta de Crédito', afecta_caja: false },
    { codigo: 'TARJETA_DEBITO', nombre: 'Tarjeta Débito', afecta_caja: false },
    { codigo: 'CHEQUE', nombre: 'Cheque al Día', afecta_caja: true },
    { codigo: 'NEQUI', nombre: 'Nequi / Daviplata', afecta_caja: false },
  ],

  categoriasGasto: [
    { nombre: 'Servicios Públicos (Energía, Agua, Internet)', codigo_puc: '5135' },
    { nombre: 'Arrendamiento de Bodegas y Locales', codigo_puc: '5120' },
    { nombre: 'Mantenimiento y Reparaciones Locativas', codigo_puc: '5145' },
    { nombre: 'Papelería, Útiles y Envíos', codigo_puc: '5195' },
    { nombre: 'Gastos de Transporte y Fletes de Mercancía', codigo_puc: '5235' },
    { nombre: 'Publicidad y Mercadeo', codigo_puc: '5235' },
    { nombre: 'Honorarios Contables y Legales', codigo_puc: '5110' },
    { nombre: 'Seguros', codigo_puc: '5130' },
    { nombre: 'Aseo y Cafetería', codigo_puc: '5195' },
  ],

  // Empresa emisora de ejemplo: solo se inserta si no hay una registrada.
  // Reemplácela con los datos reales desde PUT /empresa.
  empresa: {
    nit: '900999888-5',
    razon_social: 'Repuestos Automotrices Demo SAS',
    nombre_comercial: 'AutoRepuestos Demo',
    ciudad: 'Bogotá',
    direccion: 'Calle 72 # 24 - 15',
    telefono: '6013456789',
    email: 'facturacion@repuestosdemo.com.co',
    responsable_iva: true,
    responsabilidades_fiscales: 'O-13;O-15',
    actividad_economica: '4530',
  },

  resolucionDian: {
    prefijo: 'FAC',
    numero_resolucion: '18764000001234',
    fecha_expedicion: '2026-01-01',
    rango_desde: 1,
    rango_hasta: 10000,
    vigente_hasta: '2027-12-31',
  },

  roles: [
    {
      codigo: 'ADMIN',
      nombre: 'Administrador',
      descripcion: 'Acceso total al sistema, configuración, auditoría y cierres contables',
    },
    {
      codigo: 'USUARIO',
      nombre: 'Usuario Operativo',
      descripcion: 'Facturación, inventario y consultas, sin anulaciones ni configuración',
    },
  ],

  permisos: [
    { modulo: 'ventas', codigo: 'ventas.consultar', nombre: 'Consultar ventas', descripcion: 'Ver facturas y cotizaciones' },
    { modulo: 'ventas', codigo: 'ventas.crear', nombre: 'Crear ventas', descripcion: 'Registrar ventas y cotizaciones' },
    { modulo: 'ventas', codigo: 'ventas.anular', nombre: 'Anular ventas', descripcion: 'Anular facturas de venta generadas' },
    { modulo: 'compras', codigo: 'compras.consultar', nombre: 'Consultar compras', descripcion: 'Ver órdenes y facturas de compra' },
    { modulo: 'compras', codigo: 'compras.crear', nombre: 'Crear compras', descripcion: 'Registrar compras a proveedores' },
    { modulo: 'compras', codigo: 'compras.anular', nombre: 'Anular compras', descripcion: 'Anular compras registradas' },
    { modulo: 'inventario', codigo: 'inventario.consultar', nombre: 'Consultar inventario', descripcion: 'Ver existencias y catálogo' },
    { modulo: 'inventario', codigo: 'inventario.ajustar', nombre: 'Ajustar inventario', descripcion: 'Realizar ajustes manuales o conteos' },
    { modulo: 'inventario', codigo: 'inventario.costos', nombre: 'Ver costos', descripcion: 'Visualizar costos de adquisición y márgenes' },
    { modulo: 'cartera', codigo: 'cartera.consultar', nombre: 'Consultar cartera', descripcion: 'Ver saldos y estados de cuenta' },
    { modulo: 'pagos', codigo: 'pagos.registrar', nombre: 'Registrar pagos', descripcion: 'Recibir y registrar pagos de clientes/proveedores' },
    { modulo: 'pagos', codigo: 'pagos.anular', nombre: 'Anular pagos', descripcion: 'Reversar pagos aplicados' },
    { modulo: 'pagos', codigo: 'pagos.consultar_todos', nombre: 'Consultar todos los pagos', descripcion: 'Ver pagos y recibos registrados por cualquier usuario (sin él, solo los propios)' },
    { modulo: 'terceros', codigo: 'terceros.consultar', nombre: 'Consultar terceros', descripcion: 'Ver clientes y proveedores' },
    { modulo: 'terceros', codigo: 'terceros.crear', nombre: 'Crear terceros', descripcion: 'Crear nuevos clientes y proveedores' },
    { modulo: 'terceros', codigo: 'terceros.editar', nombre: 'Editar terceros', descripcion: 'Actualizar información de terceros' },
    { modulo: 'terceros', codigo: 'terceros.eliminar', nombre: 'Eliminar terceros', descripcion: 'Desactivar clientes y proveedores' },
    { modulo: 'gastos', codigo: 'gastos.consultar_todos', nombre: 'Consultar todos los gastos', descripcion: 'Ver los gastos registrados por cualquier usuario' },
    { modulo: 'usuarios', codigo: 'usuarios.gestionar', nombre: 'Gestionar usuarios', descripcion: 'Crear, editar y dar de baja usuarios del sistema' },
    { modulo: 'roles', codigo: 'roles.gestionar', nombre: 'Gestionar roles', descripcion: 'Modificar permisos asignados a roles' },
    { modulo: 'auditoria', codigo: 'auditoria.consultar', nombre: 'Consultar auditoría', descripcion: 'Revisar logs y trazabilidad de operaciones' },
    { modulo: 'configuracion', codigo: 'configuracion.gestionar', nombre: 'Configuración general', descripcion: 'Parámetros generales, empresa, alertas y correo' },
    { modulo: 'cierres', codigo: 'cierres.ejecutar', nombre: 'Ejecutar cierres contables', descripcion: 'Ejecución de cierres periódicos contables' },
    { modulo: 'inventario', codigo: 'inventario.movimientos', nombre: 'Movimientos de inventario', descripcion: 'Registrar entradas, salidas, traslados y devoluciones' },
    { modulo: 'productos', codigo: 'productos.crear', nombre: 'Crear productos', descripcion: 'Registrar productos nuevos en el catálogo' },
    { modulo: 'productos', codigo: 'productos.editar', nombre: 'Editar productos', descripcion: 'Modificar datos no financieros y equivalencias' },
    { modulo: 'productos', codigo: 'productos.precios', nombre: 'Gestionar precios', descripcion: 'Cambiar precios de venta, actualización masiva e historial' },
    { modulo: 'productos', codigo: 'productos.eliminar', nombre: 'Eliminar productos', descripcion: 'Borrado lógico de productos' },
    { modulo: 'productos', codigo: 'productos.importar', nombre: 'Importar productos', descripcion: 'Importación masiva del catálogo' },
    { modulo: 'terceros', codigo: 'terceros.importar', nombre: 'Importar terceros', descripcion: 'Importación masiva de clientes' },
    { modulo: 'catalogos', codigo: 'catalogos.gestionar', nombre: 'Gestionar catálogos', descripcion: 'Marcas, categorías, impuestos, bodegas y categorías de gasto' },
    { modulo: 'cartera', codigo: 'cartera.gestionar', nombre: 'Gestionar cartera', descripcion: 'Cupos, bloqueos de crédito, castigos y recordatorios' },
    { modulo: 'consecutivos', codigo: 'consecutivos.gestionar', nombre: 'Gestionar consecutivos', descripcion: 'Ajustar prefijos y numeración de documentos' },
    { modulo: 'reportes', codigo: 'reportes.financieros', nombre: 'Reportes financieros', descripcion: 'Utilidad, rentabilidad, flujo de caja y estado de resultados' },
    { modulo: 'reportes', codigo: 'reportes.exportar', nombre: 'Exportar reportes', descripcion: 'Generar exportaciones de reportes' },
    { modulo: 'gastos', codigo: 'gastos.registrar', nombre: 'Registrar gastos', descripcion: 'Registrar y editar gastos propios' },
    { modulo: 'gastos', codigo: 'gastos.anular', nombre: 'Anular gastos', descripcion: 'Anular gastos registrados' },
    { modulo: 'empleados', codigo: 'empleados.consultar', nombre: 'Consultar empleados', descripcion: 'Ver datos de la nómina y empleados' },
    { modulo: 'empleados', codigo: 'empleados.gestionar', nombre: 'Gestionar empleados', descripcion: 'Crear y actualizar empleados' },
    { modulo: 'nomina', codigo: 'nomina.consultar', nombre: 'Consultar nómina', descripcion: 'Ver liquidaciones y periodos de nómina' },
    { modulo: 'nomina', codigo: 'nomina.gestionar', nombre: 'Gestionar nómina', descripcion: 'Liquidar y autorizar pagos de nómina' },
    { modulo: 'mantenimiento', codigo: 'mantenimiento.gestionar', nombre: 'Operación y mantenimiento', descripcion: 'Ver métricas, jobs, backups y almacenamiento' },
  ],

  permisosUsuarioOperativo: [
    'ventas.consultar',
    'ventas.crear',
    'compras.consultar',
    'compras.crear',
    'inventario.consultar',
    'cartera.consultar',
    'pagos.registrar',
    'terceros.consultar',
    'terceros.crear',
    'terceros.editar',
    'inventario.movimientos',
    'productos.crear',
    'productos.editar',
    'gastos.registrar',
    'reportes.exportar',
  ],

  usuarios: [
    { email: 'admin@crmcontable.com', rol: 'ADMIN', nombres: 'Carlos Andrés', apellidos: 'Pérez Gómez', telefono: '3001234567', documento: '1014234567', ciudad: 'Bogotá' },
    { email: 'gerencia@crmcontable.com', rol: 'ADMIN', nombres: 'María Fernanda', apellidos: 'Morales Castro', telefono: '3109876543', documento: '1020567890', ciudad: 'Bogotá' },
    { email: 'usuario@crmcontable.com', rol: 'USUARIO', nombres: 'Juan Camilo', apellidos: 'Gómez Restrepo', telefono: '3156789012', documento: '1035678901', ciudad: 'Medellín' },
    { email: 'vendedor@crmcontable.com', rol: 'USUARIO', nombres: 'Laura Daniela', apellidos: 'Ortiz Prada', telefono: '3203456789', documento: '1047890123', ciudad: 'Bogotá' },
    { email: 'operador@crmcontable.com', rol: 'USUARIO', nombres: 'Andrés Felipe', apellidos: 'Rojas Medina', telefono: '3187654321', documento: '1052345678', ciudad: 'Bogotá' },
    { email: 'caja@crmcontable.com', rol: 'USUARIO', nombres: 'Sandra Milena', apellidos: 'Vargas Cárdenas', telefono: '3112345678', documento: '1063456789', ciudad: 'Cali' },
  ],
};
