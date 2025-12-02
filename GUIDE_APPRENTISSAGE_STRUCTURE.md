# Guide : Apprentissage de la Structure des Factures

## Vue d'ensemble

Le système apprend non seulement les **valeurs** que vous corrigez, mais aussi la **structure** et la **position** des éléments dans la facture. Cela permet au système de savoir :

- **Quels éléments** vous gardez (description, référence, BAT, logo, quantité, prix, montant)
- **Où ils se trouvent** dans le texte brut (positions, ordre des colonnes)
- **Comment les extraire** pour les prochaines factures similaires

## Comment ça fonctionne

### 1. Lors de la correction d'une facture

Quand vous corrigez une facture dans l'éditeur de parsing et que vous l'importez, le système :

1. **Compare** la facture originale (parsée automatiquement) avec la facture corrigée
2. **Analyse le texte brut** du PDF pour trouver où se trouvent les éléments que vous avez gardés
3. **Mémorise** :
   - L'ordre des colonnes dans le texte
   - Les positions approximatives de chaque champ
   - Des exemples de lignes extraites
   - Les patterns pour identifier chaque type de champ

### 2. Lors du parsing d'une nouvelle facture

Quand vous parsez une nouvelle facture du même fournisseur avec une structure similaire :

1. Le système **identifie** le profil de facture le plus similaire
2. Si une structure d'extraction a été apprise, il **l'applique** :
   - Cherche les lignes dans le texte brut en utilisant les positions apprises
   - Extrait chaque champ selon l'ordre et les patterns mémorisés
   - Reconstruit les lignes de produits avec les bonnes valeurs

## Exemple concret

### Scénario : Facture LEHMANN F

**Facture originale parsée :**
```
Description: "Produit LEHMANN F"
Quantité: 1
Prix unitaire: 0
Montant HT: 0
```

**Après votre correction :**
```
Description: "Verre à vin 25cl"
Référence: "VW25"
Quantité: 100
Prix unitaire: 1.50
Montant HT: 150.00
```

**Ce que le système apprend :**

1. **Structure détectée dans le texte brut :**
   ```
   Verre à vin 25cl  VW25  100  1.50 €  150.00 €
   ```

2. **Ordre des colonnes appris :**
   - Description → Référence → Quantité → Prix unitaire → Montant HT

3. **Positions mémorisées :**
   - Description : position 0-20
   - Référence : position 21-25
   - Quantité : position 26-29
   - Prix unitaire : position 30-35
   - Montant HT : position 36-43

4. **Patterns créés :**
   - Description : texte libre
   - Quantité : `[\d\s,\.]+`
   - Prix unitaire : `[\d\s,\.]+`
   - Montant HT : `[\d\s,\.]+`

### Application sur une nouvelle facture

Lors du parsing de la facture F2 de LEHMANN F :

1. Le système détecte que c'est le même type de facture (même profil)
2. Il applique la structure apprise :
   - Cherche les lignes dans le texte brut
   - Extrait chaque champ selon les positions mémorisées
   - Reconstruit automatiquement les lignes avec les bonnes valeurs

**Résultat :** La facture F2 est parsée correctement dès le premier essai, sans correction manuelle nécessaire !

## Avantages

✅ **Apprentissage progressif** : Plus vous corrigez, plus le système devient précis

✅ **Reconnaissance de structure** : Le système comprend où se trouvent les informations dans le PDF

✅ **Extraction automatique** : Les prochaines factures similaires sont parsées automatiquement

✅ **Adaptation** : Le système s'adapte à différents formats de factures du même fournisseur

## Conseils pour optimiser l'apprentissage

1. **Corrigez complètement** : Assurez-vous de corriger tous les champs importants (description, référence, quantités, prix)

2. **Gardez la cohérence** : Si vous modifiez la structure (ajout/suppression de colonnes), le système apprendra cette nouvelle structure

3. **Plusieurs exemples** : Pour les fournisseurs avec plusieurs formats de factures, corrigez au moins une facture de chaque format

4. **Vérifiez les résultats** : Après avoir corrigé quelques factures, testez le parsing d'une nouvelle facture pour voir si le système a bien appris

## Limitations

- Le système apprend à partir des **corrections que vous faites** : si vous ne corrigez pas un champ, il ne saura pas où le trouver
- Les **positions** sont approximatives : le système utilise une marge pour gérer les variations mineures
- Pour les factures avec des **structures très différentes**, il faudra peut-être créer un nouveau profil

## Voir les règles apprises

Les règles apprises sont stockées dans le `localStorage` du navigateur. Vous pouvez les consulter dans la console du navigateur (F12) en cherchant les messages `[PARSING RULES]`.


