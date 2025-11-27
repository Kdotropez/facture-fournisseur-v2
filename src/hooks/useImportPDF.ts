/**
 * Hook pour gérer l'import de fichiers PDF
 */

import { useState, useCallback } from 'react';
import type { Facture } from '../types/facture';
import { parserFacture, detecterFournisseur } from '@parsers/index';
import type { Fournisseur } from '../types/facture';
import { lireFichierEnDataURL } from '../utils/fileUtils';

export function useImportPDF() {
  const [importEnCours, setImportEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const importerFichier = useCallback(async (
    fichier: File,
    fournisseur?: Fournisseur
  ): Promise<Facture | null> => {
    setImportEnCours(true);
    setErreur(null);

    try {
      // Détecter le fournisseur si non fourni
      let fournisseurDetecte = fournisseur;
      if (!fournisseurDetecte) {
        // Essayer de détecter depuis le chemin du fichier
        // Note: Dans un navigateur, on n'a pas accès au chemin complet
        // On peut utiliser le nom du fichier ou demander à l'utilisateur
        const nomFichier = fichier.name.toUpperCase();
        if (nomFichier.includes('RB') || nomFichier.startsWith('RB')) {
          fournisseurDetecte = 'RB DRINKS';
        } else if (nomFichier.includes('F') || nomFichier.startsWith('F')) {
          fournisseurDetecte = 'LEHMANN F';
        } else if (nomFichier.includes('I') || nomFichier.startsWith('I')) {
          fournisseurDetecte = 'ITALESSE';
        } else {
          throw new Error(
            'Impossible de détecter le fournisseur. Veuillez le sélectionner manuellement.'
          );
        }
      }

      // Parser le fichier
      const resultat = await parserFacture(fichier, fournisseurDetecte);
      
      if (resultat.erreurs && resultat.erreurs.length > 0) {
        throw new Error(resultat.erreurs.join(', '));
      }

      const pdfOriginal = await lireFichierEnDataURL(fichier);
      return {
        ...resultat.facture,
        fichierPDF: fichier.name,
        pdfOriginal,
      };
    } catch (error) {
      const messageErreur = error instanceof Error 
        ? error.message 
        : 'Erreur lors de l\'import du fichier';
      setErreur(messageErreur);
      return null;
    } finally {
      setImportEnCours(false);
    }
  }, []);

  const importerFichiers = useCallback(async (
    fichiers: File[],
    fournisseur?: Fournisseur
  ): Promise<Facture[]> => {
    const factures: Facture[] = [];
    
    for (const fichier of fichiers) {
      const facture = await importerFichier(fichier, fournisseur);
      if (facture) {
        factures.push(facture);
      }
    }

    return factures;
  }, [importerFichier]);

  return {
    importerFichier,
    importerFichiers,
    importEnCours,
    erreur,
    setErreur,
  };
}



