-- =============================================================================
-- 008 · Cliente "Consumidor final"
--   Cliente por defecto de las remisiones de mostrador (venta sin identificar
--   al comprador). Documento 222222222222, como lo usa la DIAN para el
--   consumidor final. Solo contado: sin cupo ni días de plazo.
-- Idempotente: puede ejecutarse más de una vez sin error.
-- =============================================================================
BEGIN;

-- En una base nueva las migraciones corren antes que los datos semilla
INSERT INTO tipos_documento (codigo, nombre)
VALUES ('CC', 'Cédula de Ciudadanía')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO terceros (id_tipo_documento, numero_documento, razon_social, tipo_persona, activo)
SELECT td.id_tipo_documento, '222222222222', 'CONSUMIDOR FINAL', 'NATURAL', TRUE
  FROM tipos_documento td
 WHERE td.codigo = 'CC'
ON CONFLICT (numero_documento) DO NOTHING;

INSERT INTO clientes (id_tercero, cupo_credito, dias_plazo)
SELECT t.id_tercero, 0, 0
  FROM terceros t
 WHERE t.numero_documento = '222222222222'
ON CONFLICT (id_tercero) DO NOTHING;

COMMIT;
