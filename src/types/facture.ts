/**
 * Modèle de données normalisé pour les factures
 */

export type Fournisseur = string; // Permet d'ajouter de nouveaux fournisseurs dynamiquement

export interface LigneProduit {
  /** Description du produit */
  description: string;
  /** Description traduite / normalisée en français (optionnelle) */
  descriptionFR?: string;
  /** Référence fournisseur (optionnel) */
  refFournisseur?: string;
  /** BAT - Référence du logo (optionnel) */
  bat?: string;
  /** Logo - Nom du logo (optionnel) */
  logo?: string;
  /** Variante / couleur (optionnel) */
  couleur?: string;
  /** Quantité */
  quantite: number;
  /** Quantité facturée saisie manuellement (pour comparaison devis/factures) */
  quantiteFactureeManuelle?: number;
  /** Prix unitaire HT */
  prixUnitaireHT: number;
  /** Remise (montant) */
  remise: number;
  /** Montant HT de la ligne */
  montantHT: number;
  /** Historique des réceptions (par BL / livraison) pour les devis */
  receptions?: Array<{
    id: string;
    /** Numéro de BL / livraison (optionnel) */
    numero?: string;
    /** Date de réception (ISO string) */
    date: string;
    /** Quantité reçue sur cette livraison */
    quantite: number;
  }>;
}

export interface DonneesBrutesFacture {
  texteExtrait?: string;
  texteComplet?: string;
  totalHTBrut?: number;
  remise?: number;
  netHT?: number;
  /** Total HT FOB (hors transport/douanes) si disponible */
  totalHTFOB?: number;
  /** Transport et douanes (montant additionnel) si disponible */
  transportEtDouanes?: number;
  /** Total HT global (FOB + transport/douanes) si disponible */
  totalHTGlobal?: number;
  [cle: string]: unknown;
}

export interface Facture {
  /** Identifiant unique de la facture */
  id: string;
  /** Statut de la facture (active par défaut, ou annulée pour une annulation douce) */
  statut?: 'active' | 'annulee';
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


