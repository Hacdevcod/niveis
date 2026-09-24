@echo off
REM Inicia o WATCHDOG do Afline Niveis em 2o plano, de forma invisivel.
REM Ele sobe o proxy (8777), o tunnel publico e publica a URL no Worker.
REM Para ver o status em tempo real, rode monitor.cmd.
REM Auto-inicio ao ligar o PC: o arquivo iniciar_watchdog.vbs ja esta na
REM pasta Inicializar do Windows. Para desativar, apague-o de la.
setlocal

set "DIR=%~dp0"
wscript.exe "%DIR%iniciar_watchdog.vbs"

echo.
echo [ok] Watchdog iniciado em 2o plano - invisivel, sem janela.
echo URL FIXA .....: https://afline-niveis.codw23.workers.dev/
echo Status .......: monitor.cmd
echo =================
endlocal