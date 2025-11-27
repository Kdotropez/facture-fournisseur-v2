/**
 * Point d'entrée pour tous les parseurs
 * Système extensible pour ajouter facilement de nouveaux fournisseurs
 */

import { parserRBDrinks } from './rb-drinks';
import { parserLehmann } from './lehmann';
import { parserItalesse } from './italesse';
import type { Parser, ParserResult } from './types';
import type { Fournisseur } from '../src/types/facture';

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
 */
export async function parserFacture(
  fichier: File | string,
  fournisseur: Fournisseur
): Promise<ParserResult> {
  const parser = obtenirParser(fournisseur);
  
  if (!parser) {
    throw new Error(`Aucun parser disponible pour le fournisseur: ${fournisseur}`);
  }
  
  return parser.parser(fichier);
}

/**
 * Détecte automatiquement le fournisseur à partir du chemin du fichier
 */
export function detecterFournisseur(chemin: string): Fournisseur | null {
  const cheminNormalise = chemin.toUpperCase();
  
  if (cheminNormalise.includes('RB DRINKS')) {
    return 'RB DRINKS';
  }
  if (cheminNormalise.includes('LEHMANN')) {
    return 'LEHMANN F';
  }
  if (cheminNormalise.includes('ITALESSE')) {
    return 'ITALESSE';
  }
  
  return null;
}

/**
 * Liste tous les fournisseurs disponibles
 */
export function obtenirFournisseurs(): Fournisseur[] {
  return Object.keys(parseurs) as Fournisseur[];
}



