-- =============================================================================
-- 009 · Remisión rápida y deudores
--   numero_externo: número de la factura/remisión física (talonario) cuando la
--                   venta se registra solo por número y valor (remisión rápida).
--   nombre_deudor:  quién queda debiendo cuando el crédito es a "Consumidor final".
--   Producto VENTA-GENERAL: línea única de la remisión rápida (sin inventario).
-- Idempotente: puede ejecutarse más de una vez sin error.
-- =============================================================================
BEGIN;

ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS numero_externo VARCHAR(40);
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS nombre_deudor  VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_facturas_venta_numero_externo
    ON facturas_venta (numero_externo) WHERE numero_externo IS NOT NULL;

INSERT INTO productos (codigo, nombre, maneja_inventario, stock_minimo, activo)
VALUES ('VENTA-GENERAL', 'Venta general (remisión rápida por valor)', FALSE, 0, TRUE)
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
