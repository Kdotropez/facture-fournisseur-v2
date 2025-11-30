# Guide de connexion du dépôt Git

## ✅ Dépôt Git local créé

Le dépôt Git local a été recréé avec succès. Tous vos fichiers sont commités.

## 📋 Étapes pour connecter à GitHub

### Option 1 : Créer le dépôt manuellement (Recommandé)

1. **Allez sur GitHub** : https://github.com/new
2. **Créez un nouveau dépôt** :
   - Nom : `factures-fournisseurs`
   - Description : "Application de gestion des factures fournisseurs"
   - **IMPORTANT** : Ne cochez PAS "Add a README file"
   - Ne cochez PAS "Add .gitignore"
   - Ne cochez PAS "Choose a license"
   - Laissez tout vide
3. **Cliquez sur "Create repository"**
4. **Copiez l'URL du dépôt** (ex: `https://github.com/votre-username/factures-fournisseurs.git`)
5. **Donnez-moi l'URL** et je connecterai automatiquement le dépôt

### Option 2 : Si vous avez déjà un dépôt GitHub

Si vous avez déjà créé un dépôt sur GitHub, donnez-moi simplement l'URL et je le connecterai.

## 🔗 Après la connexion

Une fois le dépôt connecté, je vais :
1. Ajouter le remote GitHub
2. Pousser tout le code
3. Vous pourrez ensuite connecter Vercel au dépôt GitHub

## 📝 Commandes à exécuter (si vous préférez le faire manuellement)

```bash
git remote add origin https://github.com/VOTRE-USERNAME/factures-fournisseurs.git
git push -u origin main
```

Ensuite, dans Vercel :
1. Allez dans Settings > Git
2. Cliquez sur "Connect Git Repository"
3. Sélectionnez votre dépôt GitHub
4. Vercel se connectera automatiquement

