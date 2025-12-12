# Script pour pousser le code vers GitHub

Write-Host "=== DIAGNOSTIC DU DEPOT GIT ===" -ForegroundColor Cyan

# Vérifier si .git existe
if (Test-Path .git) {
    Write-Host "✓ Dossier .git existe" -ForegroundColor Green
} else {
    Write-Host "✗ Pas de depot Git" -ForegroundColor Red
    exit
}

# Vérifier les remotes
Write-Host "`n=== REMOTES ===" -ForegroundColor Cyan
git remote -v

# Vérifier l'état
Write-Host "`n=== ETAT ===" -ForegroundColor Cyan
git status

# Vérifier les commits
Write-Host "`n=== COMMITS LOCAUX ===" -ForegroundColor Cyan
git log --oneline -3

# Essayer de pousser
Write-Host "`n=== TENTATIVE DE PUSH ===" -ForegroundColor Yellow
Write-Host "Pushing to origin main..." -ForegroundColor Yellow
git push -u origin main 2>&1 | Write-Host

Write-Host "`n=== VERIFICATION ===" -ForegroundColor Cyan
git status





