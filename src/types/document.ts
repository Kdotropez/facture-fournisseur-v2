import type { AcompteDevis, Devis, LivraisonDevis, StatutDevis } from './devis';
import type { DonneesBrutesFacture, Facture, Fournisseur, LigneProduit } from './facture';

export type TypeDocumentFournisseur = 'devis' | 'facture';
export type NatureDocumentFournisseur = 'principal' | 'demande_acompte' | 'facture_finale';

export interface DocumentFournisseur {
  id: string;
  typeDocument: TypeDocumentFournisseur;
  fournisseur: Fournisseur;
  numero: string;
  date: Date;
  dateImport: Date;
  lignes: LigneProduit[];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  natureDocument: NatureDocumentFournisseur;
  dateValidite?: Date;
  dateLivraison?: Date;
  fichierPDF?: string;
  pdfOriginal?: string;
  donneesBrutes?: DonneesBrutesFacture;
  livraisons?: LivraisonDevis[];
  acompteDemandeTTC?: number;
  acomptesDemandes?: AcompteDevis[];
  documentsLiesIds?: string[];
  documentParentId?: string;
  statutDevis?: StatutDevis;
  statutFacture?: Facture['statut'];
  sourceLegacy?: 'devis' | 'facture';
}

const normaliserDate = (valeur: unknown): Date | undefined => {
  if (!valeur) return undefined;
  if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) return valeur;
  const date = new Date(valeur as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export function documentDepuisDevis(devis: Devis): DocumentFournisseur {
  return {
    id: devis.id,
    typeDocument: 'devis',
    fournisseur: devis.fournisseur,
    numero: devis.numero,
    date: normaliserDate(devis.date) || new Date(),
    dateImport: normaliserDate(devis.dateImport) || new Date(),
    dateValidite: normaliserDate(devis.dateValidite),
    fichierPDF: devis.fichierPDF,
    pdfOriginal: devis.pdfOriginal,
    lignes: devis.lignes || [],
    totalHT: devis.totalHT || 0,
    totalTVA: devis.totalTVA || 0,
    totalTTC: devis.totalTTC || 0,
    natureDocument: 'principal',
    acompteDemandeTTC: devis.acompteDemandeTTC,
    acomptesDemandes: devis.acomptesDemandes,
    livraisons: devis.livraisons,
    donneesBrutes: devis.donneesBrutes,
    documentsLiesIds: devis.facturesLieesIds,
    statutDevis: devis.statut,
    sourceLegacy: 'devis',
  };
}

export function documentDepuisFacture(facture: Facture): DocumentFournisseur {
  return {
    id: facture.id,
    typeDocument: 'facture',
    fournisseur: facture.fournisseur,
    numero: facture.numero,
    date: normaliserDate(facture.date) || new Date(),
    dateImport: normaliserDate(facture.dateImport) || new Date(),
    dateLivraison: normaliserDate(facture.dateLivraison),
    fichierPDF: facture.fichierPDF,
    pdfOriginal: facture.pdfOriginal,
    lignes: facture.lignes || [],
    totalHT: facture.totalHT || 0,
    totalTVA: facture.totalTVA || 0,
    totalTTC: facture.totalTTC || 0,
    natureDocument: 'principal',
    donneesBrutes: facture.donneesBrutes,
    statutFacture: facture.statut ?? 'active',
    sourceLegacy: 'facture',
  };
}

export function documentVersDevis(document: DocumentFournisseur): Devis {
  return {
    id: document.id,
    fournisseur: document.fournisseur,
    numero: document.numero,
    date: normaliserDate(document.date) || new Date(),
    dateValidite: normaliserDate(document.dateValidite),
    fichierPDF: document.fichierPDF,
    pdfOriginal: document.pdfOriginal,
    lignes: document.lignes || [],
    totalHT: document.totalHT || 0,
    totalTVA: document.totalTVA || 0,
    totalTTC: document.totalTTC || 0,
    acompteDemandeTTC: document.acompteDemandeTTC,
    acomptesDemandes: document.acomptesDemandes,
    dateImport: normaliserDate(document.dateImport) || new Date(),
    statut: document.statutDevis || 'en_attente',
    facturesLieesIds: document.documentsLiesIds,
    donneesBrutes: document.donneesBrutes,
    livraisons: document.livraisons,
  };
}

export function documentVersFacture(document: DocumentFournisseur): Facture {
  return {
    id: document.id,
    statut: document.statutFacture ?? 'active',
    fournisseur: document.fournisseur,
    numero: document.numero,
    date: normaliserDate(document.date) || new Date(),
    dateLivraison: normaliserDate(document.dateLivraison),
    fichierPDF: document.fichierPDF,
    pdfOriginal: document.pdfOriginal,
    lignes: document.lignes || [],
    totalHT: document.totalHT || 0,
    totalTVA: document.totalTVA || 0,
    totalTTC: document.totalTTC || 0,
    dateImport: normaliserDate(document.dateImport) || new Date(),
    donneesBrutes: document.donneesBrutes,
  };
}
