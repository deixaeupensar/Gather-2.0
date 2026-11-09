@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Isto vai construir o escritorio decorado no centro do mundo (faz backup antes).
echo O servidor precisa estar PARADO.
pause
node tools\gerar-escritorio.js
pause
