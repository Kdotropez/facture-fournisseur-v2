# Script final pour pousser vers GitHub

Write-Host "=== CONFIGURATION FINALE ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier le remote
Write-Host "[1] Vérification du remote..." -ForegroundColor Yellow
$remote = git remote get-url origin
Write-Host "  Remote: $remote" -ForegroundColor Green

# Vérifier l'état
Write-Host "[2] Vérification de l'état..." -ForegroundColor Yellow
git status --short | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  ✓ Dépôt prêt" -ForegroundColor Green
}

# Vérifier les commits
Write-Host "[3] Vérification des commits..." -ForegroundColor Yellow
$commits = git log --oneline | Measure-Object -Line
Write-Host "  ✓ $($commits.Lines) commit(s) local(aux)" -ForegroundColor Green

Write-Host ""
Write-Host "=== PUSH VERS GITHUB ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Le dépôt est configuré et prêt !" -ForegroundColor Green
Write-Host ""
Write-Host "Pour pousser le code, exécutez:" -ForegroundColor Yellow
Write-Host "  git push -u origin main" -ForegroundColor White
Write-Host ""
Write-Host "Quand GitHub demande:" -ForegroundColor Yellow
Write-Host "  Username: Kdotropez" -ForegroundColor White
Write-Host "  Password: (collez votre token GitHub)" -ForegroundColor White
Write-Host ""
Write-Host "Pour créer un token:" -ForegroundColor Yellow
Write-Host "  https://github.com/settings/tokens" -ForegroundColor Cyan
Write-Host "  Scope: repo" -ForegroundColor White
Write-Host ""





