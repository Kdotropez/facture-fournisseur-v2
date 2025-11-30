# Guide : Pousser le code vers GitHub

## 📋 Étape 1 : Créer un Personal Access Token GitHub

### 1.1 Aller sur la page des tokens GitHub
1. Ouvrez votre navigateur
2. Allez sur : **https://github.com/settings/tokens**
3. Connectez-vous si nécessaire

### 1.2 Créer un nouveau token
1. Cliquez sur **"Generate new token"** (en haut à droite)
2. Sélectionnez **"Generate new token (classic)"**

### 1.3 Configurer le token
1. **Note** : Donnez un nom au token (ex: "Vercel Deploy" ou "Factures Fournisseurs")
2. **Expiration** : Choisissez la durée (90 jours, 1 an, ou "No expiration")
3. **Scopes** : Cochez **UNIQUEMENT** :
   - ✅ **`repo`** (accès complet aux dépôts privés)
     - Cela inclut automatiquement : repo:status, repo_deployment, public_repo, repo:invite, security_events

### 1.4 Générer et copier le token
1. Faites défiler vers le bas
2. Cliquez sur **"Generate token"** (bouton vert)
3. **⚠️ IMPORTANT** : Copiez le token immédiatement (ex: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - Vous ne pourrez plus le voir après !
   - Gardez-le dans un endroit sûr temporairement

---

## 📋 Étape 2 : Pousser le code avec le token

### 2.1 Ouvrir PowerShell ou Git Bash
- Ouvrez PowerShell (Windows) ou Git Bash
- Naviguez vers le dossier du projet :
```bash
cd "C:\Users\lefev\Projets\FACTURES FOURNISSEURS"
```

### 2.2 Vérifier la configuration
```bash
git remote -v
```
Vous devriez voir :
```
origin  https://github.com/Kdotropez/Factures-Fournisseurs.git (fetch)
origin  https://github.com/Kdotropez/Factures-Fournisseurs.git (push)
```

### 2.3 Pousser le code
Exécutez cette commande :
```bash
git push -u origin main
```

### 2.4 Authentification
Quand GitHub demande :
- **Username** : Entrez `Kdotropez`
- **Password** : **Collez votre Personal Access Token** (pas votre mot de passe GitHub !)

---

## 📋 Étape 3 : Vérifier que ça a fonctionné

1. Allez sur : **https://github.com/Kdotropez/Factures-Fournisseurs**
2. Vous devriez voir tous vos fichiers :
   - `src/` dossier
   - `parsers/` dossier
   - `package.json`
   - `vite.config.ts`
   - etc.

---

## 📋 Étape 4 : Connecter Vercel au dépôt GitHub

1. Allez sur : **https://vercel.com/dashboard**
2. Cliquez sur votre projet **"factures-fournisseurs"**
3. Allez dans **Settings** (en haut)
4. Cliquez sur **Git** dans le menu de gauche
5. Cliquez sur **"Connect Git Repository"**
6. Sélectionnez **GitHub**
7. Autorisez Vercel à accéder à vos dépôts si demandé
8. Sélectionnez le dépôt : **Kdotropez/Factures-Fournisseurs**
9. Vercel se connectera automatiquement et déploiera votre code

---

## ❓ Problèmes courants

### Erreur : "Authentication failed"
- Vérifiez que vous utilisez le **token** et pas votre mot de passe
- Vérifiez que le token a bien le scope `repo`

### Erreur : "Repository not found"
- Vérifiez que le dépôt existe sur GitHub
- Vérifiez que vous avez les droits d'accès

### Le push semble bloqué
- Appuyez sur `Ctrl+C` pour annuler
- Réessayez avec : `git push -u origin main`

---

## ✅ Une fois terminé

Votre code sera sur GitHub et Vercel se connectera automatiquement pour les futurs déploiements !

