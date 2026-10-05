-- =====================================================================
-- MIGRACIÓN 004 — Remisiones, seguridad transversal y operación
--
-- * Las ventas se emiten como REMISIONES con consecutivo interno (sin DIAN).
-- * Idempotency-Key, tokens de recuperación/invitación y dueño de los jobs.
-- * Retenciones y descuentos en compras, bloqueo de crédito, trazabilidad
--   del kardex y permisos granulares por operación (GEMINI.md §5).
-- =====================================================================

BEGIN;

-- 1. Kardex: TIMESTAMPTZ (GEMINI.md §4.3) y trazabilidad de quién y por qué
ALTER TABLE movimientos_inventario
    ALTER COLUMN fecha TYPE TIMESTAMPTZ USING fecha AT TIME ZONE 'UTC',
    ALTER COLUMN fecha SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE movimientos_inventario ADD COLUMN IF NOT EXISTS motivo TEXT;
ALTER TABLE movimientos_inventario
    ADD COLUMN IF NOT EXISTS id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL;

-- 2. Crédito de clientes: el bloqueo no destruye el cupo configurado
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS credito_bloqueado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS motivo_bloqueo TEXT;

-- 3. Castigo de cartera con motivo
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS motivo_castigo TEXT;

-- 4. Compras: descuento por línea y retenciones (valores calculados al registrar)
ALTER TABLE detalle_factura_compra ADD COLUMN IF NOT EXISTS pct_descuento NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS retefuente NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS reteiva    NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS reteica    NUMERIC(15,2) NOT NULL DEFAULT 0;

-- 5. Consecutivos: la venta es una remisión con numeración interna
DELETE FROM consecutivos_config WHERE tipo = 'FACTURA_VENTA';
INSERT INTO consecutivos_config (tipo, prefijo, siguiente_numero) VALUES ('REMISION', 'REM', 1)
ON CONFLICT (tipo) DO NOTHING;

-- 6. Idempotency-Key (GEMINI.md §5.5)
CREATE TABLE IF NOT EXISTS idempotencia_solicitudes (
    id_solicitud    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario      UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    clave           VARCHAR(255) NOT NULL,
    metodo          VARCHAR(10) NOT NULL,
    ruta            VARCHAR(255) NOT NULL,
    hash_cuerpo     VARCHAR(64) NOT NULL,
    estado          VARCHAR(20) NOT NULL DEFAULT 'EN_PROCESO'
                    CHECK (estado IN ('EN_PROCESO', 'COMPLETADO')),
    codigo_http     INT,
    respuesta       JSONB,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_en       TIMESTAMPTZ NOT NULL,
    UNIQUE (id_usuario, clave)
);
CREATE INDEX IF NOT EXISTS idx_idempotencia_expira ON idempotencia_solicitudes(expira_en);

-- 7. Tokens de un solo uso: recuperación de contraseña e invitación de usuarios
CREATE TABLE IF NOT EXISTS tokens_usuario (
    id_token        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario      UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('RESET_PASSWORD', 'INVITACION')),
    token_hash      VARCHAR(64) NOT NULL UNIQUE,
    expira_en       TIMESTAMPTZ NOT NULL,
    usado_en        TIMESTAMPTZ,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tokens_usuario ON tokens_usuario(id_usuario, tipo);

-- 8. Jobs asíncronos: dueño, intentos y tiempos
ALTER TABLE jobs_sistema
    ADD COLUMN IF NOT EXISTS id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE jobs_sistema ADD COLUMN IF NOT EXISTS intentos INT NOT NULL DEFAULT 0;
ALTER TABLE jobs_sistema ADD COLUMN IF NOT EXISTS iniciado_en TIMESTAMPTZ;
ALTER TABLE jobs_sistema ADD COLUMN IF NOT EXISTS ruta_archivo TEXT;
CREATE INDEX IF NOT EXISTS idx_jobs_pendientes ON jobs_sistema(estado, creado_en);
-- Los registros que la versión anterior marcó COMPLETADO sin ejecutar nada no tienen archivo
UPDATE jobs_sistema SET estado = 'FALLIDO', error = 'Registro simulado de una versión anterior: no se ejecutó'
 WHERE estado = 'COMPLETADO' AND ruta_archivo IS NULL;

-- 9. Configuración de dashboard por usuario
CREATE TABLE IF NOT EXISTS dashboard_config_usuario (
    id_usuario      UUID PRIMARY KEY REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    config          JSONB NOT NULL,
    actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Un periodo de nómina por mes
ALTER TABLE periodos_nomina DROP CONSTRAINT IF EXISTS uq_periodos_nomina_mes;
ALTER TABLE periodos_nomina ADD CONSTRAINT uq_periodos_nomina_mes UNIQUE (anio, mes);
ALTER TABLE periodos_nomina DROP CONSTRAINT IF EXISTS chk_periodos_nomina_mes;
ALTER TABLE periodos_nomina ADD CONSTRAINT chk_periodos_nomina_mes CHECK (mes BETWEEN 1 AND 12);
ALTER TABLE periodos_contables ADD COLUMN IF NOT EXISTS motivo_reapertura TEXT;

-- 11. Parámetros de nómina (editables con PATCH /configuracion). Valores 2025 de referencia.
INSERT INTO configuracion_sistema (clave, valor, descripcion, categoria) VALUES
('NOMINA_SMMLV', '1423500', 'Salario mínimo mensual legal vigente', 'NOMINA'),
('NOMINA_AUXILIO_TRANSPORTE', '200000', 'Auxilio de transporte mensual', 'NOMINA'),
('NOMINA_TOPE_AUXILIO_SMMLV', '2', 'Se paga auxilio a quien devenga hasta N salarios mínimos', 'NOMINA'),
('NOMINA_PCT_SALUD', '4', 'Aporte del empleado a salud (%)', 'NOMINA'),
('NOMINA_PCT_PENSION', '4', 'Aporte del empleado a pensión (%)', 'NOMINA'),
('CORREO_SSL', 'false', 'Usar TLS implícito (puerto 465)', 'CORREO'),
('CORREO_USUARIO', '', 'Usuario SMTP (la contraseña va en la variable SMTP_PASSWORD / Secret Manager)', 'CORREO')
ON CONFLICT (clave) DO NOTHING;

-- Los secretos no se guardan en base de datos (GEMINI.md §2, Secret Manager)
DELETE FROM configuracion_sistema WHERE clave = 'CORREO_PASSWORD';
-- La configuración de dashboard ahora es por usuario
DELETE FROM configuracion_sistema WHERE clave LIKE 'DASHBOARD_CONFIG_USER_%';

-- 12. Permisos granulares por operación
INSERT INTO permisos (modulo, codigo, nombre, descripcion) VALUES
('inventario', 'inventario.movimientos', 'Movimientos de inventario', 'Registrar entradas, salidas, traslados y devoluciones'),
('productos', 'productos.crear', 'Crear productos', 'Registrar productos nuevos en el catálogo'),
('productos', 'productos.editar', 'Editar productos', 'Modificar datos no financieros y equivalencias'),
('productos', 'productos.precios', 'Gestionar precios', 'Cambiar precios de venta, actualización masiva e historial'),
('productos', 'productos.eliminar', 'Eliminar productos', 'Borrado lógico de productos'),
('productos', 'productos.importar', 'Importar productos', 'Importación masiva del catálogo'),
('terceros', 'terceros.importar', 'Importar terceros', 'Importación masiva de clientes'),
('catalogos', 'catalogos.gestionar', 'Gestionar catálogos', 'Marcas, categorías, impuestos, bodegas y categorías de gasto'),
('cartera', 'cartera.gestionar', 'Gestionar cartera', 'Cupos, bloqueos de crédito, castigos y recordatorios'),
('consecutivos', 'consecutivos.gestionar', 'Gestionar consecutivos', 'Ajustar prefijos y numeración de documentos'),
('reportes', 'reportes.financieros', 'Reportes financieros', 'Utilidad, rentabilidad, flujo de caja y estado de resultados'),
('reportes', 'reportes.exportar', 'Exportar reportes', 'Generar exportaciones de reportes'),
('gastos', 'gastos.registrar', 'Registrar gastos', 'Registrar y editar gastos propios'),
('gastos', 'gastos.anular', 'Anular gastos', 'Anular gastos registrados')
ON CONFLICT (codigo) DO NOTHING;

-- Fuera de alcance: integración con Siigo
DELETE FROM roles_permisos WHERE id_permiso IN (SELECT id_permiso FROM permisos WHERE codigo = 'siigo.gestionar');
DELETE FROM permisos WHERE codigo = 'siigo.gestionar';

-- ADMIN siempre tiene todos los permisos
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso FROM roles r CROSS JOIN permisos p
 WHERE r.codigo = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Usuario operativo: operación diaria permitida por el catálogo (§2)
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
  FROM roles r
  JOIN permisos p ON p.codigo IN (
    'inventario.movimientos', 'productos.crear', 'productos.editar',
    'gastos.registrar', 'reportes.exportar'
  )
 WHERE r.codigo = 'USUARIO'
ON CONFLICT DO NOTHING;

-- La anulación de compras ya no habilita anular gastos, ni compras.crear registrar gastos:
-- cada operación tiene su permiso. terceros.eliminar es administrativo (§23).
DELETE FROM roles_permisos rp
 USING roles r, permisos p
 WHERE rp.id_rol = r.id_rol AND rp.id_permiso = p.id_permiso
   AND r.codigo = 'USUARIO' AND p.codigo = 'terceros.eliminar';

COMMIT;
