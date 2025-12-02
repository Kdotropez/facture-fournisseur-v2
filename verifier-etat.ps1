# Script de vérification complète

Write-Host "=== VERIFICATION DU DEPOT GIT ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier si .git existe
if (Test-Path .git) {
    Write-Host "[OK] Dossier .git existe" -ForegroundColor Green
} else {
    Write-Host "[ERREUR] Pas de depot Git" -ForegroundColor Red
    exit
}

# Remote
Write-Host "`n=== REMOTE GITHUB ===" -ForegroundColor Cyan
$remote = git remote get-url origin 2>&1
if ($remote -like "*github.com*") {
    Write-Host "[OK] Remote configure: $remote" -ForegroundColor Green
} else {
    Write-Host "[ERREUR] Remote non configure" -ForegroundColor Red
}

# État
Write-Host "`n=== ETAT LOCAL ===" -ForegroundColor Cyan
$status = git status --porcelain 2>&1
$branchStatus = git status -sb 2>&1

if ($branchStatus -match "ahead") {
    Write-Host "[ATTENTION] Des commits ne sont pas pousses" -ForegroundColor Yellow
    Write-Host $branchStatus -ForegroundColor Yellow
} elseif ($branchStatus -match "up to date") {
    Write-Host "[OK] Branche a jour avec origin/main" -ForegroundColor Green
    Write-Host $branchStatus -ForegroundColor Green
} else {
    Write-Host "[INFO] Etat:" -ForegroundColor Cyan
    Write-Host $branchStatus -ForegroundColor White
}

# Commits locaux
Write-Host "`n=== COMMITS LOCAUX ===" -ForegroundColor Cyan
$commits = git log --oneline -3 2>&1
Write-Host $commits -ForegroundColor White

# Vérifier la connexion au remote
Write-Host "`n=== VERIFICATION REMOTE ===" -ForegroundColor Cyan
$remoteCheck = git ls-remote origin HEAD 2>&1
if ($remoteCheck -match "refs/heads") {
    Write-Host "[OK] Connexion au remote reussie" -ForegroundColor Green
    Write-Host "Commit distant trouve" -ForegroundColor Green
} else {
    Write-Host "[ATTENTION] Impossible de se connecter au remote" -ForegroundColor Yellow
    Write-Host "Cela peut signifier:" -ForegroundColor Yellow
    Write-Host "  - Le push n'a pas encore ete fait" -ForegroundColor Yellow
    Write-Host "  - Probleme d'authentification" -ForegroundColor Yellow
    Write-Host "  - Le depot est vide sur GitHub" -ForegroundColor Yellow
}

Write-Host "`n=== RESUME ===" -ForegroundColor Cyan
Write-Host "Pour verifier sur GitHub:" -ForegroundColor Yellow
Write-Host "  https://github.com/Kdotropez/Factures-et-Fournisseurs" -ForegroundColor Cyan
Write-Host "`nSi vous voyez vos fichiers = Push reussi !" -ForegroundColor Green
Write-Host "Si le depot est vide = Push non fait" -ForegroundColor Yellow


