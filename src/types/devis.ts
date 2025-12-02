/**
 * Modèle de données pour les devis fournisseurs
 */

import type { Fournisseur, LigneProduit, DonneesBrutesFacture, Facture } from './facture';

export type StatutDevis =
  | 'brouillon'
  | 'en_attente'        // Devis envoyé / reçu, pas encore validé
  | 'accepte'           // Devis accepté
  | 'facture_partielle' // Une partie seulement a été facturée
  | 'facture_soldee'    // Tout le devis a été facturé
  | 'refuse';

export interface Devis {
  /** Identifiant unique du devis */
  id: string;
  /** Fournisseur */
  fournisseur: Fournisseur;
  /** Numéro de devis */
  numero: string;
  /** Date du devis */
  date: Date;
  /** Date de validité (optionnelle) */
  dateValidite?: Date;
  /** Nom du fichier PDF source */
  fichierPDF?: string;
  /** Données encodées du PDF original (data URL) */
  pdfOriginal?: string;
  /** Lignes de produits prévues au devis */
  lignes: LigneProduit[];
  /** Total HT prévu */
  totalHT: number;
  /** Total TVA prévu */
  totalTVA: number;
  /** Total TTC prévu */
  totalTTC: number;
  /** Date d'import */
  dateImport: Date;
  /** Statut du devis dans le cycle de vie */
  statut: StatutDevis;
  /** Factures liées (acomptes + solde) */
  facturesLieesIds?: string[];
  /** Données brutes du parsing (pour debug) */
  donneesBrutes?: DonneesBrutesFacture;
  /** Livraisons associées à ce devis (réceptions partielles de marchandise) */
  livraisons?: LivraisonDevis[];
}

/** Livraison (réception réelle) liée à un devis, au niveau montant global */
export interface LivraisonDevis {
  /** Identifiant unique de la livraison */
  id: string;
  /** Numéro de BL / livraison / facture logistique */
  numero: string;
  /** Date de la livraison */
  date: Date;
  /** Montant HT reçu pour cette livraison */
  montantHT: number;
  /** Montant TTC reçu pour cette livraison */
  montantTTC: number;
  /** Commentaire éventuel (périmètre de la livraison, conteneur, etc.) */
  notes?: string;
}

/**
 * Résultat de comparaison entre un devis et les factures liées
 */
export interface ComparaisonLigneDevis {
  /** Ligne du devis */
  ligneDevis: LigneProduit;
  /** Quantité totale facturée correspondant à cette ligne */
  quantiteFacturee: number;
  /** Quantité facturée calculée automatiquement à partir des factures */
  quantiteFactureeAuto?: number;
  /** Écart de quantité (facturée - devis) */
  ecartQuantite: number;
  /** Prix unitaire moyen facturé (HT) */
  prixUnitaireMoyenFacture: number | null;
  /** Écart de prix unitaire (facturé - devis) */
  ecartPrixUnitaire: number | null;
  /** Montant HT de la ligne de devis (quantité * PU) */
  montantLigneDevis: number;
}

export interface SyntheseComparaisonDevis {
  devis: Devis;
  /** Factures effectivement liées (trouvées à partir des IDs) */
  facturesLiees: Facture[];
  /** Lignes comparées une à une */
  lignes: ComparaisonLigneDevis[];
  /** Montant TTC total du devis */
  totalDevisTTC: number;
  /** Montant TTC total des factures liées (toutes lignes confondues) */
  totalFacturesTTC: number;
  /** Écart global TTC (facturé - devis) */
  ecartGlobalTTC: number;
  /** Montant TTC total déjà livré (somme des livraisons) */
  totalLivraisonsTTC: number;
  /** Reste à livrer TTC (devis - livraisons) */
  resteALivrerTTC: number;
}


