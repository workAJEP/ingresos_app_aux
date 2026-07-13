@echo off
REM ============================================================
REM  poll-agent.bat  -  Arranca el poller de impresion (Camino A)
REM  Editar los valores de abajo y hacer doble-clic para probar.
REM  Para arranque automatico: Programador de tareas -> Al iniciar
REM  sesion -> Accion: iniciar este .bat.
REM ============================================================

REM URL de tu app en Vercel (sin barra final).
set API_URL=https://ingresos-app-aux.vercel.app

REM MISMO valor que PRINT_PULL_TOKEN en Vercel.
set PULL_TOKEN=bece1710e5564d881cb9fdaa467b8a9591f56d61a39c8c13819341bbf77f65b4

REM Carpeta donde se dejan los CSV.
set OUT_DIR=C:\BarTenderIn

REM Etiqueta de BarTender. Si se deja vacio, el poller SOLO deja el CSV
REM (usar entonces BarTender Integration Builder con disparador de Carpeta).
set BTW_PATH=d:\Users\usuario\Desktop\TEST\ingreso.btw

REM Ruta a bartend.exe: el .EXE REAL, SIN comillas (los espacios de
REM "Program Files (x86)" no molestan) y NUNCA un acceso directo .lnk.
REM Verifica la ruta con:
REM   dir "C:\Program Files*\Seagull" /s /b | findstr /i bartend.exe
set BARTEND_EXE=C:\Program Files (x86)\Seagull\BarTender Suite\bartend.exe

REM Nombre de la impresora en Windows.
set PRINTER=TSC TTP-247 JORGE

REM Segundos entre sondeos.
set INTERVAL=3

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0poll-agent.ps1"
pause
