<#
.SYNOPSIS
  Publica el frontend (Next.js) del CRM Contable en Cloud Run.

.DESCRIPTION
  El navegador solo habla con el frontend: las llamadas a /api/v1 las reenvía
  Next.js al backend de Cloud Run (rewrites de next.config.mjs). Así la sesión
  (cookie del refresh token) es del mismo sitio y no hay problemas de CORS.

  Requisitos: Google Cloud SDK instalado, sesión iniciada (gcloud auth login)
  y el backend ya desplegado (backend\desplegar-cloud-run.ps1).

.EXAMPLE
  .\desplegar-cloud-run.ps1
.EXAMPLE
  .\desplegar-cloud-run.ps1 -ProjectId crm-cloud-506523 -InstanciasMinimas 1
#>
param(
  [string]$ProjectId = 'crm-cloud-506523',
  [string]$Region = 'us-east1',
  [string]$Servicio = 'crm-contable-web',
  [string]$ServicioApi = 'crm-contable-api',
  [int]$InstanciasMinimas = 0
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Ruta del ejecutable real (una función llamada "Gcloud" se llamaría a sí misma)
$GcloudExe = (Get-Command gcloud -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $GcloudExe) {
  throw 'No se encontró gcloud. Instale Google Cloud SDK: https://cloud.google.com/sdk/docs/install y ejecute "gcloud auth login".'
}
function Invoke-Gcloud { & $GcloudExe @args; if ($LASTEXITCODE -ne 0) { throw "Falló: gcloud $args" } }
function Paso($texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
# Consulta que puede fallar sin detener el script (en PowerShell 5.1, 2>$null con Stop lanza error)
function Consultar-Gcloud {
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { (& $GcloudExe @args 2>$null) } finally { $ErrorActionPreference = $anterior }
}

Paso "Proyecto $ProjectId"
Invoke-Gcloud config set project $ProjectId | Out-Null

$urlApi = Consultar-Gcloud run services describe $ServicioApi --region $Region --format='value(status.url)'
if (-not $urlApi) {
  throw "No se encontró el backend '$ServicioApi' en Cloud Run. Despliéguelo primero con backend\desplegar-cloud-run.ps1"
}
Write-Host "Backend: $urlApi"

# Next.js lee .env.production al compilar (en Cloud Build). Se borra al terminar.
$envProduccion = Join-Path $PSScriptRoot '.env.production'
$contenido = "NEXT_PUBLIC_API_URL=/api/v1`nBACKEND_API_URL=$urlApi/api/v1`n"
[IO.File]::WriteAllText($envProduccion, $contenido, (New-Object System.Text.UTF8Encoding $false))

try {
  Paso "Construyendo y desplegando $Servicio en $Region (tarda unos minutos)"
  Invoke-Gcloud run deploy $Servicio `
    --source . `
    --region $Region `
    --allow-unauthenticated `
    --min-instances $InstanciasMinimas `
    --memory 512Mi `
    --timeout 300
} finally {
  Remove-Item $envProduccion -Force -ErrorAction SilentlyContinue
}

$urlWeb = (& $GcloudExe run services describe $Servicio --region $Region --format='value(status.url)')

# El backend debe conocer la dirección pública del frontend (CORS y enlaces de correos)
Paso "Registrando la dirección del frontend en el backend"
# Separador ";" (no ","): así no hace falta el delimitador ^@^ de gcloud, que cmd.exe altera en Windows
Invoke-Gcloud run services update $ServicioApi --region $Region `
  --update-env-vars "FRONTEND_URL=$urlWeb;http://localhost:3001" | Out-Null

Paso 'Listo'
Write-Host "Aplicación: $urlWeb" -ForegroundColor Green
Write-Host "API:        $urlApi/api/v1"
Write-Host "`nAbra $urlWeb en el navegador: ya no necesita correr nada en su equipo."
