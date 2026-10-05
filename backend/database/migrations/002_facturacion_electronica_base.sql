-- =====================================================================
-- MIGRACIÓN 002 — Base opcional para facturación electrónica DIAN.
--
-- No cambia el funcionamiento normal: todas las facturas quedan con
-- estado_dian = 'NO_APLICA' mientras FACTURACION_ELECTRONICA no esté
-- activada en el .env. Idempotente.
-- =====================================================================

BEGIN;

-- Datos del emisor (la empresa). Tabla de una sola fila.
CREATE TABLE IF NOT EXISTS empresa (
    id                         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    nit                        VARCHAR(20) NOT NULL,
    razon_social               VARCHAR(200) NOT NULL,
    nombre_comercial           VARCHAR(200),
    id_ciudad                  UUID REFERENCES ciudades(id_ciudad),
    direccion                  VARCHAR(200),
    telefono                   VARCHAR(30),
    email                      VARCHAR(150),
    responsable_iva            BOOLEAN NOT NULL DEFAULT TRUE,
    -- Códigos DIAN separados por ';' (p. ej. 'O-13;O-15'). R-99-PN = no aplica
    responsabilidades_fiscales VARCHAR(100) NOT NULL DEFAULT 'R-99-PN',
    actividad_economica        VARCHAR(10),
    actualizado_en             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Responsabilidades fiscales del adquiriente (cliente)
ALTER TABLE terceros ADD COLUMN IF NOT EXISTS responsabilidades_fiscales VARCHAR(100);

-- Clave técnica de la resolución de facturación electrónica (necesaria para el CUFE)
ALTER TABLE resoluciones_dian ADD COLUMN IF NOT EXISTS clave_tecnica VARCHAR(100);

-- Estado electrónico de cada factura
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS estado_dian VARCHAR(20) NOT NULL DEFAULT 'NO_APLICA';
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS cufe VARCHAR(96);
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS fecha_envio_dian TIMESTAMPTZ;
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS respuesta_dian TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_facturas_venta_estado_dian') THEN
    ALTER TABLE facturas_venta ADD CONSTRAINT chk_facturas_venta_estado_dian
      CHECK (estado_dian IN ('NO_APLICA', 'PENDIENTE', 'ENVIADA', 'ACEPTADA', 'RECHAZADA'));
  END IF;
END $$;

COMMIT;
