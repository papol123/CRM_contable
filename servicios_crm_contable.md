# Servicios web — CRM Contable (repuestos automotrices)

**Base URL:** `/api/v1`
**Autenticación:** `Authorization: Bearer <access_token>` en todos los endpoints, excepto `/auth/login`, `/auth/refresh`, `/auth/forgot-password`, `/auth/reset-password` y `/health`.
**Roles:** Usuario (operativo) y Administrador (todo lo del Usuario + Parte B).

> Métodos: **GET** consulta · **POST** crea o ejecuta una acción · **PUT** reemplaza · **PATCH** actualiza parcialmente · **DELETE** elimina (borrado lógico).
>
> Los módulos marcados *(reconstruido)* se completaron con el mismo criterio del catálogo original; conviene validarlos contra el documento Word del 8 de septiembre.

---

## Parte A — Rol Usuario

### A1. Autenticación *(reconstruido)*
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/auth/login` | Inicia sesión, devuelve access token |
| POST | `/auth/refresh` | Renueva el access token |
| POST | `/auth/logout` | Cierra la sesión |
| POST | `/auth/forgot-password` | Solicita recuperación de contraseña |
| POST | `/auth/reset-password` | Restablece la contraseña |
| GET | `/auth/me` | Datos y permisos del usuario autenticado |

### A2. Catálogos base — solo lectura *(reconstruido)*
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/paises` | Lista de países |
| GET | `/departamentos?paisId=` | Departamentos de un país |
| GET | `/ciudades?departamentoId=` | Ciudades de un departamento |
| GET | `/marcas` | Marcas de productos |
| GET | `/categorias` | Categorías de productos |
| GET | `/impuestos` | Tarifas de impuesto |
| GET | `/formas-pago` | Contado, crédito 30, crédito 60 |
| GET | `/medios-pago` | Efectivo, transferencia, tarjeta, cheque |
| GET | `/categorias-gasto` | Categorías de gasto |

### A3. Clientes
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/clientes` | Lista paginada con filtros |
| GET | `/clientes/{id}` | Detalle |
| GET | `/clientes/{id}/telefonos` | Teléfonos |
| GET | `/clientes/{id}/correos` | Correos |
| GET | `/clientes/{id}/historial-compras` | Historial de compras |
| GET | `/clientes/{id}/cartera` | Estado de cuenta |
| POST | `/clientes` | Crear (NIT único) |
| PATCH | `/clientes/{id}` | Actualizar |
| POST | `/clientes/{id}/telefonos` | Agregar teléfono |
| DELETE | `/clientes/{id}/telefonos/{telId}` | Eliminar teléfono |
| POST | `/clientes/{id}/correos` | Agregar correo |

### A4. Proveedores
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/proveedores` | Lista |
| GET | `/proveedores/{id}` | Detalle |
| GET | `/proveedores/{id}/historial-compras` | Compras al proveedor |
| GET | `/proveedores/{id}/productos` | Productos que suministra |
| GET | `/proveedores/comparar-precios?productoId=` | Comparar precios entre proveedores |
| POST | `/proveedores` | Crear |
| PATCH | `/proveedores/{id}` | Actualizar |

### A5. Productos
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/productos` | Lista con filtros |
| GET | `/productos/buscar?q=` | Búsqueda rápida por código o referencia |
| GET | `/productos/{id}` | Detalle con saldos por bodega |
| POST | `/productos` | Crear |
| PATCH | `/productos/{id}` | Actualizar descripción, marca o categoría |

### A6. Inventario *(parcialmente reconstruido)*
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/inventario` | Saldos por producto y bodega |
| GET | `/inventario/movimientos` | Kardex |
| GET | `/inventario/alertas-stock` | Productos bajo stock mínimo |
| GET | `/inventario/sin-movimiento?dias=180` | Inventario obsoleto |
| POST | `/inventario/movimientos` | Registrar entrada o salida |

### A7. Cotizaciones
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/cotizaciones` | Lista |
| GET | `/cotizaciones/{id}` | Detalle |
| GET | `/cotizaciones/{id}/pdf` | Descargar PDF |
| POST | `/cotizaciones` | Crear |
| PATCH | `/cotizaciones/{id}` | Editar (solo en borrador) |
| POST | `/cotizaciones/{id}/enviar` | Enviar PDF por correo |
| POST | `/cotizaciones/{id}/aprobar` | Aprobar |
| POST | `/cotizaciones/{id}/rechazar` | Rechazar con motivo |
| POST | `/cotizaciones/{id}/convertir-pedido` | Convertir en pedido |

### A8. Pedidos
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/pedidos` | Lista |
| GET | `/pedidos/{id}` | Detalle |
| GET | `/pedidos/{id}/trazabilidad` | Historial de estados |
| POST | `/pedidos` | Crear (reserva stock) |
| PATCH | `/pedidos/{id}/estado` | Cambiar estado |
| POST | `/pedidos/{id}/facturar` | Generar factura de venta |

### A9. Facturas de venta
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/facturas-venta` | Lista |
| GET | `/facturas-venta/{id}` | Detalle |
| GET | `/facturas-venta/siguiente-consecutivo` | Próximo número |
| GET | `/facturas-venta/{id}/pdf` | PDF |
| POST | `/facturas-venta` | Crear (transaccional: stock, consecutivo, IVA, kardex, CxC, auditoría) |
| POST | `/facturas-venta/calcular` | Simular totales sin guardar |
| PATCH | `/facturas-venta/{id}` | Editar campos no financieros |

### A10. Facturas de compra
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/facturas-compra` | Lista |
| GET | `/facturas-compra/{id}` | Detalle |
| GET | `/facturas-compra/{id}/adjuntos` | Adjuntos |
| POST | `/facturas-compra` | Registrar (con IVA, ReteIVA, ReteICA) |
| POST | `/facturas-compra/importar-xml` | Precargar desde XML |
| POST | `/facturas-compra/{id}/adjuntos` | Subir PDF o XML |
| PATCH | `/facturas-compra/{id}` | Editar campos no financieros |

### A11. Cartera y cuentas por pagar (consulta)
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/cuentas-por-cobrar` | Lista de CxC |
| GET | `/cuentas-por-cobrar/{id}` | Detalle |
| GET | `/cartera/morosos` | Clientes en mora |
| GET | `/cartera/vencida` | Cartera por edades |
| GET | `/cartera/resumen` | Totales |
| GET | `/cuentas-por-pagar` | Lista de CxP |
| GET | `/cuentas-por-pagar/{id}` | Detalle |
| GET | `/cuentas-por-pagar/proximas-vencer?dias=7` | Próximas a vencer |
| GET | `/cuentas-por-pagar/vencidas` | Vencidas |

### A12. Pagos
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/pagos` | Lista |
| GET | `/pagos/{id}` | Detalle |
| GET | `/pagos/{id}/recibo` | Recibo en PDF |
| POST | `/pagos` | Registrar pago o abono (acepta `Idempotency-Key`) |

### A13. Gastos (solo los propios)
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/gastos` | Lista |
| GET | `/gastos/{id}` | Detalle |
| POST | `/gastos` | Registrar |
| PATCH | `/gastos/{id}` | Editar (periodo abierto) |
| POST | `/gastos/{id}/soporte` | Subir soporte |

### A14. Reportes operativos
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/dashboard/resumen` | KPIs del día |
| GET | `/dashboard/config` | Configuración del dashboard |
| GET | `/reportes/ventas` | Ventas (sin márgenes) |
| GET | `/reportes/inventario` | Existencias y rotación |
| GET | `/reportes/cartera` | Cartera por edades |
| GET | `/reportes/jobs/{jobId}` | Estado de un reporte y descarga |
| PUT | `/dashboard/config` | Guardar configuración |
| POST | `/reportes/exportar` | Exportar a Excel o PDF |

### A15. Salud del servicio
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/health` | Liveness (público) |
| GET | `/version` | Versión desplegada |

---

## Parte B — Rol Administrador (además de toda la Parte A)

### B1. Usuarios
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/usuarios` | Lista |
| GET | `/usuarios/{id}` | Detalle con permisos |
| GET | `/usuarios/{id}/sesiones` | Sesiones activas |
| GET | `/usuarios/{id}/actividad` | Actividad reciente |
| POST | `/usuarios` | Crear |
| PATCH | `/usuarios/{id}` | Actualizar o cambiar rol |
| POST | `/usuarios/{id}/activar` | Activar |
| POST | `/usuarios/{id}/desactivar` | Desactivar |
| POST | `/usuarios/{id}/reset-password` | Forzar cambio de contraseña |
| POST | `/usuarios/{id}/cerrar-sesiones` | Revocar sesiones |

### B2. Roles y permisos
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/roles` | Lista |
| GET | `/roles/{id}` | Detalle |
| GET | `/roles/{id}/permisos` | Permisos del rol |
| GET | `/roles/{id}/usuarios` | Usuarios del rol |
| GET | `/permisos` | Catálogo de permisos |
| POST | `/roles` | Crear |
| PATCH | `/roles/{id}` | Actualizar |
| PUT | `/roles/{id}/permisos` | Reemplazar permisos |
| DELETE | `/roles/{id}` | Eliminar |

### B3. Anulaciones y reversas
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/facturas-venta/{id}/anular` | Anular venta |
| POST | `/facturas-compra/{id}/anular` | Anular compra |
| POST | `/pagos/{id}/anular` | Anular pago |
| POST | `/gastos/{id}/anular` | Anular gasto |
| POST | `/pedidos/{id}/anular` | Anular pedido |
| POST | `/inventario/movimientos/{id}/reversar` | Reversar movimiento |

### B4. Inventario: ajustes y control
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/inventario/valorizado` | Inventario a costo |
| GET | `/inventario/conteos/{id}` | Detalle de conteo |
| POST | `/inventario/ajustes` | Ajuste por conteo físico |
| POST | `/inventario/conteos` | Abrir conteo |
| POST | `/inventario/conteos/{id}/cerrar` | Cerrar conteo |
| PATCH | `/productos/{id}/stock-minimo` | Definir stock mínimo |
| POST | `/bodegas` | Crear bodega |
| PATCH | `/bodegas/{id}` | Actualizar bodega |
| DELETE | `/bodegas/{id}` | Eliminar bodega |

### B5. Precios y catálogos maestros
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/productos/{id}/historial-precios` | Historial de precios |
| GET | `/productos/{id}/margen` | Margen del producto |
| PATCH | `/productos/{id}/precio` | Cambiar precio |
| POST | `/productos/precios/masivo` | Precios masivos |
| POST | `/clientes/importar` | Importar clientes |
| POST | `/productos/importar` | Importar productos |
| DELETE | `/productos/{id}` | Borrado lógico |
| DELETE | `/clientes/{id}` | Borrado lógico |
| DELETE | `/proveedores/{id}` | Borrado lógico |
| POST | `/marcas` | Crear marca |
| PATCH | `/marcas/{id}` | Actualizar marca |
| DELETE | `/marcas/{id}` | Eliminar marca |
| POST | `/categorias` | Crear categoría |
| PATCH | `/categorias/{id}` | Actualizar categoría |
| DELETE | `/categorias/{id}` | Eliminar categoría |
| POST | `/categorias-gasto` | Crear categoría de gasto |
| PATCH | `/categorias-gasto/{id}` | Actualizar categoría de gasto |
| POST | `/impuestos` | Crear impuesto |
| PATCH | `/impuestos/{id}` | Actualizar impuesto |

### B6. Facturación y consecutivos
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/resoluciones` | Resoluciones DIAN |
| GET | `/resoluciones/activa` | Resolución vigente |
| GET | `/consecutivos` | Estado de consecutivos |
| POST | `/resoluciones` | Registrar resolución |
| PATCH | `/resoluciones/{id}` | Actualizar |
| PATCH | `/consecutivos/{tipo}` | Ajustar consecutivo |

### B7. Cartera: gestión activa
| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/cartera/recordatorios` | Enviar recordatorios de pago |
| PATCH | `/clientes/{id}/cupo-credito` | Cupo y plazo de crédito |
| POST | `/clientes/{id}/bloquear-credito` | Bloquear crédito |
| POST | `/clientes/{id}/desbloquear-credito` | Desbloquear crédito |
| POST | `/cuentas-por-cobrar/{id}/castigar` | Castigar cartera incobrable |

### B8. Reportes financieros
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/dashboard/financiero` | KPIs financieros |
| GET | `/reportes/utilidad` | Utilidad |
| GET | `/reportes/rentabilidad` | Rentabilidad |
| GET | `/reportes/flujo-caja` | Flujo de caja |
| GET | `/reportes/gastos` | Gastos de todos los usuarios |
| GET | `/reportes/compras` | Compras con costos |
| GET | `/reportes/inventario-valorizado` | Inventario valorizado |
| GET | `/reportes/ventas-por-vendedor` | Ventas por vendedor |
| GET | `/reportes/estado-resultados` | Estado de resultados |
| GET | `/periodos-contables` | Periodos contables |
| POST | `/reportes/cierre-mensual` | Cierre del mes |
| POST | `/periodos-contables/{id}/cerrar` | Cerrar periodo |
| POST | `/periodos-contables/{id}/reabrir` | Reabrir periodo |

### B9. Empleados y nómina *(fase posterior)*
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/empleados` | Lista |
| GET | `/empleados/{id}` | Detalle |
| GET | `/nomina` | Periodos de nómina |
| GET | `/nomina/{id}` | Detalle del periodo |
| GET | `/nomina/{id}/desprendibles` | Desprendibles en PDF |
| POST | `/empleados` | Crear |
| PATCH | `/empleados/{id}` | Actualizar |
| POST | `/nomina` | Abrir periodo |
| POST | `/nomina/{id}/calcular` | Calcular |
| POST | `/nomina/{id}/pagar` | Pagar (genera el gasto) |

### B10. Integración con Siigo *(fase posterior, parcialmente reconstruido)*
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/integraciones/siigo/estado` | Estado de conexión |
| GET | `/integraciones/siigo/sincronizaciones` | Historial de sincronizaciones |
| PUT | `/integraciones/siigo/credenciales` | Guardar credenciales (Secret Manager) |
| POST | `/integraciones/siigo/sincronizar` | Lanzar sincronización |

### B11. Auditoría y configuración *(reconstruido)*
| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/auditoria` | Consulta de auditoría (solo lectura) |
| GET | `/configuracion` | Configuración del sistema |
| PUT | `/configuracion` | Actualizar configuración |
