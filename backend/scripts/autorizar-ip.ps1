<#
.SYNOPSIS
  Autoriza la IP pública de este equipo en Cloud SQL (conservando las ya autorizadas).
  Necesario solo para conectarse directo a la base (migraciones, npm run usuarios).
  La aplicación publicada en Cloud Run no lo necesita.

.EXAMPLE
  .\scripts\autorizar-ip.ps1
#>
param(
  [string]$ProjectId = 'crm-cloud-506523',
  [string]$Instancia = 'crm-contable-db'
)
$ErrorActionPreference = 'Stop'

$GcloudExe = (Get-Command gcloud -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $GcloudExe) { throw 'No se encontró gcloud. Instálelo con: winget install -e --id Google.CloudSDK' }

$ip = (Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 10).Trim()
Write-Host "IP pública de este equipo: $ip"

$actuales = @(& $GcloudExe sql instances describe $Instancia --project $ProjectId `
    --format='value(settings.ipConfiguration.authorizedNetworks[].value)') -split '[;,\s]+' | Where-Object { $_ }
if ($LASTEXITCODE -ne 0) { throw "No se pudo leer la instancia $Instancia" }
Write-Host "Redes autorizadas hoy: $(if ($actuales) { $actuales -join ', ' } else { '(ninguna)' })"

if ($actuales -contains "$ip/32") {
  Write-Host "La IP ya estaba autorizada." -ForegroundColor Green
  return
}

# --authorized-networks REEMPLAZA la lista: se envían las actuales más la nueva
$nueva = (@($actuales) + "$ip/32") -join ','
Write-Host "Autorizando $ip/32 (tarda 1-2 minutos)..."
& $GcloudExe sql instances patch $Instancia --project $ProjectId --authorized-networks=$nueva --quiet
if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar la lista de redes autorizadas' }
Write-Host "Listo: $ip/32 autorizada." -ForegroundColor Green
