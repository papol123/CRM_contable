-- =============================================================================
-- 006 · Consulta global reservada al administrador
--   GEMINI.md §5.4 / OWASP API1:2023 (BOLA) y API5:2023 (BFLA):
--   Sin los permisos *.consultar_todos cada usuario solo ve sus propias ventas
--   y compras, busca terceros sin datos de contacto y no ve la cartera global.
--   El rol USUARIO queda con sus 15 permisos operativos: se le retiran los que
--   haya acumulado por fuera de esa lista (privilege creep).
-- Idempotente: puede ejecutarse más de una vez sin error.
-- =============================================================================
BEGIN;

INSERT INTO permisos (modulo, codigo, nombre, descripcion) VALUES
('terceros', 'terceros.consultar_todos', 'Consultar directorio de terceros', 'Listar clientes y proveedores con teléfonos, correos, direcciones e historial (sin él, solo búsqueda por nombre o documento)'),
('ventas',   'ventas.consultar_todos',   'Consultar todas las ventas',       'Ver remisiones, cotizaciones y pedidos de cualquier usuario, el resumen del dashboard y el reporte de ventas (sin él, solo los propios)'),
('compras',  'compras.consultar_todos',  'Consultar todas las compras',      'Ver facturas de compra de cualquier usuario y las cuentas por pagar globales (sin él, solo las propias o por proveedor)'),
('cartera',  'cartera.consultar_todos',  'Consultar cartera global',         'Ver morosos, cartera vencida, resumen y reporte de cartera, y cuentas por cobrar sin filtrar por cliente')
ON CONFLICT (codigo) DO NOTHING;

-- ADMIN siempre tiene todos los permisos
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso FROM roles r CROSS JOIN permisos p
 WHERE r.codigo = 'ADMIN'
ON CONFLICT DO NOTHING;

-- Tesorería cobra cualquier remisión; bodega recibe cualquier compra
INSERT INTO roles_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso FROM roles r JOIN permisos p
    ON (r.codigo = 'CAJERO' AND p.codigo IN ('ventas.consultar_todos', 'cartera.consultar_todos'))
    OR (r.codigo = 'BODEGA' AND p.codigo = 'compras.consultar_todos')
ON CONFLICT DO NOTHING;

-- USUARIO: exactamente sus permisos operativos (scripts/data/base.js · permisosPorRol.USUARIO)
DELETE FROM roles_permisos rp
 USING roles r, permisos p
 WHERE rp.id_rol = r.id_rol
   AND rp.id_permiso = p.id_permiso
   AND r.codigo = 'USUARIO'
   AND p.codigo NOT IN (
     'ventas.consultar', 'ventas.crear',
     'compras.consultar', 'compras.crear',
     'inventario.consultar', 'inventario.movimientos',
     'cartera.consultar', 'pagos.registrar',
     'terceros.consultar', 'terceros.crear', 'terceros.editar',
     'productos.crear', 'productos.editar',
     'gastos.registrar', 'reportes.exportar'
   );

COMMIT;
