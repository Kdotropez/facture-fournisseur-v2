import { useCallback, useEffect, useState } from 'react';
import type { DocumentFournisseur } from '../types/document';
import type { Fournisseur } from '../types/facture';
import {
  ajouterDocument as ajouterDocumentService,
  chargerDocuments,
  mettreAJourDocument as mettreAJourDocumentService,
  sauvegarderDocuments,
  supprimerDocument as supprimerDocumentService,
} from '../services/documentService';

export function useDocuments() {
  const [documents, setDocuments] = useState<DocumentFournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [termeRecherche, setTermeRecherche] = useState('');
  const [fournisseurFiltre, setFournisseurFiltre] = useState<Fournisseur | null>(null);

  const rechargerDocuments = useCallback(async () => {
    try {
      const documentsCharges = await chargerDocuments();
      setDocuments(documentsCharges);
    } catch (error) {
      console.warn('[DOCUMENTS] Rechargement impossible:', error);
      setDocuments([]);
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void rechargerDocuments();
  }, [rechargerDocuments]);

  const ajouterDocument = useCallback(async (document: DocumentFournisseur) => {
    await ajouterDocumentService(document);
    await rechargerDocuments();
  }, [rechargerDocuments]);

  const mettreAJourDocument = useCallback(async (document: DocumentFournisseur) => {
    await mettreAJourDocumentService(document);
    setDocuments((prev) => prev.map((courant) => (courant.id === document.id ? document : courant)));
  }, []);

  const supprimerDocument = useCallback(async (id: string) => {
    await supprimerDocumentService(id);
    setDocuments((prev) => prev.filter((document) => document.id !== id));
  }, []);

  const remplacerDocuments = useCallback(async (nouveauxDocuments: DocumentFournisseur[]) => {
    sauvegarderDocuments(nouveauxDocuments);
    setDocuments(nouveauxDocuments);
  }, []);

  const documentsFiltres = (() => {
    const documentsParFournisseur = documents.filter((document) =>
      fournisseurFiltre ? document.fournisseur === fournisseurFiltre : true
    );

    if (!termeRecherche.trim()) {
      return documentsParFournisseur;
    }

    const terme = termeRecherche.toLowerCase();
    const idsCorrespondants = new Set(
      documentsParFournisseur
        .filter(
          (document) =>
            document.numero.toLowerCase().includes(terme) ||
            document.fournisseur.toLowerCase().includes(terme) ||
            document.lignes.some((ligne) => ligne.description.toLowerCase().includes(terme))
        )
        .map((document) => document.id)
    );

    if (idsCorrespondants.size === 0) {
      return [];
    }

    return documentsParFournisseur.filter((document) => {
      if (idsCorrespondants.has(document.id)) {
        return true;
      }

      if (document.documentParentId && idsCorrespondants.has(document.documentParentId)) {
        return true;
      }

      return documentsParFournisseur.some(
        (courant) => courant.documentParentId === document.id && idsCorrespondants.has(courant.id)
      );
    });
  })();

  return {
    documents: documentsFiltres,
    tousLesDocuments: documents,
    chargement,
    termeRecherche,
    setTermeRecherche,
    fournisseurFiltre,
    setFournisseurFiltre,
    ajouterDocument,
    mettreAJourDocument,
    supprimerDocument,
    remplacerDocuments,
    rechargerDocuments,
  };
}
