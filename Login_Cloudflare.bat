@echo off
chcp 65001 >nul
echo ========================================================
echo   GuiaData 3.5 - Login Cloudflare via API Token
echo ========================================================
echo.
echo Cole seu API Token do Cloudflare abaixo:
echo (Gere em: https://dash.cloudflare.com/profile/api-tokens)
echo.
set /p CLOUDFLARE_API_TOKEN="Token: "

echo.
echo Verificando token...
wrangler whoami

echo.
echo Se o token foi aceito, rode agora:
echo   Configurar_D1.bat
echo.
pause
