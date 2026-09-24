@echo off
title GuiaData - Publicar no GitHub
chcp 65001 >nul
cls

echo ========================================================
echo   GuiaData 3.5 — Publicador Oficial para o GitHub
echo ========================================================
echo.

set PATH=C:\Users\Lenovo2user\AppData\Local\Programs\Git\cmd;%PATH%

cd /d "c:\Users\Lenovo2user\.gemini\antigravity\scratch\wv-contabilidade\guiadata"

echo [1/2] Repositorio Alvo:
echo https://github.com/sistemapesquisa/guiadata.git
echo.

git remote remove origin >nul 2>&1
git remote add origin https://github.com/sistemapesquisa/guiadata.git
git branch -M main

echo [2/2] Enviando arquivos para a branch main no GitHub...
echo (Se uma janela do navegador abrir pedindo login no GitHub, basta autorizar)
echo.

git push -u origin main

echo.
if %errorlevel% equ 0 (
    echo ========================================================
    echo   🎉 SUCESSO! Repositorio GuiaData publicado no GitHub!
    echo ========================================================
    echo.
    echo Agora voce ja pode ir no Cloudflare Pages e conectar o
    echo repositorio sistemapesquisa/guiadata!
) else (
    echo ========================================================
    echo   [AVISO] O envio precisou de autenticacao.
    echo ========================================================
    echo Se pediu Token ou senha, utilize o Git Credential Manager
    echo ou um Personal Access Token (PAT) do GitHub.
)

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
