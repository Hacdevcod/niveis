@echo off
REM Monitor de status do Afline Niveis (terminal em 2o plano).
REM Feche esta janela quando quiser - o watchdog continua rodando.
title Afline Niveis - Status (2o plano)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0monitor.ps1"