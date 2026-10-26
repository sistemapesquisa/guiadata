@echo off
title GuiaData - Deploy para Cloudflare
chcp 65001 >nul
cls

echo ========================================================
echo   GuiaData 3.5 — Deploy Direto para Cloudflare
echo ========================================================
echo.

set PATH=C:\Program Files\nodejs;%PATH%
cd /d "c:\Users\Lenovo2user\.gemini\antigravity\scratch\wv-contabilidade\guiadata"

echo [1/2] Iniciando deploy direto via Wrangler...
echo (Se o navegador abrir pedindo autorizacao da Cloudflare, clique em 'Allow')
echo.

cmd /c npx -y wrangler deploy

echo.
if %errorlevel% equ 0 (
    echo ========================================================
    echo   🎉 SUCESSO! GuiaData publicado na Cloudflare!
    echo ========================================================
) else (
    echo [AVISO] Se o deploy pedir login, autorize na janela do navegador.
)

echo.
pause
