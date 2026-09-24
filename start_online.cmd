@echo off
REM Sobe o WATCHDOG do sistema Afline Niveis.
REM Ele mantem no ar: proxy local (8777) + cloudflared (tunel publico) e
REM publica a URL atual no Worker (URL fixa https://afline-niveis.codw23.workers.dev/).
REM Voce pode fechar esta janela; o watchdog continua rodando.
setlocal

set "DIR=%~dp0"
set "WPY=%DIR%watchdog.py"
set "LOG_DIR=%TEMP%\opencode\tun"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

where pythonw >nul 2>&1
if %errorlevel%==0 ( set "PYW=pythonw" ) else ( set "PYW=python" )

echo [..] Iniciando watchdog (proxy + tunel + URL publica)...
start "niveis-watchdog" /min "%PYW%" "%WPY%"
timeout /t 4 /nobreak >nul

echo.
echo ===== WATCHDOG ATIVO =====
echo URL FIXA (sempre atualizada): https://afline-niveis.codw23.workers.dev/
echo Log do watchdog: %LOG_DIR%\watchdog.log
if exist "%DIR%cloudflare\public\live-url.txt" (
  set /p LIVE=<"%DIR%cloudflare\public\live-url.txt"
  if defined LIVE echo URL atual do tunel: %LIVE%
)
echo ===========================
endlocal