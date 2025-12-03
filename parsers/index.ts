/**
 * Point d'entrée pour tous les parseurs
 * Système extensible pour ajouter facilement de nouveaux fournisseurs
 */

import { parserRBDrinks } from './rb-drinks';
import { parserLehmann } from './lehmann';
import { parserItalesse } from './italesse';
import { parserStem } from './stem';
import type { Parser, ParserResult } from './types';
import type { Fournisseur } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';
import { appliquerReglesApprises } from '../src/services/parsingRulesService';

/**
 * Registre de tous les parseurs disponibles
 * Pour ajouter un nouveau fournisseur, il suffit d'ajouter son parser ici
 */
export const parseurs: Record<Fournisseur, Parser> = {
  'RB DRINKS': parserRBDrinks,
  LEHMANN: parserLehmann,
  ITALESSE: parserItalesse,
  STEM: parserStem,
};

/**
 * Obtient le parser pour un fournisseur donné
 */
export function obtenirParser(fournisseur: Fournisseur): Parser | undefined {
  return parseurs[fournisseur];
}

/**
 * Parse un fichier en utilisant le parser approprié selon le fournisseur
 * Si aucun parser spécifique n'existe, utilise un parser générique
 */
export async function parserFacture(
  fichier: File | string,
  fournisseur: Fournisseur
): Promise<ParserResult> {
  const parser = obtenirParser(fournisseur);
  
  let resultat: ParserResult;
  
  if (!parser) {
    // Parser générique pour les nouveaux fournisseurs
    console.warn(`Aucun parser spécifique pour ${fournisseur}, utilisation du parser générique`);
    resultat = await parserGenerique(fichier, fournisseur);
  } else {
    resultat = await parser.parser(fichier);
  }
  
  // Appliquer les règles apprises si disponibles
  if (resultat.facture) {
    // Extraire le texte brut pour déterminer le profil
    let texteBrut: string | undefined;
    try {
      if (typeof fichier === 'string') {
        // Si c'est un chemin, on ne peut pas extraire le texte ici
        texteBrut = undefined;
      } else {
        texteBrut = await extraireTextePDF(fichier);
      }
    } catch (error) {
      console.warn(`[PARSING RULES] Impossible d'extraire le texte brut pour déterminer le profil:`, error);
      texteBrut = undefined;
    }
    
    const factureCorrigee = appliquerReglesApprises(fournisseur, resultat.facture, texteBrut);
    
    // Si des corrections ont été appliquées, mettre à jour le résultat
    if (factureCorrigee !== resultat.facture) {
      console.log(`[PARSING RULES] ✅ Règles apprises appliquées pour ${fournisseur}`);
      resultat = {
        ...resultat,
        facture: factureCorrigee,
      };
    }
  }
  
  return resultat;
}

/**
 * Parser générique pour les fournisseurs sans parser spécifique
 */
async function parserGenerique(
  fichier: File | string,
  fournisseur: Fournisseur
): Promise<ParserResult> {
  const erreurs: string[] = [];
  const avertissements: string[] = [];
  
  try {
    let textePDF: string;
    let nomFichier: string;
    
    if (typeof fichier === 'string') {
      nomFichier = fichier.split(/[/\\]/).pop() || 'facture.pdf';
      throw new Error('Le parsing depuis un chemin nécessite un serveur backend');
    } else {
      nomFichier = fichier.name;
      textePDF = await extraireTextePDF(fichier);
    }

    // Extraction basique
    const numeroMatch = textePDF.match(/(?:FACTURE|FATTURA|INVOICE)\s*(?:N[°º]|NO\.?|NUM\.?)\s*([A-Z0-9\-\.\/]+)/i);
    const numero = numeroMatch?.[1]?.trim() || nomFichier.replace(/\.[^.]+$/, '');
    
    const dateMatch = textePDF.match(/(?:DATE|DATA)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i);
    const dateStr = dateMatch?.[1];
    const date = dateStr ? new Date(dateStr.split(/[\/\-\.]/).reverse().join('-')) : new Date();
    
    // Extraction basique des totaux
    const totalMatch = textePDF.match(/(?:TOTAL|TOTALE|AMOUNT)\s*(?:HT|TTC)?\s*:?\s*([\d\s,\.]+)/i);
    const totalHT = totalMatch ? parseFloat(totalMatch[1].replace(/[\s,]/g, '').replace(',', '.')) || 0 : 0;
    
    avertissements.push(`Parser générique utilisé pour ${fournisseur}. Certaines données peuvent être incomplètes.`);
    
    return {
      facture: {
        id: `${fournisseur.toLowerCase().replace(/\s+/g, '-')}-${numero}-${Date.now()}`,
        fournisseur,
        numero,
        date,
        fichierPDF: nomFichier,
        lignes: [{
          description: `Produits ${fournisseur}`,
          quantite: 1,
          prixUnitaireHT: totalHT,
          remise: 0,
          montantHT: totalHT,
        }],
        totalHT,
        totalTVA: 0,
        totalTTC: totalHT,
        dateImport: new Date(),
        donneesBrutes: {
          texteComplet: textePDF,
        },
      },
      erreurs: erreurs.length > 0 ? erreurs : undefined,
      avertissements: avertissements.length > 0 ? avertissements : undefined,
    };
  } catch (error) {
    const messageErreur = error instanceof Error ? error.message : 'Erreur inconnue';
    erreurs.push(messageErreur);
    
    return {
      facture: {
        id: `${fournisseur.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        fournisseur,
        numero: 'N/A',
        date: new Date(),
        fichierPDF: typeof fichier === 'string' ? fichier : fichier.name,
        lignes: [],
        totalHT: 0,
        totalTVA: 0,
        totalTTC: 0,
        dateImport: new Date(),
      },
      erreurs,
      avertissements,
    };
  }
}

/**
 * Détecte automatiquement le fournisseur à partir du chemin du fichier
 * Détecte aussi automatiquement les nouveaux fournisseurs depuis les noms de dossiers
 */
export function detecterFournisseur(chemin: string): Fournisseur | null {
  const cheminNormalise = chemin.toUpperCase();

  if (
    cheminNormalise.includes('ITALESSE') ||
    cheminNormalise.includes('FATTURA') ||
    (cheminNormalise.includes('VELA') && !cheminNormalise.includes('LEHMANN'))
  ) {
    return 'ITALESSE';
  }
  if (cheminNormalise.includes('RB DRINKS')) {
    return 'RB DRINKS';
  }
  if (
    cheminNormalise.includes('LEHMANN F') ||
    cheminNormalise.includes('LEHMANN FRERES') ||
    cheminNormalise.includes('LEHMANN FRÈRES') ||
    cheminNormalise.includes('LEHMANN')
  ) {
    return 'LEHMANN';
  }

  // Détection automatique des nouveaux fournisseurs depuis le nom du dossier
  // Format attendu: "NOM FOURNISSEUR 2025" ou "NOM FOURNISSEUR"
  const matchDossier = chemin.match(/^([^\/\\]+?)(?:\s+\d{4})?[\/\\]/i);
  if (matchDossier) {
    const nomDossier = matchDossier[1].trim();
    // Vérifier si c'est un fournisseur personnalisé enregistré
    try {
      const fournisseursPerso = localStorage.getItem('fournisseurs-personnalises');
      if (fournisseursPerso) {
        const liste = JSON.parse(fournisseursPerso) as string[];
        if (liste.includes(nomDossier)) {
          return nomDossier as Fournisseur;
        }
      }
    } catch (e) {
      // Ignorer les erreurs de parsing
    }
    
    // Si le nom du dossier ressemble à un fournisseur (plusieurs mots, majuscules)
    const dossiersSysteme = ['PUBLIC', 'DIST', 'SRC', 'NODE_MODULES'];
    if (!dossiersSysteme.includes(nomDossier.toUpperCase()) && 
        nomDossier.length > 2 && /[A-Z]/.test(nomDossier)) {
      return nomDossier as Fournisseur;
    }
  }

  return null;
}

/**
 * Liste tous les fournisseurs disponibles
 */
export function obtenirFournisseurs(): Fournisseur[] {
  const deBase = Object.keys(parseurs) as Fournisseur[];

  // Ajouter les fournisseurs personnalisés mémorisés dans le navigateur
  if (typeof window === 'undefined') {
    return deBase;
  }

  try {
    const persoStr = localStorage.getItem('fournisseurs-personnalises');
    if (!persoStr) return deBase;

    const perso = JSON.parse(persoStr) as string[];
    const tous = [...deBase];

    perso.forEach((nom) => {
      const nomTrim = (nom || '').trim();
      if (!nomTrim) return;
      if (!tous.includes(nomTrim as Fournisseur)) {
        tous.push(nomTrim as Fournisseur);
      }
    });

    return tous;
  } catch {
    return deBase;
  }
}



