-- =============================================================================
-- 005 · Cumplimiento estricto de GEMINI.md
--   §4.1 Todas las tablas con PK UUID (gen_random_uuid). Las claves naturales
--        anteriores se conservan como UNIQUE, así los ON CONFLICT siguen igual.
--   §4.2 Las tarifas de retención aplicadas a cada compra se guardan como
--        NUMERIC(5,2) (antes solo se guardaba el valor retenido).
--   §5.2 "Pagos propios": nuevo permiso pagos.consultar_todos (solo ADMIN).
-- Idempotente: puede ejecutarse más de una vez sin error.
-- =============================================================================

-- ─── §4.1 · PK UUID ──────────────────────────────────────────────────────────

-- empresa: tabla de una sola fila. La columna smallint "id" pasa a llamarse
-- "fila" (UNIQUE, siempre 1) y la PK es id_empresa UUID.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'empresa' AND column_name = 'id') THEN
    ALTER TABLE empresa RENAME COLUMN id TO fila;
  END IF;
END $$;
ALTER TABLE empresa ADD COLUMN IF NOT EXISTS id_empresa UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE empresa DROP CONSTRAINT IF EXISTS empresa_pkey;
ALTER TABLE empresa ADD CONSTRAINT empresa_pkey PRIMARY KEY (id_empresa);
ALTER TABLE empresa DROP CONSTRAINT IF EXISTS uq_empresa_fila;
ALTER TABLE empresa ADD CONSTRAINT uq_empresa_fila UNIQUE (fila);

-- configuracion_sistema
ALTER TABLE configuracion_sistema ADD COLUMN IF NOT EXISTS id_configuracion UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE configuracion_sistema DROP CONSTRAINT IF EXISTS configuracion_sistema_pkey;
ALTER TABLE configuracion_sistema ADD CONSTRAINT configuracion_sistema_pkey PRIMARY KEY (id_configuracion);
ALTER TABLE configuracion_sistema DROP CONSTRAINT IF EXISTS uq_configuracion_sistema_clave;
ALTER TABLE configuracion_sistema ADD CONSTRAINT uq_configuracion_sistema_clave UNIQUE (clave);

-- consecutivos_config
ALTER TABLE consecutivos_config ADD COLUMN IF NOT EXISTS id_consecutivo UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE consecutivos_config DROP CONSTRAINT IF EXISTS consecutivos_config_pkey;
ALTER TABLE consecutivos_config ADD CONSTRAINT consecutivos_config_pkey PRIMARY KEY (id_consecutivo);
ALTER TABLE consecutivos_config DROP CONSTRAINT IF EXISTS uq_consecutivos_config_tipo;
ALTER TABLE consecutivos_config ADD CONSTRAINT uq_consecutivos_config_tipo UNIQUE (tipo);

-- dashboard_config_usuario
ALTER TABLE dashboard_config_usuario ADD COLUMN IF NOT EXISTS id_dashboard_config UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE dashboard_config_usuario DROP CONSTRAINT IF EXISTS dashboard_config_usuario_pkey;
ALTER TABLE dashboard_config_usuario ADD CONSTRAINT dashboard_config_usuario_pkey PRIMARY KEY (id_dashboard_config);
ALTER TABLE dashboard_config_usuario DROP CONSTRAINT IF EXISTS uq_dashboard_config_usuario;
ALTER TABLE dashboard_config_usuario ADD CONSTRAINT uq_dashboard_config_usuario UNIQUE (id_usuario);

-- roles_permisos
ALTER TABLE roles_permisos ADD COLUMN IF NOT EXISTS id_rol_permiso UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE roles_permisos DROP CONSTRAINT IF EXISTS roles_permisos_pkey;
ALTER TABLE roles_permisos ADD CONSTRAINT roles_permisos_pkey PRIMARY KEY (id_rol_permiso);
ALTER TABLE roles_permisos DROP CONSTRAINT IF EXISTS uq_roles_permisos;
ALTER TABLE roles_permisos ADD CONSTRAINT uq_roles_permisos UNIQUE (id_rol, id_permiso);

-- producto_proveedor
ALTER TABLE producto_proveedor ADD COLUMN IF NOT EXISTS id_producto_proveedor UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE producto_proveedor DROP CONSTRAINT IF EXISTS producto_proveedor_pkey;
ALTER TABLE producto_proveedor ADD CONSTRAINT producto_proveedor_pkey PRIMARY KEY (id_producto_proveedor);
ALTER TABLE producto_proveedor DROP CONSTRAINT IF EXISTS uq_producto_proveedor;
ALTER TABLE producto_proveedor ADD CONSTRAINT uq_producto_proveedor UNIQUE (id_producto, id_proveedor);

-- schema_migraciones (control del propio migrador)
ALTER TABLE schema_migraciones ADD COLUMN IF NOT EXISTS id_migracion UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE schema_migraciones DROP CONSTRAINT IF EXISTS schema_migraciones_pkey;
ALTER TABLE schema_migraciones ADD CONSTRAINT schema_migraciones_pkey PRIMARY KEY (id_migracion);
ALTER TABLE schema_migraciones DROP CONSTRAINT IF EXISTS uq_schema_migraciones_nombre;
ALTER TABLE schema_migraciones ADD CONSTRAINT uq_schema_migraciones_nombre UNIQUE (nombre);

-- ─── §4.2 · Tarifas de retención aplicadas (NUMERIC(5,2)) ────────────────────
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS pct_retefuente NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS pct_reteiva    NUMERIC(5,2) NOT NULL DEFAULT 0;
-- ReteICA se expresa por mil (‰), p. ej. 9.66
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS tarifa_reteica NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE facturas_compra DROP CONSTRAINT IF EXISTS chk_facturas_compra_tarifas_retencion;
ALTER TABLE facturas_compra ADD CONSTRAINT chk_facturas_compra_tarifas_retencion
  CHECK (pct_retefuente BETWEEN 0 AND 100 AND pct_reteiva BETWEEN 0 AND 100 AND tarifa_reteica BETWEEN 0 AND 100);

-- ─── §5.2 · Pagos propios ───────────────────────────────────────────────────
INSERT INTO permisos (modulo, codigo, nombre, descripcion) VALUES
('pagos', 'pagos.consultar_todos', 'Consultar todos los pagos', 'Ver pagos y recibos registrados por cualquier usuario (sin él, solo los propios)')
ON CONFLICT (codigo) DO NOTHING;

-- ADMIN siempre tiene todos los permisos
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso FROM roles r CROSS JOIN permisos p
 WHERE r.codigo = 'ADMIN'
ON CONFLICT DO NOTHING;
