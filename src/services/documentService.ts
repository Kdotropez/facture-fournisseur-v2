import { chargerDevis } from './devisService';
import { chargerFactures } from './factureService';
import type { DocumentFournisseur } from '../types/document';
import {
  documentDepuisDevis,
  documentDepuisFacture,
} from '../types/document';

const STORAGE_KEY_DOCUMENTS = 'documents-fournisseurs';
const STORAGE_KEY_DOCUMENTS_MIGRATION_BACKUP = 'documents-fournisseurs-migration-backup-v1';
const MAX_TEXTE_EXTRAIT = 2000;
const MAX_PDF_ORIGINAL = 100_000;

const normaliserDate = (valeur: unknown): Date => {
  if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) return valeur;
  const date = new Date(valeur as string);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const normaliserDocument = (document: DocumentFournisseur): DocumentFournisseur => ({
  ...document,
  date: normaliserDate(document.date),
  dateImport: normaliserDate(document.dateImport),
  dateValidite: document.dateValidite ? normaliserDate(document.dateValidite) : undefined,
  dateLivraison: document.dateLivraison ? normaliserDate(document.dateLivraison) : undefined,
});

const trierDocuments = (documents: DocumentFournisseur[]) =>
  [...documents].sort((a, b) => {
    const dateB = normaliserDate(b.dateImport).getTime();
    const dateA = normaliserDate(a.dateImport).getTime();
    return dateB - dateA;
  });

function optimiserDocumentsPourStockage(documents: DocumentFournisseur[]): DocumentFournisseur[] {
  return documents.map((document) => {
    const copie: DocumentFournisseur = { ...document };

    if (copie.pdfOriginal && copie.pdfOriginal.length > MAX_PDF_ORIGINAL) {
      copie.pdfOriginal = undefined;
    }

    if (copie.donneesBrutes) {
      const donnees = { ...copie.donneesBrutes };
      if (typeof donnees.texteComplet === 'string') {
        delete donnees.texteComplet;
      }
      if (typeof donnees.texteExtrait === 'string' && donnees.texteExtrait.length > MAX_TEXTE_EXTRAIT) {
        donnees.texteExtrait = donnees.texteExtrait.slice(0, MAX_TEXTE_EXTRAIT);
      }
      copie.donneesBrutes = donnees;
    }

    return copie;
  });
}

function chargerDocumentsStockes(): DocumentFournisseur[] {
  try {
    const brut = localStorage.getItem(STORAGE_KEY_DOCUMENTS);
    if (!brut) return [];
    const documents = JSON.parse(brut) as DocumentFournisseur[];
    if (!Array.isArray(documents)) return [];
    return documents.map(normaliserDocument);
  } catch (error) {
    console.warn('[DOCUMENTS] Impossible de charger le stockage unifié:', error);
    return [];
  }
}

async function creerBackupLegacySiNecessaire(): Promise<void> {
  try {
    if (localStorage.getItem(STORAGE_KEY_DOCUMENTS_MIGRATION_BACKUP)) {
      return;
    }

    const legacyFactures = chargerFactures();
    const legacyDevis = await chargerDevis();
    localStorage.setItem(
      STORAGE_KEY_DOCUMENTS_MIGRATION_BACKUP,
      JSON.stringify({
        dateSauvegarde: new Date().toISOString(),
        factures: legacyFactures,
        devis: legacyDevis,
      })
    );
  } catch (error) {
    console.warn('[DOCUMENTS] Impossible de créer le backup legacy:', error);
  }
}

function fusionnerDocuments(
  documentsStockes: DocumentFournisseur[],
  documentsLegacy: DocumentFournisseur[]
): DocumentFournisseur[] {
  const parId = new Map<string, DocumentFournisseur>();

  documentsStockes.forEach((document) => {
    parId.set(document.id, normaliserDocument(document));
  });

  documentsLegacy.forEach((document) => {
    parId.set(document.id, normaliserDocument(document));
  });

  return trierDocuments(Array.from(parId.values()));
}

function infererNatureDocumentLie(
  parent: DocumentFournisseur,
  enfant: DocumentFournisseur
): DocumentFournisseur['natureDocument'] {
  const numero = (enfant.numero || '').toLowerCase();
  if (numero.includes('acompte')) {
    return 'demande_acompte';
  }

  if ((enfant.totalTTC || 0) < (parent.totalTTC || 0) - 0.01) {
    return 'demande_acompte';
  }

  return 'facture_finale';
}

function normaliserTexteComparaison(valeur: string): string[] {
  return valeur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
}

function scoreRattachement(parent: DocumentFournisseur, enfant: DocumentFournisseur): number {
  if (parent.fournisseur !== enfant.fournisseur) {
    return -1;
  }

  if ((enfant.totalTTC || 0) >= (parent.totalTTC || 0)) {
    return -1;
  }

  const tokensParent = new Set(normaliserTexteComparaison(parent.numero || ''));
  const tokensEnfant = normaliserTexteComparaison(enfant.numero || '');
  const correspondances = tokensEnfant.filter((token) => tokensParent.has(token)).length;
  const bonusAcompte = (enfant.numero || '').toLowerCase().includes('acompte') ? 5 : 0;
  const bonusChronologie = enfant.date >= parent.date ? 1 : 0;

  return correspondances * 10 + bonusAcompte + bonusChronologie;
}

function enrichirHierarchieDocuments(documents: DocumentFournisseur[]): DocumentFournisseur[] {
  const parId = new Map(documents.map((document) => [document.id, { ...document }]));

  documents.forEach((document) => {
    if (document.typeDocument !== 'devis') {
      return;
    }

    const parent = parId.get(document.id);
    if (!parent) {
      return;
    }

    parent.natureDocument = 'principal';

    (document.documentsLiesIds || []).forEach((idLie) => {
      const enfant = parId.get(idLie);
      if (!enfant) {
        return;
      }

      enfant.documentParentId = parent.id;
      enfant.natureDocument = infererNatureDocumentLie(parent, enfant);
    });
  });

  const documentsEnrichis = Array.from(parId.values());
  const parentsPotentiels = documentsEnrichis.filter(
    (document) => document.typeDocument === 'devis' && document.natureDocument === 'principal'
  );

  documentsEnrichis.forEach((document) => {
    if (document.documentParentId || document.typeDocument !== 'facture') {
      return;
    }

    const meilleurParent = parentsPotentiels
      .map((parent) => ({ parent, score: scoreRattachement(parent, document) }))
      .filter((candidat) => candidat.score > 0)
      .sort((a, b) => b.score - a.score)[0];

    if (!meilleurParent) {
      return;
    }

    document.documentParentId = meilleurParent.parent.id;
    document.natureDocument = infererNatureDocumentLie(meilleurParent.parent, document);
  });

  return documentsEnrichis;
}

export async function migrerDocumentsDepuisLegacy(): Promise<DocumentFournisseur[]> {
  await creerBackupLegacySiNecessaire();

  const [devis, factures] = await Promise.all([chargerDevis(), Promise.resolve(chargerFactures())]);
  const documentsLegacy = [
    ...devis.map(documentDepuisDevis),
    ...factures.map(documentDepuisFacture),
  ];
  const documentsLegacyEnrichis = enrichirHierarchieDocuments(documentsLegacy);

  const documentsStockes = chargerDocumentsStockes();
  const documentsFusionnes = fusionnerDocuments(documentsStockes, documentsLegacyEnrichis);

  if (JSON.stringify(documentsFusionnes) !== JSON.stringify(documentsStockes)) {
    try {
      sauvegarderDocuments(documentsFusionnes);
    } catch (error) {
      console.warn('[DOCUMENTS] Migration stockée partiellement, affichage conservé en mémoire:', error);
    }
  }

  return documentsFusionnes;
}

export async function chargerDocuments(): Promise<DocumentFournisseur[]> {
  return migrerDocumentsDepuisLegacy();
}

export function sauvegarderDocuments(documents: DocumentFournisseur[]): void {
  const documentsTries = trierDocuments(documents);
  const documentsOptimises = optimiserDocumentsPourStockage(documentsTries);

  try {
    localStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(documentsOptimises));
  } catch (error) {
    console.warn('[DOCUMENTS] Sauvegarde optimisée impossible, tentative minimale:', error);
    const documentsMinimaux = documentsOptimises.map((document) => ({
      ...document,
      pdfOriginal: undefined,
      donneesBrutes: document.donneesBrutes
        ? {
            totalHTBrut: document.donneesBrutes.totalHTBrut,
            remise: document.donneesBrutes.remise,
            netHT: document.donneesBrutes.netHT,
            totalHTFOB: document.donneesBrutes.totalHTFOB,
            transportEtDouanes: document.donneesBrutes.transportEtDouanes,
            totalHTGlobal: document.donneesBrutes.totalHTGlobal,
          }
        : undefined,
    }));
    localStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(documentsMinimaux));
  }
}

export async function ajouterDocument(document: DocumentFournisseur): Promise<void> {
  const documents = await chargerDocuments();
  documents.push(normaliserDocument(document));
  sauvegarderDocuments(documents);
}

export async function mettreAJourDocument(document: DocumentFournisseur): Promise<void> {
  const documents = await chargerDocuments();
  const index = documents.findIndex((courant) => courant.id === document.id);
  if (index === -1) {
    documents.push(normaliserDocument(document));
  } else {
    documents[index] = normaliserDocument(document);
  }
  sauvegarderDocuments(documents);
}

export async function supprimerDocument(id: string): Promise<void> {
  const documents = await chargerDocuments();
  sauvegarderDocuments(documents.filter((document) => document.id !== id));
}

export function chargerBackupMigrationDocuments(): {
  dateSauvegarde: string;
  factures: unknown[];
  devis: unknown[];
} | null {
  try {
    const brut = localStorage.getItem(STORAGE_KEY_DOCUMENTS_MIGRATION_BACKUP);
    if (!brut) return null;
    return JSON.parse(brut) as {
      dateSauvegarde: string;
      factures: unknown[];
      devis: unknown[];
    };
  } catch (error) {
    console.warn('[DOCUMENTS] Impossible de charger le backup de migration:', error);
    return null;
  }
}
