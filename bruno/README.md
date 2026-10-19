# Colección Bruno — CRM Contable

162 peticiones con pruebas automáticas, agrupadas por módulo. Abra esta carpeta en Bruno (**Open Collection**).

## Entornos

| Entorno | `baseUrl` | Cuándo usarlo |
|---            |---|---|
| **Cloud SQL - backend local** | `http://localhost:3000/api/v1` | Backend corriendo en su PC (`npm run start:dev`) con el `.env` apuntando a Cloud SQL |
| **Cloud Run** | `https://crm-contable-api-916812392845.us-east1.run.app/api/v1` | Backend publicado en Cloud Run (proyecto `crm-cloud-506523`) |

> La colección siempre corresponde al código del repositorio. Después de cambiar el backend, publíquelo con `backend/desplegar-cloud-run.ps1 -ProjectId crm-cloud-506523`: al arrancar, el contenedor aplica las migraciones pendientes en Cloud SQL, así que código, permisos y colección quedan alineados.

## Cómo correrla

- **Login automático:** `collection.bru` tiene un script que corre antes de cada petición. Inicia sesión solo cuando un token falta o está por vencer (duran 15 min) y carga los IDs base (cliente, producto con stock, bodegas, proveedor) si faltan. Puede correr cualquier carpeta o petición suelta sin haber corrido antes 01 y 02.
- Corra cada carpeta completa (clic derecho → **Run**): dentro de una carpeta las peticiones van en orden y algunas usan variables de la anterior (por ejemplo, crear y luego anular la misma remisión).
- **99 Limite de peticiones** va al final: bloquea el login desde su IP durante un minuto.
- Si un script no se ejecuta, en la configuración de la colección cambie **Safe Mode** por **Developer Mode**.

También desde la terminal:

```bash
npx @usebruno/cli run --env "Cloud SQL - backend local" -r
```

## Tenga en cuenta (base real)

- Las pruebas **crean datos reales**: remisiones, compras, pagos, gastos, empleados y nóminas de meses futuros, cotizaciones, pedidos y un usuario invitado. Las que cambian estado lo devuelven: anulan lo que crean, desbloquean el crédito, reabren el periodo cerrado y reactivan al administrador.
- **Subir logo** reemplaza el logo de la empresa con una imagen de 1×1 px; vuelva a subir el logo real después.
- **Ejecutar respaldo** crea un respaldo real de Cloud SQL si `CLOUD_SQL_INSTANCE` está configurado.
- **MANUAL - Restablecer con el token del correo**: pegue en la variable `tokenRecuperacion` del entorno el token del enlace que llega a `caja@crmcontable.com` (con `CORREO_MODO=log` aparece en la consola del backend). Cambia la contraseña de ese usuario.
- La lectura de XML usa `archivos/factura-proveedor.xml`, con el NIT del proveedor *Correas y Rodamientos Andinos Ltda* y el producto `REP-ACC-001` de la base actual.
- La nómina espera `NOMINA_SMMLV=1423500` y auxilio de 200000. Si los actualiza a los valores vigentes, ajuste los valores esperados de esas dos pruebas.

## Cuándo regenerar la colección

Los archivos `.bru` se generan con `backend/scripts/bruno/generar_coleccion.py`
(no los edite a mano: se sobrescriben).

- **No hace falta** regenerar si cambia la lógica interna del backend o la base
  de datos y las rutas, cuerpos y respuestas siguen iguales. Solo vuelva a correr la colección.
- **Sí hace falta** si cambia una ruta, un campo del cuerpo, un permiso o el
  código de respuesta esperado. Edite el generador y ejecute:

  ```bash
  cd CRM_contable
  python backend/scripts/bruno/generar_coleccion.py
  ```

Regenerar borra las variables guardadas en los entornos (tokens, ids). No pasa
nada: el script de la colección inicia sesión de nuevo y las pruebas vuelven a
crear sus datos. Después cierre y abra la colección en Bruno para ver los cambios.
