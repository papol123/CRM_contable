# CRM Contable --- Repuestos Automotrices

## Catálogo de servicios y endpoints para desarrollo

> Documento base para construir prompts de implementación, documentación
> y arquitectura del proyecto. Fuente: catálogo de servicios y endpoints
> del proyecto.

------------------------------------------------------------------------

## 1. Contexto del proyecto

El sistema es un **CRM/ERP contable para una empresa de repuestos
automotrices**.

### Stack definido

-   **Frontend:** Next.js + React + TypeScript
-   **UI / estilos:** Tailwind CSS
-   **Gestión de datos:** TanStack Query
-   **Formularios:** React Hook Form + Zod
-   **Backend:** NestJS 11 (TypeScript) o Spring Boot 4.1 (Java 21)
-   **Base de datos:** Cloud SQL PostgreSQL 16/17
-   **Documentación API:** Swagger / OpenAPI generado desde decoradores
-   **Infraestructura:** Google Cloud Platform
-   **Roles principales:** Usuario y Administrador

### Base de la API

``` text
https://api.tudominio.com/api/v1
```

------------------------------------------------------------------------

# 2. Modelo de autorización

## Usuario

Rol operativo. Puede:

-   Facturar
-   Cotizar
-   Registrar compras
-   Registrar pagos
-   Registrar gastos propios
-   Consultar clientes, proveedores, productos, inventario y cartera
-   Consultar reportes operativos
-   Gestionar su propio perfil

No puede:

-   Anular documentos
-   Ajustar inventario
-   Ver costos y márgenes
-   Gestionar usuarios y permisos
-   Gestionar resoluciones y consecutivos
-   Ejecutar cierres contables
-   Gestionar nómina
-   Gestionar integración con Siigo
-   Consultar auditoría
-   Modificar configuración administrativa

## Administrador

Tiene todo lo disponible para Usuario más:

-   Gestión de usuarios
-   Roles y permisos
-   Anulaciones y reversas
-   Ajustes y conteos de inventario
-   Precios, costos y catálogos maestros
-   Resoluciones y consecutivos
-   Gestión activa de cartera
-   Reportes financieros
-   Nómina
-   Integración con Siigo
-   Auditoría
-   Configuración
-   Operación y mantenimiento

### Regla fundamental

**No duplicar endpoints por rol.**

Debe existir una única ruta y la autorización debe realizarse mediante
permisos.

Ejemplo conceptual:

``` typescript
@Post(':id/anular')
@RequirePermission('ventas.anular')
async anular(
  @Param('id') id: string,
  @Body() dto: AnularDto
) {
  // ...
}
```

Los roles deben ser conjuntos de permisos. No se recomienda repartir
condiciones como:

``` typescript
if (rol === 'ADMIN') {
   // ...
}
```

por todo el proyecto.

------------------------------------------------------------------------

# 3. Seguridad transversal de la API

## Códigos HTTP

  Código   Significado
  -------- ---------------------------------------------------
  200      Consulta o actualización exitosa
  201      Recurso creado
  202      Proceso asíncrono encolado
  204      Acción exitosa sin cuerpo
  400      JSON malformado o parámetro inválido
  401      Sin token, token vencido o inválido
  403      Autenticado pero sin permiso
  404      Recurso inexistente o no perteneciente al usuario
  409      Conflicto con el estado actual
  422      Validación de reglas de negocio fallida
  429      Rate limiting superado
  500      Error interno
  503      Dependencia no disponible

Todos los errores deben utilizar:

``` text
application/problem+json
```

siguiendo RFC 9457.

## Reglas críticas

### Autorización

El backend debe validar permisos aunque el frontend haya ocultado una
funcionalidad.

Un Usuario que intente acceder a un endpoint administrativo debe
recibir:

``` text
403 Forbidden
```

### Propiedad de recursos

La autenticación por sí sola no garantiza acceso al recurso.

Ejemplo:

``` sql
SELECT *
FROM facturas_venta
WHERE id = ?
  AND empresa_id = ?;
```

### Auditoría

Las operaciones críticas deben conservar trazabilidad.

No se deben eliminar registros históricos cuando la operación requiera
reversión. Se deben generar movimientos compensatorios.

### Idempotencia

Las operaciones críticas que pueden recibir reintentos deben soportar:

``` text
Idempotency-Key
```

especialmente:

-   Creación de facturas de venta
-   Registro de pagos
-   Otras operaciones transaccionales sensibles

------------------------------------------------------------------------

# 4. Servicios del rol Usuario

## 4.1 Autenticación y perfil

  -------------------------------------------------------------------------
  Método                  Endpoint                  Descripción
  ----------------------- ------------------------- -----------------------
  POST                    `/auth/login`             Iniciar sesión y
                                                    devolver access token;
                                                    refresh token en cookie
                                                    HttpOnly

  POST                    `/auth/refresh`           Renovar access token

  POST                    `/auth/logout`            Cerrar sesión e
                                                    invalidar refresh token

  GET                     `/auth/me`                Obtener usuario
                                                    autenticado, rol y
                                                    permisos efectivos

  PATCH                   `/auth/me`                Actualizar datos
                                                    propios

  POST                    `/auth/change-password`   Cambiar contraseña

  POST                    `/auth/forgot-password`   Solicitar recuperación

  POST                    `/auth/reset-password`    Establecer nueva
                                                    contraseña mediante
                                                    token de un solo uso
  -------------------------------------------------------------------------

### Reglas

-   El Usuario no puede cambiar su propio rol.
-   El refresh token debe gestionarse de forma segura.
-   `forgot-password` debe evitar revelar si un correo existe.

------------------------------------------------------------------------

# 5. Catálogos de consulta

Todos son servicios de lectura para alimentar formularios.

  Método   Endpoint                         Descripción
  -------- -------------------------------- -----------------------------
  GET      `/paises`                        Lista de países
  GET      `/paises/{id}/departamentos`     Departamentos de un país
  GET      `/departamentos/{id}/ciudades`   Ciudades de un departamento
  GET      `/ciudades?search=`              Búsqueda de ciudades
  GET      `/marcas`                        Marcas de repuestos
  GET      `/categorias`                    Categorías de producto
  GET      `/unidades-medida`               Unidades de medida
  GET      `/impuestos`                     Tarifas de IVA
  GET      `/formas-pago`                   Formas de pago
  GET      `/medios-pago`                   Medios de pago
  GET      `/bodegas`                       Bodegas disponibles
  GET      `/categorias-gasto`              Categorías de gasto

------------------------------------------------------------------------

# 6. Clientes

  Método   Endpoint                             Descripción
  -------- ------------------------------------ ------------------------------------------
  GET      `/clientes`                          Lista paginada y filtrable
  POST     `/clientes`                          Registrar cliente
  GET      `/clientes/{id}`                     Consultar detalle
  PATCH    `/clientes/{id}`                     Actualizar datos de contacto y dirección
  DELETE   `/clientes/{id}`                     No disponible para Usuario
  GET      `/clientes/{id}/telefonos`           Consultar teléfonos
  POST     `/clientes/{id}/telefonos`           Agregar teléfono
  DELETE   `/clientes/{id}/telefonos/{telId}`   Eliminar teléfono
  GET      `/clientes/{id}/correos`             Consultar correos
  POST     `/clientes/{id}/correos`             Agregar correo
  GET      `/clientes/{id}/historial-compras`   Historial de compras
  GET      `/clientes/{id}/cartera`             Estado de cuenta
  POST     `/clientes/importar`                 Solo Administrador

### Reglas

-   NIT/cédula debe ser único.
-   El Usuario solo debe acceder a recursos permitidos por su
    empresa/contexto.
-   El historial debe poder filtrarse por fechas.
-   La cartera debe mostrar facturas pendientes, abonos, saldo y días de
    mora.

------------------------------------------------------------------------

# 7. Proveedores

  ---------------------------------------------------------------------------------------------
  Método                  Endpoint                                      Descripción
  ----------------------- --------------------------------------------- -----------------------
  GET                     `/proveedores`                                Lista paginada con
                                                                        filtros

  POST                    `/proveedores`                                Registrar proveedor

  GET                     `/proveedores/{id}`                           Detalle

  PATCH                   `/proveedores/{id}`                           Actualizar datos

  DELETE                  `/proveedores/{id}`                           Solo Administrador

  GET                     `/proveedores/{id}/historial-compras`         Compras realizadas

  GET                     `/proveedores/{id}/productos`                 Productos suministrados
                                                                        y último precio

  GET                     `/proveedores/comparar-precios?productoId=`   Comparar precio del
                                                                        producto entre
                                                                        proveedores
  ---------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 8. Productos

  ---------------------------------------------------------------------------------
  Método                  Endpoint                          Descripción
  ----------------------- --------------------------------- -----------------------
  GET                     `/productos`                      Lista filtrable

  GET                     `/productos/buscar?q=`            Búsqueda rápida

  POST                    `/productos`                      Crear producto

  GET                     `/productos/{id}`                 Detalle, precio,
                                                            impuesto y saldos

  PATCH                   `/productos/{id}`                 Actualizar descripción,
                                                            marca o categoría

  PATCH                   `/productos/{id}/precio`          Solo Administrador

  DELETE                  `/productos/{id}`                 Solo Administrador

  GET                     `/productos/{id}/equivalencias`   Consultar equivalencias

  POST                    `/productos/{id}/equivalencias`   Registrar equivalencia
  ---------------------------------------------------------------------------------

### Regla

El Usuario puede modificar datos no financieros del producto, pero no
precio ni costo.

------------------------------------------------------------------------

# 9. Inventario

  ---------------------------------------------------------------------------------------
  Método                  Endpoint                                Descripción
  ----------------------- --------------------------------------- -----------------------
  GET                     `/inventario`                           Saldos actuales por
                                                                  producto y bodega

  GET                     `/inventario/{productoId}`              Saldo por todas las
                                                                  bodegas

  GET                     `/inventario/{productoId}/kardex`       Kardex completo

  POST                    `/inventario/entradas`                  Registrar entrada

  POST                    `/inventario/salidas`                   Registrar salida

  POST                    `/inventario/traslados`                 Traslado entre bodegas

  POST                    `/inventario/devoluciones`              Devolución de mercancía

  POST                    `/inventario/ajustes`                   Solo Administrador

  GET                     `/inventario/alertas-stock`             Productos bajo stock
                                                                  mínimo

  GET                     `/inventario/sin-movimiento?dias=180`   Inventario sin
                                                                  movimiento

  GET                     `/inventario/valorizado`                Solo Administrador
  ---------------------------------------------------------------------------------------

### Reglas transaccionales

Una entrada debe:

1.  Crear el movimiento.
2.  Actualizar el saldo.

Una salida debe rechazar la operación si no existe stock suficiente.

Un traslado debe realizar:

1.  Salida de una bodega.
2.  Entrada en otra bodega.
3.  Ambas operaciones dentro de la misma transacción.

------------------------------------------------------------------------

# 10. Cotizaciones

  Método   Endpoint                                Descripción
  -------- --------------------------------------- ------------------------------------
  GET      `/cotizaciones`                         Lista filtrable
  POST     `/cotizaciones`                         Crear cotización
  GET      `/cotizaciones/{id}`                    Detalle
  PATCH    `/cotizaciones/{id}`                    Editar mientras está en borrador
  POST     `/cotizaciones/{id}/enviar`             Generar PDF, almacenar y enviar
  POST     `/cotizaciones/{id}/aprobar`            Aprobar
  POST     `/cotizaciones/{id}/rechazar`           Rechazar con motivo
  POST     `/cotizaciones/{id}/convertir-pedido`   Convertir en pedido
  GET      `/cotizaciones/{id}/pdf`                Descargar PDF mediante URL firmada

### Reglas

-   Una cotización aprobada no debe editarse.
-   El envío de PDF puede ser asíncrono.
-   La conversión a pedido evita volver a digitar la información.

------------------------------------------------------------------------

# 11. Pedidos

  Método   Endpoint                       Descripción
  -------- ------------------------------ -------------------------------
  GET      `/pedidos`                     Lista filtrable
  POST     `/pedidos`                     Crear pedido y reservar stock
  GET      `/pedidos/{id}`                Consultar estado
  PATCH    `/pedidos/{id}/estado`         Avanzar estado
  GET      `/pedidos/{id}/trazabilidad`   Historial de estados
  POST     `/pedidos/{id}/facturar`       Crear factura
  POST     `/pedidos/{id}/anular`         Solo Administrador

### Estados

``` text
recibido → en proceso → enviado → entregado
```

Las transiciones inválidas deben rechazarse.

------------------------------------------------------------------------

# 12. Facturas de venta

  -----------------------------------------------------------------------------------------
  Método                  Endpoint                                  Descripción
  ----------------------- ----------------------------------------- -----------------------
  GET                     `/facturas-venta`                         Lista filtrable

  POST                    `/facturas-venta`                         Crear factura

  GET                     `/facturas-venta/{id}`                    Detalle

  PATCH                   `/facturas-venta/{id}`                    Modificar campos no
                                                                    financieros

  POST                    `/facturas-venta/calcular`                Simular totales sin
                                                                    guardar

  GET                     `/facturas-venta/siguiente-consecutivo`   Obtener próximo
                                                                    consecutivo

  GET                     `/facturas-venta/{id}/pdf`                Descargar PDF

  POST                    `/facturas-venta/{id}/anular`             Solo Administrador
  -----------------------------------------------------------------------------------------

### Operación crítica de creación

La creación de factura debe validar:

1.  Stock.
2.  Consecutivo.
3.  IVA por línea.
4.  Descuentos.
5.  Totales.
6.  Detalle de factura.
7.  Movimiento de inventario.
8.  Cuenta por cobrar si la venta es a crédito.
9.  Auditoría.

Todo debe ejecutarse dentro de una transacción.

Debe soportar:

``` text
Idempotency-Key
```

------------------------------------------------------------------------

# 13. Facturas de compra

  Método   Endpoint                           Descripción
  -------- ---------------------------------- ---------------------------------
  GET      `/facturas-compra`                 Lista
  POST     `/facturas-compra`                 Registrar factura de proveedor
  GET      `/facturas-compra/{id}`            Detalle
  PATCH    `/facturas-compra/{id}`            Modificar campos no financieros
  POST     `/facturas-compra/{id}/adjuntos`   Subir PDF/XML
  GET      `/facturas-compra/{id}/adjuntos`   Consultar adjuntos
  POST     `/facturas-compra/importar-xml`    Importar XML
  POST     `/facturas-compra/{id}/anular`     Solo Administrador

### Operación crítica

Registrar compra debe:

-   Aplicar descuentos.
-   Calcular IVA.
-   Calcular ReteIVA y ReteICA.
-   Crear entrada de inventario.
-   Actualizar costo promedio.
-   Crear cuenta por pagar.
-   Ejecutar todo de forma transaccional.

------------------------------------------------------------------------

# 14. Cuentas por cobrar y pagar

## Cuentas por cobrar

  Método   Endpoint                     Descripción
  -------- ---------------------------- --------------------
  GET      `/cuentas-por-cobrar`        CxC
  GET      `/cuentas-por-cobrar/{id}`   Detalle y abonos
  GET      `/cartera/morosos`           Clientes en mora
  GET      `/cartera/vencida`           Cartera por edades
  GET      `/cartera/resumen`           Resumen de cartera

## Cuentas por pagar

  ---------------------------------------------------------------------------------------------
  Método                  Endpoint                                      Descripción
  ----------------------- --------------------------------------------- -----------------------
  GET                     `/cuentas-por-pagar`                          CxP

  GET                     `/cuentas-por-pagar/{id}`                     Detalle

  GET                     `/cuentas-por-pagar/proximas-vencer?dias=7`   Próximos vencimientos

  GET                     `/cuentas-por-pagar/vencidas`                 CxP vencidas
  ---------------------------------------------------------------------------------------------

------------------------------------------------------------------------

# 15. Pagos

  Método   Endpoint               Descripción
  -------- ---------------------- ------------------------
  GET      `/pagos`               Lista filtrable
  POST     `/pagos`               Registrar pago o abono
  GET      `/pagos/{id}`          Detalle
  GET      `/pagos/{id}/recibo`   Recibo PDF
  POST     `/pagos/{id}/anular`   Solo Administrador

### Operación transaccional

Registrar pago debe:

1.  Crear pago.
2.  Aplicar saldo al documento.
3.  Cerrar cuenta si queda en cero.
4.  Mantener consistencia transaccional.

Debe soportar `Idempotency-Key`.

------------------------------------------------------------------------

# 16. Gastos

  Método   Endpoint                 Descripción
  -------- ------------------------ ---------------------
  GET      `/gastos`                Gastos propios
  POST     `/gastos`                Registrar gasto
  GET      `/gastos/{id}`           Detalle
  PATCH    `/gastos/{id}`           Editar gasto propio
  POST     `/gastos/{id}/soporte`   Subir soporte
  POST     `/gastos/{id}/anular`    Solo Administrador

Ejemplos de gastos:

-   Gasolina
-   Compras de oficina

El Usuario solo debe consultar y modificar sus propios gastos.

------------------------------------------------------------------------

# 17. Dashboard y reportes operativos

  Método   Endpoint                   Descripción
  -------- -------------------------- ----------------------------------------
  GET      `/dashboard/resumen`       KPIs operativos
  GET      `/dashboard/config`        Configuración propia
  PUT      `/dashboard/config`        Guardar configuración
  GET      `/reportes/ventas`         Ventas por periodo, cliente y producto
  GET      `/reportes/inventario`     Existencias y rotación
  GET      `/reportes/cartera`        Cartera por edades
  GET      `/reportes/utilidad`       Solo Administrador
  GET      `/reportes/rentabilidad`   Solo Administrador
  GET      `/reportes/flujo-caja`     Solo Administrador
  POST     `/reportes/exportar`       Exportar reporte
  GET      `/reportes/jobs/{jobId}`   Consultar exportación

### Regla

El Usuario ve **volumen**, pero no **margen, costo ni rentabilidad**.

------------------------------------------------------------------------

# 18. Salud del servicio

  Método   Endpoint          Descripción
  -------- ----------------- ----------------------------------------
  GET      `/health`         Liveness público
  GET      `/version`        Versión desplegada
  GET      `/health/ready`   Readiness de Cloud SQL y Cloud Storage

------------------------------------------------------------------------

# 19. Gestión de usuarios --- Administrador

  Método   Endpoint                           Descripción
  -------- ---------------------------------- ------------------------------------
  GET      `/usuarios`                        Lista de usuarios
  POST     `/usuarios`                        Crear usuario e invitar por correo
  GET      `/usuarios/{id}`                   Detalle
  PATCH    `/usuarios/{id}`                   Actualizar datos o rol
  POST     `/usuarios/{id}/activar`           Activar
  POST     `/usuarios/{id}/desactivar`        Desactivar sin borrar
  POST     `/usuarios/{id}/reset-password`    Forzar cambio de contraseña
  POST     `/usuarios/{id}/cerrar-sesiones`   Revocar sesiones
  GET      `/usuarios/{id}/sesiones`          Consultar sesiones
  GET      `/usuarios/{id}/actividad`         Actividad reciente

### Regla

Desactivar usuarios no debe borrar su historial de auditoría.

No se puede desactivar al último administrador.

------------------------------------------------------------------------

# 20. Roles y permisos --- Administrador

  Método   Endpoint                 Descripción
  -------- ------------------------ ----------------------
  GET      `/roles`                 Lista de roles
  POST     `/roles`                 Crear rol
  GET      `/roles/{id}`            Detalle
  PATCH    `/roles/{id}`            Modificar rol
  DELETE   `/roles/{id}`            Eliminar rol
  GET      `/roles/{id}/permisos`   Permisos del rol
  PUT      `/roles/{id}/permisos`   Reemplazar permisos
  GET      `/permisos`              Catálogo de permisos
  GET      `/roles/{id}/usuarios`   Usuarios del rol

Ejemplos de permisos:

``` text
ventas.create
ventas.anular
inventario.adjust
```

------------------------------------------------------------------------

# 21. Anulaciones y reversas --- Administrador

Las anulaciones **no eliminan registros**. Generan movimientos
compensatorios y conservan trazabilidad.

  Método   Endpoint                                  Descripción
  -------- ----------------------------------------- ---------------------------------
  POST     `/facturas-venta/{id}/anular`             Anular venta
  POST     `/facturas-compra/{id}/anular`            Anular compra
  POST     `/pagos/{id}/anular`                      Reversar pago
  POST     `/gastos/{id}/anular`                     Anular gasto
  POST     `/pedidos/{id}/anular`                    Anular pedido y liberar reserva
  POST     `/inventario/movimientos/{id}/reversar`   Reversar movimiento

Las operaciones sensibles deben exigir motivo cuando corresponda.

------------------------------------------------------------------------

# 22. Inventario administrativo

  -----------------------------------------------------------------------------------
  Método                  Endpoint                            Descripción
  ----------------------- ----------------------------------- -----------------------
  POST                    `/inventario/ajustes`               Ajuste por conteo
                                                              físico

  GET                     `/inventario/valorizado`            Valor a costo

  POST                    `/inventario/conteos`               Abrir conteo cíclico

  GET                     `/inventario/conteos/{id}`          Detalle de conteo

  POST                    `/inventario/conteos/{id}/cerrar`   Cerrar conteo y generar
                                                              ajustes

  PATCH                   `/productos/{id}/stock-minimo`      Definir stock mínimo

  POST                    `/bodegas`                          Crear bodega

  PATCH                   `/bodegas/{id}`                     Actualizar bodega

  DELETE                  `/bodegas/{id}`                     Eliminar bodega
  -----------------------------------------------------------------------------------

### Reglas

-   Los ajustes requieren motivo.
-   Los ajustes quedan auditados.
-   Una bodega con existencias no debe eliminarse.
-   El conteo cerrado no debe poder cerrarse nuevamente.

------------------------------------------------------------------------

# 23. Precios, costos y catálogos maestros

  -------------------------------------------------------------------------------------
  Método                  Endpoint                              Descripción
  ----------------------- ------------------------------------- -----------------------
  PATCH                   `/productos/{id}/precio`              Cambiar precio de venta

  POST                    `/productos/precios/masivo`           Actualización masiva

  GET                     `/productos/{id}/historial-precios`   Historial de costo y
                                                                precio

  GET                     `/productos/{id}/margen`              Costo, precio y
                                                                utilidad

  DELETE                  `/productos/{id}`                     Borrado lógico

  DELETE                  `/clientes/{id}`                      Borrado lógico

  DELETE                  `/proveedores/{id}`                   Borrado lógico

  POST                    `/clientes/importar`                  Importar clientes

  POST                    `/productos/importar`                 Importar catálogo

  POST/PATCH/DELETE       `/marcas`                             Administrar marcas

  POST/PATCH/DELETE       `/categorias`                         Administrar categorías

  POST/PATCH              `/categorias-gasto`                   Administrar categorías
                                                                de gasto

  POST/PATCH              `/impuestos`                          Administrar impuestos
  -------------------------------------------------------------------------------------

### Reglas

Los borrados lógicos deben impedirse cuando existan relaciones que
comprometan la integridad histórica.

------------------------------------------------------------------------

# 24. Facturación electrónica y consecutivos

  Método   Endpoint                 Descripción
  -------- ------------------------ -----------------------------
  GET      `/resoluciones`          Resoluciones de facturación
  POST     `/resoluciones`          Registrar resolución DIAN
  PATCH    `/resoluciones/{id}`     Actualizar resolución
  GET      `/resoluciones/activa`   Resolución vigente
  GET      `/consecutivos`          Estado de consecutivos
  PATCH    `/consecutivos/{tipo}`   Ajustar consecutivo

### Reglas

-   No permitir rangos de resolución solapados.
-   Validar vigencia.
-   Validar disponibilidad.
-   Los ajustes de consecutivos siempre deben quedar auditados.

------------------------------------------------------------------------

# 25. Gestión activa de cartera

  --------------------------------------------------------------------------------------
  Método                  Endpoint                               Descripción
  ----------------------- -------------------------------------- -----------------------
  POST                    `/cartera/recordatorios`               Enviar recordatorios

  PATCH                   `/clientes/{id}/cupo-credito`          Definir cupo y plazo

  POST                    `/clientes/{id}/bloquear-credito`      Bloquear ventas a
                                                                 crédito

  POST                    `/clientes/{id}/desbloquear-credito`   Desbloquear crédito

  POST                    `/cuentas-por-cobrar/{id}/castigar`    Castigar cuenta
                                                                 incobrable
  --------------------------------------------------------------------------------------

### Reglas

-   Recordatorios pueden procesarse de forma asíncrona.
-   Castigos requieren motivo y auditoría.
-   El bloqueo de crédito debe impedir nuevas ventas a crédito.

------------------------------------------------------------------------

# 26. Reportes financieros --- Administrador

  Método   Endpoint                             Descripción
  -------- ------------------------------------ ------------------------------
  GET      `/dashboard/financiero`              KPIs financieros
  GET      `/reportes/utilidad`                 Utilidad por periodo
  GET      `/reportes/rentabilidad`             Rentabilidad
  GET      `/reportes/flujo-caja`               Flujo de caja
  GET      `/reportes/gastos`                   Gastos de todos los usuarios
  GET      `/reportes/compras`                  Compras y costos
  GET      `/reportes/inventario-valorizado`    Inventario a costo
  GET      `/reportes/ventas-por-vendedor`      Desempeño comercial
  GET      `/reportes/estado-resultados`        Estado de resultados
  POST     `/reportes/cierre-mensual`           Cierre contable
  GET      `/periodos-contables`                Periodos abiertos/cerrados
  POST     `/periodos-contables/{id}/cerrar`    Cerrar periodo
  POST     `/periodos-contables/{id}/reabrir`   Reabrir periodo

### Regla

Estos servicios exponen información financiera sensible y son exclusivos
del Administrador.

------------------------------------------------------------------------

# 27. Empleados y nómina

  ------------------------------------------------------------------------------
  Método                  Endpoint                       Descripción
  ----------------------- ------------------------------ -----------------------
  GET                     `/empleados`                   Lista

  POST                    `/empleados`                   Registrar empleado

  GET                     `/empleados/{id}`              Detalle

  PATCH                   `/empleados/{id}`              Actualizar empleado

  GET                     `/nomina`                      Periodos de nómina

  POST                    `/nomina`                      Abrir periodo

  GET                     `/nomina/{id}`                 Detalle

  POST                    `/nomina/{id}/calcular`        Calcular devengados,
                                                         deducciones y neto

  POST                    `/nomina/{id}/pagar`           Marcar como pagada y
                                                         generar gasto

  GET                     `/nomina/{id}/desprendibles`   Desprendibles PDF
  ------------------------------------------------------------------------------

------------------------------------------------------------------------

# 28. Integración con Siigo

  ---------------------------------------------------------------------------------------------------------
  Método                  Endpoint                                                  Descripción
  ----------------------- --------------------------------------------------------- -----------------------
  GET                     `/integraciones/siigo/estado`                             Estado de conexión

  PUT                     `/integraciones/siigo/credenciales`                       Guardar credenciales en
                                                                                    Secret Manager

  POST                    `/integraciones/siigo/probar`                             Probar conexión

  POST                    `/integraciones/siigo/sincronizar`                        Sincronización completa

  POST                    `/integraciones/siigo/sincronizar/clientes`               Sincronizar clientes

  POST                    `/integraciones/siigo/sincronizar/productos`              Sincronizar productos

  POST                    `/integraciones/siigo/sincronizar/ventas`                 Enviar facturas de
                                                                                    venta

  GET                     `/integraciones/siigo/sincronizaciones`                   Historial

  GET                     `/integraciones/siigo/sincronizaciones/{id}`              Detalle de errores

  POST                    `/integraciones/siigo/sincronizaciones/{id}/reintentar`   Reprocesar fallidos

  GET                     `/integraciones/siigo/logs`                               Logs técnicos
  ---------------------------------------------------------------------------------------------------------

### Reglas

-   Nunca devolver credenciales al consultar configuración.
-   Las credenciales deben almacenarse en Secret Manager.
-   Las sincronizaciones pueden ser asíncronas.
-   Debe existir control para evitar sincronizaciones duplicadas
    simultáneas.
-   Los logs nunca deben exponer secretos.

------------------------------------------------------------------------

# 29. Auditoría --- Administrador

La auditoría es **solo lectura**.

No debe existir:

``` text
POST /auditoria
PATCH /auditoria
DELETE /auditoria
```

  Método   Endpoint                      Descripción
  -------- ----------------------------- -----------------------------
  GET      `/auditoria`                  Operaciones críticas
  GET      `/auditoria/{recurso}/{id}`   Historial de recurso
  GET      `/auditoria/usuarios/{id}`    Actividad de usuario
  GET      `/auditoria/anulaciones`      Anulaciones
  GET      `/auditoria/accesos`          Accesos exitosos y fallidos
  POST     `/auditoria/exportar`         Exportar log

La bitácora debe registrar, cuando corresponda:

-   Usuario
-   Fecha
-   Acción
-   Recurso
-   Valor anterior
-   Valor nuevo
-   Resultado
-   Motivo de operaciones sensibles

------------------------------------------------------------------------

# 30. Configuración del sistema

  Método   Endpoint                        Descripción
  -------- ------------------------------- -------------------------
  GET      `/configuracion`                Parámetros generales
  PATCH    `/configuracion`                Actualizar parámetros
  GET      `/configuracion/empresa`        Datos de empresa
  PATCH    `/configuracion/empresa`        Actualizar empresa
  POST     `/configuracion/empresa/logo`   Subir logo
  GET      `/configuracion/alertas`        Reglas de alertas
  PATCH    `/configuracion/alertas`        Actualizar alertas
  GET      `/configuracion/correo`         Configuración de correo
  PATCH    `/configuracion/correo`         Actualizar correo

------------------------------------------------------------------------

# 31. Operación y mantenimiento

  Método   Endpoint                        Descripción
  -------- ------------------------------- --------------------------------
  GET      `/health/ready`                 Verificar dependencias
  GET      `/admin/metricas`               Peticiones, latencia y errores
  GET      `/admin/jobs`                   Tareas asíncronas
  POST     `/admin/jobs/{id}/reintentar`   Reintentar tarea
  GET      `/admin/backups`                Historial de respaldos
  POST     `/admin/backups`                Ejecutar respaldo
  GET      `/admin/almacenamiento`         Uso de Cloud Storage

------------------------------------------------------------------------

# 32. Matriz resumida de capacidades

  Área                                                     Usuario           Administrador
  --------------------------- ------------------------------------ -----------------------
  Sesión y perfil                                               Sí                      Sí
  Catálogos lectura                                             Sí                      Sí
  Catálogos CRUD                                                No                      Sí
  Clientes/proveedores                               CRUD limitado   CRUD + administración
  Productos                     Consulta/creación/edición limitada                Completo
  Inventario operativo                                          Sí                      Sí
  Ajustes/conteos                                               No                      Sí
  Inventario valorizado                                         No                      Sí
  Cotizaciones                                                  Sí                      Sí
  Pedidos                                                       Sí                      Sí
  Facturas                                         Crear/consultar                Completo
  Anulaciones                                                   No                      Sí
  Pagos                                        Registrar/consultar                Completo
  Gastos                                                   Propios                   Todos
  Cartera consulta                                              Sí                      Sí
  Gestión de cartera                                            No                      Sí
  Reportes operativos                                           Sí                      Sí
  Reportes financieros                                          No                      Sí
  Resoluciones/consecutivos                                     No                      Sí
  Periodos contables                                            No                      Sí
  Nómina                                                        No                      Sí
  Usuarios/roles/permisos                                       No                      Sí
  Auditoría                                                     No                      Sí
  Siigo                                                         No                      Sí
  Configuración                                                 No                      Sí
  Mantenimiento                                                 No                      Sí

------------------------------------------------------------------------

# 33. Requisitos para implementación

Al generar código a partir de este catálogo, respetar como mínimo:

## Backend

1.  Arquitectura modular por dominio.
2.  Controladores separados por contexto funcional.
3.  DTOs para entrada y salida.
4.  Validación de DTOs.
5.  Guards de autenticación.
6.  Guards de autorización por permisos.
7.  Manejo uniforme de errores.
8.  `application/problem+json`.
9.  Transacciones para operaciones financieras e inventario.
10. Idempotencia en operaciones críticas.
11. Auditoría para operaciones sensibles.
12. Paginación en listados.
13. Filtros y búsqueda donde se definan.
14. Manejo de procesos asíncronos.
15. Swagger/OpenAPI.
16. Health checks.
17. Protección de secretos.
18. Control de propiedad de recursos.

## Base de datos

Diseñar las entidades para mantener integridad referencial y
trazabilidad.

Las operaciones de:

-   Facturación
-   Compras
-   Pagos
-   Inventario
-   Anulaciones
-   Cierre contable

deben mantener consistencia transaccional.

## Frontend

-   Next.js + React + TypeScript.
-   Tailwind.
-   TanStack Query para consumo de API.
-   React Hook Form + Zod para formularios.
-   Manejar estados `loading`, `error`, `empty` y `success`.
-   No confiar en ocultar botones como mecanismo de seguridad.
-   Mostrar únicamente funcionalidades permitidas por permisos, pero
    mantener la autorización real en backend.

------------------------------------------------------------------------

# 34. Requisitos de pruebas

Crear pruebas unitarias, integración y E2E para las operaciones
críticas.

## Pruebas obligatorias de autorización

Por cada endpoint restringido:

``` text
Token Usuario → endpoint Administrador → 403
```

## Prueba estructural recomendada

Recorrer las rutas registradas y fallar si una ruta protegible no
declara su permiso.

## Casos críticos

Probar como mínimo:

-   Usuario sin token → `401`
-   Usuario sin permiso → `403`
-   Recurso inexistente → `404`
-   Recurso de otra empresa → no debe exponerse
-   Stock insuficiente → `409`
-   Datos de negocio inválidos → `422`
-   Duplicados → `409`
-   Rate limit → `429`
-   Dependencia caída → `503`
-   Operación repetida con misma `Idempotency-Key`
-   Anulación de documento ya anulado
-   Modificación de periodo cerrado
-   Intento de eliminar entidad con dependencias
-   Consecutivo agotado o vencido

------------------------------------------------------------------------

# 35. Prompt base para generar el proyecto

Utiliza este documento como especificación funcional de servicios.

> Actúa como un Ingeniero de Software Senior especializado en
> arquitectura de aplicaciones web, APIs REST, seguridad, PostgreSQL y
> Google Cloud.
>
> Construye el CRM/ERP contable para una empresa de repuestos
> automotrices siguiendo estrictamente el catálogo de servicios definido
> en este documento.
>
> Stack:
>
> -   Frontend: Next.js + React + TypeScript + Tailwind CSS
> -   TanStack Query
> -   React Hook Form + Zod
> -   Backend: NestJS 11 con TypeScript o Spring Boot 4.1 con Java 21
> -   PostgreSQL 16/17 en Cloud SQL
> -   Swagger/OpenAPI
> -   Google Cloud Platform
>
> Roles:
>
> -   Usuario
> -   Administrador
>
> No dupliques endpoints por rol. Implementa autorización mediante
> permisos granulares y guards.
>
> La seguridad debe validarse en backend independientemente de las
> restricciones visuales del frontend.
>
> Implementa:
>
> 1.  Autenticación y autorización.
> 2.  Control de propiedad de recursos.
> 3.  Validación de DTOs.
> 4.  Manejo uniforme de errores.
> 5.  Transacciones para operaciones críticas.
> 6.  Idempotencia en operaciones que lo requieren.
> 7.  Auditoría de operaciones sensibles.
> 8.  Paginación y filtros.
> 9.  Procesos asíncronos donde estén definidos.
> 10. Swagger/OpenAPI.
> 11. Health checks.
> 12. Pruebas unitarias, integración y E2E.
>
> Para cada servicio generado debes indicar:
>
> -   Módulo/dominio.
> -   Endpoint.
> -   Método HTTP.
> -   Permiso requerido.
> -   DTO de entrada.
> -   Respuesta.
> -   Códigos HTTP.
> -   Reglas de negocio.
> -   Validaciones.
> -   Errores posibles.
> -   Si requiere transacción.
> -   Si requiere auditoría.
> -   Si requiere idempotencia.
> -   Pruebas necesarias.
>
> No inventes endpoints que contradigan este catálogo. Si una decisión
> técnica requiere modificar el contrato, explica primero la razón y
> presenta la propuesta antes de cambiarlo.

------------------------------------------------------------------------

# 36. Regla de oro del proyecto

La implementación debe mantener esta cadena:

``` text
Requisito
   ↓
Servicio / Endpoint
   ↓
Permiso
   ↓
Regla de negocio
   ↓
Modelo de datos
   ↓
Transacción
   ↓
Auditoría
   ↓
Prueba
   ↓
Documentación OpenAPI
```

El objetivo es que cada servicio pueda ser trazado desde su necesidad
funcional hasta su implementación y evidencia de prueba.
