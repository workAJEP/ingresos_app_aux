@echo off
REM ============================================================
REM  poll-agent.bat  -  Arranca el poller de impresion (Camino A)
REM  Editar los valores de abajo y hacer doble-clic para probar.
REM  Para arranque automatico: Programador de tareas -> Al iniciar
REM  sesion -> Accion: iniciar este .bat.
REM ============================================================

REM URL de tu app en Vercel (sin barra final).
set API_URL=https://TU-APP.vercel.app

REM MISMO valor que PRINT_PULL_TOKEN en Vercel.
set PULL_TOKEN=bece1710e5564d881cb9fdaa467b8a9591f56d61a39c8c13819341bbf77f65b4

REM Carpeta donde se dejan los CSV.
set OUT_DIR=C:\BarTenderIn

REM Etiqueta de BarTender. Si se deja vacio, el poller SOLO deja el CSV
REM (usar entonces BarTender Integration Builder con disparador de Carpeta).
set BTW_PATH=C:\labels\marchamo.btw

REM Ruta a bartend.exe (ajustar a tu version). Requiere edicion Automation/Enterprise.
set BARTEND_EXE=C:\Program Files\Seagull\BarTender Suite\bartend.exe

REM Nombre de la impresora en Windows.
set PRINTER=TTP-345

REM Segundos entre sondeos.
set INTERVAL=3

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0poll-agent.ps1"
pause
