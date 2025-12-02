# Script automatique pour pousser vers GitHub

Write-Host "=== PUSH AUTOMATIQUE VERS GITHUB ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier que Git est configuré
Write-Host "[1/5] Vérification du dépôt Git..." -ForegroundColor Yellow
if (-not (Test-Path .git)) {
    Write-Host "  ✗ Dépôt Git non trouvé" -ForegroundColor Red
    git init
    git branch -M main
}

# Vérifier le remote
Write-Host "[2/5] Configuration du remote..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin https://github.com/Kdotropez/Factures-Fournisseurs.git
$remote = git remote get-url origin
Write-Host "  ✓ Remote configuré: $remote" -ForegroundColor Green

# Ajouter et commiter
Write-Host "[3/5] Préparation des fichiers..." -ForegroundColor Yellow
git add -A
$status = git status --porcelain
if ($status) {
    git commit -m "feat: Application complete gestion factures fournisseurs" -q
    Write-Host "  ✓ Fichiers commités" -ForegroundColor Green
} else {
    Write-Host "  ✓ Aucun changement à commiter" -ForegroundColor Green
}

# Vérifier GitHub CLI
Write-Host "[4/5] Vérification de GitHub CLI..." -ForegroundColor Yellow
$ghInstalled = $false
try {
    $ghVersion = gh --version 2>$null
    if ($ghVersion) {
        $ghInstalled = $true
        Write-Host "  ✓ GitHub CLI installé" -ForegroundColor Green
    }
} catch {
    Write-Host "  ⚠ GitHub CLI non installé" -ForegroundColor Yellow
}

# Essayer de pousser
Write-Host "[5/5] Tentative de push..." -ForegroundColor Yellow
Write-Host ""

if ($ghInstalled) {
    Write-Host "Tentative avec GitHub CLI..." -ForegroundColor Cyan
    gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        git push -u origin main 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Host "✓ Push réussi !" -ForegroundColor Green
            Write-Host "Vérifiez sur: https://github.com/Kdotropez/Factures-Fournisseurs" -ForegroundColor Cyan
            exit 0
        }
    }
}

# Essayer avec credentials Windows
Write-Host "Tentative avec credentials Windows..." -ForegroundColor Cyan
git config --global credential.helper manager-core 2>$null
$pushResult = git push -u origin main 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Push réussi !" -ForegroundColor Green
    Write-Host "Vérifiez sur: https://github.com/Kdotropez/Factures-Fournisseurs" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "⚠ Push nécessite une authentification manuelle" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "PROCHAINES ETAPES:" -ForegroundColor Cyan
    Write-Host "1. Créez un token sur: https://github.com/settings/tokens" -ForegroundColor White
    Write-Host "2. Scope: repo" -ForegroundColor White
    Write-Host "3. Exécutez: git push -u origin main" -ForegroundColor White
    Write-Host "4. Username: Kdotropez" -ForegroundColor White
    Write-Host "5. Password: (collez votre token)" -ForegroundColor White
}


