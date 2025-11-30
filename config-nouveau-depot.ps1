# Script pour configurer le nouveau dépôt GitHub

param(
    [Parameter(Mandatory=$true)]
    [string]$UrlDepot
)

Write-Host "=== CONFIGURATION DU NOUVEAU DEPOT ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier que l'URL est valide
if ($UrlDepot -notmatch "github\.com") {
    Write-Host "[ERREUR] L'URL ne semble pas etre une URL GitHub valide" -ForegroundColor Red
    Write-Host "Exemple: https://github.com/Kdotropez/facture-fournisseur-v2.git" -ForegroundColor Yellow
    exit 1
}

# Supprimer l'ancien remote s'il existe
Write-Host "[1/4] Suppression de l'ancien remote..." -ForegroundColor Yellow
git remote remove origin 2>&1 | Out-Null

# Ajouter le nouveau remote
Write-Host "[2/4] Ajout du nouveau remote: $UrlDepot" -ForegroundColor Yellow
git remote add origin $UrlDepot

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] Impossible d'ajouter le remote" -ForegroundColor Red
    exit 1
}

# Vérifier le remote
Write-Host "[3/4] Verification du remote..." -ForegroundColor Yellow
$remote = git remote get-url origin
Write-Host "Remote configure: $remote" -ForegroundColor Green

# Vérifier l'état
Write-Host "[4/4] Verification de l'etat local..." -ForegroundColor Yellow
$status = git status -sb
Write-Host $status -ForegroundColor White

Write-Host "`n=== CONFIGURATION TERMINEE ===" -ForegroundColor Green
Write-Host "`nPour pousser le code, executez:" -ForegroundColor Yellow
Write-Host "  git push -u origin main" -ForegroundColor Cyan
Write-Host "`nOu utilisez GitHub Desktop pour publier le depot." -ForegroundColor Yellow

