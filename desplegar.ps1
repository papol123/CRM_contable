# Publica todo el CRM Contable en Google Cloud (Cloud Run): primero el backend
# (API + migraciones de Cloud SQL) y luego el frontend (la aplicación web).
# Después de esto la aplicación queda siempre en línea en la dirección que se muestra al final.
#
#   npm run desplegar                 (desde la raíz)
#   .\desplegar.ps1 -SoloFrontend     (cuando solo cambió la parte visual)
param(
  [string]$ProjectId = 'crm-cloud-506523',
  [string]$Region = 'us-east1',
  [switch]$SoloFrontend,
  [switch]$SoloBackend
)
$ErrorActionPreference = 'Stop'

if (-not $SoloFrontend) {
  & (Join-Path $PSScriptRoot 'backend\desplegar-cloud-run.ps1') -ProjectId $ProjectId -Region $Region
}
if (-not $SoloBackend) {
  & (Join-Path $PSScriptRoot 'frontend\desplegar-cloud-run.ps1') -ProjectId $ProjectId -Region $Region
}
