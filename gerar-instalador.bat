@echo off
setlocal EnableExtensions DisableDelayedExpansion
chcp 65001 >nul
title CaixaUp - Gerador de instalador
where node.exe >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Node.js nao encontrado.
    echo Instale Node.js 22.12 ou superior e abra este arquivo novamente.
    pause
    exit /b 1
)
if not exist "%~dp0gerar-instalador.cjs" (
    echo [ERRO] Falta gerar-instalador.cjs ao lado deste arquivo BAT.
    echo Mantenha os dois arquivos juntos na pasta principal do CaixaUp.
    pause
    exit /b 1
)
node.exe "%~dp0gerar-instalador.cjs"
set "BUILD_EXIT=%ERRORLEVEL%"
echo.
echo Pressione qualquer tecla para fechar esta janela.
pause >nul
exit /b %BUILD_EXIT%
