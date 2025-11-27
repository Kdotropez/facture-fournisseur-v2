/**
 * Service pour gérer les règles de parsing personnalisées par fournisseur
 * Permet de mémoriser les corrections faites dans l'éditeur
 */

import type { Fournisseur, Facture } from '../types/facture';

export interface ParsingRule {
  fournisseur: Fournisseur;
  patternNumero?: string; // Pattern regex pour extraire le numéro de facture
  exempleNumero?: string; // Exemple de numéro corrigé
  corrections?: {
    [key: string]: any; // Corrections spécifiques par fournisseur
  };
  dateDerniereUtilisation?: Date;
  nombreUtilisations?: number;
  // Nouvelles propriétés pour l'apprentissage
  reglesApprises?: {
    nettoyageDescription?: (description: string) => string;
    extractionReference?: (texte: string, ligne: any) => string;
    extractionBAT?: (texte: string, ligne: any) => string;
    extractionLogo?: (texte: string, ligne: any) => string;
    extractionMontant?: (texte: string) => number;
    structureLignes?: {
      nombreColonnes?: number;
      ordreColonnes?: string[];
      separateurs?: string[];
    };
    transformations?: Array<{
      pattern: string;
      remplacement: string;
      champ: string;
    }>;
  };
}

const STORAGE_KEY = 'parsing-rules';

/**
 * Charge toutes les règles de parsing depuis le stockage local
 */
export function chargerReglesParsing(): Map<Fournisseur, ParsingRule> {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY);
    if (!donnees) return new Map();
    
    const regles = JSON.parse(donnees) as ParsingRule[];
    const map = new Map<Fournisseur, ParsingRule>();
    
    regles.forEach(regle => {
      map.set(regle.fournisseur, {
        ...regle,
        dateDerniereUtilisation: regle.dateDerniereUtilisation 
          ? new Date(regle.dateDerniereUtilisation) 
          : undefined,
      });
    });
    
    return map;
  } catch (error) {
    console.error('Erreur lors du chargement des règles de parsing:', error);
    return new Map();
  }
}

/**
 * Sauvegarde toutes les règles de parsing dans le stockage local
 */
export function sauvegarderReglesParsing(regles: Map<Fournisseur, ParsingRule>): void {
  try {
    const reglesArray = Array.from(regles.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reglesArray));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des règles de parsing:', error);
    throw error;
  }
}

/**
 * Obtient la règle de parsing pour un fournisseur donné
 */
export function obtenirRegleParsing(fournisseur: Fournisseur): ParsingRule | undefined {
  const regles = chargerReglesParsing();
  return regles.get(fournisseur);
}

/**
 * Sauvegarde ou met à jour une règle de parsing pour un fournisseur
 */
export function sauvegarderRegleParsing(regle: ParsingRule): void {
  const regles = chargerReglesParsing();
  
  const regleExistante = regles.get(regle.fournisseur);
  const regleMiseAJour: ParsingRule = {
    ...regleExistante,
    ...regle,
    dateDerniereUtilisation: new Date(),
    nombreUtilisations: (regleExistante?.nombreUtilisations || 0) + 1,
  };
  
  regles.set(regle.fournisseur, regleMiseAJour);
  sauvegarderReglesParsing(regles);
}

/**
 * Extrait et sauvegarde les règles depuis une facture corrigée
 * Apprend automatiquement les patterns pour améliorer le parsing futur
 */
export function extraireReglesDepuisFacture(
  fournisseur: Fournisseur,
  numeroFacture: string,
  texteBrut?: string
): void {
  // Charger la règle existante pour la mettre à jour
  const regleExistante = obtenirRegleParsing(fournisseur);
  
  // Extraire le pattern du numéro de facture si possible
  let patternNumero: string | undefined = regleExistante?.patternNumero;
  
  if (texteBrut && numeroFacture) {
    // Essayer de trouver le pattern dans le texte brut
    // Par exemple, si on trouve "Numero doc./Doc. No. 1149/00" et le numéro est "1149"
    const patterns = [
      /Numero\s+doc\.\s*\/\s*Doc\.\s*No\.\s*([0-9]+\/[0-9]+)/i,
      /Numero\s+doc\.\/Doc\.\s*No\.\s*([0-9]+\/[0-9]+)/i,
      /Numero\s+doc\.\/\s*Doc\.\s*No\.\s*([0-9]+\/[0-9]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = texteBrut.match(pattern);
      if (match && match[1]) {
        // Créer un pattern générique plus robuste
        // Exemple: "1149/00" -> "\\d+\\/\\d+" mais on garde le format exact trouvé
        const formatTrouve = match[1];
        // Si le format contient un slash, créer un pattern générique
        if (formatTrouve.includes('/')) {
          patternNumero = formatTrouve.replace(/\d+/g, '\\d+');
        } else {
          patternNumero = formatTrouve.replace(/\d+/g, '\\d+');
        }
        break;
      }
    }
  }
  
  // Mettre à jour la règle existante ou créer une nouvelle
  const regle: ParsingRule = {
    fournisseur,
    patternNumero: patternNumero || regleExistante?.patternNumero,
    exempleNumero: numeroFacture, // Toujours mettre à jour avec le dernier exemple
    corrections: {
      ...regleExistante?.corrections,
      // Ajouter d'autres corrections si nécessaire
    },
    dateDerniereUtilisation: new Date(),
    nombreUtilisations: (regleExistante?.nombreUtilisations || 0) + 1,
  };
  
  sauvegarderRegleParsing(regle);
  console.log(`[PARSING RULES] ✅ Règle apprise et sauvegardée pour ${fournisseur}:`, {
    patternNumero: regle.patternNumero,
    exempleNumero: regle.exempleNumero,
    nombreUtilisations: regle.nombreUtilisations,
  });
}

/**
 * Utilise les règles apprises pour extraire le numéro de facture
 * Retourne le numéro si trouvé, sinon undefined
 */
export function utiliserReglePourNumero(
  fournisseur: Fournisseur,
  textePDF: string
): string | undefined {
  const regle = obtenirRegleParsing(fournisseur);
  if (!regle) return undefined;
  
  // Si on a un pattern sauvegardé, l'utiliser en priorité
  if (regle.patternNumero) {
    try {
      const regex = new RegExp(regle.patternNumero, 'i');
      const match = textePDF.match(regex);
      if (match && match[1]) {
        let numeroBrut = match[1].trim();
        // Si format avec slash, prendre la partie avant
        if (numeroBrut.includes('/')) {
          const parties = numeroBrut.split('/');
          numeroBrut = parties[0].trim();
        }
        if (/^\d{3,}$/.test(numeroBrut)) {
          console.log(`[PARSING RULES] Numéro extrait avec règle apprise pour ${fournisseur}: ${numeroBrut}`);
          return numeroBrut;
        }
      }
    } catch (error) {
      console.warn(`[PARSING RULES] Erreur avec le pattern sauvegardé pour ${fournisseur}:`, error);
    }
  }
  
  // Si on a un exemple de numéro, essayer de le trouver dans le texte
  if (regle.exempleNumero) {
    // Chercher le pattern "Numero doc./Doc. No." avec le format appris
    const patterns = [
      new RegExp(`Numero\\s+doc\\.\\s*\\/\\s*Doc\\.\\s*No\\.\\s*([0-9]+(?:\\/[0-9]+)?)`, 'i'),
      new RegExp(`Numero\\s+doc\\.\\/Doc\\.\\s*No\\.\\s*([0-9]+(?:\\/[0-9]+)?)`, 'i'),
    ];
    
    for (const pattern of patterns) {
      const match = textePDF.match(pattern);
      if (match && match[1]) {
        let numeroBrut = match[1].trim();
        if (numeroBrut.includes('/')) {
          const parties = numeroBrut.split('/');
          numeroBrut = parties[0].trim();
        }
        if (/^\d{3,}$/.test(numeroBrut)) {
          console.log(`[PARSING RULES] Numéro extrait avec pattern appris pour ${fournisseur}: ${numeroBrut}`);
          return numeroBrut;
        }
      }
    }
  }
  
  return undefined;
}

/**
 * Mémorise un modèle de parsing complet pour un fournisseur
 * Stocke la structure complète de la facture corrigée comme modèle
 */
export function memoriserModeleParsing(
  fournisseur: Fournisseur,
  factureCorrigee: Facture,
  texteBrut: string
): void {
  console.log(`[PARSING RULES] Mémorisation du modèle de parsing pour ${fournisseur}...`);
  
  const regles = chargerReglesParsing();
  const regleExistante = regles.get(fournisseur);
  
  // Créer un modèle de parsing basé sur la facture corrigée
  const modeleParsing = {
    numeroFacture: factureCorrigee.numero,
    dateFacture: factureCorrigee.date.toISOString(),
    nombreLignes: factureCorrigee.lignes.length,
    structureLignes: factureCorrigee.lignes.map(ligne => ({
      refFournisseur: ligne.refFournisseur,
      description: ligne.description,
      bat: ligne.bat,
      logo: ligne.logo,
      couleur: ligne.couleur,
      quantite: ligne.quantite,
      prixUnitaireHT: ligne.prixUnitaireHT,
      remise: ligne.remise,
      montantHT: ligne.montantHT,
    })),
    totalHT: factureCorrigee.totalHT,
    totalTVA: factureCorrigee.totalTVA,
    totalTTC: factureCorrigee.totalTTC,
    texteBrut: texteBrut.substring(0, 10000), // Limiter à 10k caractères pour le stockage
  };
  
  const regleMiseAJour: ParsingRule = {
    fournisseur,
    ...regleExistante,
    corrections: {
      ...regleExistante?.corrections,
      modeleParsing,
    },
    dateDerniereUtilisation: new Date(),
    nombreUtilisations: (regleExistante?.nombreUtilisations || 0) + 1,
  };
  
  regles.set(fournisseur, regleMiseAJour);
  sauvegarderReglesParsing(regles);
  console.log(`[PARSING RULES] ✅ Modèle de parsing mémorisé pour ${fournisseur}.`, {
    nombreLignes: modeleParsing.nombreLignes,
    totalHT: modeleParsing.totalHT,
  });
}

/**
 * Analyse les corrections faites dans l'éditeur et apprend les règles
 * Compare factureOriginale (parsing initial) et factureCorrigee (après édition)
 */
export function apprendreCorrections(
  fournisseur: Fournisseur,
  factureOriginale: Facture,
  factureCorrigee: Facture,
  _texteBrut: string
): void {
  console.log(`[PARSING RULES] 🎓 Apprentissage des corrections pour ${fournisseur}...`);
  
  const regles = chargerReglesParsing();
  const regleExistante = regles.get(fournisseur);
  
  const reglesApprises: ParsingRule['reglesApprises'] = {
    ...regleExistante?.reglesApprises,
  };
  
  // 1. Apprendre les corrections de numéro de facture
  if (factureOriginale.numero !== factureCorrigee.numero) {
    console.log(`[PARSING RULES] 📝 Numéro corrigé: "${factureOriginale.numero}" → "${factureCorrigee.numero}"`);
    // Le pattern est déjà extrait par extraireReglesDepuisFacture
  }
  
  // 2. Apprendre les corrections de descriptions
  const correctionsDescription: Array<{ avant: string; apres: string }> = [];
  factureOriginale.lignes.forEach((ligneOrig, index) => {
    const ligneCorr = factureCorrigee.lignes[index];
    if (ligneCorr && ligneOrig.description !== ligneCorr.description) {
      correctionsDescription.push({
        avant: ligneOrig.description,
        apres: ligneCorr.description,
      });
    }
  });
  
  if (correctionsDescription.length > 0) {
    console.log(`[PARSING RULES] 📝 ${correctionsDescription.length} descriptions corrigées`);
    // Créer une fonction de nettoyage basée sur les corrections
    reglesApprises.nettoyageDescription = (description: string) => {
      // Appliquer les transformations apprises
      for (const correction of correctionsDescription) {
        if (description.includes(correction.avant)) {
          description = description.replace(correction.avant, correction.apres);
        }
      }
      return description;
    };
  }
  
  // 3. Apprendre les corrections de références
  const correctionsReference: Array<{ avant: string; apres: string }> = [];
  factureOriginale.lignes.forEach((ligneOrig, index) => {
    const ligneCorr = factureCorrigee.lignes[index];
    if (ligneCorr && ligneOrig.refFournisseur !== ligneCorr.refFournisseur) {
      correctionsReference.push({
        avant: ligneOrig.refFournisseur || '',
        apres: ligneCorr.refFournisseur || '',
      });
    }
  });
  
  if (correctionsReference.length > 0) {
    console.log(`[PARSING RULES] 📝 ${correctionsReference.length} références corrigées`);
  }
  
  // 4. Apprendre les corrections de BAT
  const correctionsBAT: Array<{ avant: string; apres: string }> = [];
  factureOriginale.lignes.forEach((ligneOrig, index) => {
    const ligneCorr = factureCorrigee.lignes[index];
    if (ligneCorr && ligneOrig.bat !== ligneCorr.bat) {
      correctionsBAT.push({
        avant: ligneOrig.bat || '',
        apres: ligneCorr.bat || '',
      });
    }
  });
  
  if (correctionsBAT.length > 0) {
    console.log(`[PARSING RULES] 📝 ${correctionsBAT.length} BAT corrigés`);
  }
  
  // 5. Apprendre les corrections de Logo
  const correctionsLogo: Array<{ avant: string; apres: string }> = [];
  factureOriginale.lignes.forEach((ligneOrig, index) => {
    const ligneCorr = factureCorrigee.lignes[index];
    if (ligneCorr && ligneOrig.logo !== ligneCorr.logo) {
      correctionsLogo.push({
        avant: ligneOrig.logo || '',
        apres: ligneCorr.logo || '',
      });
    }
  });
  
  if (correctionsLogo.length > 0) {
    console.log(`[PARSING RULES] 📝 ${correctionsLogo.length} logos corrigés`);
  }
  
  // 6. Apprendre les corrections de montants
  const correctionsMontants: Array<{ avant: number; apres: number }> = [];
  factureOriginale.lignes.forEach((ligneOrig, index) => {
    const ligneCorr = factureCorrigee.lignes[index];
    if (ligneCorr && Math.abs(ligneOrig.montantHT - ligneCorr.montantHT) > 0.01) {
      correctionsMontants.push({
        avant: ligneOrig.montantHT,
        apres: ligneCorr.montantHT,
      });
    }
  });
  
  if (correctionsMontants.length > 0) {
    console.log(`[PARSING RULES] 📝 ${correctionsMontants.length} montants corrigés`);
  }
  
  // 7. Apprendre la structure des lignes (si des lignes ont été ajoutées/supprimées)
  const differenceLignes = factureCorrigee.lignes.length - factureOriginale.lignes.length;
  if (differenceLignes !== 0) {
    console.log(`[PARSING RULES] 📝 Structure modifiée: ${differenceLignes > 0 ? '+' : ''}${differenceLignes} lignes`);
  }
  
  // 8. Apprendre les transformations de texte (patterns à remplacer)
  const transformations: Array<{ pattern: string; remplacement: string; champ: string }> = [];
  
  // Analyser les patterns communs dans les corrections
  correctionsDescription.forEach(corr => {
    // Si la correction supprime un pattern récurrent
    const patternSupprime = extrairePatternCommun(corr.avant, corr.apres);
    if (patternSupprime) {
      transformations.push({
        pattern: patternSupprime,
        remplacement: '',
        champ: 'description',
      });
    }
  });
  
  // Mettre à jour la règle avec les apprentissages
  const regleMiseAJour: ParsingRule = {
    fournisseur,
    ...regleExistante,
    reglesApprises: {
      ...reglesApprises,
      transformations: [
        ...(regleExistante?.reglesApprises?.transformations || []),
        ...transformations,
      ],
    },
    dateDerniereUtilisation: new Date(),
    nombreUtilisations: (regleExistante?.nombreUtilisations || 0) + 1,
  };
  
  regles.set(fournisseur, regleMiseAJour);
  sauvegarderReglesParsing(regles);
  
  console.log(`[PARSING RULES] ✅ Règles apprises sauvegardées pour ${fournisseur}:`, {
    descriptions: correctionsDescription.length,
    references: correctionsReference.length,
    bat: correctionsBAT.length,
    logos: correctionsLogo.length,
    montants: correctionsMontants.length,
    transformations: transformations.length,
  });
}

/**
 * Extrait un pattern commun entre deux chaînes
 * Utile pour identifier les patterns à supprimer/remplacer
 */
function extrairePatternCommun(avant: string, apres: string): string | null {
  // Si "apres" est une sous-chaîne de "avant", on a probablement supprimé quelque chose
  if (avant.includes(apres) && avant.length > apres.length) {
    const debut = avant.indexOf(apres);
    if (debut > 0) {
      // Pattern au début
      return avant.substring(0, debut).trim();
    } else {
      // Pattern à la fin ou au milieu
      const fin = avant.lastIndexOf(apres);
      if (fin + apres.length < avant.length) {
        return avant.substring(fin + apres.length).trim();
      }
    }
  }
  return null;
}

/**
 * Applique les règles apprises à une facture parsée
 */
export function appliquerReglesApprises(
  fournisseur: Fournisseur,
  facture: Facture
): Facture {
  const regle = obtenirRegleParsing(fournisseur);
  if (!regle?.reglesApprises) {
    return facture;
  }
  
  const reglesApprises = regle.reglesApprises;
  let factureCorrigee = { ...facture };
  
  // Appliquer les transformations de description
  if (reglesApprises.nettoyageDescription) {
    factureCorrigee.lignes = factureCorrigee.lignes.map(ligne => ({
      ...ligne,
      description: reglesApprises.nettoyageDescription!(ligne.description),
    }));
  }
  
  // Appliquer les transformations de patterns
  if (reglesApprises.transformations && reglesApprises.transformations.length > 0) {
    factureCorrigee.lignes = factureCorrigee.lignes.map(ligne => {
      let ligneCorrigee = { ...ligne };
      
      reglesApprises.transformations!.forEach(transformation => {
        if (transformation.champ === 'description') {
          ligneCorrigee.description = ligneCorrigee.description.replace(
            new RegExp(transformation.pattern, 'gi'),
            transformation.remplacement
          );
        }
      });
      
      return ligneCorrigee;
    });
  }
  
  return factureCorrigee;
}

/**
 * Supprime une règle de parsing pour un fournisseur
 */
export function supprimerRegleParsing(fournisseur: Fournisseur): void {
  const regles = chargerReglesParsing();
  regles.delete(fournisseur);
  sauvegarderReglesParsing(regles);
}

