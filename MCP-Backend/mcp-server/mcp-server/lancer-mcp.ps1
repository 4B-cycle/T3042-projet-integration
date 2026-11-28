# Lance le serveur MCP avec les bons secrets. À exécuter dans le dossier qui contient server.py.
#   .\lancer-mcp.ps1                      -> lit les secrets dans ..\backend-tutorat\.env s'il existe, sinon les demande
#   .\lancer-mcp.ps1 -EnvFile C:\chemin\.env
# Ne mettez JAMAIS les secrets dans ce fichier (il pourrait être commité).
param([string]$EnvFile = "..\backend-tutorat\.env", [string]$BackendUrl = "http://localhost:8001")

function Lire-Secret($nom) {
    if (Test-Path $EnvFile) {
        $ligne = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$nom\s*=" } | Select-Object -First 1
        if ($ligne) { return ($ligne -replace "^\s*$nom\s*=\s*", "").Trim() }
    }
    return Read-Host "Valeur de $nom (même que dans le .env du backend)"
}

$env:BACKEND_URL           = $BackendUrl
$env:BACKEND_TOKEN         = Lire-Secret "BACKEND_TOKEN"
$env:BACKEND_SERVICE_TOKEN = Lire-Secret "BACKEND_SERVICE_TOKEN"
# OPENWEBUI_JWT_SECRET n'est PAS donné au MCP : il ne sert qu'au backend et à Open WebUI.

python server.py
