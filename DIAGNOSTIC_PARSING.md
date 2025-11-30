# Diagnostic du Système d'Apprentissage

## Comment vérifier si le système fonctionne

### 1. Ouvrir la console du navigateur
- Appuyez sur `F12` ou `Ctrl+Shift+I`
- Allez dans l'onglet "Console"

### 2. Parser une facture
- Allez dans l'éditeur de parsing
- Parsez une facture que vous avez déjà corrigée précédemment

### 3. Vérifier les messages dans la console

Vous devriez voir des messages comme :
```
[PARSING RULES] 🔍 Application des règles pour LEHMANN F...
[PARSING RULES] ✅ Règle trouvée, 1 profil(s) disponible(s)
[PARSING RULES] 📝 Signature de la facture: ...
[PARSING RULES] ✅ Profil "lehmann-f-type1" sélectionné
[PARSING RULES] 🎯 Utilisation du modèle complet mémorisé (5 lignes)
```

### 4. Si ça ne fonctionne pas

#### Problème : "Aucune règle trouvée"
**Solution :** Vous devez d'abord corriger et importer au moins une facture pour que le système apprenne.

#### Problème : "Aucun profil similaire trouvé"
**Causes possibles :**
- La structure de la facture est trop différente (nombre de lignes très différent)
- La signature ne correspond pas (format de facture différent)

**Solution :** Corrigez et importez cette facture pour créer un nouveau profil.

#### Problème : "Pas de texte brut"
**Solution :** Le texte brut doit être disponible dans `donneesBrutes.texteComplet`. Vérifiez que le parser extrait bien le texte complet.

### 5. Vérifier les règles sauvegardées

Dans la console, tapez :
```javascript
const regles = JSON.parse(localStorage.getItem('parsing-rules') || '{}');
console.log(regles);
```

Cela affichera toutes les règles apprises.

### 6. Réinitialiser les règles (si nécessaire)

Si vous voulez recommencer à zéro :
```javascript
localStorage.removeItem('parsing-rules');
location.reload();
```

## Comment ça fonctionne maintenant

### Système simplifié

Le système utilise maintenant principalement le **modèle complet mémorisé** :

1. **Quand vous corrigez une facture** :
   - Le système mémorise la facture complète corrigée
   - Il crée un "profil" avec cette facture comme modèle

2. **Quand vous parsez une nouvelle facture** :
   - Le système cherche un profil similaire
   - Si le nombre de lignes correspond (avec une tolérance de 10%), il utilise le modèle mémorisé
   - Les descriptions, références, quantités, prix sont copiés depuis le modèle

### Avantages

✅ **Simple et fiable** : Le modèle complet est plus fiable que l'extraction depuis le texte

✅ **Tolérance** : Accepte des différences de ±10% sur le nombre de lignes

✅ **Adaptation** : Si le nombre de lignes diffère, le système adapte le modèle

### Limitations

⚠️ **Nombre de lignes** : Le système fonctionne mieux si les factures ont le même nombre de lignes (ou presque)

⚠️ **Structure identique** : Les factures doivent avoir la même structure (même type de produits)

## Prochaines étapes

Si le système ne fonctionne toujours pas :

1. **Vérifiez la console** pour voir les messages d'erreur
2. **Corrigez et importez** au moins une facture de chaque type
3. **Testez** avec une facture similaire
4. **Partagez les messages de la console** si vous avez besoin d'aide

