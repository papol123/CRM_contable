# Script de inicio para CRM Contable (Apex Ledger)
#   npm start            -> backend conectado a Cloud SQL (backend/.env)
#   npm run start:local  -> base PostgreSQL embebida en 127.0.0.1:54329 (backend/.env.local)
param(
  [switch]$Local
)
$ErrorActionPreference = "Stop"

$baseDir = $PSScriptRoot
$modo = if ($Local) { 'BASE LOCAL (127.0.0.1:54329)' } else { 'CLOUD SQL (nube)' }

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Iniciando CRM Contable (Apex Ledger) - $modo" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

if ($Local) {
  # 1. Base de Datos Embebida (PostgreSQL 17 en 127.0.0.1:54329)
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$baseDir/backend'; Write-Host '=== Base de Datos Local (PostgreSQL en puerto 54329) ===' -ForegroundColor Green; npm run db:local"
  Write-Host "Iniciando PostgreSQL local... esperando 3 segundos." -ForegroundColor Gray
  Start-Sleep -Seconds 3
  $comandoBackend = 'npm run start:local'
} else {
  # 1. Verificar que Cloud SQL responda desde esta red (IP autorizada)
  $envFile = Join-Path $baseDir 'backend/.env'
  $dbHost = ((Get-Content $envFile | Where-Object { $_ -match '^DB_HOST=' }) -replace '^DB_HOST=', '').Trim()
  $dbPort = ((Get-Content $envFile | Where-Object { $_ -match '^DB_PORT=' }) -replace '^DB_PORT=', '').Trim()
  if (-not $dbPort) { $dbPort = 5432 }
  Write-Host "Verificando conexión a Cloud SQL ($dbHost`:$dbPort)..." -ForegroundColor Gray
  $tcp = New-Object System.Net.Sockets.TcpClient
  $intento = $tcp.BeginConnect($dbHost, [int]$dbPort, $null, $null)
  $conecta = $intento.AsyncWaitHandle.WaitOne(5000) -and $tcp.Connected
  $tcp.Close()
  if ($conecta) {
    Write-Host "Cloud SQL responde." -ForegroundColor Green
  } else {
    $ip = try { Invoke-RestMethod -Uri 'https://api.ipify.org' -TimeoutSec 5 } catch { 'desconocida' }
    Write-Host "`nATENCIÓN: Cloud SQL no responde desde esta red (IP pública: $ip)." -ForegroundColor Red
    Write-Host "Autorícela en Google Cloud Console -> SQL -> crm-contable-db -> Conexiones -> Redes" -ForegroundColor Yellow
    Write-Host "-> 'Agregar una red' con $ip/32 -> Guardar. Ver TROUBLESHOOTING.md §1.1`n" -ForegroundColor Yellow
  }
  $comandoBackend = 'npm run start:dev'
}

# 2. Backend NestJS en http://localhost:3000
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$baseDir/backend'; Write-Host '=== Backend NestJS (http://localhost:3000) - $modo ===' -ForegroundColor Yellow; $comandoBackend"

Write-Host "Iniciando Backend NestJS..." -ForegroundColor Gray
Start-Sleep -Seconds 2

# 3. Frontend Next.js en http://localhost:3001
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$baseDir/frontend'; Write-Host '=== Frontend Next.js (http://localhost:3001) ===' -ForegroundColor Cyan; npm run dev"

Write-Host "`nServicios lanzados exitosamente en ventanas independientes:" -ForegroundColor Green
Write-Host " - Frontend Next.js:        http://localhost:3001" -ForegroundColor White
Write-Host " - Backend API:             http://localhost:3000/api/v1" -ForegroundColor White
Write-Host " - Documentación Swagger:   http://localhost:3000/api/docs" -ForegroundColor White
Write-Host " - Base de datos:           $modo" -ForegroundColor White
Write-Host "`nUsuarios de prueba (contraseña: Admin123*):" -ForegroundColor Magenta
Write-Host " - admin@crmcontable.com    (Rol: ADMIN)" -ForegroundColor Gray
Write-Host " - usuario@crmcontable.com  (Rol: USUARIO)" -ForegroundColor Gray
