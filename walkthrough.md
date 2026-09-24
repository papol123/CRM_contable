# Resumen de Implementación: Servicio de Inicio de Sesión (Login) CRM Contable

Se ha implementado con éxito la arquitectura y el código fuente para el servicio de autenticación y autorización (RBAC) del CRM Contable de repuestos automotrices.

---

## 1. Cambios Realizados

### Base de Datos PostgreSQL
- **Archivo Modificado**: [crm_contable_schema_postgresql_uuid.sql](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/crm_contable_schema_postgresql_uuid.sql)
- **Nuevas Tablas y Relaciones**:
  - `roles`: Catálogo de perfiles del sistema (`ADMIN`, `USUARIO`).
  - `permisos`: Permisos granulares por módulo (`ventas`, `inventario`, `terceros`, `usuarios`, etc.).
  - `roles_permisos`: Tabla intermedia para la asignación de permisos a roles.
  - `usuarios`: Cuentas de acceso con correo institucional, hash de contraseña, rol asignado y auditoría.
  - `refresh_tokens`: Gestión de sesiones persistentes revocables con rotación de tokens (Token Rotation).
- **Semillas de Datos (Seeds)**:
  - Creación de permisos operativos y administrativos.
  - Asignación de todos los permisos al rol `ADMIN` y permisos restringidos al rol `USUARIO`.
  - Usuario inicial: `admin@crmcontable.com` / `Admin123*`.

---

### Backend NestJS 11
- **Directorio Creado**: [backend/](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/)
- **Entidades TypeORM**:
  - [user.entity.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/database/entities/user.entity.ts)
  - [role.entity.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/database/entities/role.entity.ts)
  - [permission.entity.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/database/entities/permission.entity.ts)
  - [refresh-token.entity.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/database/entities/refresh-token.entity.ts)
- **Módulo de Autenticación (`AuthModule`)**:
  - [auth.controller.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/modules/auth/controllers/auth.controller.ts):
    - `POST /api/v1/auth/login`: Validación de credenciales con `bcrypt`, generación de JWT y fijación de cookie `HttpOnly` (`refreshToken`).
    - `POST /api/v1/auth/refresh`: Renovación automática de token con rotación del Refresh Token.
    - `POST /api/v1/auth/logout`: Revocación en base de datos y limpieza de la cookie de sesión.
    - `GET /api/v1/auth/me`: Retorna los datos del usuario autenticado y su lista de permisos efectivos.
  - [auth.service.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/modules/auth/services/auth.service.ts): Lógica de hashing, emisión de tokens y rotación criptográfica.
  - [jwt.strategy.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/modules/auth/strategies/jwt.strategy.ts) & [jwt-auth.guard.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/modules/auth/guards/jwt-auth.guard.ts): Autenticación Bearer para rutas protegidas.
  - [permissions.guard.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/modules/auth/guards/permissions.guard.ts) & [permissions.decorator.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/modules/auth/decorators/permissions.decorator.ts): Decorador `@RequirePermission(...)` que asegura el cumplimiento de permisos emitiendo `403 Forbidden` si no se cumplen.
- **Configuración Global**:
  - [main.ts](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/backend/src/main.ts): Prefijo `/api/v1`, parser de cookies para refresh tokens, validación estricta de DTOs y documentación Swagger OpenAPI en `/api/docs`.

---

## 2. Cómo Probar el Servicio

### Iniciar el Backend
Desde la terminal en el directorio `backend`:
```powershell
npm run start:dev
```

### Probar en Swagger
Acceder desde el navegador a:
```
http://localhost:3000/api/docs
```

### Probar mediante cURL / HTTP
**Inicio de Sesión:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@crmcontable.com","password":"Admin123*"}' \
  -c cookies.txt
```

**Consultar Perfil Protegido:**
```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <TU_ACCESS_TOKEN>"
```

**Renovar Token:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -b cookies.txt \
  -c cookies.txt
```

---

## 3. Datos Semilla y Credenciales de Prueba (RBAC)

Se poblaron todas las **39 tablas** del modelo de base de datos con datos coherentes para el negocio de repuestos automotrices (geografía, terceros, catálogo de repuestos con categorías y listas de precios, inventario, facturas DIAN, pagos y gastos).

### Credenciales de Acceso

| Rol | Correo Electrónico | Contraseña | Nombre Completo | Perfil / Cargo |
| :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@crmcontable.com` | `Admin123*` | Carlos Andrés Pérez Gómez | Administrador del Sistema |
| **ADMIN** | `gerencia@crmcontable.com` | `Admin123*` | María Fernanda Morales Castro | Gerente General |
| **USUARIO** | `usuario@crmcontable.com` | `Admin123*` | Juan Camilo Gómez Restrepo | Asesor de Mostrador |
| **USUARIO** | `vendedor@crmcontable.com` | `Admin123*` | Laura Daniela Ortiz Prada | Asesora Comercial Repuestos |
| **USUARIO** | `operador@crmcontable.com` | `Admin123*` | Andrés Felipe Rojas Medina | Encargado de Bodega |
| **USUARIO** | `caja@crmcontable.com` | `Admin123*` | Sandra Milena Vargas Cárdenas | Cajera Facturadora |

### Script de Semillas (Seed)
Para volver a ejecutar o repoblar las tablas en cualquier momento:
```powershell
cd backend
npm run seed
```

