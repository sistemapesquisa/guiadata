@echo off
title GuiaData - Publicar no GitHub
chcp 65001 >nul
cls

echo ========================================================
echo   GuiaData 3.5 — Publicador Oficial para o GitHub
echo ========================================================
echo.

set PATH=C:\Users\Lenovo2user\AppData\Local\Programs\Git\cmd;%PATH%

cd /d "%~dp0"

echo [1/3] Verificando arquivos locais...
git status
echo.

set /p REPO_URL="Cole a URL do seu repositorio no GitHub (ex: https://github.com/SEU_USUARIO/guiadata.git): "

if "%REPO_URL%"=="" (
    echo [ERRO] Nenhuma URL foi informada.
    pause
    exit /b
)

echo.
echo [2/3] Configurando conexao remota...
git remote remove origin >nul 2>&1
git remote add origin %REPO_URL%
git branch -M main

echo.
echo [3/3] Enviando arquivos para a branch main no GitHub...
echo (Se uma janela do navegador ou pedido de login abrir, confirme seu acesso ao GitHub)
echo.
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================================
    echo   🎉 SUCESSO! Repositorio GuiaData publicado no GitHub!
    echo ========================================================
) else (
    echo.
    echo [AVISO] Se o push pedir senha, o GitHub exige um Personal Access Token (PAT)
    echo ou que voce autorize pelo navegador no Git Credential Manager.
)

echo.
pause
