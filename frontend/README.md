# Frontend Next.js — Apex Ledger (CRM & ERP Contable Automotriz)

Frontend web corporativo construido con **Next.js (App Router)**, **TypeScript**, **Tailwind CSS** y **TanStack React Query**, diseñado bajo las especificaciones de diseño de [DESIGN.md](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/DESIGN.md), la arquitectura y reglas de negocio de [GEMINI.md](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/GEMINI.md) y el mapeo integral de pantallas y tratamiento RCE de [UX_MAPPING.MD](file:///c:/Users/Thuer/OneDrive/Documents/CRM_contable/frontend/UX_MAPPING.MD).

---

## 1. Stack Tecnológico

- **Framework:** Next.js 14 (App Router) + React 18 + TypeScript 5
- **Estilos:** Tailwind CSS con tokens corporativos "Apex Ledger Corporate" (paleta slate navy `#0f172a`, primary `#1d63ed`, canvas `#f8fafc`)
- **Tipografía y Formato:** Inter, `tabular-nums` en celdas y montos financieros COP (`Intl.NumberFormat`)
- **Gestión de Estado y Fetching:** TanStack Query v5 con manejo de reintentos inteligente y cliente base `lib/api.ts`
- **Manejo de Errores:** Formato RFC 9457 (`application/problem+json`) mediante banners interactivos y acciones RCE
- **Seguridad:** Tokens JWT en memoria y `sessionStorage`, expiración a 15 min con alerta a los 13 min, gating por permisos granulares con `can()` y cabecera `Idempotency-Key` en operaciones críticas.

---

## 2. Estructura de Rutas y Módulos

| Módulo | Ruta | Pantallas Stitch / PDF | Roles / Permisos |
|---|---|---|---|
| **Autenticación** | `/auth/login` | 1.1, 1.2, 1.3 | Público (Token JWT, RCE en 400/401/429) |
| **Recuperación** | `/auth/forgot-password` | 1.4 | Público (Respuesta neutra 30 min) |
| **Restablecimiento**| `/auth/reset-password` | 1.5, 1.5a, 1.5b | Con token (Medidor de seguridad y RCE en expiración) |
| **Control de Acceso**| `/acceso-denegado` | 1.6 | Autenticado (403 RBAC con solicitud mailto) |
| **Dashboard** | `/dashboard` | 2.1, 2.1E | Admin (completo) / Usuario (alertas y accesos) |
| **Clientes** | `/clientes` | 2.2, 2.2E, A1, A2 | Consulta, cartera, bloqueo/desbloqueo y cupo |
| **Proveedores** | `/proveedores` | 2.3, 2.3E | Directorio, compras y cuentas por pagar |
| **Compras XML** | `/proveedores/compras/nueva` | D1, D2 | Importación UBL 2.1 y retenciones |
| **Inventario** | `/inventario` | 2.4, 2.4E, B1, B2 | Catálogo, Kardex interactivo, entradas/salidas/traslados |
| **Ventas / Remisiones** | `/facturacion/nueva` y `/ventas` | 2.5, 2.5E, C1, C2 | Simulador `/calcular`, idempotencia y remisiones internas |
| **Tesorería y Cartera**| `/contabilidad/cartera` | E1, E2 | Recibos de caja, pagos idempotentes y gastos |
| **Liquidación Nómina**| `/contabilidad/nomina` | F1, F2 | Periodos, horas extras en COP y desprendibles |
| **Cierre Contable** | `/contabilidad/cierre` | G1, G2 | Cierre inmutable de mes, reabrir y jobs CSV |
| **Integraciones** | `/contabilidad/siigo` | J1, J2 | Estado y auditoría de reversas |
| **Usuarios y Roles** | `/configuracion/usuarios` | H1, H2 | Directorio, invitaciones y roles |
| **Catálogos** | `/configuracion/catalogos` | I1, I2 | Consecutivos y datos institucionales |

---

## 3. Ejecución Local

```bash
cd frontend
npm install
npm run dev
```

La aplicación quedará disponible en `http://localhost:3000`.

Para compilar el bundle de producción:
```bash
npm run build
```
