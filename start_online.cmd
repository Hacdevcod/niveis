@echo off
REM Sobe o proxy local (porta 8777) e o Cloudflare Tunnel (URL publica).
REM Requisitos: proxy.py na mesma pasta, cloudflared instalado.
setlocal

set "PROXY_DIR=%~dp0"
set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
set "LOG_DIR=%TEMP%\opencode\tun"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM 1) Proxy local (verifica se ja esta escutando na 8777)
netstat -ano | findstr "LISTENING" | findstr ":8777 " >nul
if %errorlevel%==0 (
  echo [ok] Proxy local ja rodando em http://127.0.0.1:8777/
) else (
  echo [..] Iniciando proxy local...
  start "niveis-proxy" /min cmd /c ""%PROXY_DIR%proxy.py" > "%LOG_DIR%\proxy.log" 2>&1"
  timeout /t 3 /nobreak >nul
)

REM 2) Cloudflare Tunnel (mata qualquer instancia anterior)
taskkill /f /im cloudflared.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo [..] Criando tunnel publico (trycloudflare)...
start "cloudflared-tunnel" /min cmd /c ""%CLOUDFLARED%" tunnel --url http://127.0.0.1:8777 --no-autoupdate > "%LOG_DIR%\out.log" 2> "%LOG_DIR%\err.log""

timeout /t 15 /nobreak >nul

echo.
echo ==== URL PUBLICA ====
findstr /c:"trycloudflare.com" "%LOG_DIR%\out.log" "%LOG_DIR%\err.log"
echo =====================
echo Mantenha esta janela/mensagem salva. A URL muda se reiniciar.
endlocal