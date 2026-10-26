@echo off
chcp 65001 >nul
echo ========================================================
echo   GuiaData 3.5 - Configuracao do Banco de Dados D1
echo ========================================================
echo.

REM Verifica se o Wrangler esta instalado
where wrangler >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [1/4] Instalando Wrangler CLI...
    npm install -g wrangler
) else (
    echo [1/4] Wrangler CLI ja esta instalado.
)

echo.
echo [2/4] Fazendo login no Cloudflare...
echo (Se abrir o navegador, autorize o acesso)
wrangler login

echo.
echo [3/4] Criando o banco de dados D1 "guiadata-prod"...
wrangler d1 create guiadata-prod

echo.
echo ========================================================
echo   IMPORTANTE: Copie o "database_id" que apareceu acima
echo   e confira se bate com o que esta no wrangler.toml:
echo   d28ea7a8-35d9-4839-b11d-7a50b4dab689
echo.
echo   Se for DIFERENTE, edite o wrangler.toml com o ID correto.
echo ========================================================
echo.
pause

echo.
echo [4/4] Aplicando o schema SQL no banco D1...
wrangler d1 execute guiadata-prod --remote --file=schema.sql

echo.
echo ========================================================
echo   SUCESSO! Banco de dados D1 configurado!
echo   Tabelas criadas: projects, forms, users, submissions...
echo ========================================================
echo.
pause
