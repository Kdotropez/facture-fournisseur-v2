/**
 * Modèle de données normalisé pour les factures
 */

export type Fournisseur = 'RB DRINKS' | 'LEHMANN F' | 'ITALESSE';

export interface LigneProduit {
  /** Description du produit */
  description: string;
  /** Référence fournisseur (optionnel) */
  refFournisseur?: string;
  /** BAT - Référence du logo (optionnel) */
  bat?: string;
  /** Logo - Nom du logo (optionnel) */
  logo?: string;
  /** Quantité */
  quantite: number;
  /** Prix unitaire HT */
  prixUnitaireHT: number;
  /** Remise (montant) */
  remise: number;
  /** Montant HT de la ligne */
  montantHT: number;
}

export interface DonneesBrutesFacture {
  texteExtrait?: string;
  texteComplet?: string;
  totalHTBrut?: number;
  remise?: number;
  netHT?: number;
  [cle: string]: unknown;
}

export interface Facture {
  /** Identifiant unique de la facture */
  id: string;
  /** Fournisseur */
  fournisseur: Fournisseur;
  /** Numéro de facture */
  numero: string;
  /** Date de la facture */
  date: Date;
  /** Date de livraison prévue ou constatée */
  dateLivraison?: Date;
  /** Nom du fichier PDF source */
  fichierPDF?: string;
  /** Données encodées du PDF original (data URL) */
  pdfOriginal?: string;
  /** Lignes de produits */
  lignes: LigneProduit[];
  /** Total HT */
  totalHT: number;
  /** Total TVA */
  totalTVA: number;
  /** Total TTC */
  totalTTC: number;
  /** Date d'import */
  dateImport: Date;
  /** Données brutes du parsing (pour debug) */
  donneesBrutes?: DonneesBrutesFacture;
}

export interface Statistiques {
  /** Nombre total de factures */
  nombreFactures: number;
  /** Total HT toutes factures confondues */
  totalHT: number;
  /** Total TVA toutes factures confondues */
  totalTVA: number;
  /** Total TTC toutes factures confondues */
  totalTTC: number;
  /** Statistiques par fournisseur */
  parFournisseur: Record<Fournisseur, {
    nombre: number;
    totalHT: number;
    totalTVA: number;
    totalTTC: number;
  }>;
}


