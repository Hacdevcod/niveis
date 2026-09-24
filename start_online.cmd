@echo off
REM Sobe o WATCHDOG (proxy + tunel + URL publica) em segundo plano.
REM Ele abre uma janela minimizada "niveis-watchdog" - restaure-a para ver o
REM terminal ao vivo, ou rode monitor.cmd. Nao duplica se ja estiver ativo.
setlocal

set "DIR=%~dp0"
set "DIR=%DIR:~0,-1%"
set "LOG_DIR=%TEMP%\opencode\tun"
set "LOCK=%LOG_DIR%\watchdog.pid"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

set "WPID="
if exist "%LOCK%" (
  set /p WPID=<"%LOCK%"
)

set "RODANDO="
if defined WPID (
  tasklist /FI "PID eq %WPID%" 2>nul | findstr "%WPID%" >nul
  if not errorlevel 1 set "RODANDO=1"
)

if defined RODANDO (
  echo [ok] Watchdog ja rodando PID %WPID% - nada a fazer.
) else (
  echo [..] Iniciando watchdog em segundo plano - janela minimizada...
  start "niveis-watchdog" /min cmd /k "cd /d ""%DIR%"" && python watchdog.py"
  timeout /t 3 /nobreak >nul
)

echo.
echo ===== ATIVO =====
echo URL FIXA .....: https://afline-niveis.codw23.workers.dev/
echo Terminal .....: restaure a janela "niveis-watchdog" ou rode monitor.cmd
echo =================
endlocal