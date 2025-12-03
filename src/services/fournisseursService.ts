/**
 * Service pour gérer les fournisseurs personnalisés
 * Permet d'ajouter de nouveaux fournisseurs au système
 */

import type { Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';

const STORAGE_KEY = 'fournisseurs-personnalises';

/**
 * Charge les fournisseurs personnalisés depuis le stockage local
 */
export function chargerFournisseursPersonnalises(): Fournisseur[] {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY);
    if (!donnees) return [];
    
    return JSON.parse(donnees) as Fournisseur[];
  } catch (error) {
    console.error('Erreur lors du chargement des fournisseurs personnalisés:', error);
    return [];
  }
}

/**
 * Sauvegarde un nouveau fournisseur personnalisé
 */
export function ajouterFournisseurPersonnalise(nom: Fournisseur): void {
  try {
    const fournisseurs = chargerFournisseursPersonnalises();
    
    // Vérifier si le fournisseur n'existe pas déjà
    if (!fournisseurs.includes(nom)) {
      fournisseurs.push(nom);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fournisseurs));
      console.log(`[FOURNISSEURS] Nouveau fournisseur ajouté: ${nom}`);
    }
  } catch (error) {
    console.error('Erreur lors de l\'ajout du fournisseur personnalisé:', error);
    throw error;
  }
}

/**
 * Obtient tous les fournisseurs (par défaut + personnalisés)
 */
export function obtenirTousLesFournisseurs(): Fournisseur[] {
  const fournisseursParDefaut = obtenirFournisseurs();
  const fournisseursPersonnalises = chargerFournisseursPersonnalises();
  
  // Combiner et dédupliquer
  const tous = [...fournisseursParDefaut, ...fournisseursPersonnalises];
  return Array.from(new Set(tous)) as Fournisseur[];
}

/**
 * Normalise un nom de fournisseur pour regrouper les variantes
 * Exemple : "LEHMANN F" -> "LEHMANN"
 */
const ALIAS_FOURNISSEURS: Record<string, Fournisseur> = {
  'LEHMANN F': 'LEHMANN',
  LEHMANN: 'LEHMANN',
};

export function normaliserNomFournisseur(nom: Fournisseur): Fournisseur {
  // Sécuriser au cas où des anciennes données auraient un fournisseur manquant ou non string
  if (!nom || typeof nom !== 'string') {
    return '' as Fournisseur;
  }

  const cle = nom.trim().toUpperCase();
  if (ALIAS_FOURNISSEURS[cle]) {
    return ALIAS_FOURNISSEURS[cle];
  }
  return nom;
}

