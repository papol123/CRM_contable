@echo off
title Lanzador CRM Contable
rem Por defecto conecta a Cloud SQL. Para la base local embebida: iniciar.bat -Local
powershell -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
echo.
pause
