# Guide : Système d'apprentissage du parsing

## 🎓 Comment fonctionne l'apprentissage automatique ?

Le système d'apprentissage permet à l'application de **mémoriser vos corrections** et de les réappliquer automatiquement sur les prochaines factures du même fournisseur.

## 📋 Vue d'ensemble

Quand vous corrigez une facture dans l'éditeur de parsing et que vous l'importez, le système :

1. **Compare** la facture originale (parsing initial) avec la facture corrigée (après vos modifications)
2. **Identifie** les différences (corrections de numéro, descriptions, montants, etc.)
3. **Mémorise** ces corrections comme règles d'apprentissage
4. **Applique** automatiquement ces règles aux prochaines factures similaires

## 🔄 Processus d'apprentissage

### Étape 1 : Parsing initial

Quand vous parsez une facture (ex: F1 de LEHMANN F), le système :
- Extrait les données du PDF avec le parser du fournisseur
- Crée une facture avec les données extraites
- Cette facture est la **facture originale**

### Étape 2 : Corrections dans l'éditeur

Vous pouvez modifier :
- ✅ Numéro de facture
- ✅ Date de facture
- ✅ Total HT / Total TTC
- ✅ **Montant HT** de chaque ligne (nouveau !)
- ✅ Prix unitaire HT
- ✅ Quantité
- ✅ Remise
- ✅ Description
- ✅ Référence fournisseur
- ✅ BAT
- ✅ Logo

### Étape 3 : Import et mémorisation

Quand vous cliquez sur **"Importer"**, le système :

1. **Extrait les règles** depuis la facture corrigée :
   - Patterns de numéro de facture
   - Structure des lignes
   - Modèle de parsing complet

2. **Apprend les corrections** :
   - Compare facture originale vs facture corrigée
   - Identifie les différences
   - Crée des règles de transformation

3. **Mémorise le modèle** :
   - Sauvegarde la structure complète de la facture corrigée
   - Crée un "profil" de facture basé sur la signature (mots-clés, structure, etc.)

### Étape 4 : Application automatique

Lors du parsing suivant d'une facture du même fournisseur :

1. Le système **génère une signature** de la nouvelle facture
2. **Compare** cette signature avec les profils mémorisés
3. **Trouve le profil le plus similaire** (si similarité ≥ 60%)
4. **Applique automatiquement** les règles apprises :
   - Nettoyage des descriptions
   - Corrections de patterns
   - Transformations de texte

## 📊 Système de profils

Le système utilise des **profils de factures** pour gérer différents formats au sein d'un même fournisseur.

### Exemple : LEHMANN F

Si LEHMANN F a deux types de factures :
- **Type 1** : Factures avec marquage (signature: `marquage|avec-bat|avec-logo`)
- **Type 2** : Factures sans marquage (signature: `sans-marquage`)

Le système créera deux profils :
- `lehmann-f-type1` : Règles pour les factures avec marquage
- `lehmann-f-type2` : Règles pour les factures sans marquage

### Signature d'une facture

La signature est générée à partir de :
- **Mots-clés** dans le texte brut (ex: "FATTURA RIEPILOGATIVA", "RELAIS DES COCHES")
- **Structure** : nombre de lignes
- **Champs présents** : BAT, Logo, Couleur
- **Format du numéro** : avec/sans slash

Exemple de signature : `lignes-15|avec-bat|avec-logo|numero-slash|relais-coches`

## ❓ Questions fréquentes

### Une seule facture suffit-elle ?

**Oui et non**, cela dépend :

#### ✅ **Oui, une seule facture suffit si :**
- Toutes les factures du fournisseur ont le **même format**
- Les corrections que vous faites sont **systématiques** (même type d'erreurs)
- Le format est **stable** (pas de variations importantes)

**Exemple** : Si toutes les factures LEHMANN F ont le même format et que vous corrigez toujours les mêmes choses, une seule facture (F1) peut suffire.

#### ⚠️ **Non, il faut plusieurs factures si :**
- Le fournisseur a **plusieurs formats** de factures
- Les factures varient selon le **type de commande** (marquage, sans marquage, etc.)
- Les **patterns d'extraction** sont différents selon les factures

**Exemple** : Si LEHMANN F a des factures avec marquage et d'autres sans, il faudra corriger au moins une facture de chaque type.

### Combien de factures pour bien apprendre ?

**Recommandation** :
- **Minimum** : 1 facture par format/type
- **Idéal** : 2-3 factures par format pour plus de robustesse
- **Maximum** : Pas de limite, mais après 5-10 factures par format, l'apprentissage est généralement optimal

### Le système apprend-il progressivement ?

**Oui !** Chaque fois que vous importez une facture corrigée :
- Les règles sont **mises à jour** (pas remplacées)
- Les profils sont **enrichis** avec de nouvelles corrections
- Le système devient **plus précis** au fil des utilisations

### Comment savoir si l'apprentissage fonctionne ?

**Indicateurs** :
1. **Console du navigateur** (F12) : Messages `[PARSING RULES]` montrant :
   - ✅ Règles apprises sauvegardées
   - ✅ Profil sélectionné
   - ✅ Règles appliquées

2. **Amélioration progressive** : Les prochaines factures nécessitent moins de corrections

3. **Application automatique** : Certaines corrections sont déjà appliquées au parsing initial

## 🎯 Bonnes pratiques

### 1. Corriger complètement la première facture

Prenez le temps de **corriger toutes les erreurs** sur la première facture :
- Numéro de facture
- Toutes les lignes (descriptions, montants, références)
- Totaux

### 2. Vérifier la cohérence

Assurez-vous que :
- Les montants HT des lignes correspondent aux totaux
- Les calculs sont corrects (quantité × prix unitaire - remise = montant HT)
- Les références sont cohérentes

### 3. Tester avec plusieurs factures

Après avoir corrigé une facture :
1. Parsez une **deuxième facture** du même type
2. Vérifiez si les corrections sont déjà appliquées
3. Si nécessaire, corrigez encore et réimportez

### 4. Gérer les différents formats

Si un fournisseur a plusieurs formats :
- Corrigez **au moins une facture de chaque format**
- Le système créera automatiquement des profils séparés
- Les profils seront appliqués selon la signature de chaque facture

## 🔍 Détails techniques

### Où sont stockées les règles ?

Les règles sont stockées dans le **localStorage** du navigateur sous la clé `parsing-rules`.

### Structure des données

```typescript
{
  fournisseur: "LEHMANN F",
  patternNumero: "\\d+\\/\\d+",
  exempleNumero: "1149/00",
  profils: [
    {
      identifiant: "lehmann-f-type1",
      signature: "lignes-15|avec-bat|avec-logo",
      reglesApprises: {
        nettoyageDescription: (desc) => { ... },
        transformations: [...]
      },
      nombreUtilisations: 5
    }
  ]
}
```

### Application des règles

Les règles sont appliquées dans `parsers/index.ts` via la fonction `appliquerReglesApprises()` qui :
1. Génère la signature de la facture parsée
2. Trouve le profil le plus similaire
3. Applique les transformations apprises

## 🐛 Dépannage

### Les règles ne sont pas appliquées

1. Vérifiez la console (F12) pour les messages `[PARSING RULES]`
2. Vérifiez que vous avez bien **importé** (pas seulement parsé) une facture corrigée
3. Vérifiez que la signature de la nouvelle facture correspond à un profil existant

### Les corrections ne sont pas mémorisées

1. Assurez-vous d'avoir cliqué sur **"Importer"** (pas seulement "Enregistrer")
2. Vérifiez que vous avez fait des **modifications** (pas seulement visualisé)
3. Vérifiez la console pour les erreurs

### Le système crée trop de profils

C'est normal si les factures ont des formats très différents. Chaque format unique crée son propre profil.

## 📈 Évolution future

Le système d'apprentissage peut être amélioré pour :
- Apprendre les patterns d'extraction automatiquement
- Détecter les erreurs courantes
- Suggérer des corrections automatiques
- Apprendre depuis plusieurs factures en une fois

---

**En résumé** : Le système apprend **progressivement** à partir de vos corrections. Une seule facture peut suffire si le format est uniforme, mais plusieurs factures permettent une meilleure robustesse, surtout si le fournisseur a plusieurs formats différents.





