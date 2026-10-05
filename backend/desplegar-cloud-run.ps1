<#
.SYNOPSIS
  Publica el backend del CRM Contable en Cloud Run, conectado a Cloud SQL.

.DESCRIPTION
  Construye la imagen en Cloud Build (no necesita Docker local) y despliega:
    - Conexión a Cloud SQL por socket (/cloudsql/...), sin IP pública.
    - DB_PASSWORD y JWT_SECRET en Secret Manager (se toman de backend/.env la primera vez).
    - Adjuntos, PDF y exportaciones en un bucket de Cloud Storage.
    - CPU siempre asignada para que el worker de tareas asíncronas funcione.
  Al terminar escribe la URL en bruno/environments/Cloud Run.bru.

  Requisitos: Google Cloud SDK instalado y sesión iniciada (gcloud auth login).

.EXAMPLE
  .\desplegar-cloud-run.ps1 -ProjectId mi-proyecto-123
.EXAMPLE
  .\desplegar-cloud-run.ps1 -ProjectId mi-proyecto-123 -Region us-east1 -FrontendUrl https://crm.miempresa.com -InstanciasMinimas 1
#>
param(
  [Parameter(Mandatory = $true)][string]$ProjectId,
  [string]$Region = 'us-east1',
  [string]$Servicio = 'crm-contable-api',
  [string]$InstanciaSql = 'crm-contable-db',
  [string]$Bucket = '',
  [string]$FrontendUrl = 'http://localhost:3001',
  [int]$InstanciasMinimas = 0,
  [switch]$ActualizarSecretos
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not $Bucket) { $Bucket = "$ProjectId-crm-adjuntos" }

function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Gcloud { & gcloud @args; if ($LASTEXITCODE -ne 0) { throw "Falló: gcloud $args" } }
# true si el comando gcloud termina bien; sus errores no detienen el script
function Existe {
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & gcloud @args 2>&1 | Out-Null; return ($LASTEXITCODE -eq 0) } finally { $ErrorActionPreference = $anterior }
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw 'No se encontró gcloud. Instale Google Cloud SDK: https://cloud.google.com/sdk/docs/install y ejecute "gcloud auth login".'
}

# ─── Valores del .env local (solo usuario, base y secretos) ──────────────────
$envVars = @{}
Get-Content (Join-Path $PSScriptRoot '.env') | Where-Object { $_ -match '^\s*([A-Z_]+)\s*=\s*(.*)$' } | ForEach-Object {
  $envVars[$Matches[1]] = $Matches[2].Trim()
}
foreach ($clave in 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET') {
  if (-not $envVars[$clave]) { throw "Falta $clave en backend/.env" }
}

Paso "Proyecto $ProjectId y APIs necesarias"
Gcloud config set project $ProjectId | Out-Null
Gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
  sqladmin.googleapis.com secretmanager.googleapis.com storage.googleapis.com

$conexionSql = (& gcloud sql instances describe $InstanciaSql --format='value(connectionName)')
if (-not $conexionSql) { throw "No se encontró la instancia Cloud SQL '$InstanciaSql' en el proyecto $ProjectId" }
Write-Host "Cloud SQL: $conexionSql"

$numeroProyecto = (& gcloud projects describe $ProjectId --format='value(projectNumber)')
$cuentaServicio = "$numeroProyecto-compute@developer.gserviceaccount.com"

# ─── Secret Manager ──────────────────────────────────────────────────────────
function Guardar-Secreto($nombre, $valor) {
  $temporal = New-TemporaryFile
  try {
    # Sin salto de línea final: el secreto debe ser exactamente el valor
    [IO.File]::WriteAllText($temporal.FullName, $valor)
    if (-not (Existe secrets describe $nombre)) {
      Gcloud secrets create $nombre --replication-policy=automatic --data-file=$($temporal.FullName)
    } elseif ($ActualizarSecretos) {
      Gcloud secrets versions add $nombre --data-file=$($temporal.FullName)
    } else {
      Write-Host "Secreto $nombre ya existe (use -ActualizarSecretos para reemplazarlo)"
    }
  } finally { Remove-Item $temporal -Force }
  Gcloud secrets add-iam-policy-binding $nombre --member="serviceAccount:$cuentaServicio" `
    --role=roles/secretmanager.secretAccessor --quiet | Out-Null
}

Paso 'Secretos (DB_PASSWORD, JWT_SECRET y SMTP_PASSWORD si existe)'
Guardar-Secreto 'crm-db-password' $envVars['DB_PASSWORD']
Guardar-Secreto 'crm-jwt-secret' $envVars['JWT_SECRET']
$secretos = 'DB_PASSWORD=crm-db-password:latest,JWT_SECRET=crm-jwt-secret:latest'
if ($envVars['SMTP_PASSWORD']) {
  Guardar-Secreto 'crm-smtp-password' $envVars['SMTP_PASSWORD']
  $secretos += ',SMTP_PASSWORD=crm-smtp-password:latest'
}

# ─── Cloud Storage ───────────────────────────────────────────────────────────
Paso "Bucket gs://$Bucket"
if (-not (Existe storage buckets describe "gs://$Bucket")) {
  Gcloud storage buckets create "gs://$Bucket" --location=$Region --uniform-bucket-level-access --public-access-prevention
}
Gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member="serviceAccount:$cuentaServicio" `
  --role=roles/storage.objectAdmin | Out-Null

# Conexión a Cloud SQL y respaldos bajo demanda (POST /admin/backups)
foreach ($rol in 'roles/cloudsql.client', 'roles/cloudsql.editor') {
  Gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$cuentaServicio" --role=$rol --condition=None --quiet | Out-Null
}

# ─── Despliegue ──────────────────────────────────────────────────────────────
Paso "Construyendo y desplegando $Servicio en $Region (tarda unos minutos)"
# ^@^ cambia el separador de variables para permitir comas en FRONTEND_URL
$variables = '^@^' + (@(
    'NODE_ENV=production',
    "DB_HOST=/cloudsql/$conexionSql",
    'DB_PORT=5432',
    "DB_USER=$($envVars['DB_USER'])",
    "DB_NAME=$($envVars['DB_NAME'])",
    'DB_SSL=false',
    'JWT_EXPIRATION=15m',
    'REFRESH_TOKEN_EXPIRATION_DAYS=7',
    "FRONTEND_URL=$FrontendUrl",
    'APP_TIMEZONE=America/Bogota',
    'TRUST_PROXY_HOPS=1',
    'STORAGE_DRIVER=gcs',
    "GCP_STORAGE_BUCKET_NAME=$Bucket",
    "GCP_PROJECT_ID=$ProjectId",
    "CLOUD_SQL_INSTANCE=$InstanciaSql",
    'JOBS_WORKER=true'
  ) -join '@')

Gcloud run deploy $Servicio `
  --source . `
  --region $Region `
  --allow-unauthenticated `
  --add-cloudsql-instances $conexionSql `
  --set-env-vars $variables `
  --set-secrets $secretos `
  --no-cpu-throttling `
  --min-instances $InstanciasMinimas `
  --memory 1Gi `
  --timeout 300

$url = (& gcloud run services describe $Servicio --region $Region --format='value(status.url)')

# ─── Entorno de Bruno ────────────────────────────────────────────────────────
$entornoBruno = Join-Path $PSScriptRoot '..\bruno\environments\Cloud Run.bru'
if (Test-Path $entornoBruno) {
  $contenido = (Get-Content $entornoBruno -Raw) -replace 'baseUrl: .*', "baseUrl: $url/api/v1"
  # UTF-8 sin BOM (Set-Content -Encoding utf8 de PowerShell 5.1 agrega BOM)
  [IO.File]::WriteAllText((Resolve-Path $entornoBruno), $contenido, (New-Object System.Text.UTF8Encoding $false))
}

Paso 'Listo'
Write-Host "API:     $url/api/v1"
Write-Host "Salud:   $url/api/v1/health/ready"
Write-Host "Swagger: $url/api/docs"
Write-Host "Bruno:   entorno 'Cloud Run' actualizado con la URL"
