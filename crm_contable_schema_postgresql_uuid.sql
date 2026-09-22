-- =====================================================================
-- CRM CONTABLE - SCRIPT DE CREACIÓN DE ESQUEMA (PostgreSQL / Cloud SQL)
-- Basado en ERD v2 (módulos: terceros, inventario, documentos)
-- Versión con llaves primarias UUID. Crea las tablas en "public".
-- =====================================================================

BEGIN;

-- gen_random_uuid() es nativo desde PostgreSQL 13. Si tu Cloud SQL corre
-- una versión anterior, descomenta la siguiente línea:
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================================
-- MÓDULO 1: TERCEROS (geografía, clientes, proveedores, contactos)
-- =====================================================================

CREATE TABLE paises (
    id_pais     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(100) NOT NULL
);

CREATE TABLE departamentos (
    id_departamento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pais         UUID NOT NULL REFERENCES paises(id_pais),
    nombre          VARCHAR(100) NOT NULL
);

CREATE TABLE ciudades (
    id_ciudad       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_departamento UUID NOT NULL REFERENCES departamentos(id_departamento),
    nombre          VARCHAR(100) NOT NULL
);

CREATE TABLE tipos_documento (
    id_tipo_documento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo            VARCHAR(10) UNIQUE NOT NULL,
    nombre            VARCHAR(100) NOT NULL
);

CREATE TABLE terceros (
    id_tercero        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tipo_documento UUID NOT NULL REFERENCES tipos_documento(id_tipo_documento),
    numero_documento  VARCHAR(30) UNIQUE NOT NULL,
    razon_social      VARCHAR(200) NOT NULL,
    tipo_persona      VARCHAR(20) NOT NULL CHECK (tipo_persona IN ('NATURAL','JURIDICA')),
    id_ciudad         UUID REFERENCES ciudades(id_ciudad),
    activo            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE clientes (
    id_cliente     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero     UUID UNIQUE NOT NULL REFERENCES terceros(id_tercero),
    cupo_credito   NUMERIC(15,2) DEFAULT 0,
    dias_plazo     INT DEFAULT 0
);

CREATE TABLE proveedores (
    id_proveedor   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero     UUID UNIQUE NOT NULL REFERENCES terceros(id_tercero),
    dias_plazo     INT DEFAULT 0
);

CREATE TABLE contactos (
    id_contacto    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero     UUID NOT NULL REFERENCES terceros(id_tercero),
    nombre         VARCHAR(150) NOT NULL,
    cargo          VARCHAR(100),
    principal      BOOLEAN DEFAULT FALSE
);

CREATE TABLE telefonos (
    id_telefono    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero     UUID REFERENCES terceros(id_tercero),
    id_contacto    UUID REFERENCES contactos(id_contacto),
    numero         VARCHAR(30) NOT NULL,
    tipo           VARCHAR(20),
    principal      BOOLEAN DEFAULT FALSE
);

CREATE TABLE emails (
    id_email       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero     UUID REFERENCES terceros(id_tercero),
    id_contacto    UUID REFERENCES contactos(id_contacto),
    email          VARCHAR(150) NOT NULL,
    tipo           VARCHAR(20),
    principal      BOOLEAN DEFAULT FALSE
);

CREATE TABLE direcciones (
    id_direccion   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero     UUID NOT NULL REFERENCES terceros(id_tercero),
    id_ciudad      UUID REFERENCES ciudades(id_ciudad),
    direccion      VARCHAR(200) NOT NULL,
    tipo           VARCHAR(20),
    principal      BOOLEAN DEFAULT FALSE
);

-- =====================================================================
-- MÓDULO 2: INVENTARIO (productos, bodegas, precios, movimientos)
-- =====================================================================

CREATE TABLE categorias_producto (
    id_categoria        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_categoria_padre  UUID REFERENCES categorias_producto(id_categoria),
    nombre               VARCHAR(100) NOT NULL
);

CREATE TABLE unidades_medida (
    id_unidad      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo         VARCHAR(10) UNIQUE NOT NULL,
    nombre         VARCHAR(50) NOT NULL,
    decimales      INT DEFAULT 0
);

CREATE TABLE impuestos (
    id_impuesto    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo         VARCHAR(20) NOT NULL,
    porcentaje     NUMERIC(5,2) NOT NULL,
    tipo           VARCHAR(20),
    vigente_desde  DATE NOT NULL
);

CREATE TABLE bodegas (
    id_bodega      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo         VARCHAR(20) UNIQUE NOT NULL,
    nombre         VARCHAR(100) NOT NULL,
    id_ciudad      UUID REFERENCES ciudades(id_ciudad),
    activo         BOOLEAN DEFAULT TRUE
);

CREATE TABLE productos (
    id_producto        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo             VARCHAR(30) UNIQUE NOT NULL,
    nombre             VARCHAR(200) NOT NULL,
    id_categoria       UUID REFERENCES categorias_producto(id_categoria),
    id_unidad          UUID REFERENCES unidades_medida(id_unidad),
    id_impuesto_venta  UUID REFERENCES impuestos(id_impuesto),
    maneja_inventario  BOOLEAN DEFAULT TRUE,
    stock_minimo       NUMERIC(12,3) DEFAULT 0,
    activo             BOOLEAN DEFAULT TRUE
);

CREATE TABLE producto_proveedor (
    id_producto      UUID NOT NULL REFERENCES productos(id_producto),
    id_proveedor     UUID NOT NULL REFERENCES proveedores(id_proveedor),
    codigo_proveedor VARCHAR(50),
    costo_actual     NUMERIC(15,2),
    dias_entrega     INT,
    es_principal     BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (id_producto, id_proveedor)
);

CREATE TABLE listas_precios (
    id_lista       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE precios_producto (
    id_precio      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_lista       UUID REFERENCES listas_precios(id_lista),
    id_producto    UUID REFERENCES productos(id_producto),
    precio         NUMERIC(15,2) NOT NULL,
    vigente_desde  DATE NOT NULL,
    vigente_hasta  DATE
);

CREATE TABLE movimientos_inventario (
    id_movimiento    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_producto      UUID NOT NULL REFERENCES productos(id_producto),
    id_bodega        UUID NOT NULL REFERENCES bodegas(id_bodega),
    tipo_movimiento  VARCHAR(20) NOT NULL,
    cantidad         NUMERIC(12,3) NOT NULL,
    costo_unitario   NUMERIC(15,2),
    fecha            TIMESTAMP NOT NULL DEFAULT now(),
    origen_tabla     VARCHAR(50),
    origen_id        UUID
);

-- =====================================================================
-- MÓDULO 3: DOCUMENTOS (facturas de venta/compra, pagos, gastos)
-- =====================================================================

CREATE TABLE estados_factura_venta (
    id_estado   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      VARCHAR(20) UNIQUE NOT NULL,
    nombre      VARCHAR(50) NOT NULL,
    es_final    BOOLEAN DEFAULT FALSE
);

-- NOTA: el diagrama solo mostraba la relación de RESOLUCIONES_DIAN hacia
-- FACTURAS_VENTA, sin definir sus columnas. Se asumió la estructura típica
-- de una resolución de numeración DIAN; ajusta si tienes los campos reales.
CREATE TABLE resoluciones_dian (
    id_resolucion      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prefijo            VARCHAR(10),
    numero_resolucion  VARCHAR(30) NOT NULL,
    fecha_expedicion   DATE NOT NULL,
    rango_desde        BIGINT NOT NULL,
    rango_hasta        BIGINT NOT NULL,
    vigente_hasta       DATE
);

CREATE TABLE facturas_venta (
    id_factura_venta   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_cliente         UUID NOT NULL REFERENCES clientes(id_cliente),
    id_resolucion      UUID REFERENCES resoluciones_dian(id_resolucion),
    id_estado          UUID NOT NULL REFERENCES estados_factura_venta(id_estado),
    numero_venta       VARCHAR(30) UNIQUE NOT NULL,
    fecha_expedicion   DATE NOT NULL,
    fecha_vencimiento  DATE,
    retefuente         NUMERIC(15,2) DEFAULT 0,
    anulada            BOOLEAN DEFAULT FALSE
);

CREATE TABLE detalle_factura_venta (
    id_detalle        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_factura_venta  UUID NOT NULL REFERENCES facturas_venta(id_factura_venta),
    id_producto       UUID REFERENCES productos(id_producto),
    cantidad          NUMERIC(12,3) NOT NULL,
    valor_unitario    NUMERIC(15,2) NOT NULL,
    pct_descuento     NUMERIC(5,2) DEFAULT 0,
    pct_iva           NUMERIC(5,2) DEFAULT 0
);

CREATE TABLE estados_factura_compra (
    id_estado   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      VARCHAR(20) UNIQUE NOT NULL,
    nombre      VARCHAR(50) NOT NULL
);

CREATE TABLE facturas_compra (
    id_factura_compra  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_proveedor       UUID NOT NULL REFERENCES proveedores(id_proveedor),
    id_estado          UUID NOT NULL REFERENCES estados_factura_compra(id_estado),
    numero_factura     VARCHAR(30),
    cufe               VARCHAR(100) UNIQUE,
    fecha_emision      DATE NOT NULL,
    fecha_vencimiento  DATE
);

CREATE TABLE detalle_factura_compra (
    id_detalle         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_factura_compra  UUID NOT NULL REFERENCES facturas_compra(id_factura_compra),
    id_producto        UUID REFERENCES productos(id_producto),
    cantidad           NUMERIC(12,3) NOT NULL,
    costo_unitario     NUMERIC(15,2) NOT NULL,
    pct_iva            NUMERIC(5,2) DEFAULT 0
);

CREATE TABLE metodos_pago (
    id_metodo_pago  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          VARCHAR(20) UNIQUE NOT NULL,
    nombre          VARCHAR(50) NOT NULL,
    afecta_caja     BOOLEAN DEFAULT TRUE
);

CREATE TABLE estados_pago (
    id_estado   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      VARCHAR(20) UNIQUE NOT NULL,
    nombre      VARCHAR(50) NOT NULL
);

CREATE TABLE pagos (
    id_pago         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero      UUID NOT NULL REFERENCES terceros(id_tercero),
    id_metodo_pago  UUID NOT NULL REFERENCES metodos_pago(id_metodo_pago),
    id_estado       UUID NOT NULL REFERENCES estados_pago(id_estado),
    tipo_pago       VARCHAR(20) NOT NULL CHECK (tipo_pago IN ('factura de venta','factura de compra')),
    fecha_pago      DATE NOT NULL,
    monto           NUMERIC(15,2) NOT NULL
);

CREATE TABLE aplicacion_pago_venta (
    id_aplicacion     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pago           UUID NOT NULL REFERENCES pagos(id_pago),
    id_factura_venta  UUID NOT NULL REFERENCES facturas_venta(id_factura_venta),
    monto_aplicado    NUMERIC(15,2) NOT NULL
);

CREATE TABLE aplicacion_pago_compra (
    id_aplicacion      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pago            UUID NOT NULL REFERENCES pagos(id_pago),
    id_factura_compra  UUID NOT NULL REFERENCES facturas_compra(id_factura_compra),
    monto_aplicado     NUMERIC(15,2) NOT NULL
);

CREATE TABLE categorias_gasto (
    id_categoria_gasto  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre              VARCHAR(100) UNIQUE NOT NULL,
    codigo_puc          VARCHAR(20)
);

CREATE TABLE gastos (
    id_gasto            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_categoria_gasto  UUID NOT NULL REFERENCES categorias_gasto(id_categoria_gasto),
    id_metodo_pago      UUID REFERENCES metodos_pago(id_metodo_pago),
    descripcion         VARCHAR(200) NOT NULL,
    monto               NUMERIC(15,2) NOT NULL,
    fecha               DATE NOT NULL,
    soporte_url         TEXT
);

-- =====================================================================
-- MÓDULO 4: AUTENTICACIÓN, ROLES Y CONTROL DE ACCESO (RBAC)
-- =====================================================================

CREATE TABLE roles (
    id_rol          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          VARCHAR(50) UNIQUE NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permisos (
    id_permiso      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modulo          VARCHAR(50) NOT NULL,
    codigo          VARCHAR(100) UNIQUE NOT NULL,
    nombre          VARCHAR(100) NOT NULL,
    descripcion     TEXT
);

CREATE TABLE roles_permisos (
    id_rol          UUID NOT NULL REFERENCES roles(id_rol) ON DELETE CASCADE,
    id_permiso      UUID NOT NULL REFERENCES permisos(id_permiso) ON DELETE CASCADE,
    PRIMARY KEY (id_rol, id_permiso)
);

CREATE TABLE usuarios (
    id_usuario      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero      UUID REFERENCES terceros(id_tercero) ON DELETE SET NULL,
    id_rol          UUID NOT NULL REFERENCES roles(id_rol),
    email           VARCHAR(150) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    nombres         VARCHAR(100) NOT NULL,
    apellidos       VARCHAR(100) NOT NULL,
    telefono        VARCHAR(30),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_login    TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE refresh_tokens (
    id_refresh_token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario       UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    token_hash       VARCHAR(255) NOT NULL,
    revocado         BOOLEAN NOT NULL DEFAULT FALSE,
    expira_en        TIMESTAMPTZ NOT NULL,
    ip_address       VARCHAR(45),
    user_agent       TEXT,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- ÍNDICES SOBRE LLAVES FORÁNEAS MÁS CONSULTADAS Y SEGURIDAD
-- =====================================================================

CREATE INDEX idx_terceros_ciudad ON terceros(id_ciudad);
CREATE INDEX idx_detalle_venta_factura ON detalle_factura_venta(id_factura_venta);
CREATE INDEX idx_detalle_compra_factura ON detalle_factura_compra(id_factura_compra);
CREATE INDEX idx_movimientos_producto ON movimientos_inventario(id_producto);
CREATE INDEX idx_movimientos_bodega ON movimientos_inventario(id_bodega);
CREATE INDEX idx_pagos_tercero ON pagos(id_tercero);
CREATE INDEX idx_facturas_venta_cliente ON facturas_venta(id_cliente);
CREATE INDEX idx_facturas_compra_proveedor ON facturas_compra(id_proveedor);

-- Índices de seguridad
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_usuarios_rol ON usuarios(id_rol);
CREATE INDEX idx_refresh_tokens_usuario ON refresh_tokens(id_usuario);
CREATE INDEX idx_roles_permisos_rol ON roles_permisos(id_rol);

-- =====================================================================
-- DATOS SEMILLA (SEEDS) DE SEGURIDAD Y ROLES
-- =====================================================================

-- 1. Roles iniciales
INSERT INTO roles (codigo, nombre, descripcion) VALUES
('ADMIN', 'Administrador', 'Acceso total al sistema, configuración, auditoría y cierres contables'),
('USUARIO', 'Usuario Operativo', 'Acceso operativo para facturación, inventario y consultas sin permisos de anulación ni configuración');

-- 2. Catálogo de Permisos según Especificación
INSERT INTO permisos (modulo, codigo, nombre, descripcion) VALUES
('ventas', 'ventas.consultar', 'Consultar ventas', 'Ver facturas y cotizaciones'),
('ventas', 'ventas.crear', 'Crear ventas', 'Registrar ventas y cotizaciones'),
('ventas', 'ventas.anular', 'Anular ventas', 'Anular facturas de venta generadas'),
('compras', 'compras.consultar', 'Consultar compras', 'Ver órdenes y facturas de compra'),
('compras', 'compras.crear', 'Crear compras', 'Registrar compras a proveedores'),
('compras', 'compras.anular', 'Anular compras', 'Anular compras registradas'),
('inventario', 'inventario.consultar', 'Consultar inventario', 'Ver existencias y catálogo'),
('inventario', 'inventario.ajustar', 'Ajustar inventario', 'Realizar ajustes manuales o conteos'),
('inventario', 'inventario.costos', 'Ver costos', 'Visualizar costos de adquisición y márgenes'),
('cartera', 'cartera.consultar', 'Consultar cartera', 'Ver saldos y estados de cuenta'),
('pagos', 'pagos.registrar', 'Registrar pagos', 'Recibir y registrar pagos de clientes/proveedores'),
('pagos', 'pagos.anular', 'Anular pagos', 'Reversar pagos aplicados'),
('terceros', 'terceros.consultar', 'Consultar terceros', 'Ver clientes y proveedores'),
('terceros', 'terceros.crear', 'Crear terceros', 'Crear nuevos clientes y proveedores'),
('terceros', 'terceros.editar', 'Editar terceros', 'Actualizar información de terceros'),
('usuarios', 'usuarios.gestionar', 'Gestionar usuarios', 'Crear, editar y dar de baja usuarios del sistema'),
('roles', 'roles.gestionar', 'Gestionar roles', 'Modificar permisos asignados a roles'),
('auditoria', 'auditoria.consultar', 'Consultar auditoría', 'Revisar logs y trazabilidad de operaciones'),
('configuracion', 'configuracion.gestionar', 'Configuración general', 'Consecutivos, resoluciones DIAN y parámetros'),
('cierres', 'cierres.ejecutar', 'Ejecutar cierres contables', 'Ejecución de cierres periódicos contables');

-- 3. Asignación de permisos al Administrador (Todos los permisos)
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r, permisos p
WHERE r.codigo = 'ADMIN';

-- 4. Asignación de permisos al Usuario Operativo
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles r
JOIN permisos p ON p.codigo IN (
    'ventas.consultar', 'ventas.crear',
    'compras.consultar', 'compras.crear',
    'inventario.consultar',
    'cartera.consultar',
    'pagos.registrar',
    'terceros.consultar', 'terceros.crear', 'terceros.editar'
)
WHERE r.codigo = 'USUARIO';

-- 5. Usuario Inicial Administrador de prueba
-- Contraseña temporal: "Admin123*" (Hash generado con bcrypt genérico costo 10)
INSERT INTO usuarios (id_rol, email, password_hash, nombres, apellidos)
SELECT r.id_rol, 'admin@crmcontable.com', '$2a$10$wN9Q7iF6Vv4qJgL0lZ4mreM6zC6uGvR8QWq9Yg9tX8uBv2vKj8jC6', 'Administrador', 'Principal'
FROM roles r
WHERE r.codigo = 'ADMIN';

COMMIT;

