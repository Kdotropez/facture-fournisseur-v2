# Guide Complet : Configuration Git + Vercel

## 🎯 Objectif
Configurer un nouveau dépôt Git et le connecter à Vercel pour le déploiement automatique.

---

## 📋 ÉTAPE 1 : Créer le dépôt GitHub

### 1.1 Aller sur GitHub
1. Ouvrez : **https://github.com/new**
2. Connectez-vous à votre compte GitHub

### 1.2 Créer le dépôt
- **Repository name** : `Factures-Fournisseurs` (ou `factures-fournisseurs`)
- **Description** : "Application de gestion des factures fournisseurs"
- **Visibility** : Public ou Private (au choix)
- **⚠️ IMPORTANT** : Ne cochez AUCUNE option :
  - ❌ Pas de README
  - ❌ Pas de .gitignore
  - ❌ Pas de license
- Cliquez sur **"Create repository"**

### 1.3 Copier l'URL
Après création, GitHub affichera l'URL. Copiez-la :
- Exemple : `https://github.com/Kdotropez/Factures-Fournisseurs.git`

---

## 📋 ÉTAPE 2 : Connecter le dépôt local à GitHub

### 2.1 Ouvrir PowerShell
Ouvrez PowerShell dans le dossier du projet :
```powershell
cd "C:\Users\lefev\Projets\FACTURES FOURNISSEURS"
```

### 2.2 Ajouter le remote
Remplacez `VOTRE-URL` par l'URL de votre dépôt :
```powershell
git remote add origin https://github.com/Kdotropez/Factures-Fournisseurs.git
```

### 2.3 Vérifier
```powershell
git remote -v
```
Vous devriez voir votre URL.

---

## 📋 ÉTAPE 3 : Pousser le code vers GitHub

### 3.1 Créer un Personal Access Token

1. Allez sur : **https://github.com/settings/tokens**
2. Cliquez sur **"Generate new token"** → **"Generate new token (classic)"**
3. **Note** : "Vercel Deploy"
4. **Expiration** : 90 jours (ou plus)
5. **Scopes** : Cochez **`repo`** (tout en bas)
6. Cliquez sur **"Generate token"**
7. **⚠️ COPIEZ LE TOKEN** (ex: `ghp_xxxxxxxxxxxxx`)

### 3.2 Pousser le code

```powershell
git push -u origin main
```

Quand GitHub demande :
- **Username** : `Kdotropez` (ou votre username GitHub)
- **Password** : **Collez votre token** (pas votre mot de passe !)

### 3.3 Vérifier
Allez sur : **https://github.com/Kdotropez/Factures-Fournisseurs**
Vous devriez voir tous vos fichiers.

---

## 📋 ÉTAPE 4 : Connecter Vercel au dépôt GitHub

### 4.1 Aller sur Vercel
1. Ouvrez : **https://vercel.com/dashboard**
2. Connectez-vous

### 4.2 Créer/Modifier le projet
- Si vous avez déjà un projet : Cliquez dessus → **Settings** → **Git**
- Si nouveau projet : Cliquez sur **"Add New Project"**

### 4.3 Connecter le dépôt Git
1. Cliquez sur **"Import Git Repository"** ou **"Connect Git Repository"**
2. Sélectionnez **GitHub**
3. Autorisez Vercel à accéder à vos dépôts (si demandé)
4. Sélectionnez : **Kdotropez/Factures-Fournisseurs**
5. Cliquez sur **"Import"**

### 4.4 Configuration du projet
Vercel détectera automatiquement :
- **Framework Preset** : Vite
- **Root Directory** : `./`
- **Build Command** : `npm run build`
- **Output Directory** : `dist`

Cliquez sur **"Deploy"**

### 4.5 Variables d'environnement (si nécessaire)
Si votre app nécessite des variables d'environnement :
- **Settings** → **Environment Variables**
- Ajoutez-les si besoin

---

## 📋 ÉTAPE 5 : Vérifier le déploiement

1. Vercel va automatiquement :
   - Installer les dépendances (`npm install`)
   - Builder le projet (`npm run build`)
   - Déployer sur Vercel

2. Une fois terminé, vous aurez une URL comme :
   - `https://factures-fournisseurs-xxxxx.vercel.app`

3. **Déploiements automatiques** :
   - Chaque `git push` déclenchera un nouveau déploiement
   - Vercel surveille automatiquement votre dépôt GitHub

---

## ✅ Résumé

**Ce qui est fait automatiquement :**
- ✅ Dépôt Git local créé
- ✅ Tous les fichiers commités
- ✅ Branche `main` configurée

**Ce que vous devez faire :**
1. Créer le dépôt sur GitHub
2. Créer un token GitHub
3. Pousser le code (avec le token)
4. Connecter Vercel au dépôt GitHub

**Temps estimé : 5-10 minutes**

---

## 🔧 Commandes utiles

```powershell
# Vérifier l'état
git status

# Voir les remotes
git remote -v

# Pousser les modifications futures
git add -A
git commit -m "Description des changements"
git push
```

---

## ❓ Problèmes courants

### "Authentication failed"
- Vérifiez que vous utilisez le **token** et pas le mot de passe
- Vérifiez que le token a le scope `repo`

### "Repository not found"
- Vérifiez que le dépôt existe sur GitHub
- Vérifiez l'URL du remote : `git remote -v`

### Vercel ne détecte pas le projet
- Vérifiez que le `package.json` est à la racine
- Vérifiez que `vite.config.ts` existe

---

**Une fois terminé, votre application sera déployée automatiquement à chaque push ! 🚀**

