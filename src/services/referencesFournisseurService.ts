/**
 * Service pour mémoriser les références fournisseur et leurs descriptions
 * Permet d'apprendre les correspondances entre références et noms de produits
 */

import type { Fournisseur } from '../types/facture';

export interface ReferenceFournisseur {
  reference: string;
  description: string;
  fournisseur: Fournisseur;
  nombreUtilisations: number;
  dateDerniereUtilisation: Date;
}

const STORAGE_KEY = 'references-fournisseur';

/**
 * Charge toutes les références fournisseur mémorisées
 */
export function chargerReferencesFournisseur(): Map<string, ReferenceFournisseur> {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY);
    if (!donnees) return new Map();
    
    const references = JSON.parse(donnees) as ReferenceFournisseur[];
    const map = new Map<string, ReferenceFournisseur>();
    
    references.forEach(ref => {
      // Créer une clé unique : fournisseur + référence
      const cle = `${ref.fournisseur}__${ref.reference}`;
      map.set(cle, {
        ...ref,
        dateDerniereUtilisation: new Date(ref.dateDerniereUtilisation),
      });
    });
    
    return map;
  } catch (error) {
    console.error('Erreur lors du chargement des références fournisseur:', error);
    return new Map();
  }
}

/**
 * Sauvegarde toutes les références fournisseur
 */
export function sauvegarderReferencesFournisseur(references: Map<string, ReferenceFournisseur>): void {
  try {
    const referencesArray = Array.from(references.values());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(referencesArray));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des références fournisseur:', error);
    throw error;
  }
}

/**
 * Obtient la description pour une référence fournisseur donnée
 */
export function obtenirDescriptionReference(
  fournisseur: Fournisseur,
  reference: string
): string | undefined {
  const references = chargerReferencesFournisseur();
  const cle = `${fournisseur}__${reference}`;
  const ref = references.get(cle);
  return ref?.description;
}

/**
 * Mémorise ou met à jour une référence fournisseur avec sa description
 */
export function memoriserReferenceFournisseur(
  fournisseur: Fournisseur,
  reference: string,
  description: string
): void {
  const references = chargerReferencesFournisseur();
  const cle = `${fournisseur}__${reference}`;
  
  const refExistante = references.get(cle);
  if (refExistante) {
    // Mettre à jour si la description est différente (prendre la plus récente ou la plus longue)
    if (refExistante.description !== description) {
      // Prendre la description la plus longue (généralement plus complète)
      if (description.length > refExistante.description.length) {
        refExistante.description = description;
      }
    }
    refExistante.nombreUtilisations = (refExistante.nombreUtilisations || 0) + 1;
    refExistante.dateDerniereUtilisation = new Date();
  } else {
    // Créer une nouvelle référence
    references.set(cle, {
      reference,
      description,
      fournisseur,
      nombreUtilisations: 1,
      dateDerniereUtilisation: new Date(),
    });
  }
  
  sauvegarderReferencesFournisseur(references);
  console.log(`[REFERENCES] Référence mémorisée: ${fournisseur} - ${reference} -> ${description}`);
}

/**
 * Mémorise les références depuis une facture corrigée
 */
export function memoriserReferencesDepuisFacture(facture: {
  fournisseur: Fournisseur;
  lignes: Array<{ refFournisseur?: string; description: string }>;
}): void {
  facture.lignes.forEach(ligne => {
    if (ligne.refFournisseur && ligne.description) {
      memoriserReferenceFournisseur(
        facture.fournisseur,
        ligne.refFournisseur,
        ligne.description
      );
    }
  });
}

/**
 * Obtient toutes les références pour un fournisseur donné
 */
export function obtenirReferencesParFournisseur(fournisseur: Fournisseur): ReferenceFournisseur[] {
  const references = chargerReferencesFournisseur();
  return Array.from(references.values())
    .filter(ref => ref.fournisseur === fournisseur)
    .sort((a, b) => (b.nombreUtilisations || 0) - (a.nombreUtilisations || 0));
}

