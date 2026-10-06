# TROUBLESHOOTING — CRM Contable

Histórico de errores encontrados y su solución (referenciado en `GEMINI.md` §1).
Antes de depurar un problema, busque aquí el síntoma. Al resolver uno nuevo,
agréguelo con el mismo formato: **Síntoma → Causa → Solución**.

Datos del entorno en la nube:

| Recurso | Valor |
|---|---|
| Proyecto GCP | `crm-cloud-506523` |
| Región | `us-east1` |
| Cloud SQL | `crm-contable-db` (`crm-cloud-506523:us-east1:crm-contable-db`, IP pública 34.23.121.79) |
| Usuario de BD | `crm_admin` |
| Secreto de la clave | Secret Manager `crm-db-password` |
| API (Cloud Run) | `https://crm-contable-api-916812392845.us-east1.run.app/api/v1` |

---

## 1. Conexión a Cloud SQL

### 1.1 `connect ETIMEDOUT 34.23.121.79:5432` al compilar o correr el backend en local
- **Causa:** la IP pública de su red cambió y Cloud SQL solo acepta las redes autorizadas.
- **Solución:** averigüe su IP (`curl ifconfig.me`) y agréguela. **`--authorized-networks` reemplaza la lista completa**: incluya las anteriores que sigan vigentes.
  ```bash
  gcloud sql instances patch crm-contable-db --project crm-cloud-506523 \
    --authorized-networks=IP1/32,IP2/32,SU_IP_NUEVA/32
  ```
  Consulte las actuales con
  `gcloud sql instances describe crm-contable-db --project crm-cloud-506523 --format="value(settings.ipConfiguration.authorizedNetworks[].value)"`.

### 1.2 `password authentication failed for user "crm_admin"`
- **Causa:** la clave del `.env` local, la de Cloud SQL y la del secreto `crm-db-password` (que usa Cloud Run) no coinciden.
- **Solución:** fije la misma clave en los tres lugares (Cloud Shell):
  ```bash
  CLAVE='LA_CLAVE_NUEVA'
  gcloud sql users set-password crm_admin --instance=crm-contable-db --project crm-cloud-506523 --password="$CLAVE"
  printf '%s' "$CLAVE" | gcloud secrets versions add crm-db-password --project crm-cloud-506523 --data-file=-
  gcloud run services update crm-contable-api --region us-east1 --project crm-cloud-506523 \
    --update-secrets DB_PASSWORD=crm-db-password:latest
  unset CLAVE
  ```
  Luego actualice `DB_PASSWORD` en `backend/.env` (nunca lo suba a git).
- **Cuidado:** use `printf '%s'` y no `echo` (agrega un salto de línea a la clave). Con `read -rsp "texto" VAR`, el primer argumento es el *mensaje* del prompt, no la clave: si escribe la clave ahí, la variable queda vacía.
- Si una clave se pegó en un chat, un ticket o un log, considérela expuesta y cámbiela.

### 1.3 Cloud Run no arranca (la revisión falla el health check)
- **Causa habitual:** el secreto `crm-db-password` tiene una clave errada (ver 1.2) o falta una variable.
- **Diagnóstico:**
  `gcloud run services logs read crm-contable-api --region us-east1 --project crm-cloud-506523 --limit 50`

### 1.4 La API responde 503 `dependencia-no-disponible`
- **Causa:** la base de datos no responde (instancia detenida, red no autorizada, conexiones agotadas). El filtro global convierte esos errores en 503 RFC 9457 en lugar de 500.

---

## 2. Base de datos local (embebida)

### 2.1 `initdb` falla o los textos con tildes se dañan (WIN1252)
- **Causa:** en Windows, `initdb` toma la codificación del sistema (WIN1252).
- **Solución:** `scripts/db-local.js` y `test/setup/global-setup.ts` inician con `--encoding=UTF8 --locale=C`. Si quedó una base creada con WIN1252, borre `backend/.local-pg` y ejecute de nuevo `npm run db:local`.

### 2.2 El puerto 54329/54330 está ocupado
- **Causa:** quedó un proceso `postgres` huérfano de una ejecución interrumpida.
- **Solución:** cierre los procesos `postgres.exe` desde el Administrador de tareas (o `taskkill /IM postgres.exe /F`) y vuelva a iniciar.

### 2.3 Las pruebas e2e nunca tocan Cloud SQL
- `test/utils/app.ts` aborta si `DB_HOST` no es local. Las e2e crean su propia base embebida en el puerto 54330 y la destruyen al terminar.

### 2.4 `npm ERR! enoent ... package.json`
- **Causa:** se ejecutó `npm` fuera de la carpeta `backend`.
- **Solución:** `cd CRM_contable/backend` antes de `npm run build`, `npm test`, etc.

---

## 3. Migraciones y semillas

### 3.1 Orden de ejecución
```bash
npm run db:migrate   # aplica database/migrations/*.sql pendientes (tabla schema_migraciones)
node scripts/seed-database.js   # catálogos, roles, permisos, usuarios base
node scripts/seed-demo.js       # datos de demostración (solo base vacía, o --reset)
```
Las migraciones son idempotentes. **Aplicar una migración a Cloud SQL requiere aprobación explícita** (es una acción difícil de revertir).

### 3.2 `seed-demo --reset` falla con `violates foreign key constraint "periodos_nomina_id_gasto_fkey"`
- **Causa:** el borrado no incluía las tablas de nómina y conteos agregadas después.
- **Solución (aplicada):** `SQL_BORRAR_DEMO` borra primero `detalle_nomina`, `periodos_nomina`, conteos y empleados que no son usuarios.

### 3.3 Crear cotización o pedido responde 409 `duplicado` (COT-xxxxx ya existe)
- **Causa:** `seq_cotizaciones` / `seq_pedidos` quedaron por debajo de los números guardados. `setval` **no es transaccional**: si un proceso hace `setval` y luego `ROLLBACK`, la secuencia queda movida.
- **Solución:** alinear la secuencia con el máximo guardado:
  ```sql
  SELECT setval('seq_cotizaciones', COALESCE((SELECT MAX(CAST(substring(numero FROM '([0-9]+)$') AS BIGINT)) FROM cotizaciones), 0) + 1, false),
         setval('seq_pedidos',      COALESCE((SELECT MAX(CAST(substring(numero FROM '([0-9]+)$') AS BIGINT)) FROM pedidos), 0) + 1, false);
  ```
  `seed-demo.js` ya sincroniza las secuencias después del `COMMIT`. Para remisiones y conteos (`consecutivos_config`) el servicio salta automáticamente números ya usados.

### 3.4 `inconsistent types deduced for parameter $2`
- **Causa:** el mismo parámetro se usa en contextos de tipos distintos (p. ej. `$2` comparado con varchar y asignado a text).
- **Solución:** casts explícitos en el SQL (`$2::varchar`, `$3::text`). Patrón obligatorio en filtros opcionales: `($n::uuid IS NULL OR col = $n::uuid)`.

---

## 4. Despliegue (Cloud Run)

### 4.1 404 HTML de Google: *"The requested URL /api/v1/auth/login was not found on this server"*
- **Causa:** la URL base del entorno de Bruno no era la del servicio (el generador la sobrescribía).
- **Solución:** `baseUrl` = `https://crm-contable-api-916812392845.us-east1.run.app/api/v1`.

### 4.2 Desplegar
Desde Cloud Shell, con el ZIP del backend descomprimido:
```bash
bash desplegar-cloud-run.sh crm-cloud-506523
```
En Cloud Shell no existe `powershell` ni rutas `C:\...`; use el `.sh`. En Windows local existe `desplegar-cloud-run.ps1`.

### 4.3 El commit no incluía los cambios
- **Causa:** solo se confirmaron archivos que ya estaban en *staging*.
- **Solución:** `git add -A`, `git status` (verifique que **no** aparezca `.env`), `git commit`, `git push`.

---

## 5. Pruebas manuales con Bruno

### 5.1 401 en todo después de iniciar sesión / "el token no dura nada"
- **Causa:** algunas versiones de Bruno no conservan `bru.setVar` entre carpetas.
- **Solución (aplicada):** la colección usa `bru.setEnvVar` y un script de colección que inicia sesión automáticamente si falta el token o está vencido.

### 5.2 Muchos errores al ejecutar "todas de una"
- **Causa:** el runner ejecutó solicitudes en paralelo; la colección depende del orden (crea un documento y luego lo usa).
- **Solución:** ejecutar en orden (Runner secuencial) o por CLI:
  ```bash
  cd CRM_contable/bruno
  npx @usebruno/cli run -r --env "Cloud Run" --sandbox=developer
  ```

### 5.3 Fechas "de mañana" en las pruebas después de las 7 p. m.
- **Causa:** `new Date().toISOString()` está en UTC; Colombia es UTC-5.
- **Solución (aplicada):** la colección calcula `hoy` restando 5 horas.

### 5.4 Fallas esperadas
- `MANUAL - Restablecer con el token del correo`: hay que pegar el token recibido por correo en la variable `tokenRecuperacion`.
- Envío de correo con Gmail `530 Authentication Required`: falta `SMTP_PASSWORD` (contraseña de aplicación de Google) en Secret Manager / variables de Cloud Run. La clave SMTP **nunca** se guarda en la base de datos.
- Logo de la empresa: en Cloud Run se guarda en Cloud Storage (`STORAGE_DRIVER=gcs`); un logo subido en local no existe en la nube.

### 5.5 Datos de prueba en la base de la nube
Las pruebas de Bruno contra Cloud Run crean documentos reales (remisiones, compras, gastos, nóminas). Se revierten por la API (anular con motivo, reabrir periodo, desbloquear cliente); nunca borrando filas a mano.

---

## 6. Cumplimiento de GEMINI.md

Estado verificado y decisiones de interpretación. Revise esta sección antes de cambiar el modelo de datos o la seguridad.

| Regla | Estado | Cómo se cumple |
|---|---|---|
| §2 tipos estrictos | ✅ | `tsconfig.json` con `"strict": true` (solo `strictPropertyInitialization` desactivado, requerido por las entidades TypeORM). |
| §3 NotebookLM | ⚠️ pendiente | El MCP `6a849736-7072-4338-b97e-4a6f771733ac` **no está conectado** en el entorno de desarrollo, por lo que no se ha consultado. Conéctelo (configuración MCP de Claude Code / Gemini) y revise Kardex, cierre contable y seguridad contra sus notas. |
| §4.1 PK UUID | ✅ | Migración `005`: todas las tablas tienen PK UUID `gen_random_uuid()`. Las claves naturales anteriores quedaron como `UNIQUE` (`empresa.fila`, `configuracion_sistema.clave`, `consecutivos_config.tipo`, `roles_permisos (id_rol, id_permiso)`, etc.). |
| §4.2 NUMERIC | ✅ | Montos `NUMERIC(15,2)`, cantidades `NUMERIC(12,3)`, porcentajes `NUMERIC(5,2)`. Las tarifas de retención aplicadas a cada compra se guardan en `facturas_compra.pct_retefuente`, `pct_reteiva`, `tarifa_reteica` (‰). |
| §4.3 TIMESTAMPTZ | ✅ | Todas las marcas de tiempo; `DATE` solo para fechas de calendario (emisión, vencimiento). |
| §4.4 transacciones | ✅ | Remisiones, compras, pagos, traslados, ajustes/conteos y cierres usan `dataSource.transaction`. |
| §4.5 SQL sin concatenar | ✅ | Ningún `${variable}` dentro de SQL en `src/`, `scripts/` ni `test/`. Filtros opcionales con `($n::tipo IS NULL OR col = $n)`; los fragmentos compartidos son constantes de módulo `SQL_*` sin valores; las semillas usan una sentencia fija por tabla (`jsonb_populate_recordset`). |
| §5.1 sin endpoints por rol | ✅ | Una ruta por recurso; la diferencia está en `@RequirePermission` y en el filtrado del servicio. |
| §5.2 Usuario: pagos propios | ✅ | Sin `pagos.consultar_todos` solo se listan/consultan los pagos registrados por el propio usuario. |
| §5.2 Admin: costos/márgenes | ✅ | `inventario.costos` para costos de proveedor y valorizado; `reportes.financieros` para utilidad, rentabilidad y reporte de compras. El Usuario sí ve el costo en las compras que él registra (operación "Compras"). |
| §5.3 403 sin permiso | ✅ | Prueba e2e recorre todas las rutas con token de Usuario. |
| §5.4 propiedad | ✅ | Recursos ajenos responden **404** (no revela su existencia): pagos, gastos, jobs. Hay una sola empresa por instalación. |
| §5.5 Idempotency-Key | ✅ | `POST /facturas-venta`, `POST /pagos`, `POST /facturas-compra` y `POST /pedidos/:id/facturar`. |
| §6 RFC 9457 | ✅ | `application/problem+json` con `type` y `title` específicos por tipo (`stock-insuficiente` → "Stock insuficiente", `periodo-cerrado`, `credito-bloqueado`, …). |
| Alcance | — | Sin facturación electrónica DIAN ni Siigo: las ventas son **remisiones** (`REM-000001`). Los módulos `facturacion-electronica` y `siigo` no están registrados en `AppModule`. |

### Verificación rápida
```bash
cd CRM_contable/backend
npx tsc --noEmit -p tsconfig.json   # tipos estrictos
npm test                            # unitarias
npm run test:e2e                    # e2e sobre PostgreSQL embebido (nunca Cloud SQL)
```
