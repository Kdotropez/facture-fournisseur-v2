/**
 * Service pour référencer les fichiers PDF de factures existants
 * dans les dossiers fournisseurs
 */

import type { Fournisseur } from '../types/facture';

export interface FichierFacture {
  nom: string;
  chemin: string;
  fournisseur: Fournisseur;
}

/**
 * Liste des fichiers PDF disponibles dans les dossiers fournisseurs
 * Cette liste peut être générée automatiquement ou mise à jour manuellement
 */
export const fichiersFactures: FichierFacture[] = [
  // RB DRINKS 2025
  { nom: 'RB2.pdf', chemin: 'RB DRINKS 2025/RB2.pdf', fournisseur: 'RB DRINKS' },
  
  // LEHMANN F 2025
  { nom: 'F1.pdf', chemin: 'LEHMANN F 2025/F1.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F2.pdf', chemin: 'LEHMANN F 2025/F2.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F3.pdf', chemin: 'LEHMANN F 2025/F3.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F4.pdf', chemin: 'LEHMANN F 2025/F4.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F5.pdf', chemin: 'LEHMANN F 2025/F5.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F6.pdf', chemin: 'LEHMANN F 2025/F6.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F7.pdf', chemin: 'LEHMANN F 2025/F7.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F8.pdf', chemin: 'LEHMANN F 2025/F8.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F9.pdf', chemin: 'LEHMANN F 2025/F9.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F10.pdf', chemin: 'LEHMANN F 2025/F10.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F11.pdf', chemin: 'LEHMANN F 2025/F11.pdf', fournisseur: 'LEHMANN F' },
  
  // ITALESSE 2025
  { nom: 'I1.pdf', chemin: 'ITALESSE 2025/I1.pdf', fournisseur: 'ITALESSE' },
  { nom: 'I2.pdf', chemin: 'ITALESSE 2025/I2.pdf', fournisseur: 'ITALESSE' },
];

/**
 * Obtient tous les fichiers d'un fournisseur donné
 */
export function obtenirFichiersParFournisseur(fournisseur: Fournisseur): FichierFacture[] {
  return fichiersFactures.filter(f => f.fournisseur === fournisseur);
}

/**
 * Obtient tous les fichiers disponibles
 */
export function obtenirTousLesFichiers(): FichierFacture[] {
  return fichiersFactures;
}

/**
 * Obtient les statistiques des fichiers disponibles
 */
export function obtenirStatistiquesFichiers() {
  const stats = {
    total: fichiersFactures.length,
    parFournisseur: {
      'RB DRINKS': fichiersFactures.filter(f => f.fournisseur === 'RB DRINKS').length,
      'LEHMANN F': fichiersFactures.filter(f => f.fournisseur === 'LEHMANN F').length,
      'ITALESSE': fichiersFactures.filter(f => f.fournisseur === 'ITALESSE').length,
    },
  };
  return stats;
}


