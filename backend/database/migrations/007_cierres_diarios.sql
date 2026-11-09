-- =============================================================================
-- 007 · Cierre diario y arqueo de caja
--   Un registro por día: totales consolidados (ventas cobradas/a crédito,
--   gastos, compras pagadas), saldo esperado contra el efectivo contado y el
--   detalle de los ítems agregados a mano (remisiones, gastos y compras que no
--   están en el sistema). Los totales los calcula el backend al guardar.
--   Se gestiona con el permiso cierres.ejecutar (ya existente).
-- Idempotente: puede ejecutarse más de una vez sin error.
-- =============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS cierres_diarios (
    id_cierre_diario        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha                   DATE NOT NULL CONSTRAINT uq_cierres_diarios_fecha UNIQUE,
    facturado_dia_anterior  NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (facturado_dia_anterior >= 0),
    total_ventas            NUMERIC(15,2) NOT NULL DEFAULT 0,
    ventas_cobradas         NUMERIC(15,2) NOT NULL DEFAULT 0,
    ventas_credito          NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_gastos            NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_compras_pagadas   NUMERIC(15,2) NOT NULL DEFAULT 0,
    saldo_esperado          NUMERIC(15,2) NOT NULL DEFAULT 0,
    efectivo_real           NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (efectivo_real >= 0),
    diferencia              NUMERIC(15,2) NOT NULL DEFAULT 0,
    observaciones           TEXT,
    detalle                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    id_usuario_cierre       UUID REFERENCES usuarios(id_usuario),
    creado_en               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cierres_diarios_fecha ON cierres_diarios (fecha DESC);

COMMIT;
