/**
 * Service pour la gestion des factures
 * Utilise localStorage pour la persistance
 */

import type { Facture, Fournisseur, Statistiques } from '../types/facture';

const STORAGE_KEY = 'factures-fournisseurs';

/**
 * Charge toutes les factures depuis le stockage local
 */
export function chargerFactures(): Facture[] {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY);
    if (!donnees) return [];
    
    const factures = JSON.parse(donnees) as Facture[];
    // Convertir les dates string en objets Date
    return factures.map(f => ({
      ...f,
      date: new Date(f.date),
      dateLivraison: f.dateLivraison ? new Date(f.dateLivraison) : undefined,
      dateImport: new Date(f.dateImport),
    }));
  } catch (error) {
    console.error('Erreur lors du chargement des factures:', error);
    return [];
  }
}

/**
 * Sauvegarde toutes les factures dans le stockage local
 */
export function sauvegarderFactures(factures: Facture[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(factures));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des factures:', error);
    throw error;
  }
}

/**
 * Ajoute une nouvelle facture
 */
export function ajouterFacture(facture: Facture): void {
  const factures = chargerFactures();
  factures.push(facture);
  sauvegarderFactures(factures);
}

/**
 * Supprime une facture par son ID
 */
export function supprimerFacture(id: string): void {
  const factures = chargerFactures();
  const facturesFiltrees = factures.filter(f => f.id !== id);
  sauvegarderFactures(facturesFiltrees);
}

/**
 * Met à jour une facture existante
 */
export function mettreAJourFacture(facture: Facture): void {
  const factures = chargerFactures();
  const index = factures.findIndex(f => f.id === facture.id);
  if (index !== -1) {
    factures[index] = facture;
    sauvegarderFactures(factures);
  }
}

/**
 * Obtient une facture par son ID
 */
export function obtenirFacture(id: string): Facture | undefined {
  const factures = chargerFactures();
  return factures.find(f => f.id === id);
}

/**
 * Calcule les statistiques globales
 */
export function calculerStatistiques(factures: Facture[]): Statistiques {
  const stats: Statistiques = {
    nombreFactures: factures.length,
    totalHT: 0,
    totalTVA: 0,
    totalTTC: 0,
    parFournisseur: {
      'RB DRINKS': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
      'LEHMANN F': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
      'ITALESSE': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
    },
  };

  factures.forEach(facture => {
    stats.totalHT += facture.totalHT;
    stats.totalTVA += facture.totalTVA;
    stats.totalTTC += facture.totalTTC;

    const statsFournisseur = stats.parFournisseur[facture.fournisseur];
    if (statsFournisseur) {
      statsFournisseur.nombre += 1;
      statsFournisseur.totalHT += facture.totalHT;
      statsFournisseur.totalTVA += facture.totalTVA;
      statsFournisseur.totalTTC += facture.totalTTC;
    }
  });

  return stats;
}

/**
 * Recherche des factures selon un terme de recherche
 */
export function rechercherFactures(
  factures: Facture[],
  terme: string
): Facture[] {
  if (!terme.trim()) return factures;

  const termeLower = terme.toLowerCase();
  return factures.filter(facture =>
    facture.numero.toLowerCase().includes(termeLower) ||
    facture.fournisseur.toLowerCase().includes(termeLower) ||
    facture.lignes.some(ligne =>
      ligne.description.toLowerCase().includes(termeLower)
    )
  );
}

/**
 * Filtre les factures par fournisseur
 */
export function filtrerParFournisseur(
  factures: Facture[],
  fournisseur: Fournisseur | null
): Facture[] {
  if (!fournisseur) return factures;
  return factures.filter(f => f.fournisseur === fournisseur);
}



