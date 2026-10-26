$Host.UI.RawUI.WindowTitle = "GuiaData - Publicar no GitHub"
$env:PATH = "C:\Users\Lenovo2user\AppData\Local\Programs\Git\cmd;C:\Users\Lenovo2user\AppData\Local\Programs\Git\mingw64\bin;$env:PATH"

Set-Location "c:\Users\Lenovo2user\.gemini\antigravity\scratch\wv-contabilidade\guiadata"

Clear-Host
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  GuiaData 3.5 - Publicador Oficial para o GitHub" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Repositorio: https://github.com/sistemapesquisa/guiadata.git" -ForegroundColor Gray
Write-Host "Branch: main" -ForegroundColor Gray
Write-Host ""
Write-Host "[1/2] Verificando conexao remota..." -ForegroundColor Yellow

& git remote remove origin 2>$null
& git remote add origin https://github.com/sistemapesquisa/guiadata.git
& git branch -M main

Write-Host "[2/2] Enviando arquivos para o GitHub..." -ForegroundColor Yellow
Write-Host "(Se abrir uma janela do navegador, clique em 'Authorize GitCredentialManager')" -ForegroundColor DarkYellow
Write-Host ""

& git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  [SUCESSO] Repositorio GuiaData publicado no GitHub!" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "Agora volte na tela da Cloudflare e clique em 'Retry build'!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Red
    Write-Host "  [AVISO] O envio precisou de autorizacao." -ForegroundColor Red
    Write-Host "========================================================" -ForegroundColor Red
}

Write-Host ""
Read-Host "Pressione Enter para fechar esta janela"
