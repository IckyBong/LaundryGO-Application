@echo off
title LaundryGO Mobile Web Server
cd /d "%~dp0"
echo Starting LaundryGO Mobile Web Server on Port 8082...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run_server.ps1"
pause
