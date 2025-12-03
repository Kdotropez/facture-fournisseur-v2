/**
 * Service de sauvegarde/restauration globale de toutes les données applicatives
 * (factures, devis, règlements, règles de paiement, règles de parsing, références, fournisseurs, etc.)
 */

import type { Fournisseur } from '../types/facture';

export interface SauvegardeGlobale {
  version: 1;
  dateExport: string;
  /** Données par clé de localStorage */
  donnees: Record<string, unknown>;
}

// Clés importantes utilisées par l'application dans localStorage
const STORAGE_KEYS_IMPORTANTES: string[] = [
  'factures-fournisseurs',        // Factures
  'devis-fournisseurs',          // Devis
  'reglements-factures',         // Règlements
  'regles-paiement-fournisseurs',// Règles de paiement
  'parsing-rules',               // Règles de parsing apprises
  'references-fournisseur',      // Références produits apprises
  'fournisseurs-personnalises',  // Fournisseurs ajoutés manuellement
  'factures-traductions',        // Traductions ITALESSE / produits
];

/**
 * Crée un objet de sauvegarde globale à partir du localStorage actuel.
 */
export function creerSauvegardeGlobale(): SauvegardeGlobale {
  const donnees: Record<string, unknown> = {};

  STORAGE_KEYS_IMPORTANTES.forEach((cle) => {
    try {
      const brute = localStorage.getItem(cle);
      if (brute !== null) {
        try {
          // La plupart des clés stockent du JSON
          donnees[cle] = JSON.parse(brute);
        } catch {
          // Si ce n'est pas du JSON valide, stocker la string brute
          donnees[cle] = brute;
        }
      }
    } catch {
      // Ne pas bloquer la sauvegarde globale si une clé pose problème
    }
  });

  return {
    version: 1,
    dateExport: new Date().toISOString(),
    donnees,
  };
}

/**
 * Restaure une sauvegarde globale dans le localStorage.
 * ATTENTION : cela remplace les données existantes pour les clés concernées.
 */
export function restaurerSauvegardeGlobale(sauvegarde: SauvegardeGlobale): void {
  if (!sauvegarde || typeof sauvegarde !== 'object') {
    throw new Error('Format de sauvegarde invalide.');
  }

  if (sauvegarde.version !== 1 || !sauvegarde.donnees) {
    throw new Error('Version de sauvegarde inconnue ou données manquantes.');
  }

  const entrees = Object.entries(sauvegarde.donnees);

  entrees.forEach(([cle, valeur]) => {
    try {
      // Sauvegarder en JSON systématiquement
      localStorage.setItem(cle, JSON.stringify(valeur));
    } catch (error) {
      console.warn(`Erreur lors de la restauration de la clé ${cle}:`, error);
    }
  });
}


