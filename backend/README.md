# CRM Contable — Backend (NestJS 11)

API REST del CRM/ERP contable para la empresa de repuestos automotrices: **NestJS 11**, **TypeScript**, **PostgreSQL 16/17 (Cloud SQL)**, **Passport/JWT**. Implementa el catálogo `CRM_Repuestos_Servicios_API_Prompt.md` siguiendo `GEMINI.md`.

> **Alcance:** las ventas se emiten como **remisiones** con consecutivo interno (`REM-000001`). No hay facturación electrónica DIAN ni integración con Siigo: esos módulos (`src/modules/facturacion-electronica`, `src/modules/siigo`) no están registrados en `AppModule`.

Documentación interactiva: `http://localhost:3000/api/docs` (todas las rutas llevan el prefijo `/api/v1`).

---

## 1. Puesta en marcha local (sin tocar Cloud SQL)

```bash
npm install
npm run db:local          # PostgreSQL 17 embebido en 127.0.0.1:54329 (déjelo corriendo)

# En otra terminal, apuntando a esa base:
export DB_HOST=127.0.0.1 DB_PORT=54329 DB_USER=postgres DB_PASSWORD=postgres DB_SSL=false
npm run db:setup          # esquema + migraciones + datos base + 6 meses de demo
CORREO_MODO=log STORAGE_DRIVER=local npm run start:dev
```

Usuarios de prueba (contraseña `Admin123*`): `admin@crmcontable.com`, `gerencia@crmcontable.com` (ADMIN); `usuario@`, `vendedor@`, `operador@`, `caja@crmcontable.com` (USUARIO).

Las variables de entorno están documentadas en `../.env.example`.

## 2. Pruebas

```bash
npm test            # unitarias + prueba estructural de rutas (sin base de datos)
npm run test:e2e    # E2E contra un PostgreSQL embebido desechable con datos demo
```

- **Estructural** (`src/rutas.spec.ts`): falla si una ruta no declara `@RequirePermission`, `@Autenticado` o `@Public`, si hay rutas duplicadas por rol o si se registra DIAN/Siigo.
- **Autorización E2E**: recorre todas las rutas: sin token → 401; token de Usuario en rutas administrativas → 403; ningún GET del administrador responde 5xx.
- **Flujos E2E**: remisiones (consecutivo, idempotencia, stock 409, anulación repetida 409, crédito bloqueado 422), compras con retenciones, pagos (saldo 422), periodo cerrado 422, recursos ajenos 404, dependencias 409, último administrador, recuperación de contraseña y límite de peticiones 429.

## 3. Seguridad transversal

| Tema | Implementación |
|---|---|
| Autenticación | JWT de vida corta + refresh token rotado en cookie `HttpOnly` (`/api/v1/auth`). Reusar un refresh token ya rotado revoca todas las sesiones. |
| Autorización | Guards **globales** (`ThrottlerGuard` → `JwtAuthGuard` → `PermissionsGuard`). Cada ruta declara `@RequirePermission('modulo.accion')`, `@Autenticado()` (solo sesión) o `@Public()`. Los permisos se recargan de la base en cada solicitud. Un acceso denegado queda en la bitácora (`ACCESO_DENEGADO`). |
| Errores | RFC 9457 `application/problem+json` con `type`, `title`, `status`, `detail`, `instance` (y `errors` en validaciones). BD caída → 503. |
| Idempotencia | `Idempotency-Key` en `POST /facturas-venta`, `POST /facturas-compra`, `POST /pagos` y `POST /pedidos/{id}/facturar` (24 h; otro cuerpo con la misma clave → 422). |
| Límite de peticiones | 300/min por IP (configurable); login y recuperación 10/min; olvido de contraseña 5/min. |
| Auditoría | `bitacora_auditoria`: usuario, IP, acción, recurso, valor anterior/nuevo, motivo y resultado. Las operaciones sensibles se registran dentro de su transacción. Solo lectura vía `/auditoria`. |
| Periodos contables | Un mes cerrado (`POST /reportes/cierre-mensual`) rechaza con 422 remisiones, compras, pagos, gastos y movimientos de inventario con fecha en él. Reabrir exige motivo. |
| Secretos | La contraseña SMTP solo en `SMTP_PASSWORD` (Secret Manager); nunca se guarda ni se devuelve. |
| Archivos | Adjuntos validados por tipo y firma (magic bytes), máx. 10 MB, rutas generadas por el servidor, en Cloud Storage o disco local. El XML del proveedor se lee sin DOCTYPE ni entidades (sin XXE). |

## 4. Permisos

ADMIN tiene todos los permisos. USUARIO (operación diaria):

`ventas.consultar`, `ventas.crear`, `compras.consultar`, `compras.crear`, `pagos.registrar`, `cartera.consultar`, `inventario.consultar`, `inventario.movimientos`, `productos.crear`, `productos.editar`, `terceros.consultar`, `terceros.crear`, `terceros.editar`, `gastos.registrar`, `reportes.exportar`.

Solo administrador: `ventas.anular`, `compras.anular`, `pagos.anular`, `gastos.anular`, `gastos.consultar_todos`, `inventario.ajustar`, `inventario.costos`, `productos.precios`, `productos.eliminar`, `productos.importar`, `terceros.eliminar`, `terceros.importar`, `catalogos.gestionar`, `cartera.gestionar`, `consecutivos.gestionar`, `reportes.financieros`, `cierres.ejecutar`, `usuarios.gestionar`, `roles.gestionar`, `auditoria.consultar`, `configuracion.gestionar`, `empleados.*`, `nomina.*`, `mantenimiento.gestionar`.

## 5. Procesos asíncronos

`jobs_sistema` es la cola. Un worker en el mismo proceso la atiende con `FOR UPDATE SKIP LOCKED` (seguro con varias instancias). Tareas: exportación de reportes y de auditoría (CSV), envío de cotizaciones por correo, recordatorios de cartera y respaldos de Cloud SQL. El estado se consulta en `GET /reportes/jobs/{jobId}` (cada usuario solo ve los suyos). En Cloud Run despliegue con CPU siempre asignada o una instancia mínima.

## 6. Rutas agregadas al catálogo

Necesarias para descargar archivos que el catálogo sube o genera:

- `GET /facturas-compra/{id}/adjuntos/{idAdjunto}` — descargar un adjunto.
- `GET /gastos/{id}/soporte` — descargar el soporte del gasto.
- `GET /configuracion/empresa/logo` — logo para los documentos.
- `GET /reportes/jobs/{jobId}/descargar` — archivo de una exportación.

Rutas del catálogo **retiradas** por estar fuera de alcance: `/resoluciones*` (DIAN) e `/integraciones/siigo/*`.

## 7. Base de datos

```bash
npm run db:migrate   # esquema base si la base está vacía + migraciones pendientes (database/migrations)
npm run seed         # catálogos, estados, roles/permisos y usuarios de prueba (idempotente)
npm run seed:demo    # 6 meses de operación simulada
```

La migración `004_remisiones_seguridad_y_operacion.sql` agrega: consecutivo `REMISION`, idempotencia, tokens de recuperación/invitación, retenciones y descuentos de compras, bloqueo de crédito, trazabilidad del kardex (`TIMESTAMPTZ`, usuario y motivo), configuración de dashboard por usuario, parámetros de nómina y los permisos granulares.
