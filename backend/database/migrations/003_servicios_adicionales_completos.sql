-- =====================================================================
-- MIGRACIÓN 003 — Tablas y columnas de soporte para catálogo completo de servicios:
-- Auditoría, Nómina y Empleados, Integración Siigo, Periodos Contables,
-- Conteos de Inventario, Equivalencias, Adjuntos y Configuración.
-- =====================================================================

BEGIN;

-- 1. Bitácora de Auditoría
CREATE TABLE IF NOT EXISTS bitacora_auditoria (
    id_auditoria    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario      UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    accion          VARCHAR(100) NOT NULL,
    recurso         VARCHAR(50) NOT NULL,
    id_recurso      UUID,
    valor_anterior  JSONB,
    valor_nuevo     JSONB,
    motivo          TEXT,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    resultado       VARCHAR(20) DEFAULT 'EXITOSO',
    fecha           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON bitacora_auditoria(id_usuario);
CREATE INDEX IF NOT EXISTS idx_auditoria_recurso ON bitacora_auditoria(recurso, id_recurso);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON bitacora_auditoria(fecha);

-- 2. Empleados y Nómina
CREATE TABLE IF NOT EXISTS empleados (
    id_empleado     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_tercero      UUID REFERENCES terceros(id_tercero),
    cargo           VARCHAR(100) NOT NULL,
    salario_base    NUMERIC(15,2) NOT NULL,
    fecha_ingreso   DATE NOT NULL,
    tipo_contrato   VARCHAR(50) NOT NULL DEFAULT 'TERMINO_INDEFINIDO',
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS periodos_nomina (
    id_periodo_nomina UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mes             INT NOT NULL,
    anio            INT NOT NULL,
    fecha_inicio    DATE NOT NULL,
    fecha_fin       DATE NOT NULL,
    estado          VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
                    CHECK (estado IN ('ABIERTO', 'CALCULADO', 'PAGADO', 'CERRADO')),
    total_devengado NUMERIC(15,2) DEFAULT 0,
    total_deducciones NUMERIC(15,2) DEFAULT 0,
    total_neto      NUMERIC(15,2) DEFAULT 0,
    id_gasto        UUID REFERENCES gastos(id_gasto),
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_nomina (
    id_detalle_nomina  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_periodo_nomina  UUID NOT NULL REFERENCES periodos_nomina(id_periodo_nomina) ON DELETE CASCADE,
    id_empleado        UUID NOT NULL REFERENCES empleados(id_empleado),
    salario_base       NUMERIC(15,2) NOT NULL,
    dias_trabajados    INT NOT NULL DEFAULT 30,
    auxilio_transporte NUMERIC(15,2) DEFAULT 0,
    horas_extras       NUMERIC(15,2) DEFAULT 0,
    bonificaciones     NUMERIC(15,2) DEFAULT 0,
    deduccion_salud    NUMERIC(15,2) DEFAULT 0,
    deduccion_pension  NUMERIC(15,2) DEFAULT 0,
    otras_deducciones  NUMERIC(15,2) DEFAULT 0,
    neto_pagar         NUMERIC(15,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_detalle_nomina_periodo ON detalle_nomina(id_periodo_nomina);

-- 3. Periodos Contables
CREATE TABLE IF NOT EXISTS periodos_contables (
    id_periodo          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anio                INT NOT NULL,
    mes                 INT NOT NULL,
    abierto             BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_cierre        TIMESTAMPTZ,
    id_usuario_cierre   UUID REFERENCES usuarios(id_usuario),
    total_ingresos      NUMERIC(15,2) DEFAULT 0,
    total_costos        NUMERIC(15,2) DEFAULT 0,
    total_gastos        NUMERIC(15,2) DEFAULT 0,
    utilidad_neta       NUMERIC(15,2) DEFAULT 0,
    observaciones       TEXT,
    UNIQUE (anio, mes)
);

-- 4. Parámetros de Configuración del Sistema
CREATE TABLE IF NOT EXISTS configuracion_sistema (
    clave               VARCHAR(100) PRIMARY KEY,
    valor               TEXT NOT NULL,
    descripcion         TEXT,
    categoria           VARCHAR(50) DEFAULT 'GENERAL',
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insertar configuraciones iniciales por defecto si no existen
INSERT INTO configuracion_sistema (clave, valor, descripcion, categoria) VALUES
('EMPRESA_NOMBRE', 'Distribuidora de Repuestos Automotrices S.A.S.', 'Razón social de la empresa', 'EMPRESA'),
('EMPRESA_NIT', '901.234.567-8', 'NIT de la empresa', 'EMPRESA'),
('EMPRESA_DIRECCION', 'Cra 50 # 45-67, Bogotá', 'Dirección física', 'EMPRESA'),
('EMPRESA_TELEFONO', '3001234567', 'Teléfono institucional', 'EMPRESA'),
('EMPRESA_EMAIL', 'contacto@crmcontable.com', 'Correo electrónico corporativo', 'EMPRESA'),
('ALERTAS_STOCK_MINIMO', 'true', 'Activar alertas cuando stock <= stock mínimo', 'ALERTAS'),
('ALERTAS_DIAS_MORA_CARTERA', '30', 'Días para clasificar factura en mora crítica', 'ALERTAS'),
('CORREO_HOST', 'smtp.gmail.com', 'Host SMTP para envío de correos', 'CORREO'),
('CORREO_PUERTO', '587', 'Puerto SMTP', 'CORREO'),
('CORREO_REMITENTE', 'notificaciones@crmcontable.com', 'Remitente predeterminado', 'CORREO'),
('DASHBOARD_CONFIG_DEFAULT', '{"graficas":["ventas_mes","top_productos","cartera_vencida","kpis_operativos"]}', 'Configuración por defecto del dashboard', 'DASHBOARD')
ON CONFLICT (clave) DO NOTHING;

-- 5. Integración con Siigo
CREATE TABLE IF NOT EXISTS siigo_integracion (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activo              BOOLEAN NOT NULL DEFAULT FALSE,
    usuario             VARCHAR(150),
    access_key_hash     VARCHAR(255),
    partner_id          VARCHAR(100),
    ultimo_sync         TIMESTAMPTZ,
    estado_conexion     VARCHAR(50) DEFAULT 'DESCONECTADO'
);

CREATE TABLE IF NOT EXISTS siigo_sincronizaciones (
    id_sync             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo                VARCHAR(50) NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'EN_PROCESO',
    iniciado_en         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finalizado_en       TIMESTAMPTZ,
    registros_procesados INT DEFAULT 0,
    registros_fallidos   INT DEFAULT 0,
    detalle_errores     JSONB
);

-- 6. Conteos de Inventario
CREATE TABLE IF NOT EXISTS conteos_inventario (
    id_conteo           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero              VARCHAR(30) UNIQUE NOT NULL,
    id_bodega           UUID NOT NULL REFERENCES bodegas(id_bodega),
    estado              VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
                        CHECK (estado IN ('ABIERTO', 'CERRADO', 'CANCELADO')),
    observacion         TEXT,
    fecha_apertura      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre        TIMESTAMPTZ,
    id_usuario_apertura UUID REFERENCES usuarios(id_usuario),
    id_usuario_cierre   UUID REFERENCES usuarios(id_usuario)
);

CREATE TABLE IF NOT EXISTS detalle_conteo_inventario (
    id_detalle          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_conteo           UUID NOT NULL REFERENCES conteos_inventario(id_conteo) ON DELETE CASCADE,
    id_producto         UUID NOT NULL REFERENCES productos(id_producto),
    stock_sistema       NUMERIC(12,3) NOT NULL,
    stock_fisico        NUMERIC(12,3) NOT NULL,
    diferencia          NUMERIC(12,3) NOT NULL,
    ajuste_aplicado     BOOLEAN DEFAULT FALSE
);

-- 7. Equivalencias de Repuestos / Productos
CREATE TABLE IF NOT EXISTS producto_equivalencias (
    id_equivalencia     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_producto_origen  UUID NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
    id_producto_equivalente UUID NOT NULL REFERENCES productos(id_producto) ON DELETE CASCADE,
    observacion         VARCHAR(255),
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id_producto_origen, id_producto_equivalente)
);

-- 8. Adjuntos de Documentos (compras, gastos)
CREATE TABLE IF NOT EXISTS adjuntos_documento (
    id_adjunto          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tabla               VARCHAR(50) NOT NULL,
    id_registro         UUID NOT NULL,
    nombre_archivo      VARCHAR(255) NOT NULL,
    url                 TEXT NOT NULL,
    tipo_mime           VARCHAR(100),
    tamano_bytes        BIGINT,
    subido_en           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_adjuntos_registro ON adjuntos_documento(tabla, id_registro);

-- 9. Tareas Asíncronas y Reportes (Jobs)
CREATE TABLE IF NOT EXISTS jobs_sistema (
    id_job              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo                VARCHAR(50) NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FALLIDO')),
    progreso            INT DEFAULT 0,
    resultado_url       TEXT,
    error               TEXT,
    parametros          JSONB,
    creado_en           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Consecutivos Personalizados / Ajustes
CREATE TABLE IF NOT EXISTS consecutivos_config (
    tipo                VARCHAR(50) PRIMARY KEY,
    prefijo             VARCHAR(10) NOT NULL DEFAULT '',
    siguiente_numero    BIGINT NOT NULL DEFAULT 1,
    actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO consecutivos_config (tipo, prefijo, siguiente_numero) VALUES
('FACTURA_VENTA', 'FV', 1),
('FACTURA_COMPRA', 'FC', 1),
('COTIZACION', 'COT', 1),
('PEDIDO', 'PED', 1),
('PAGO', 'RC', 1),
('GASTO', 'GST', 1),
('CONTEO', 'CNT', 1)
ON CONFLICT (tipo) DO NOTHING;

-- 11. Permisos Nuevos según el Catálogo Completo
INSERT INTO permisos (modulo, codigo, nombre, descripcion) VALUES
('empleados', 'empleados.consultar', 'Consultar empleados', 'Ver datos de la nómina y empleados'),
('empleados', 'empleados.gestionar', 'Gestionar empleados', 'Crear y actualizar empleados'),
('nomina', 'nomina.consultar', 'Consultar nómina', 'Ver liquidaciones y periodos de nómina'),
('nomina', 'nomina.gestionar', 'Gestionar nómina', 'Liquidar y autorizar pagos de nómina'),
('siigo', 'siigo.gestionar', 'Gestionar integración Siigo', 'Sincronizar datos y configurar API de Siigo'),
('auditoria', 'auditoria.consultar', 'Consultar bitácora de auditoría', 'Ver trazabilidad de operaciones críticas'),
('mantenimiento', 'mantenimiento.gestionar', 'Operación y mantenimiento', 'Ver métricas, backups y almacenamiento')
ON CONFLICT (codigo) DO NOTHING;

-- Asignar nuevos permisos al rol ADMIN
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
  FROM roles r
  JOIN permisos p ON p.codigo IN (
    'empleados.consultar', 'empleados.gestionar',
    'nomina.consultar', 'nomina.gestionar',
    'siigo.gestionar', 'auditoria.consultar',
    'mantenimiento.gestionar'
  )
 WHERE r.codigo = 'ADMIN'
ON CONFLICT DO NOTHING;

COMMIT;
