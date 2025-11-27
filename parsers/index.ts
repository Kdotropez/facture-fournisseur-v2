/**
 * Point d'entrée pour tous les parseurs
 * Système extensible pour ajouter facilement de nouveaux fournisseurs
 */

import { parserRBDrinks } from './rb-drinks';
import { parserLehmann } from './lehmann';
import { parserItalesse } from './italesse';
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
  'LEHMANN F': parserLehmann,
  'ITALESSE': parserItalesse,
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
  if (cheminNormalise.includes('LEHMANN')) {
    return 'LEHMANN F';
  }

  return null;
}

/**
 * Liste tous les fournisseurs disponibles
 */
export function obtenirFournisseurs(): Fournisseur[] {
  return Object.keys(parseurs) as Fournisseur[];
}



