# Facturación electrónica DIAN (módulo opcional)

El CRM **no depende de la DIAN**: por defecto (`FACTURACION_ELECTRONICA=false`) las
facturas de venta funcionan igual que siempre y quedan con `estadoDian = NO_APLICA`.
Este módulo deja lista la base para emitir factura electrónica cuando la empresa
esté habilitada, sin rehacer el sistema.

## Qué hay implementado

| Pieza | Estado |
|---|---|
| Datos de la empresa emisora (`GET/PUT /empresa`) | ✅ |
| Responsabilidades fiscales del cliente (`responsabilidadesFiscales` en `/clientes`) | ✅ |
| Clave técnica de la resolución (`claveTecnica` en `/resoluciones`) | ✅ |
| Dígito de verificación del NIT y códigos DIAN de tipo de documento | ✅ |
| Cálculo del **CUFE** (SHA-384 según anexo técnico) | ✅ |
| XML **UBL 2.1 sin firma** (`GET /facturas-venta/{id}/xml-ubl`) | ✅ vista previa |
| Estado electrónico por factura (`NO_APLICA`, `PENDIENTE`, `ENVIADA`, `ACEPTADA`, `RECHAZADA`) | ✅ |
| Bloqueo de anulación de facturas ya reportadas (van con nota crédito) | ✅ |
| Diagnóstico de requisitos (`GET /facturacion-electronica/estado`) | ✅ |
| Envío (`POST /facturas-venta/{id}/enviar-dian`) | ⏳ interfaz lista, sin proveedor |
| Firma XAdES, QR, representación gráfica (PDF), envío al cliente | ❌ los hace el proveedor elegido |
| Notas crédito / débito electrónicas | ❌ pendiente |

## Trámites que debe hacer la empresa (fuera del software)

1. **RUT actualizado** con la responsabilidad **52 – Facturador electrónico**.
2. **Registro como facturador** en el portal de Facturación Electrónica de la DIAN
   (con firma electrónica del representante legal).
3. **Elegir cómo emitir** y registrarlo en el portal:
   - **Proveedor tecnológico** (recomendado para una pyme): el proveedor firma,
     envía a la DIAN, genera el PDF con QR y lo manda al cliente. Se integra por API.
   - **Software propio**: requiere certificado digital de una entidad
     certificadora autorizada, registrar Software ID y PIN, y superar el set de
     pruebas de habilitación (TestSetId).
4. **Solicitar la resolución de numeración** de facturación electrónica
   (prefijo y rango). La DIAN entrega la **clave técnica**, que se registra en
   `/resoluciones` como `claveTecnica`.

## Cómo activarlo cuando llegue el momento

1. Registrar los datos reales de la empresa: `PUT /empresa`.
2. Registrar la resolución electrónica con su `claveTecnica`: `POST /resoluciones`.
3. Implementar el proveedor elegido en
   `src/modules/facturacion-electronica/proveedores/` (interfaz `ProveedorFacturacion`)
   y registrarlo en `facturacion-electronica.module.ts`.
4. En el `.env`:
   ```
   FACTURACION_ELECTRONICA=true
   FACTURACION_PROVEEDOR=<nombre del proveedor>
   DIAN_AMBIENTE=2   # 1 cuando pase a producción
   ```
5. Revisar `GET /facturacion-electronica/estado`: `listaParaEmitir` debe ser `true`.

## Limitaciones conocidas del XML generado

- No incluye la firma XAdES-EPES, el `SoftwareSecurityCode` ni el QR: dependen
  del certificado y del software registrado.
- Todas las líneas usan unidad `94` (unidad) y solo se reporta IVA (01) y
  retención en la fuente (06). Otros impuestos (INC, ICA) se reportan en cero.
- La hora de emisión se toma del momento de creación de la factura, en hora de Colombia.
