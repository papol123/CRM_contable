# CRM Contable - Módulo Backend (NestJS 11)

Módulo Backend del CRM/ERP Contable para la empresa de repuestos automotrices, construido con **NestJS 11**, **TypeScript**, **PostgreSQL** y **Passport / JWT**.

---

## 1. Módulo de Autenticación y Autorización (RBAC)

El subsistema de inicio de sesión implementa una **estrategia de Token Dual** conforme a las especificaciones de seguridad:

1. **Access Token (JWT)**:
   - Vida útil: 15 minutos (configurable en `JWT_EXPIRATION`).
   - Contenido del payload: `sub` (ID usuario), `email`, `rol`, y `permisos` autorizados.
   - Envío en peticiones: Header `Authorization: Bearer <accessToken>`.

2. **Refresh Token**:
   - Vida útil: 7 días (configurable en `REFRESH_TOKEN_EXPIRATION_DAYS`).
   - Almacenamiento seguro: Cookie `HttpOnly`, `SameSite=Strict`, `Secure` en la ruta `/api/v1/auth`.
   - Persistencia y Rotación: Hasheado con SHA-256 en la tabla `refresh_tokens`. Cada renovación invalida el token previo y genera un par nuevo para prevenir ataques de repetición.

---

## 2. Endpoints de Autenticación

Todos los endpoints tienen el prefijo `/api/v1`:

| Método | Endpoint | Descripción | Seguridad |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Inicia sesión, entrega el JWT y fija la cookie HttpOnly | Pública |
| `POST` | `/api/v1/auth/refresh` | Renueva el Access Token leyendo la cookie de sesión | Pública (Valida cookie) |
| `POST` | `/api/v1/auth/logout` | Revoca el token en BD y limpia la cookie | Sesión activa |
| `GET`  | `/api/v1/auth/me` | Retorna el usuario autenticado, rol y permisos | Bearer JWT |

### Documentación Swagger
Con el backend en ejecución, la documentación interactiva OpenAPI está disponible en:
```
http://localhost:3000/api/docs
```

---

## 3. Control de Acceso por Permisos (RBAC)

Siguiendo la regla de oro del proyecto (**"No duplicar endpoints por rol"**):

```typescript
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('ventas.anular')
@Post('ventas/:id/anular')
async anularVenta(@Param('id') id: string) {
  // Lógica de anulación
}
```

Si un usuario con rol operativo intenta acceder a un endpoint restringido, el sistema responde automáticamente con `403 Forbidden` según la RFC 9457.

---

## 4. Base de datos: migraciones y datos de prueba

```bash
# 1. Esquema base (si la base está vacía) + migraciones pendientes de database/migrations
npm run db:migrate

# 2. Datos base: geografía, catálogos, estados, roles/permisos y usuarios de prueba.
#    Es idempotente: solo inserta lo que falte.
npm run seed

# 3. Datos de demostración: ~6 meses simulados de compras, ventas, pagos, gastos,
#    cotizaciones y pedidos. Falla si ya hay productos o facturas.
npm run seed:demo
npm run seed:demo -- --reset          # borra la demo anterior y la regenera (solo base local)
npm run seed:demo -- --reset --force  # permite --reset contra una base remota (¡borra datos!)
npm run seed:demo -- --dias=90        # simula otro número de días

# Todo lo anterior en un paso
npm run db:setup
```

Los datos editables de cada seed están en `scripts/data/base.js` y `scripts/data/demo.js`.

### Usuarios de prueba (contraseña `Admin123*`)

| Correo | Rol |
|---|---|
| `admin@crmcontable.com`, `gerencia@crmcontable.com` | ADMIN |
| `usuario@crmcontable.com`, `vendedor@crmcontable.com`, `operador@crmcontable.com`, `caja@crmcontable.com` | USUARIO |

### Variables de entorno obligatorias

- `JWT_SECRET`: el backend no arranca sin ella (ya no hay un secreto por defecto).
- `FRONTEND_URL`: origen(es) permitidos por CORS, separados por coma. Con `NODE_ENV=production` solo se aceptan estos; en desarrollo se aceptan además `localhost` y `127.0.0.1`.
- `APP_TIMEZONE` (opcional, por defecto `America/Bogota`): zona usada para la fecha de "hoy".

## 5. Comandos de Ejecución

```bash
# Modo desarrollo con recarga en vivo
npm run start:dev

# Compilar para producción
npm run build

# Iniciar bundle de producción
npm run start:prod
```
