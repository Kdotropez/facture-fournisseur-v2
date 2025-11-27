/**
 * Hook pour gérer l'import de fichiers PDF
 */

import { useState, useCallback } from 'react';
import type { Facture } from '../types/facture';
import { parserFacture } from '@parsers/index';
import type { Fournisseur } from '../types/facture';
import { lireFichierEnDataURL } from '../utils/fileUtils';
import { extraireTextePDF } from '../utils/pdfParser';

/**
 * Détecte le fournisseur depuis le contenu du PDF
 */
export async function detecterFournisseurDepuisContenu(fichier: File): Promise<Fournisseur | null> {
  try {
    const textePDF = await extraireTextePDF(fichier);
    const texteUpper = textePDF.toUpperCase();
    
    // ITALESSE : prioritaires (FATTURA RIEPILOGATIVA, VELA, ITALESSE S.p.A.)
    if (
      texteUpper.includes('FATTURA RIEPILOGATIVA') ||
      texteUpper.includes('ITALESSE S.P.A.') ||
      texteUpper.includes('ITALESSE SPA') ||
      (texteUpper.includes('VELA') && texteUpper.includes('BUCKET')) ||
      texteUpper.includes('RELAIS DES COCHES')
    ) {
      return 'ITALESSE';
    }
    
    // RB DRINKS
    if (
      texteUpper.includes('RB DRINKS') ||
      texteUpper.includes('WWW.RBDRINKS.FR') ||
      texteUpper.includes('CONTACT@RBDRINKS.FR')
    ) {
      return 'RB DRINKS';
    }
    
    // LEHMANN F
    if (texteUpper.includes('LEHMANN')) {
      return 'LEHMANN F';
    }
    
    return null;
  } catch (error) {
    console.warn('Erreur lors de la détection du fournisseur depuis le contenu:', error);
    return null;
  }
}

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
        // D'abord, essayer de détecter depuis le contenu du PDF
        fournisseurDetecte = await detecterFournisseurDepuisContenu(fichier) || undefined;
        
        // Si pas trouvé, essayer depuis le nom du fichier
        if (!fournisseurDetecte) {
          const nomFichier = fichier.name.toUpperCase();
          
          // ITALESSE : fichiers "RELAIS DES COCHES F. XXXX.pdf"
          if (nomFichier.includes('RELAIS DES COCHES')) {
            fournisseurDetecte = 'ITALESSE';
          } else if (nomFichier.includes('RB') || nomFichier.startsWith('RB')) {
            fournisseurDetecte = 'RB DRINKS';
          } else if (nomFichier.includes('LEHMANN')) {
            fournisseurDetecte = 'LEHMANN F';
          } else if (nomFichier.includes('I') || nomFichier.startsWith('I')) {
            fournisseurDetecte = 'ITALESSE';
          } else {
            throw new Error(
              'Impossible de détecter le fournisseur. Veuillez le sélectionner manuellement.'
            );
          }
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



