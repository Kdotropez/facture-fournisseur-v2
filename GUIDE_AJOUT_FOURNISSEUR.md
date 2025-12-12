# Guide : Ajouter un nouveau dossier fournisseur

Ce guide explique comment ajouter un nouveau fournisseur et son dossier de factures dans l'application.

## 📋 Vue d'ensemble

L'application gère les factures par fournisseur. Chaque fournisseur peut avoir :
- Un dossier physique contenant les PDFs de factures
- Un parser personnalisé (optionnel) pour extraire les données des PDFs
- Des règles de parsing apprises automatiquement

## 🚀 Méthode 1 : Ajout rapide via l'interface (Recommandé pour commencer)

### Étape 1 : Créer le dossier physique

1. Créez un nouveau dossier dans le répertoire `public/` :
   ```
   public/MON FOURNISSEUR 2025/
   ```
   ⚠️ **Important** : Le nom du dossier doit être au format `NOM FOURNISSEUR ANNÉE` (ex: `MON FOURNISSEUR 2025`)

2. Placez vos fichiers PDF de factures dans ce dossier :
   ```
   public/MON FOURNISSEUR 2025/
     ├── F1.pdf
     ├── F2.pdf
     └── F3.pdf
   ```

### Étape 2 : Ajouter le fournisseur via l'interface

1. Lancez l'application (`npm run dev`)
2. Allez dans la section **"Éditeur de parsing"**
3. Cliquez sur le bouton **"+"** à côté du sélecteur de fournisseur
4. Saisissez le nom exact du fournisseur (ex: `MON FOURNISSEUR`)
5. Cliquez sur **"Ajouter"**

✅ Le fournisseur est maintenant ajouté ! Il utilisera automatiquement le **parser générique** qui extrait les informations de base (numéro, date, totaux).

### Étape 3 : Tester l'import

1. Dans l'éditeur de parsing, sélectionnez un fichier PDF du nouveau fournisseur
2. Sélectionnez le fournisseur dans la liste
3. Cliquez sur **"Parser le document"**
4. Vérifiez et corrigez les données si nécessaire
5. Cliquez sur **"Importer"**

## 🔧 Méthode 2 : Configuration complète avec parser personnalisé

Si vous avez besoin d'un parser spécifique pour extraire les lignes de produits en détail, suivez cette méthode.

### Étape 1 : Créer le dossier physique

Même chose que la Méthode 1, étape 1.

### Étape 2 : Créer un parser personnalisé

1. Créez un nouveau fichier dans `parsers/` :
   ```
   parsers/mon-fournisseur.ts
   ```

2. Copiez la structure d'un parser existant (ex: `parsers/rb-drinks.ts`) et adaptez-le :

```typescript
/**
 * Parser pour les factures MON FOURNISSEUR
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';

export const parserMonFournisseur: Parser = {
  fournisseur: 'MON FOURNISSEUR',
  extensionsSupportees: ['.pdf'],
  
  parser: async (fichier: File | string): Promise<ParserResult> => {
    // Votre logique de parsing ici
    // ...
  },
};
```

3. Enregistrez le parser dans `parsers/index.ts` :

```typescript
import { parserMonFournisseur } from './mon-fournisseur';

export const parseurs: Record<Fournisseur, Parser> = {
  'RB DRINKS': parserRBDrinks,
  'LEHMANN F': parserLehmann,
  'ITALESSE': parserItalesse,
  'MON FOURNISSEUR': parserMonFournisseur, // ← Ajoutez cette ligne
};
```

### Étape 3 : Ajouter la détection automatique (optionnel)

Pour que le système détecte automatiquement ce fournisseur depuis le nom du dossier, ajoutez une règle dans `parsers/index.ts` :

```typescript
export function detecterFournisseur(chemin: string): Fournisseur | null {
  // ... règles existantes ...
  
  if (cheminNormalise.includes('MON FOURNISSEUR')) {
    return 'MON FOURNISSEUR';
  }
  
  // ...
}
```

## 📁 Structure des dossiers

```
FACTURES FOURNISSEURS/
├── public/
│   ├── RB DRINKS 2025/          ← Dossier fournisseur existant
│   │   ├── RB1.pdf
│   │   └── RB2.pdf
│   ├── MON FOURNISSEUR 2025/    ← Nouveau dossier fournisseur
│   │   ├── F1.pdf
│   │   └── F2.pdf
│   └── ...
├── parsers/
│   ├── index.ts                 ← Enregistrement des parseurs
│   ├── rb-drinks.ts             ← Parser existant
│   └── mon-fournisseur.ts      ← Nouveau parser (optionnel)
└── ...
```

## 🔍 Détection automatique

Le système détecte automatiquement les nouveaux fournisseurs si :
- Le nom du dossier correspond à un fournisseur enregistré (via l'interface ou localStorage)
- Le format du dossier est `NOM FOURNISSEUR ANNÉE` (ex: `MON FOURNISSEUR 2025`)

## ⚙️ Parser générique vs Parser personnalisé

### Parser générique (par défaut)
- ✅ Fonctionne immédiatement, aucune configuration nécessaire
- ✅ Extrait : numéro de facture, date, totaux HT/TTC
- ⚠️ Limitation : crée une seule ligne de produit générique

### Parser personnalisé
- ✅ Extrait toutes les lignes de produits en détail
- ✅ Peut gérer des formats spécifiques au fournisseur
- ⚠️ Nécessite du développement

## 💡 Conseils

1. **Nommage des dossiers** : Utilisez un format cohérent `NOM FOURNISSEUR ANNÉE`
2. **Nommage des fichiers** : Utilisez des noms clairs et uniques
3. **Test progressif** : Commencez avec le parser générique, puis créez un parser personnalisé si nécessaire
4. **Apprentissage automatique** : L'application apprend vos corrections dans l'éditeur de parsing et les réutilise pour les prochaines factures

## 🐛 Dépannage

### Le fournisseur n'apparaît pas dans la liste
- Vérifiez que vous l'avez bien ajouté via l'interface (bouton +)
- Vérifiez le nom exact (sensible à la casse)
- Rechargez la page

### Les fichiers ne sont pas détectés
- Vérifiez que les fichiers sont bien dans `public/NOM FOURNISSEUR 2025/`
- Vérifiez que les fichiers sont des PDFs valides
- Utilisez le bouton "Scanner les fichiers" dans l'interface

### Le parsing ne fonctionne pas
- Vérifiez que le fournisseur est sélectionné
- Vérifiez que le fichier PDF est valide
- Consultez les erreurs dans la console du navigateur (F12)

## 📚 Exemples de parseurs

Consultez les parseurs existants pour des exemples :
- `parsers/rb-drinks.ts` : Parser complet avec extraction détaillée
- `parsers/lehmann.ts` : Parser avec gestion de formats spécifiques
- `parsers/italesse.ts` : Parser avec extraction multi-pages





