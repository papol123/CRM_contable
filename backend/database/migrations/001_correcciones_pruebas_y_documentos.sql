-- =====================================================================
-- MIGRACIÓN 001 — Correcciones del informe de pruebas + documentos
-- comerciales (cotizaciones y pedidos) + marcas.
--
-- Es idempotente: puede ejecutarse varias veces sin error. Se aplica con
-- `npm run db:migrate` (scripts/migrate.js), que además la registra en
-- la tabla schema_migraciones.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Movimientos de inventario: tipos normalizados
--    El seed anterior guardaba 'ENTRADA_COMPRA' y el cálculo de saldos
--    lo tomaba como salida. Se unifica el vocabulario.
-- ---------------------------------------------------------------------
UPDATE movimientos_inventario SET tipo_movimiento = 'ENTRADA'
 WHERE tipo_movimiento = 'ENTRADA_COMPRA';

-- 'TRASLADO' sin dirección se contaba como salida: se conserva ese efecto.
UPDATE movimientos_inventario SET tipo_movimiento = 'TRASLADO_SALIDA'
 WHERE tipo_movimiento = 'TRASLADO';

-- Cualquier otro tipo desconocido también se contaba como salida.
UPDATE movimientos_inventario SET tipo_movimiento = 'AJUSTE_SALIDA'
 WHERE tipo_movimiento NOT IN ('ENTRADA', 'SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA',
                               'TRASLADO_ENTRADA', 'TRASLADO_SALIDA');

-- Cantidades negativas (defecto A7): se invierte el signo y el tipo para
-- conservar el saldo resultante. Las cantidades en cero no tienen efecto.
UPDATE movimientos_inventario
   SET cantidad = -cantidad,
       tipo_movimiento = CASE tipo_movimiento
           WHEN 'ENTRADA' THEN 'SALIDA'
           WHEN 'SALIDA' THEN 'ENTRADA'
           WHEN 'AJUSTE_ENTRADA' THEN 'AJUSTE_SALIDA'
           WHEN 'AJUSTE_SALIDA' THEN 'AJUSTE_ENTRADA'
           WHEN 'TRASLADO_ENTRADA' THEN 'TRASLADO_SALIDA'
           ELSE 'TRASLADO_ENTRADA'
       END
 WHERE cantidad < 0;

DELETE FROM movimientos_inventario WHERE cantidad = 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_movimientos_tipo') THEN
    ALTER TABLE movimientos_inventario ADD CONSTRAINT chk_movimientos_tipo CHECK (
      tipo_movimiento IN ('ENTRADA', 'SALIDA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA',
                          'TRASLADO_ENTRADA', 'TRASLADO_SALIDA')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_movimientos_cantidad') THEN
    ALTER TABLE movimientos_inventario ADD CONSTRAINT chk_movimientos_cantidad CHECK (cantidad > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_movimientos_origen ON movimientos_inventario(origen_tabla, origen_id);

-- ---------------------------------------------------------------------
-- 2. Marcas de producto
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marcas (
    id_marca    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre      VARCHAR(100) UNIQUE NOT NULL,
    pais_origen VARCHAR(100),
    activo      BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE productos ADD COLUMN IF NOT EXISTS id_marca UUID REFERENCES marcas(id_marca);

-- ---------------------------------------------------------------------
-- 3. Trazabilidad y anulación en documentos
-- ---------------------------------------------------------------------
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS id_bodega UUID REFERENCES bodegas(id_bodega);
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE facturas_venta ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS id_bodega UUID REFERENCES bodegas(id_bodega);
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE facturas_compra ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

-- Un proveedor no puede tener dos facturas con el mismo número (A9)
CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_compra_proveedor_numero
    ON facturas_compra(id_proveedor, numero_factura)
    WHERE numero_factura IS NOT NULL;

ALTER TABLE pagos ADD COLUMN IF NOT EXISTS id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS observaciones TEXT;
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS id_usuario UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS anulado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT;

CREATE INDEX IF NOT EXISTS idx_aplicacion_venta_factura ON aplicacion_pago_venta(id_factura_venta);
CREATE INDEX IF NOT EXISTS idx_aplicacion_compra_factura ON aplicacion_pago_compra(id_factura_compra);
CREATE INDEX IF NOT EXISTS idx_gastos_usuario ON gastos(id_usuario);

-- ---------------------------------------------------------------------
-- 4. Cotizaciones
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_cotizaciones START 1;

CREATE TABLE IF NOT EXISTS cotizaciones (
    id_cotizacion  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero         VARCHAR(30) UNIQUE NOT NULL,
    id_cliente     UUID NOT NULL REFERENCES clientes(id_cliente),
    id_usuario     UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
    vigente_hasta  DATE,
    estado         VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
                   CHECK (estado IN ('BORRADOR', 'APROBADA', 'RECHAZADA', 'CONVERTIDA')),
    observacion    TEXT,
    motivo_rechazo TEXT,
    creado_en      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_cotizacion (
    id_detalle     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_cotizacion  UUID NOT NULL REFERENCES cotizaciones(id_cotizacion) ON DELETE CASCADE,
    id_producto    UUID NOT NULL REFERENCES productos(id_producto),
    cantidad       NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    valor_unitario NUMERIC(15,2) NOT NULL CHECK (valor_unitario >= 0),
    pct_descuento  NUMERIC(5,2) NOT NULL DEFAULT 0,
    pct_iva        NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON cotizaciones(id_cliente);
CREATE INDEX IF NOT EXISTS idx_detalle_cotizacion ON detalle_cotizacion(id_cotizacion);

-- ---------------------------------------------------------------------
-- 5. Pedidos (reservan stock hasta que se facturan o anulan)
-- ---------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_pedidos START 1;

CREATE TABLE IF NOT EXISTS pedidos (
    id_pedido        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero           VARCHAR(30) UNIQUE NOT NULL,
    id_cliente       UUID NOT NULL REFERENCES clientes(id_cliente),
    id_cotizacion    UUID REFERENCES cotizaciones(id_cotizacion),
    id_bodega        UUID NOT NULL REFERENCES bodegas(id_bodega),
    id_usuario       UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    id_factura_venta UUID REFERENCES facturas_venta(id_factura_venta),
    fecha            DATE NOT NULL DEFAULT CURRENT_DATE,
    estado           VARCHAR(20) NOT NULL DEFAULT 'RECIBIDO'
                     CHECK (estado IN ('RECIBIDO', 'EN_PROCESO', 'ENVIADO', 'ENTREGADO', 'FACTURADO', 'ANULADO')),
    observacion      TEXT,
    motivo_anulacion TEXT,
    creado_en        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
    id_detalle     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pedido      UUID NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    id_producto    UUID NOT NULL REFERENCES productos(id_producto),
    cantidad       NUMERIC(12,3) NOT NULL CHECK (cantidad > 0),
    valor_unitario NUMERIC(15,2) NOT NULL CHECK (valor_unitario >= 0),
    pct_descuento  NUMERIC(5,2) NOT NULL DEFAULT 0,
    pct_iva        NUMERIC(5,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS historial_estados_pedido (
    id_historial UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_pedido    UUID NOT NULL REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
    estado       VARCHAR(20) NOT NULL,
    fecha        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario   UUID REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    observacion  TEXT
);

CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(id_cliente);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido ON detalle_pedido(id_pedido);
CREATE INDEX IF NOT EXISTS idx_historial_pedido ON historial_estados_pedido(id_pedido);

-- ---------------------------------------------------------------------
-- 6. Estados que usan las anulaciones y el castigo de cartera
-- ---------------------------------------------------------------------
INSERT INTO estados_factura_venta (codigo, nombre, es_final) VALUES
    ('EMITIDA', 'Emitida / Por Cobrar', false),
    ('PAGADA', 'Pagada Totalmente', true),
    ('ANULADA', 'Anulada', true),
    ('CASTIGADA', 'Castigada por incobrable', true)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO estados_factura_compra (codigo, nombre) VALUES
    ('RECIBIDA', 'Recibida / Por Pagar'),
    ('PAGADA', 'Pagada Totalmente'),
    ('ANULADA', 'Anulada')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO estados_pago (codigo, nombre) VALUES
    ('APLICADO', 'Aplicado'),
    ('ANULADO', 'Anulado')
ON CONFLICT (codigo) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. Permisos nuevos (solo Administrador)
--    terceros.eliminar       → M1 y M2: borrar clientes y proveedores
--    gastos.consultar_todos  → M3: ver gastos de otros usuarios
-- ---------------------------------------------------------------------
INSERT INTO permisos (modulo, codigo, nombre, descripcion) VALUES
    ('terceros', 'terceros.eliminar', 'Eliminar terceros', 'Desactivar clientes y proveedores'),
    ('gastos', 'gastos.consultar_todos', 'Consultar todos los gastos', 'Ver los gastos registrados por cualquier usuario')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
  FROM roles r
  JOIN permisos p ON p.codigo IN ('terceros.eliminar', 'gastos.consultar_todos')
 WHERE r.codigo = 'ADMIN'
ON CONFLICT DO NOTHING;

COMMIT;
