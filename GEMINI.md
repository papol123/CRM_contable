# Directrices de Proyecto y Convenciones de Desarrollo (GEMINI.md)

Este archivo contiene las instrucciones globales, reglas de arquitectura, reglas de negocio, convenciones de código y normativas de seguridad para el desarrollo del *CRM/ERP Contable de Repuestos Automotrices*.

Eres un agente experto en desarrollo de software trabajando en Antigravity sobre este proyecto. Tu objetivo es construir, validar y mantener la plataforma cumpliendo estrictamente lo que dice este documento.

> *Nota de numeración:* las secciones 1 a 6 conservan su número original. La colección Bruno cita "GEMINI §6" para el formato de errores, así que *no renumeres* este archivo. Las secciones nuevas se agregan al final.

---

## 1. Contexto General del Proyecto

* *Descripción:* sistema ERP/CRM contable e inventario para una empresa de repuestos automotrices en Colombia: inventario, terceros, cotizaciones, pedidos, remisiones, compras, cartera, pagos, gastos, nómina, cierres contables e integración con Siigo.
* *Integración con NotebookLM (MCP):* el proyecto usa *dos cuadernos* que se consultan en paralelo (ver §3):

  | Cuaderno | ID | Qué responde |
  |---|---|---|
  | *Proyecto CRM* | ed3402ae-67db-4420-b996-7dafe03a196e | *Qué* construir: reglas de negocio, arquitectura, modelo de datos y flujos del CRM |
  | *Buenas prácticas de servicios* | 6a849736-7072-4338-b97e-4a6f771733ac | *Cómo* construirlo: diseño de APIs REST, estructura de servicios, validación, errores, seguridad de la capa de servicios y pruebas |

* *Fuentes de verdad (en este orden):*
  1. Este archivo (GEMINI.md).
  2. Cuaderno *Proyecto CRM* (ed3402ae-67db-4420-b996-7dafe03a196e).
  3. Cuaderno *Buenas prácticas de servicios* (6a849736-7072-4338-b97e-4a6f771733ac).
  4. Fullstack.txt (o CRM_Repuestos_Servicios_API_Prompt.md): catálogo oficial de endpoints, reglas de negocio y matriz de permisos.
  5. crm_contable_schema_postgresql_uuid.sql: esquema DDL oficial de PostgreSQL (MER v2).
  6. UX_MAPPING.md: pantallas de Stitch ↔️ endpoints, estados de interfaz y conflictos entre el PDF de UX y la API.
  7. Colección Bruno (bruno/): contrato ejecutable de la API.
  8. TROUBLESHOOTING.md: histórico de errores y soluciones.

  Si dos fuentes se contradicen, *detente y reporta la diferencia*. No elijas en silencio.

* *Fuera de alcance:* la empresa *no emite factura electrónica DIAN. Las ventas son **remisiones internas* (REM-000001, estadoDian: "NO_APLICA") y GET /resoluciones responde 404. Sí se reciben XML UBL 2.1 de proveedores. No implementes CUFE, resoluciones ni envío a la DIAN sin una orden explícita.

---

## 2. Stack Tecnológico y Arquitectura

La topología es fija: no propongas alternativas.

### Backend (NestJS 11)
- *Lenguaje:* TypeScript sobre NestJS 11. Es el backend desplegado; Spring Boot no se usa.
- *Despliegue:* *Cloud Run*, servicio crm-contable-api, región us-east1, proyecto crm-cloud-506523. Se publica con backend/desplegar-cloud-run.ps1. Al arrancar, el contenedor aplica las migraciones pendientes en Cloud SQL.
- *Base de datos:* Cloud SQL PostgreSQL 16/17, base crm_contable, esquema public.
- *Documentación de la API:* Swagger / OpenAPI 3.0 generado desde los decoradores. Es la referencia para completar los esquemas de respuesta de UX_MAPPING.md.
- *Validaciones:* DTOs con class-validator (o Zod) y tipado estricto.
- *Tareas asíncronas:* exportaciones CSV y envío de cotizaciones por correo responden 202 Accepted + jobId, y se consultan en GET /reportes/jobs/{jobId}.
- *Siigo:* se integra *solo desde el backend*. El frontend nunca llama a Siigo.

### Frontend (Next.js + React)
- *Framework:* Next.js (App Router) + TypeScript, desplegado en Cloud Run.
- *Estilos:* Tailwind CSS.
- *Gestión de estado y fetching:* TanStack Query (React Query).
- *Formularios y validaciones:* React Hook Form + Zod.
- *API:* solo por HTTPS a través de NEXT_PUBLIC_API_URL (incluye /api/v1). Pantallas, endpoints y estados de UI según UX_MAPPING.md.

### Infraestructura (Google Cloud Platform)
- *Cloud Run:* backend y frontend.
- *Cloud SQL (PostgreSQL):* datos transaccionales.
- *Secret Manager:* secretos y credenciales.
- *Cloud Storage:* adjuntos, PDF, XML, soportes, logo y exportaciones.
- *Cloud Build y Artifact Registry:* CI/CD e imágenes.
- *Cloud Logging y Cloud Monitoring:* observabilidad.
- *Load Balancer + Cloud Armor:* solo en el escenario de alta disponibilidad del OPEX.

---

## 3. Directrices de MCP NotebookLM

Los dos cuadernos se consultan *en simultáneo, no uno después del otro: cada tarea de backend cruza el *qué (proyecto) con el cómo (buenas prácticas).

1. *Consulta obligatoria de ambos cuadernos* antes de diseñar o modificar un módulo complejo (Remisiones, Kardex, Compras/XML, Pagos, Siigo, Cierre contable, Nómina, RBAC):
   - *Proyecto CRM* (ed3402ae-67db-4420-b996-7dafe03a196e): reglas de negocio, entidades involucradas, flujo y permisos del módulo.
   - *Buenas prácticas* (6a849736-7072-4338-b97e-4a6f771733ac): estructura del servicio, controlador, DTO, guards, manejo de errores y pruebas.
2. *Antes de crear o modificar cualquier servicio, controlador, DTO, guard, middleware o endpoint*, consulta el cuaderno de buenas prácticas y aplica sus pautas de estructura, nombres, validación, errores, seguridad y pruebas.
3. *Cumplimiento de seguridad:* aplica las directrices de seguridad del cuaderno de buenas prácticas para mitigar vulnerabilidades en la capa de servicios.
4. *Resolución de conflictos:*
   - Proyecto vs. buenas prácticas: la regla de negocio del cuaderno del proyecto define *qué* debe pasar, y buenas prácticas define *cómo* implementarlo. Si no se pueden cumplir ambos, reporta el choque.
   - Cualquier cuaderno vs. este archivo: *manda este archivo*, y reportas el choque.
5. *Trazabilidad:* al terminar una tarea, indica en el resumen qué pautas de cada cuaderno aplicaste.

---

## 4. Estándares de Base de Datos y Persistencia (PostgreSQL)

1. *Llaves primarias:* todas las tablas principales usan UUID generados con gen_random_uuid().
2. *Tipos de datos monetarios y cantidades:*
   - Precios, montos, saldos, impuestos y totales: NUMERIC(15,2)
   - Cantidades de stock y unidades: NUMERIC(12,3)
   - Porcentajes y retenciones: NUMERIC(5,2)
   - Nunca float ni double para dinero.
3. *Manejo del tiempo:* usar exclusivamente TIMESTAMPTZ. En la API, las fechas van como YYYY-MM-DD en hora de Bogotá y los periodos como YYYY-MM.
4. *Transaccionalidad:* usar transacciones explícitas (BEGIN/COMMIT o @Transactional / QueryRunner) para:
   - Remisiones de venta y facturas de compra
   - Registro de pagos y abonos, y sus anulaciones
   - Entradas, salidas y traslados de inventario entre bodegas
   - Ajustes y conteos de inventario
   - Asignación de consecutivos
   - Liquidación y pago de nómina
   - Cierres y reaperturas contables
5. *Concurrencia:* las salidas de inventario y los consecutivos se validan dentro de la misma transacción con bloqueo de fila (SELECT … FOR UPDATE), para evitar sobreventa y números duplicados.
6. *Prevención de SQL Injection:* prohibido concatenar variables en consultas SQL. Usa siempre consultas parametrizadas u ORMs autorizados (Prisma, TypeORM o Drizzle).
7. *Esquema y migraciones:* respeta el MER v2 normalizado en 3 módulos (terceros, inventario y documentos), con geografía País → Departamento → Ciudad, y teléfonos y correos en tablas propias. Todo cambio de esquema va en una *migración versionada* y se refleja en crm_contable_schema_postgresql_uuid.sql. Nunca se altera la base a mano.
8. *Auditoría:* toda creación, edición o anulación de documentos, terceros, cupos, roles y periodos queda en la bitácora con usuario, fecha, valor_anterior y valor_nuevo (JSONB). La bitácora es de solo lectura.

---

## 5. Autorización, Roles y Seguridad Transversal

1. *Regla de oro, no duplicar endpoints:* no crees endpoints separados por rol (ej. /admin/facturas vs. /usuario/facturas). Cada ruta es única y la autorización se evalúa con guards basados en *permisos granulares* (ej. @RequirePermission('ventas.anular')). El prefijo /api/v1/admin/ se reserva para *operación y mantenimiento* (métricas, jobs, almacenamiento, backups), no para duplicar recursos de negocio.
2. *Roles principales* (claim rol del JWT: ADMIN | USUARIO):
   - *Usuario:* operaciones cotidianas (remisiones, cotizaciones, pedidos, compras, pagos propios, gastos propios, movimientos de inventario, consultas).
   - *Administrador:* control total (anulaciones, ajustes de stock, costos y márgenes, cupos de crédito, cierres, nómina, Siigo, usuarios, roles, auditoría y configuración).
3. *Validación backend primaria:* el frontend puede ocultar botones, pero el backend *debe* validar el JWT y los permisos efectivos. Si falta el permiso, retorna 403 Forbidden.
4. *JWT:* dura 15 minutos y lleva sub, email, rol y permisos[]. El login tiene límite de tasa por IP (429) y un mensaje genérico que no revela si el correo existe.
5. *Propiedad de recursos:* toda lectura o escritura valida que el recurso pertenezca a la empresa o al usuario autenticado. Un Usuario que pide un pago, gasto o job ajeno recibe 404, no 403. Costos y márgenes solo se devuelven a quien tenga inventario.costos o reportes.financieros.
6. *Idempotencia:* la cabecera Idempotency-Key es obligatoria en POST /facturas-venta, POST /facturas-compra, POST /pagos y POST /pedidos/{id}/facturar. Misma clave con el mismo cuerpo → resultado original + header idempotent-replayed: true. Misma clave con otro cuerpo → 422.
7. *Cero credenciales en el repositorio:* prohibido hardcodear, registrar en logs o documentar contraseñas, claves de Siigo, secretos JWT, tokens o cadenas de conexión. Esto incluye los entornos de Bruno: tokens y claves van como variables secretas locales, nunca versionadas.
8. *Secret Manager:* las credenciales llegan a Cloud Run como variables de entorno inyectadas desde Google Secret Manager. PATCH /configuracion debe seguir rechazando secretos (403).
9. *Entradas no confiables:* los XML se procesan sin DTD ni entidades externas (protección XXE, 422). Los adjuntos se validan por contenido real (magic bytes, 415) y por tamaño (413).
10. *Perímetro:* si se activa el Load Balancer, se agrega Cloud Armor con límite de tasa y reglas OWASP. Sin LB, el control queda en el backend.

---

## 6. Estándar de Respuestas HTTP y Manejo de Errores

1. *Semántica HTTP (RFC 9110):* GET lee sin efectos, POST crea o ejecuta acciones, PATCH modifica parcialmente y DELETE elimina solo entidades no financieras.
2. *Códigos de estado:*
   - 200 OK / 201 Created / 202 Accepted (proceso asíncrono) / 204 No Content
   - 400 Bad Request (JSON malformado o validación de DTO, con errors[])
   - 401 Unauthorized (token ausente, inválido o expirado)
   - 403 Forbidden (sin permiso suficiente)
   - 404 Not Found (el recurso no existe o no pertenece al usuario)
   - 409 Conflict (stock insuficiente, duplicados, estado inconsistente, anulación repetida, consecutivo hacia atrás)
   - 413 Payload Too Large / 415 Unsupported Media Type (adjuntos)
   - 422 Unprocessable Entity (regla de negocio: crédito bloqueado, periodo cerrado, pago mayor al saldo, XML inseguro)
   - 429 Too Many Requests (límite de tasa superado)
   - 500 Internal Server Error / 503 Service Unavailable
3. *Formato de errores:* todos los errores devuelven el estándar *RFC 9457* (application/problem+json):
   json
   {
     "type": "https://api.tudominio.com/errors/stock-insuficiente",
     "title": "Stock insuficiente",
     "status": 409,
     "detail": "El producto PRD-001 no cuenta con stock disponible en la bodega principal.",
     "instance": "/api/v1/facturas-venta"
   }
   
4. *Tipos de error de negocio:* el type es estable y termina en un slug (stock-insuficiente, credito-bloqueado, periodo-cerrado…). Cada slug nuevo se documenta en UX_MAPPING.md §1.4 para que el frontend lo maneje.

---

## 7. Reglas de Negocio

1. *Inventario por movimientos (Kardex):* el stock nunca se edita directamente. Solo cambia por entradas, salidas, traslados, ajustes (solo Admin) o cierre de conteo. Cada movimiento exige motivo.
2. *Documentos financieros inmutables:* remisiones, compras, pagos y gastos *no se borran*. Se anulan con motivo obligatorio y movimientos compensatorios (Kardex y saldos). Anular dos veces da 409. Una compra con pagos no se anula hasta reversar los pagos.
3. *Periodos contables:* solo se cierran meses terminados (POST /reportes/cierre-mensual). Ninguna operación con fecha en un periodo cerrado se acepta (422 periodo-cerrado). Reabrir exige permiso y motivo.
4. *Crédito de clientes:* el cupo solo lo define el Admin (PATCH /clientes/{id}/cupo-credito). Bloquear o desbloquear exige motivo y conserva el cupo. Una venta a crédito con el crédito bloqueado o el cupo excedido da 422 credito-bloqueado.
5. *Cálculos monetarios:* solo en el backend. IVA, descuentos, ReteFuente, ReteIVA y ReteICA (tarifa por mil) se guardan con la tarifa aplicada. El frontend solo muestra lo que devuelve POST /facturas-venta/calcular.
6. *Consecutivos* (REM-, COT-, PED-): se asignan en transacción con bloqueo y *nunca retroceden* (409).
7. *Nómina:* SMMLV y auxilio de transporte vienen de configuración (NOMINA_SMMLV), no del código. Una nómina pagada genera su gasto y no se recalcula (409).
8. *Compras:* el XML del proveedor solo precarga datos (POST /facturas-compra/importar-xml). La compra genera la entrada al inventario y la cuenta por pagar. Un número de factura repetido para el mismo proveedor da 409.

---

## 8. Contrato de la API y Definición de Terminado

1. *Rutas:* todo bajo /api/v1/, con una sola ruta por recurso (§5.1).
2. *Convenciones:* IDs UUID, JSON en camelCase, listados { data, meta: { total } } con ?limit=.
3. *Bruno es el contrato:* los .bru se generan con backend/scripts/bruno/generar_coleccion.py, *nunca a mano*. Si cambias una ruta, un campo, un permiso o un código de respuesta, actualiza el generador y regenera.
4. *Definición de terminado para un servicio:*
   1. Revisado contra el cuaderno de buenas prácticas (6a849736-7072-4338-b97e-4a6f771733ac), sin pautas incumplidas.
   2. Coherente con las reglas del cuaderno del proyecto (ed3402ae-67db-4420-b996-7dafe03a196e) y con §7.
   3. Métodos HTTP, códigos y errores según §6.
   4. Permiso RBAC declarado y probado (caso permitido + caso 403).
   5. Decoradores de Swagger actualizados.
   6. npx @usebruno/cli run --env "Cloud SQL - backend local" -r pasa completo.

---

## 9. Trabajo en Paralelo (varios agentes o sesiones a la vez)

Cuando haya más de un agente trabajando al mismo tiempo (por ejemplo, uno en backend y otro en frontend), todos leen *este mismo archivo* y los *mismos dos cuadernos*, así que comparten el mismo contexto.

1. *Un módulo por agente:* cada agente declara al inicio en qué módulo trabaja y no edita archivos de otro módulo sin avisar.
2. *Archivos compartidos:* GEMINI.md, UX_MAPPING.md, el esquema SQL y el generador de Bruno se editan con cambios pequeños y explícitos. Nunca se reescriben completos.
3. *El contrato primero:* si el backend cambia una ruta, un campo o un código de respuesta, actualiza Bruno y UX_MAPPING.md en la misma tarea, para que el frontend trabaje sobre el contrato vigente.
4. *TROUBLESHOOTING.md solo se edita agregando al final:* nunca se modifican ni se borran entradas de otro agente.

---

## 10. Registro de Solución de Problemas (Troubleshooting)

1. *Documentación continua:* cada vez que identifiques y soluciones un error técnico, documéntalo *en la misma tarea. Ejemplos: migraciones que fallan al arrancar Cloud Run, agotamiento de conexiones a Cloud SQL, *deadlocks en Kardex o consecutivos, carreras con Idempotency-Key, JWT vencido, CORS, XML de proveedor mal formado, timeouts de Siigo.
2. *Archivo de destino:* agrega una entrada al final de TROUBLESHOOTING.md con este formato:

   markdown
   ### [AAAA-MM-DD HH:mm America/Bogota] Título corto
   - **Descripción del error:** síntoma, endpoint o módulo y mensaje exacto (sin datos sensibles).
   - **Causa raíz:** …
   - **Solución aplicada:** cambio realizado y archivos tocados.
   - **Prevención:** prueba de Bruno, validación o alerta añadida.