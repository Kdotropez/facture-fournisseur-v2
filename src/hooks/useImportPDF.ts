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
    
    console.log('[DETECTION] Détection du fournisseur depuis le contenu...');
    console.log('[DETECTION] Extrait (200 premiers caractères):', textePDF.substring(0, 200));
    
    // PRIORITÉ 1: LEHMANN (vérifier en premier pour éviter les faux positifs)
    // Mots-clés très spécifiques à LEHMANN
    if (
      texteUpper.includes('LEHMANN F') ||
      texteUpper.includes('LEHMANN FRERES') ||
      texteUpper.includes('LEHMANN FRÈRES') ||
      texteUpper.includes('LEHMANN FRÈRE') ||
      (texteUpper.includes('LEHMANN') && texteUpper.includes('FACTURE')) ||
      (texteUpper.includes('LEHMANN') && /F\s*\d+/.test(textePDF)) // "F 1", "F1", etc.
    ) {
      console.log('[DETECTION] ✅ LEHMANN détecté');
      return 'LEHMANN';
    }
    
    // PRIORITÉ 2: RB DRINKS
    if (
      texteUpper.includes('RB DRINKS') ||
      texteUpper.includes('WWW.RBDRINKS.FR') ||
      texteUpper.includes('CONTACT@RBDRINKS.FR')
    ) {
      console.log('[DETECTION] ✅ RB DRINKS détecté');
      return 'RB DRINKS';
    }
    
    // PRIORITÉ 3: ITALESSE (critères plus stricts pour éviter les faux positifs)
    // Ne détecter ITALESSE que si on a des mots-clés TRÈS spécifiques
    if (
      texteUpper.includes('FATTURA RIEPILOGATIVA') ||
      texteUpper.includes('ITALESSE S.P.A.') ||
      texteUpper.includes('ITALESSE SPA') ||
      (texteUpper.includes('VELA') && texteUpper.includes('BUCKET') && !texteUpper.includes('LEHMANN')) ||
      (texteUpper.includes('RELAIS DES COCHES') && !texteUpper.includes('LEHMANN'))
    ) {
      console.log('[DETECTION] ✅ ITALESSE détecté');
      return 'ITALESSE';
    }
    
    console.log('[DETECTION] ❌ Aucun fournisseur détecté');
    return null;
  } catch (error) {
    console.warn('[DETECTION] Erreur lors de la détection du fournisseur depuis le contenu:', error);
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
            console.log('[DETECTION] Recherche depuis le nom de fichier:', nomFichier);
            
            // LEHMANN : fichiers "F1.pdf", "F2.pdf", etc. (PRIORITÉ)
            if (nomFichier.match(/^F\d+\.PDF$/i) || nomFichier.includes('LEHMANN')) {
              fournisseurDetecte = 'LEHMANN';
              console.log('[DETECTION] ✅ LEHMANN détecté depuis le nom de fichier');
            } 
            // RB DRINKS
            else if (nomFichier.includes('RB') || nomFichier.startsWith('RB')) {
              fournisseurDetecte = 'RB DRINKS';
              console.log('[DETECTION] ✅ RB DRINKS détecté depuis le nom de fichier');
            } 
            // ITALESSE : fichiers "RELAIS DES COCHES F. XXXX.pdf" ou "I1.pdf", etc.
            else if (nomFichier.includes('RELAIS DES COCHES') || nomFichier.match(/^I\d+\.PDF$/i)) {
              fournisseurDetecte = 'ITALESSE';
              console.log('[DETECTION] ✅ ITALESSE détecté depuis le nom de fichier');
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



