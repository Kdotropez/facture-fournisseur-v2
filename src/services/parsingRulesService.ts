/**
 * Service pour gérer les règles de parsing personnalisées par fournisseur
 * Permet de mémoriser les corrections faites dans l'éditeur
 */

import type { Fournisseur, Facture } from '../types/facture';
import { memoriserReferencesDepuisFacture } from './referencesFournisseurService';

export interface ProfilFacture {
  identifiant: string; // Identifiant unique du profil (ex: "italesse-type1", "italesse-type2")
  signature: string; // Signature du format (mots-clés, structure, etc.)
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
    // Structure d'extraction apprise depuis le texte brut
    structureExtraction?: {
      // Patterns pour identifier les lignes dans le texte
      patternLignes?: string;
      // Ordre des colonnes dans le texte brut
      ordreColonnesTexte?: string[];
      // Patterns pour extraire chaque champ depuis le texte
      patternsChamps?: Record<string, string>;
      // Positions approximatives des colonnes (pour extraction par position)
      positionsColonnes?: Record<string, { debut: number; fin: number }>;
      // Exemples de lignes extraites (pour référence)
      exemplesLignes?: Array<{
        texteBrut: string;
        elements: Record<string, string>;
      }>;
    };
  };
  modeleParsing?: {
    numeroFacture?: string;
    dateFacture?: string;
    nombreLignes?: number;
    structureLignes?: any[];
    totalHT?: number;
    totalTVA?: number;
    totalTTC?: number;
    factureComplete?: Facture; // Facture complète mémorisée pour réutilisation
  };
  dateDerniereUtilisation?: Date;
  nombreUtilisations?: number;
}

export interface ParsingRule {
  fournisseur: Fournisseur;
  patternNumero?: string; // Pattern regex pour extraire le numéro de facture (général)
  exempleNumero?: string; // Exemple de numéro corrigé
  corrections?: {
    [key: string]: any; // Corrections spécifiques par fournisseur
  };
  dateDerniereUtilisation?: Date;
  nombreUtilisations?: number;
  // Profils de factures différents pour le même fournisseur
  profils?: ProfilFacture[];
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
      // Convertir les dates dans les profils
      const profils = regle.profils?.map(profil => {
        let factureComplete: Facture | undefined;
        
        // Convertir la facture complète si elle existe
        if (profil.modeleParsing?.factureComplete) {
          const fc = profil.modeleParsing.factureComplete as any;
          factureComplete = {
            ...fc,
            date: new Date(fc.date),
            dateLivraison: fc.dateLivraison ? new Date(fc.dateLivraison) : undefined,
            dateImport: new Date(fc.dateImport),
            lignes: fc.lignes || [],
          } as Facture;
        }
        
        return {
          ...profil,
          dateDerniereUtilisation: profil.dateDerniereUtilisation 
            ? new Date(profil.dateDerniereUtilisation) 
            : undefined,
          modeleParsing: profil.modeleParsing ? {
            ...profil.modeleParsing,
            factureComplete,
          } : undefined,
        };
      }) || [];
      
      map.set(regle.fournisseur, {
        ...regle,
        profils,
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
  
  // Générer la signature pour associer le modèle au bon profil
  const signature = genererSignatureFacture(factureCorrigee, texteBrut);
  
  // Initialiser les profils si nécessaire
  let regle = regleExistante;
  if (!regle) {
    regle = {
      fournisseur,
      profils: [],
    };
    regles.set(fournisseur, regle);
  }
  
  if (!regle.profils) {
    regle.profils = [];
  }
  
  // Trouver ou créer le profil correspondant
  let profil = regle.profils.find(p => p.signature === signature);
  if (!profil) {
    const identifiant = `${fournisseur.toLowerCase().replace(/\s+/g, '-')}-type${regle.profils.length + 1}`;
    profil = {
      identifiant,
      signature,
      reglesApprises: {},
      dateDerniereUtilisation: new Date(),
      nombreUtilisations: 0,
    };
    regle.profils.push(profil);
  }
  
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
    factureComplete: factureCorrigee, // Sauvegarder la facture complète pour réutilisation
    texteBrut: texteBrut.substring(0, 10000), // Limiter à 10k caractères pour le stockage
  };
  
  // Stocker le modèle dans le profil
  profil.modeleParsing = modeleParsing;
  profil.dateDerniereUtilisation = new Date();
  profil.nombreUtilisations = (profil.nombreUtilisations || 0) + 1;
  
  // Mettre à jour la règle globale
  regle.dateDerniereUtilisation = new Date();
  regle.nombreUtilisations = (regle.nombreUtilisations || 0) + 1;
  
  regles.set(fournisseur, regle);
  sauvegarderReglesParsing(regles);
  
  // Mémoriser les références fournisseur depuis la facture corrigée
  memoriserReferencesDepuisFacture(factureCorrigee);
  
  console.log(`[PARSING RULES] ✅ Modèle de parsing mémorisé pour ${fournisseur} (profil: ${profil.identifiant}).`, {
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
  texteBrut: string
): void {
  console.log(`[PARSING RULES] 🎓 Apprentissage des corrections pour ${fournisseur}...`);
  
  const regles = chargerReglesParsing();
  
  // Générer la signature de la facture corrigée
  const signature = genererSignatureFacture(factureCorrigee, texteBrut);
  console.log(`[PARSING RULES] Signature de la facture corrigée: ${signature}`);
  
  // Initialiser les profils si nécessaire
  let regle = regles.get(fournisseur);
  if (!regle) {
    regle = {
      fournisseur,
      profils: [],
    };
    regles.set(fournisseur, regle);
  }
  
  if (!regle.profils) {
    regle.profils = [];
  }
  
  // Chercher un profil existant avec la même signature
  let profil = regle.profils.find(p => p.signature === signature);
  
  if (!profil) {
    // Créer un nouveau profil
    const identifiant = `${fournisseur.toLowerCase().replace(/\s+/g, '-')}-type${regle.profils.length + 1}`;
    profil = {
      identifiant,
      signature,
      reglesApprises: {},
      dateDerniereUtilisation: new Date(),
      nombreUtilisations: 0,
    };
    regle.profils.push(profil);
    console.log(`[PARSING RULES] 📝 Nouveau profil créé: ${identifiant}`);
  } else {
    console.log(`[PARSING RULES] 📝 Mise à jour du profil existant: ${profil.identifiant}`);
  }
  
  const reglesApprises = profil.reglesApprises || {};
  
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
  
  // 7. Apprendre la structure d'extraction depuis le texte brut
  // Analyser comment les lignes sont structurées dans le texte pour réutiliser cette structure
  if (texteBrut && factureCorrigee.lignes.length > 0) {
    console.log(`[PARSING RULES] 📝 Apprentissage de la structure d'extraction...`);
    
    // Essayer de trouver les lignes dans le texte brut en cherchant les descriptions
    const exemplesLignes: Array<{ texteBrut: string; elements: Record<string, string> }> = [];
    
    factureCorrigee.lignes.forEach((ligne, index) => {
      // Chercher la description dans le texte brut
      const descriptionRecherchee = ligne.description.substring(0, 50); // Prendre les 50 premiers caractères
      const indexDansTexte = texteBrut.indexOf(descriptionRecherchee);
      
      if (indexDansTexte >= 0) {
        // Extraire la ligne complète du texte (environ 200 caractères autour)
        const debut = Math.max(0, indexDansTexte - 20);
        const fin = Math.min(texteBrut.length, indexDansTexte + 200);
        const ligneTexte = texteBrut.substring(debut, fin);
        
        // Identifier les éléments de cette ligne
        const elements: Record<string, string> = {
          description: ligne.description,
        };
        
        if (ligne.refFournisseur) elements.refFournisseur = ligne.refFournisseur;
        if (ligne.bat) elements.bat = ligne.bat;
        if (ligne.logo) elements.logo = ligne.logo;
        if (ligne.quantite) elements.quantite = ligne.quantite.toString();
        if (ligne.prixUnitaireHT) elements.prixUnitaireHT = ligne.prixUnitaireHT.toString();
        if (ligne.montantHT) elements.montantHT = ligne.montantHT.toString();
        
        exemplesLignes.push({
          texteBrut: ligneTexte,
          elements,
        });
      }
    });
    
    if (exemplesLignes.length > 0) {
      // Analyser les patterns communs dans les exemples
      const ordreColonnesTexte: string[] = [];
      const patternsChamps: Record<string, string> = {};
      const positionsColonnes: Record<string, { debut: number; fin: number }> = {};
      
      // Détecter l'ordre des colonnes en analysant les positions dans le texte
      const positionsMoyennes: Record<string, number[]> = {};
      
      exemplesLignes.forEach(exemple => {
        const positions: Array<{ champ: string; position: number; longueur: number }> = [];
        
        Object.entries(exemple.elements).forEach(([champ, valeur]) => {
          if (valeur && valeur.trim()) {
            const index = exemple.texteBrut.indexOf(valeur);
            if (index >= 0) {
              positions.push({ champ, position: index, longueur: valeur.length });
              
              // Accumuler les positions pour calculer une moyenne
              if (!positionsMoyennes[champ]) {
                positionsMoyennes[champ] = [];
              }
              positionsMoyennes[champ].push(index);
            }
          }
        });
        
        // Trier par position pour déterminer l'ordre
        positions.sort((a, b) => a.position - b.position);
        const ordre = positions.map(p => p.champ);
        
        // Si c'est le premier exemple ou si l'ordre est cohérent, l'utiliser
        if (ordre.length > 0) {
          if (ordreColonnesTexte.length === 0) {
            ordreColonnesTexte.push(...ordre);
          } else {
            // Vérifier la cohérence avec l'ordre déjà établi
            const ordreCommun = ordre.filter(c => ordreColonnesTexte.includes(c));
            if (ordreCommun.length === ordreColonnesTexte.length) {
              // L'ordre est cohérent, on peut l'utiliser
              ordreColonnesTexte.length = 0;
              ordreColonnesTexte.push(...ordre);
            }
          }
        }
      });
      
      // Calculer les positions moyennes et les écarts types pour chaque champ
      Object.entries(positionsMoyennes).forEach(([champ, positions]) => {
        if (positions.length > 0) {
          const moyenne = positions.reduce((a, b) => a + b, 0) / positions.length;
          const min = Math.min(...positions);
          const max = Math.max(...positions);
          
          // Créer une plage de positions avec un peu de marge
          const marge = Math.max(10, (max - min) / 2);
          positionsColonnes[champ] = {
            debut: Math.max(0, Math.floor(min - marge)),
            fin: Math.ceil(max + marge),
          };
        }
      });
      
      // Créer des patterns pour extraire chaque champ
      // Utiliser des patterns plus flexibles basés sur les exemples
      exemplesLignes.forEach(exemple => {
        Object.entries(exemple.elements).forEach(([champ, valeur]) => {
          if (valeur && valeur.trim() && !patternsChamps[champ]) {
            // Pour les nombres, créer un pattern plus flexible
            if (champ === 'quantite' || champ === 'prixUnitaireHT' || champ === 'montantHT') {
              // Pattern pour nombres avec espaces, virgules, points
              patternsChamps[champ] = '[\\d\\s,\\.]+';
            } else {
              // Pour les textes, utiliser les premiers caractères comme pattern
              const valeurEchappee = valeur.substring(0, 20).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              patternsChamps[champ] = valeurEchappee;
            }
          }
        });
      });
      
      reglesApprises.structureExtraction = {
        ordreColonnesTexte,
        patternsChamps,
        positionsColonnes,
        exemplesLignes: exemplesLignes.slice(0, 5), // Garder seulement 5 exemples
      };
      
      console.log(`[PARSING RULES] 📝 Structure d'extraction apprise:`, {
        ordreColonnes: ordreColonnesTexte,
        nombreExemples: exemplesLignes.length,
        positionsColonnes,
      });
    }
  }
  
  // 8. Apprendre la structure des lignes (si des lignes ont été ajoutées/supprimées)
  const differenceLignes = factureCorrigee.lignes.length - factureOriginale.lignes.length;
  if (differenceLignes !== 0) {
    console.log(`[PARSING RULES] 📝 Structure modifiée: ${differenceLignes > 0 ? '+' : ''}${differenceLignes} lignes`);
  }
  
  // 9. Apprendre les transformations de texte (patterns à remplacer)
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
  
  // Mettre à jour le profil avec les apprentissages
  profil.reglesApprises = {
    ...reglesApprises,
    transformations: [
      ...(profil.reglesApprises?.transformations || []),
      ...transformations,
    ],
  };
  
  profil.dateDerniereUtilisation = new Date();
  profil.nombreUtilisations = (profil.nombreUtilisations || 0) + 1;
  
  // Mettre à jour la règle globale
  regle.dateDerniereUtilisation = new Date();
  regle.nombreUtilisations = (regle.nombreUtilisations || 0) + 1;
  
  regles.set(fournisseur, regle);
  sauvegarderReglesParsing(regles);
  
  // Mémoriser les références fournisseur depuis la facture corrigée
  memoriserReferencesDepuisFacture(factureCorrigee);
  
  console.log(`[PARSING RULES] ✅ Règles apprises sauvegardées pour ${fournisseur} (profil: ${profil.identifiant}):`, {
    descriptions: correctionsDescription.length,
    references: correctionsReference.length,
    bat: correctionsBAT.length,
    logos: correctionsLogo.length,
    montants: correctionsMontants.length,
    transformations: transformations.length,
    nombreProfils: regle.profils.length,
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
 * Génère une signature pour identifier le format d'une facture
 * Utilise des caractéristiques comme les mots-clés, la structure, etc.
 */
function genererSignatureFacture(facture: Facture, texteBrut: string): string {
  const caracteristiques: string[] = [];
  
  // Inclure le fournisseur dans la signature
  caracteristiques.push(`fournisseur-${facture.fournisseur.toLowerCase().replace(/\s+/g, '-')}`);
  
  // Mots-clés dans le texte brut
  const texteUpper = texteBrut.toUpperCase();
  if (texteUpper.includes('FATTURA RIEPILOGATIVA')) caracteristiques.push('fattura-riepilogativa');
  if (texteUpper.includes('RELAIS DES COCHES')) caracteristiques.push('relais-coches');
  if (texteUpper.includes('VELA BUCKET')) caracteristiques.push('vela-bucket');
  if (texteUpper.includes('PROTOCOLLO')) caracteristiques.push('protocollo');
  if (texteUpper.includes('MARQUAGE')) caracteristiques.push('marquage');
  if (texteUpper.includes('FDM')) caracteristiques.push('fdm'); // Fin de mois
  if (texteUpper.includes('PAIEMENT EN 3 FOIS')) caracteristiques.push('paiement-3-fois');
  
  // Structure de la facture (nombre de lignes - très important pour distinguer les structures)
  caracteristiques.push(`lignes-${facture.lignes.length}`);
  
  // Structure des lignes : présence et types de champs
  const aBAT = facture.lignes.some(l => l.bat);
  const aLogo = facture.lignes.some(l => l.logo);
  const aCouleur = facture.lignes.some(l => l.couleur);
  const aRefFournisseur = facture.lignes.some(l => l.refFournisseur);
  
  if (aBAT) caracteristiques.push('avec-bat');
  if (aLogo) caracteristiques.push('avec-logo');
  if (aCouleur) caracteristiques.push('avec-couleur');
  if (aRefFournisseur) caracteristiques.push('avec-ref-fournisseur');
  
  // Pattern des descriptions (premiers mots des premières lignes pour identifier la structure)
  if (facture.lignes.length > 0) {
    const premieresDescriptions = facture.lignes.slice(0, 3)
      .map(l => l.description?.substring(0, 20).toUpperCase().trim())
      .filter(d => d && d.length > 0)
      .join('-');
    if (premieresDescriptions) {
      // Créer un hash simple des premières descriptions
      const hashDescriptions = premieresDescriptions
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 30);
      if (hashDescriptions) {
        caracteristiques.push(`desc-${hashDescriptions}`);
      }
    }
  }
  
  // Format du numéro
  if (facture.numero.includes('/')) caracteristiques.push('numero-slash');
  if (facture.numero.startsWith('FA')) caracteristiques.push('numero-fa');
  
  return caracteristiques.sort().join('|');
}

/**
 * Trouve le profil de facture le plus similaire
 */
function trouverProfilSimilaire(
  regle: ParsingRule,
  signature: string
): ProfilFacture | null {
  if (!regle.profils || regle.profils.length === 0) {
    return null;
  }
  
  // Calculer la similarité avec chaque profil
  let meilleurProfil: ProfilFacture | null = null;
  let meilleureSimilarite = 0;
  
  for (const profil of regle.profils) {
    const similarite = calculerSimilarite(signature, profil.signature);
    if (similarite > meilleureSimilarite) {
      meilleureSimilarite = similarite;
      meilleurProfil = profil;
    }
  }
  
  // Seuil de similarité : au moins 40% de correspondance (réduit pour être plus permissif)
  if (meilleureSimilarite >= 0.4) {
    console.log(`[PARSING RULES] Similarité trouvée: ${(meilleureSimilarite * 100).toFixed(1)}%`);
    return meilleurProfil;
  }
  
  return null;
}

/**
 * Calcule la similarité entre deux signatures (Jaccard similarity)
 */
function calculerSimilarite(sig1: string, sig2: string): number {
  const set1 = new Set(sig1.split('|'));
  const set2 = new Set(sig2.split('|'));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Normalise un numéro de facture pour la comparaison
 */
function normaliserNumero(numero: string | undefined): string {
  if (!numero) return '';
  return numero
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '') // Enlever tous les caractères non alphanumériques
    .replace(/^F+/, '') // Enlever les préfixes "F" ou "FA"
    .replace(/^A+/, '') // Enlever les préfixes "A"
    .trim();
}

/**
 * Applique les règles apprises à une facture parsée
 * Utilise le profil de facture le plus similaire
 */
export function appliquerReglesApprises(
  fournisseur: Fournisseur,
  facture: Facture,
  texteBrut?: string
): Facture {
  console.log(`[PARSING RULES] 🔍 Application des règles pour ${fournisseur}...`);
  console.log(`[PARSING RULES] Facture parsée: ${facture.numero}, ${facture.lignes.length} lignes`);
  
  const regle = obtenirRegleParsing(fournisseur);
  if (!regle) {
    console.log(`[PARSING RULES] ❌ Aucune règle trouvée pour ${fournisseur}`);
    return facture;
  }
  
  console.log(`[PARSING RULES] ✅ Règle trouvée, ${regle.profils?.length || 0} profil(s) disponible(s)`);
  
  // Récupérer le texte brut depuis les données brutes de la facture si disponible
  if (!texteBrut && facture.donneesBrutes?.texteComplet) {
    texteBrut = facture.donneesBrutes.texteComplet;
    console.log(`[PARSING RULES] ✅ Texte brut récupéré depuis donneesBrutes.texteComplet (${texteBrut.length} caractères)`);
  }
  
  const numeroNormalise = normaliserNumero(facture.numero);
  console.log(`[PARSING RULES] Numéro de facture normalisé: "${facture.numero}" → "${numeroNormalise}"`);
  
  // PRIORITÉ 1: Chercher par numéro de facture (le plus fiable pour la même facture)
  let profil: ProfilFacture | null = null;
  
  if (numeroNormalise) {
    console.log(`[PARSING RULES] 🔍 Recherche par numéro de facture: ${numeroNormalise}`);
    for (const p of regle.profils || []) {
      if (p.modeleParsing?.numeroFacture) {
        const numeroModeleNormalise = normaliserNumero(p.modeleParsing.numeroFacture);
        if (numeroModeleNormalise === numeroNormalise) {
          profil = p;
          console.log(`[PARSING RULES] ✅ Profil trouvé par numéro de facture: ${p.identifiant} (${p.modeleParsing.numeroFacture})`);
          break;
        }
      }
    }
  }
  
  // PRIORITÉ 2: Chercher par nom de fichier (si disponible)
  if (!profil && facture.fichierPDF) {
    console.log(`[PARSING RULES] 🔍 Recherche par nom de fichier: ${facture.fichierPDF}`);
    for (const p of regle.profils || []) {
      if (p.modeleParsing?.factureComplete?.fichierPDF === facture.fichierPDF) {
        profil = p;
        console.log(`[PARSING RULES] ✅ Profil trouvé par nom de fichier: ${p.identifiant}`);
        break;
      }
    }
  }
  
  // PRIORITÉ 3: Chercher par signature (si texte brut disponible)
  if (!profil && texteBrut) {
    const signature = genererSignatureFacture(facture, texteBrut);
    console.log(`[PARSING RULES] 📝 Signature de la facture: ${signature}`);
    profil = trouverProfilSimilaire(regle, signature);
    if (profil) {
      console.log(`[PARSING RULES] ✅ Profil trouvé par signature: ${profil.identifiant}`);
    }
  }
  
  // PRIORITÉ 4: Prendre le profil le plus récent avec un modèle complet
  if (!profil) {
    console.log(`[PARSING RULES] 🔍 Recherche du profil le plus récent...`);
    const profilsAvecModele = (regle.profils || [])
      .filter(p => p.modeleParsing?.factureComplete)
      .sort((a, b) => {
        const dateA = a.dateDerniereUtilisation?.getTime() || 0;
        const dateB = b.dateDerniereUtilisation?.getTime() || 0;
        return dateB - dateA; // Plus récent en premier
      });
    
    if (profilsAvecModele.length > 0) {
      profil = profilsAvecModele[0];
      console.log(`[PARSING RULES] ✅ Utilisation du profil le plus récent: ${profil.identifiant}`);
    }
  }
  
  // Afficher les profils disponibles pour debug
  console.log(`[PARSING RULES] 📊 Profils disponibles pour ${fournisseur}:`, regle.profils?.map(p => ({
    identifiant: p.identifiant,
    numeroFacture: p.modeleParsing?.numeroFacture,
    numeroNormalise: p.modeleParsing?.numeroFacture ? normaliserNumero(p.modeleParsing.numeroFacture) : null,
    fichierPDF: p.modeleParsing?.factureComplete?.fichierPDF,
    aModele: !!p.modeleParsing?.factureComplete,
    nombreLignes: p.modeleParsing?.nombreLignes,
    utilisations: p.nombreUtilisations || 0,
    dateDerniereUtilisation: p.dateDerniereUtilisation,
  })));
  
  if (!profil) {
    console.log(`[PARSING RULES] ❌ Aucun profil similaire trouvé pour ${fournisseur}`);
    console.log(`[PARSING RULES] Signature recherchée: ${signature}`);
    console.log(`[PARSING RULES] Numéro de facture: ${facture.numero}`);
    if (regle.profils && regle.profils.length > 0) {
      console.log(`[PARSING RULES] Profils disponibles:`, regle.profils.map(p => ({
        identifiant: p.identifiant,
        numeroFacture: p.modeleParsing?.numeroFacture,
        nombreLignes: p.modeleParsing?.nombreLignes,
        aModele: !!p.modeleParsing?.factureComplete,
      })));
      console.log(`[PARSING RULES] 💡 Astuce: Corrigez et importez une facture pour créer un nouveau profil`);
    } else {
      console.log(`[PARSING RULES] 💡 Astuce: Aucun profil existant. Corrigez et importez une facture pour créer le premier profil`);
    }
    return facture;
  }
  
  console.log(`[PARSING RULES] ✅ Profil "${profil.identifiant}" sélectionné pour ${fournisseur}`);
  console.log(`[PARSING RULES] Profil a modèle complet:`, !!profil.modeleParsing?.factureComplete);
  
  // PRIORITÉ 1: Si on a un modèle complet mémorisé, l'utiliser UNIQUEMENT si c'est la même facture
  // Ne JAMAIS réutiliser un modèle complet pour une facture différente
  if (profil.modeleParsing?.factureComplete) {
    const modele = profil.modeleParsing.factureComplete;
    
    // Vérifier si c'est la même facture (même numéro normalisé)
    const numeroModeleNormalise = normaliserNumero(modele.numero);
    const numeroFactureNormalise = normaliserNumero(facture.numero);
    const estMemeFacture = numeroModeleNormalise === numeroFactureNormalise && numeroModeleNormalise !== '';
    
    console.log(`[PARSING RULES] 🔍 Vérification du modèle:`, {
      numeroModele: modele.numero,
      numeroModeleNormalise,
      numeroFacture: facture.numero,
      numeroFactureNormalise,
      estMemeFacture,
    });
    
    // Ne réutiliser le modèle complet QUE si c'est exactement la même facture
    if (estMemeFacture) {
      console.log(`[PARSING RULES] ✅ Même facture détectée (${numeroModeleNormalise}), réutilisation complète du modèle`);
      const factureCorrigee: Facture = {
        ...modele,
        id: facture.id, // Garder l'ID de la nouvelle facture
        dateImport: facture.dateImport,
        fichierPDF: facture.fichierPDF,
        pdfOriginal: facture.pdfOriginal,
        donneesBrutes: facture.donneesBrutes, // Garder les données brutes de la nouvelle facture
      };
      
      // Mettre à jour les statistiques du profil
      profil.dateDerniereUtilisation = new Date();
      profil.nombreUtilisations = (profil.nombreUtilisations || 0) + 1;
      
      // Sauvegarder les modifications du profil
      const regles = chargerReglesParsing();
      const regleMiseAJour = regles.get(fournisseur);
      if (regleMiseAJour && regleMiseAJour.profils) {
        const profilIndex = regleMiseAJour.profils.findIndex(p => p.identifiant === profil.identifiant);
        if (profilIndex >= 0) {
          regleMiseAJour.profils[profilIndex] = profil;
          regles.set(fournisseur, regleMiseAJour);
          sauvegarderReglesParsing(regles);
        }
      }
      
      return factureCorrigee;
    } else {
      console.log(`[PARSING RULES] ⚠️ Facture différente détectée (${numeroModeleNormalise} vs ${numeroFactureNormalise}), ne pas réutiliser le modèle complet`);
      console.log(`[PARSING RULES] 💡 Le modèle complet ne sera pas appliqué. Seules les règles de transformation seront appliquées.`);
    }
  }
  
  // PRIORITÉ 2: Appliquer les règles apprises (transformations)
  const reglesApprises = profil.reglesApprises;
  if (!reglesApprises) {
    return facture;
  }
  
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
  
  // PRIORITÉ 1.5: Si on a une structure d'extraction apprise, l'utiliser pour réextraire les lignes
  // NOTE: Cette fonctionnalité est désactivée pour l'instant car elle nécessite une correspondance exacte
  // Le modèle complet (PRIORITÉ 1) est plus fiable et plus simple
  // La structure d'extraction sera utilisée pour améliorer les futurs parsings, mais pour l'instant
  // on se concentre sur l'utilisation du modèle complet mémorisé
  
  // Appliquer les corrections de montants si le modèle existe
  if (profil.modeleParsing?.structureLignes && factureCorrigee.lignes.length === profil.modeleParsing.structureLignes.length) {
    console.log(`[PARSING RULES] 🔧 Application des corrections de montants depuis le modèle`);
    
    factureCorrigee.lignes = factureCorrigee.lignes.map((ligne, index) => {
      const ligneModele = profil.modeleParsing!.structureLignes![index];
      if (ligneModele) {
        // Appliquer les corrections du modèle
        return {
          ...ligne,
          montantHT: ligneModele.montantHT,
          prixUnitaireHT: ligneModele.prixUnitaireHT,
          remise: ligneModele.remise || 0,
          quantite: ligneModele.quantite,
          refFournisseur: ligneModele.refFournisseur || ligne.refFournisseur,
          bat: ligneModele.bat || ligne.bat,
          logo: ligneModele.logo || ligne.logo,
          couleur: ligneModele.couleur || ligne.couleur,
        };
      }
      return ligne;
    });
    
    // Recalculer les totaux
    factureCorrigee.totalHT = factureCorrigee.lignes.reduce((sum, l) => sum + l.montantHT, 0);
    factureCorrigee.totalTTC = factureCorrigee.totalHT + factureCorrigee.totalTVA;
  }
  
  // Appliquer les corrections de numéro si le modèle existe
  if (profil.modeleParsing?.numeroFacture) {
    // Le numéro est déjà parsé, mais on peut le corriger si nécessaire
    // (généralement le parsing du numéro fonctionne bien)
  }
  
  // Mettre à jour les statistiques du profil
  profil.dateDerniereUtilisation = new Date();
  profil.nombreUtilisations = (profil.nombreUtilisations || 0) + 1;
  
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

