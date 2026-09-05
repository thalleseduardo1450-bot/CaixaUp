@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Gerador de Instalador - CaixaUp / Horus PDV
cd /d "%~dp0"

echo ============================================================
echo    GERADOR DE INSTALADOR - CaixaUp / Horus PDV
echo    (FRONTEND desktop + instalador do DESKTOP)
echo ============================================================
echo.

echo [1/2] Recompilando o FRONTEND (modo desktop)...
echo       Pasta: %~dp0FRONTEND
echo       Comando: npm run build:desktop
echo.
cd /d "%~dp0FRONTEND"
call npm run build:desktop
if errorlevel 1 goto :erro
echo.
echo [OK] FRONTEND compilado em FRONTEND\dist
echo.

echo [2/2] Gerando o instalador com electron-builder...
echo       Pasta: %~dp0DESKTOP
echo       Comando: npm run dist
echo.
cd /d "%~dp0DESKTOP"
call npm run dist
if errorlevel 1 goto :erro

echo.
echo ============================================================
echo    PRONTO!
echo ============================================================
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set VER=%%v
echo.
echo Instalador gerado:
echo    %~dp0DESKTOP\release\CaixaUp-Setup-%VER%.exe
echo.
echo (Com ele tambem sao gerados o .blockmap e o latest.yml,
echo  usados na atualizacao automatica.)
echo.
pause
exit /b 0

:erro
echo.
echo ============================================================
echo    [ERRO] Algo falhou durante o build.
echo    Veja as mensagens acima e tente novamente.
echo ============================================================
pause
exit /b 1
