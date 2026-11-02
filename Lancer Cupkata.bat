@echo off
rem Lance la version de travail de Cupkata (reconstruit l'interface puis ouvre l'application).
cd /d "%~dp0"
call npm.cmd start
if errorlevel 1 pause
