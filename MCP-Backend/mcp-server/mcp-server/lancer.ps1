# Lance le serveur MCP avec le bon Python et le bon jeton.
# Utilisation (depuis ce dossier) :  .\lancer.ps1
# Première fois : python -m venv .venv  puis  .\.venv\Scripts\python.exe -m pip install -r requirements.txt

# $PSScriptRoot = dossier de ce script -> le script marche même si on le lance d'ailleurs.
# Le .env du backend est DANS le repo, à côté -> le chemin est le même pour tout le groupe.
$envBackend = Join-Path $PSScriptRoot "backend-test\backend-tutorat\.env"

if (-not (Test-Path $envBackend)) {
    Write-Host "Fichier .env du backend introuvable : $envBackend" -ForegroundColor Red
    Write-Host "Copie backend-test\backend-tutorat\.env.example en .env et remplis BACKEND_TOKEN." -ForegroundColor Yellow
    exit 1
}

# 1. Le MCP et le backend doivent partager le MEME jeton : on le lit dans le .env du backend
#    (sans l'afficher, c'est un secret).
$ligne = Get-Content $envBackend | Select-String '^BACKEND_TOKEN='
if (-not $ligne) {
    Write-Host "BACKEND_TOKEN absent du .env du backend." -ForegroundColor Red
    exit 1
}
$env:BACKEND_TOKEN = ($ligne.Line -replace '^BACKEND_TOKEN=', '').Trim().Trim('"')

# 2. On utilise le Python du venv (c'est lui qui a icalendar, mcp, httpx2).
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "Pas de .venv ici. Lance d'abord :" -ForegroundColor Red
    Write-Host "  python -m venv .venv" -ForegroundColor Yellow
    Write-Host "  .\.venv\Scripts\python.exe -m pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}
& $python (Join-Path $PSScriptRoot "server.py")
