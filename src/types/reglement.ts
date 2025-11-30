/**
 * Types pour la gestion des règlements de factures
 */

import type { Facture, Fournisseur } from './facture';

/**
 * Type de règlement
 */
export type TypeReglement = 
  | 'acompte'           // Acompte (paiement partiel en avance)
  | 'solde'             // Solde (paiement du reste)
  | 'reglement_complet' // Règlement complet en une fois
  | 'avoir'             // Avoir (remboursement)
  | 'autre';            // Autre type de règlement

/**
 * Statut d'un règlement
 */
export type StatutReglement = 
  | 'en_attente'        // En attente de paiement
  | 'paye'              // Payé
  | 'partiel'           // Partiellement payé
  | 'annule';           // Annulé

/**
 * Mode de paiement
 */
export type ModePaiement = 
  | 'virement'          // Virement bancaire
  | 'cheque'            // Chèque
  | 'prelevement'       // Prélèvement
  | 'carte'             // Carte bancaire
  | 'especes'           // Espèces
  | 'autre';            // Autre

/**
 * Règlement d'une facture
 */
export interface Reglement {
  /** Identifiant unique du règlement */
  id: string;
  /** Identifiant de la facture associée */
  factureId: string;
  /** Numéro de facture (pour référence rapide) */
  numeroFacture: string;
  /** Fournisseur */
  fournisseur: Fournisseur;
  /** Type de règlement */
  type: TypeReglement;
  /** Montant du règlement */
  montant: number;
  /** Date du règlement */
  dateReglement: Date;
  /** Date d'échéance (si applicable) */
  dateEcheance?: Date;
  /** Statut du règlement */
  statut: StatutReglement;
  /** Mode de paiement */
  modePaiement?: ModePaiement;
  /** Référence du paiement (numéro de chèque, référence virement, etc.) */
  referencePaiement?: string;
  /** Notes/commentaires */
  notes?: string;
  /** Date de création */
  dateCreation: Date;
  /** Date de dernière modification */
  dateModification: Date;
}

/**
 * Règle de paiement par fournisseur
 */
export interface ReglePaiementFournisseur {
  /** Fournisseur */
  fournisseur: Fournisseur;
  /** Mode de paiement par défaut */
  modePaiementDefaut?: ModePaiement;
  /** Délai de paiement en jours (ex: 30 = 30 jours) */
  delaiPaiement?: number;
  /** Pourcentage d'acompte requis (ex: 30 = 30% en acompte) */
  pourcentageAcompte?: number;
  /** Paiement en avance requis */
  paiementAvance?: boolean;
  /** Nombre d'acomptes (ex: 1 = un seul acompte, 2 = deux acomptes) */
  nombreAcomptes?: number;
  /** Délai entre les acomptes en jours */
  delaiEntreAcomptes?: number;
  /** Notes spécifiques au fournisseur */
  notes?: string;
}

/**
 * État de règlement d'une facture
 */
export interface EtatReglementFacture {
  /** Facture */
  facture: Facture;
  /** Règlements associés */
  reglements: Reglement[];
  /** Montant total réglé */
  montantRegle: number;
  /** Montant restant à régler */
  montantRestant: number;
  /** Pourcentage réglé */
  pourcentageRegle: number;
  /** Statut global */
  statut: 'non_regle' | 'partiel' | 'regle' | 'depasse';
  /** Prochain échéance (si applicable) */
  prochaineEcheance?: Date;
  /** Acomptes prévus */
  acomptesPrevu?: Array<{
    montant: number;
    dateEcheance: Date;
    type: 'acompte' | 'solde';
  }>;
}

/**
 * Statistiques de règlements
 */
export interface StatistiquesReglements {
  /** Total des factures */
  nombreFactures: number;
  /** Factures réglées */
  facturesReglees: number;
  /** Factures partiellement réglées */
  facturesPartielles: number;
  /** Factures non réglées */
  facturesNonReglees: number;
  /** Total à régler */
  totalARegler: number;
  /** Total réglé */
  totalRegle: number;
  /** Total en attente */
  totalEnAttente: number;
  /** Statistiques par fournisseur */
  parFournisseur: Record<Fournisseur, {
    nombreFactures: number;
    totalARegler: number;
    totalRegle: number;
    facturesReglees: number;
    facturesNonReglees: number;
  }>;
}

