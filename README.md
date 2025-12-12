# Gestion des Factures Fournisseurs

Application React moderne pour gérer les factures de plusieurs fournisseurs avec support pour l'import de fichiers PDF.

## 🚀 Fonctionnalités

- **Gestion des factures** : Liste, recherche et filtrage des factures par fournisseur
- **Détails complets** : Affichage détaillé de chaque facture avec lignes de produits et totaux
- **Statistiques globales** : Vue d'ensemble avec totaux HT/TVA/TTC et statistiques par fournisseur
- **Import PDF** : Import de fichiers PDF avec drag & drop et détection automatique du fournisseur
- **Système extensible** : Architecture modulaire pour ajouter facilement de nouveaux fournisseurs

## 📋 Prérequis

- Node.js 18+ et npm

## 🛠️ Installation

1. Installer les dépendances :
```bash
npm install
```

2. Lancer l'application en mode développement :
```bash
npm run dev
```

3. L'application sera accessible sur `http://localhost:5173`

## 📦 Structure du projet

```
FACTURES FOURNISSEURS/
├── src/
│   ├── components/          # Composants React
│   │   ├── ImportPDF.tsx    # Import de fichiers PDF
│   │   ├── ListeFactures.tsx # Liste des factures
│   │   ├── DetailsFacture.tsx # Détails d'une facture
│   │   └── Statistiques.tsx   # Statistiques globales
│   ├── hooks/              # Hooks React personnalisés
│   │   ├── useFactures.ts  # Gestion des factures
│   │   └── useImportPDF.ts # Import de PDF
│   ├── services/           # Services métier
│   │   └── factureService.ts # Service de gestion des factures
│   ├── types/              # Types TypeScript
│   │   └── facture.ts      # Types pour les factures
│   ├── App.tsx             # Composant principal
│   ├── main.tsx            # Point d'entrée
│   └── style.css           # Styles globaux
├── parsers/                # Parseurs pour chaque fournisseur
│   ├── index.ts            # Point d'entrée des parseurs
│   ├── rb-drinks.ts        # Parser RB DRINKS
│   ├── lehmann.ts          # Parser LEHMANN F
│   ├── italesse.ts         # Parser ITALESSE
│   └── types.ts            # Types pour les parseurs
├── RB DRINKS 2025/         # Dossiers de factures PDF
├── LEHMANN F 2025/
├── ITALESSE 2025/
└── package.json
```

## 🏗️ Architecture

### Modèle de données

Les factures sont normalisées avec la structure suivante :
- Informations générales (fournisseur, numéro, date)
- Lignes de produits (description, quantité, prix, TVA)
- Totaux (HT, TVA, TTC)

### Parseurs

Chaque fournisseur a son propre parser dans le dossier `parsers/`. Les parseurs sont structurés pour permettre l'ajout facile de nouveaux fournisseurs :

1. Créer un nouveau fichier parser (ex: `nouveau-fournisseur.ts`)
2. Implémenter l'interface `Parser`
3. Ajouter le parser dans `parsers/index.ts`

**Note** : Les parseurs actuels génèrent des données d'exemple. L'implémentation du parsing automatique des PDFs nécessitera une bibliothèque comme `pdf-parse` ou `pdfjs-dist`.

### Stockage

Les données sont stockées dans le `localStorage` du navigateur. Pour une utilisation en production, il faudra implémenter un backend avec une base de données.

## 🎨 Interface

L'application propose trois vues principales :

1. **Factures** : Liste des factures avec recherche et filtres, et panneau de détails
2. **Statistiques** : Vue d'ensemble avec totaux et statistiques par fournisseur
3. **Importer** : Interface d'import de fichiers PDF avec drag & drop

## 🔧 Scripts disponibles

- `npm run dev` : Lance le serveur de développement
- `npm run build` : Compile l'application pour la production
- `npm run preview` : Prévisualise la version de production
- `npm run lint` : Vérifie le code avec ESLint

## 📝 Notes

- Les parseurs génèrent actuellement des données d'exemple. Pour le parsing réel des PDFs, il faudra intégrer une bibliothèque de parsing PDF.
- Les données sont stockées localement dans le navigateur. Pensez à exporter régulièrement vos données.
- L'application est responsive et fonctionne sur mobile, tablette et desktop.

## 🚧 Améliorations futures

- [ ] Parsing automatique réel des fichiers PDF
- [ ] Export des données (CSV, Excel, PDF)
- [ ] Backend avec base de données
- [ ] Authentification utilisateur
- [ ] Gestion multi-utilisateurs
- [ ] Notifications et alertes
- [ ] Historique des modifications

## 📄 Licence

Ce projet est privé et destiné à un usage interne.








