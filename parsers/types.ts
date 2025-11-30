/**
 * Types pour les parseurs de factures
 */

import type { Facture, Fournisseur } from '../src/types/facture';

export interface ParserResult {
  /** Facture parsée */
  facture: Facture;
  /** Erreurs éventuelles lors du parsing */
  erreurs?: string[];
  /** Avertissements éventuels */
  avertissements?: string[];
}

export interface Parser {
  /** Nom du fournisseur */
  fournisseur: Fournisseur;
  /** Fonction de parsing d'un fichier PDF */
  parser: (fichier: File | string) => Promise<ParserResult>;
  /** Extensions de fichiers supportées */
  extensionsSupportees: string[];
}




