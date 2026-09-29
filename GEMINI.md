# Directrices de Proyecto y Convenciones de Desarrollo (GEMINI.md)

Este archivo contiene las instrucciones globales, reglas de arquitectura, convenciones de código y normativas de seguridad para la asistencia del desarrollo del **CRM/ERP Contable de Repuestos Automotrices**.

---

## 1. Contexto General del Proyecto

* **Descripción:** Sistema ERP/CRM contable e inventario para repuestos automotrices.
* **Integración con NotebookLM (MCP ID):** `6a849736-7072-4338-b97e-4a6f771733ac`
* **Archivos Base de Referencia:**
  - `Fullstack.txt` (ó `CRM_Repuestos_Servicios_API_Prompt.md`): Catálogo oficial de endpoints, reglas de negocio y matriz de permisos.
  - `crm_contable_schema_postgresql_uuid.sql`: Esquema oficial DDL PostgreSQL.
  - `TROUBLESHOOTING.md`: Histórico de errores y soluciones.

---

## 2. Stack Tecnológico y Arquitectura

### Backend (NestJS 11 / Spring Boot 4.1)
- **Lenguaje:** TypeScript (NestJS) o Java 21 (Spring Boot).
- **Base de Datos:** Cloud SQL PostgreSQL 16/17.
- **Documentación API:** Swagger / OpenAPI 3.0 generado automáticamente desde decoradores.
- **Validaciones:** DTOs con `class-validator` / `Zod` y manejo estricto de tipos.

### Frontend (Next.js + React)
- **Framework:** Next.js (App Router) + TypeScript.
- **Estilos:** Tailwind CSS.
- **Gestión de Estado y Fetching:** TanStack Query (React Query).
- **Formularios y Validaciones:** React Hook Form + Zod.

### Infraestructura (Google Cloud Platform)
- Cloud SQL (PostgreSQL), Secret Manager (Secretos y Credenciales), Cloud Storage (Adjuntos/Archivos/PDFs).

---

## 3. Directrices de MCP NotebookLM

1. **Consulta Obligatoria:** Antes de diseñar o modificar un módulo complejo (ej. Facturación Electrónica, Kardex, Siigo, Cierre Contable), consulta las notas de arquitectura en el MCP de NotebookLM con ID `6a849736-7072-4338-b97e-4a6f771733ac`.
2. **Cumplimiento de Seguridad:** Aplica las directrices de seguridad obtenidas de NotebookLM para mitigar vulnerabilidades específicas en la capa de servicios.

---

## 4. Estándares de Base de Datos y Persistencia (PostgreSQL)

1. **Llaves Primarias:** Todas las tablas principales deben utilizar `UUID` generados con `gen_random_uuid()`.
2. **Tipos de Datos Monetarios y Cantidades:**
   - Precios, montos, saldos, impuestos y totales: `NUMERIC(15,2)`
   - Cantidades de stock y unidades: `NUMERIC(12,3)`
   - Porcentajes / Retenciones: `NUMERIC(5,2)`
3. **Manejo del Tiempo:** Usar exclusivamente `TIMESTAMPTZ` (o `TIMESTAMP WITH TIME ZONE`).
4. **Transaccionalidad:** Usar bloques transaccionales explícitos (`BEGIN/COMMIT` o `@Transactional`) para:
   - Facturación de Venta y Compra
   - Registro de Pagos / Abonos
   - Traslados de Inventario entre Bodegas
   - Ajustes y Conteos de Inventario
   - Cierres Contables
5. **Prevención de SQL Injection:** Queda estrictamente prohibido concatenar variables en consultas SQL. Utilizar siempre consultas parametrizadas u ORMs autorizados (Prisma, TypeORM, Drizzle o JPA/Hibernate).

---

## 5. Autorización, Roles y Seguridad Transversal

1. **Regla de Oro - No Duplicar Endpoints:** No crear endpoints separados por rol (ej. `/admin/facturas` vs `/usuario/facturas`). Toda ruta debe ser única y la autorización se evalúa con guardias/middlewares basados en **permisos granulares** (ej. `@RequirePermission('ventas.anular')`).
2. **Roles Principales:**
   - **Usuario:** Operaciones cotidianas (Facturar, Cotizar, Compras, Pagos propios, Consultas).
   - **Administrador:** Control total (Anulaciones, Ajustes de Stock, Costos/Márgenes, Cierres, Siigo, Usuarios, Auditoría).
3. **Validación Backend Primaria:** El frontend puede ocultar botones por UI, pero el backend DEBE validar el JWT y los permisos efectivos. Si falta permiso, retornar `403 Forbidden`.
4. **Propiedad de Recursos:** Toda consulta de lectura/escritura debe validar que el recurso pertenezca a la empresa o tercero del usuario autenticado.
5. **Idempotencia:** Implementar la cabecera `Idempotency-Key` en endpoints transaccionales críticos (`POST /facturas-venta`, `POST /pagos`).

---

## 6. Estándar de Respuestas HTTP y Manejo de Errores

1. **Códigos de Estado:**
   - `200` OK / `201` Created / `204` No Content
   - `400` Bad Request (JSON malformado)
   - `401` Unauthorized (Token no válido / expirado)
   - `403` Forbidden (Sin permiso suficiente)
   - `404` Not Found (Recurso no existe o no pertenece al usuario)
   - `409` Conflict (Conflicto de stock, duplicados o estado inconsistente)
   - `422` Unprocessable Entity (Fallo de reglas de negocio)
   - `429` Too Many Requests (Rate limit superado)
   - `500` Internal Server Error
2. **Formato de Errores:** Todos los errores deben devolver el estándar **RFC 9457** (`application/problem+json`):
   ```json
   {
     "type": "[https://api.tudominio.com/errors/stock-insuficiente](https://api.tudominio.com/errors/stock-insuficiente)",
     "title": "Stock insuficiente",
     "status": 409,
     "detail": "El producto PRD-001 no cuenta con stock disponible en la bodega principal.",
     "instance": "/api/v1/facturas-venta"
   }