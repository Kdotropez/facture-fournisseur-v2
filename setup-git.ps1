# Script de configuration Git pour factures-fournisseurs

Write-Host "=== VERIFICATION DU DEPOT GIT ===" -ForegroundColor Cyan

# Vérifier si .git existe
if (Test-Path .git) {
    Write-Host "✓ Dossier .git existe" -ForegroundColor Green
} else {
    Write-Host "✗ Pas de depot Git - Initialisation..." -ForegroundColor Yellow
    git init
    git branch -M main
}

# Vérifier les remotes
Write-Host "`n=== REMOTES CONFIGURES ===" -ForegroundColor Cyan
git remote -v

# Vérifier les commits
Write-Host "`n=== DERNIERS COMMITS ===" -ForegroundColor Cyan
git log --oneline -5

# Vérifier l'état
Write-Host "`n=== ETAT ACTUEL ===" -ForegroundColor Cyan
git status

Write-Host "`n=== PROCHAINES ETAPES ===" -ForegroundColor Yellow
Write-Host "1. Allez sur https://vercel.com/dashboard"
Write-Host "2. Ouvrez votre projet 'factures-fournisseurs'"
Write-Host "3. Allez dans Settings > Git"
Write-Host "4. Copiez l'URL du depot Git (ex: https://github.com/username/repo.git)"
Write-Host "5. Ensuite executez: git remote add origin <URL>"
Write-Host "6. Puis: git push -u origin main"


