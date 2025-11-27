/**
 * Utilitaire pour parser le contenu des fichiers PDF
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configuration de pdfjs-dist pour le worker
// Essayer plusieurs méthodes pour charger le worker
if (typeof window !== 'undefined') {
  try {
    // Méthode 1: Essayer avec unpkg (plus fiable)
    const version = pdfjsLib.version || '4.0.379';
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
    
    console.log('PDF.js worker configuré:', pdfjsLib.GlobalWorkerOptions.workerSrc);
    
    // Vérifier que le worker peut être chargé (en arrière-plan, ne pas bloquer)
    fetch(pdfjsLib.GlobalWorkerOptions.workerSrc, { method: 'HEAD' })
      .then(() => console.log('Worker PDF.js accessible'))
      .catch((err) => {
        console.warn('Worker PDF.js non accessible depuis unpkg, tentative avec cdnjs...', err);
        // Fallback vers cdnjs
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
      });
  } catch (error) {
    // Ignorer les erreurs d'extensions de navigateur
    console.warn('Erreur lors de la configuration du worker (peut être due à une extension):', error);
  }
}

/**
 * Extrait le texte d'un fichier PDF
 */
export async function extraireTextePDF(fichier: File): Promise<string> {
  try {
    console.log('Début de l\'extraction du texte PDF:', fichier.name);
    
    const arrayBuffer = await fichier.arrayBuffer();
    console.log('Fichier chargé, taille:', arrayBuffer.byteLength, 'bytes');
    
    // Configuration avec gestion d'erreurs améliorée
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      verbosity: 0, // Réduire les logs
      // Ignorer les erreurs d'extensions de navigateur
      stopAtErrors: false,
    });
    
    const pdf = await loadingTask.promise;
    console.log('PDF chargé, nombre de pages:', pdf.numPages);
    
    let texteComplet = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        console.log(`Extraction de la page ${i}/${pdf.numPages}...`);
        const page = await pdf.getPage(i);
        const contenu = await page.getTextContent();
        const textePage = contenu.items
          .map((item: any) => item.str || '')
          .join(' ');
        texteComplet += textePage + '\n';
      } catch (pageError) {
        console.warn(`Erreur lors de l'extraction de la page ${i}:`, pageError);
        // Continuer avec les autres pages même en cas d'erreur
      }
    }
    
    console.log('Texte extrait, longueur:', texteComplet.length, 'caractères');
    
    // Si aucun texte n'a été extrait, le PDF est probablement une image
    if (texteComplet.trim().length === 0) {
      throw new Error('Aucun texte extrait. Le PDF est probablement une image scannée (OCR nécessaire).');
    }
    
    return texteComplet;
  } catch (error) {
    console.error('Erreur détaillée lors de l\'extraction du texte PDF:', error);
    const messageErreur = error instanceof Error ? error.message : 'Erreur inconnue';
    
    // Ignorer les erreurs d'extensions de navigateur (CS WAX, ContentIsolatedWorld, etc.)
    if (messageErreur.includes('CS WAX') || 
        messageErreur.includes('ContentIsolatedWorld') ||
        messageErreur.includes('isolated world')) {
      console.warn('Erreur d\'extension de navigateur ignorée, tentative de continuation...');
      // Essayer de continuer quand même - peut-être que le PDF a quand même été chargé
      throw new Error('Erreur d\'extension de navigateur détectée. Veuillez désactiver temporairement les extensions de sécurité ou utiliser un mode navigation privée.');
    }
    
    // Messages d'erreur plus explicites
    if (messageErreur.includes('worker') || messageErreur.includes('Worker')) {
      throw new Error('Erreur de configuration du worker PDF.js. Vérifiez votre connexion internet ou désactivez temporairement les extensions de navigateur.');
    } else if (messageErreur.includes('Invalid PDF') || messageErreur.includes('corrupted')) {
      throw new Error('Le fichier PDF est corrompu ou invalide.');
    } else if (messageErreur.includes('password') || messageErreur.includes('encrypted')) {
      throw new Error('Le PDF est protégé par un mot de passe.');
    } else {
      throw new Error(`Impossible d'extraire le texte du PDF. Le PDF est peut-être une image scannée (OCR nécessaire). Détails: ${messageErreur}`);
    }
  }
}

/**
 * Extrait le texte d'un PDF depuis un chemin (pour analyse)
 */
export async function extraireTextePDFDepuisChemin(chemin: string): Promise<string> {
  try {
    // Pour l'analyse, on essaie de charger le fichier depuis le chemin
    // Note: Dans le navigateur, cela nécessitera un serveur qui sert les fichiers
    const response = await fetch(chemin);
    if (!response.ok) {
      throw new Error(`Impossible de charger le fichier: ${chemin}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let texteComplet = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const contenu = await page.getTextContent();
      const textePage = contenu.items
        .map((item: any) => item.str)
        .join(' ');
      texteComplet += textePage + '\n';
    }
    
    return texteComplet;
  } catch (error) {
    console.error('Erreur lors de l\'extraction du texte PDF:', error);
    throw new Error(`Impossible d'extraire le texte du PDF: ${chemin}`);
  }
}

/**
 * Fonctions utilitaires pour extraire des informations depuis le texte
 */
export const extracteurs = {
  /**
   * Extrait un numéro de facture depuis le texte
   */
  extraireNumeroFacture: (texte: string, patterns: RegExp[]): string | null => {
    for (const pattern of patterns) {
      const match = texte.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  },

  /**
   * Extrait une date depuis le texte
   */
  extraireDate: (texte: string, patterns: RegExp[]): Date | null => {
    for (const pattern of patterns) {
      const match = texte.match(pattern);
      if (match) {
        // Essayer de parser différentes formats de date
        const dateStr = match[1] || match[0];
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date;
        }
        
        // Essayer le format français DD/MM/YYYY
        const matchFR = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (matchFR) {
          const [, jour, mois, annee] = matchFR;
          return new Date(parseInt(annee), parseInt(mois) - 1, parseInt(jour));
        }
        
        // Essayer le format DD/MM/YY (année sur 2 chiffres)
        const matchFR2 = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2})/);
        if (matchFR2) {
          const [, jour, mois, annee2] = matchFR2;
          // Convertir YY en YYYY (si YY < 50, c'est 20YY, sinon 19YY)
          const annee = parseInt(annee2) < 50 ? 2000 + parseInt(annee2) : 1900 + parseInt(annee2);
          return new Date(annee, parseInt(mois) - 1, parseInt(jour));
        }
      }
    }
    return null;
  },

  /**
   * Extrait un montant depuis le texte
   */
  extraireMontant: (texte: string, patterns: RegExp[]): number | null => {
    for (const pattern of patterns) {
      const matches = Array.from(texte.matchAll(new RegExp(pattern.source, 'gi')));
      // Prendre le dernier match (généralement le total en bas de page)
      if (matches.length > 0) {
        const dernierMatch = matches[matches.length - 1];
        const montantStr = (dernierMatch[1] || dernierMatch[0])
          .replace(/\s/g, '')
          .replace(',', '.');
        const montant = parseFloat(montantStr);
        if (!isNaN(montant) && montant > 0) {
          console.log('Montant extrait:', montant, 'avec pattern:', pattern.source);
          return montant;
        }
      }
    }
    console.log('Aucun montant trouvé avec les patterns:', patterns.map(p => p.source));
    return null;
  },

  /**
   * Extrait plusieurs montants depuis le texte
   */
  extraireMontants: (texte: string, patterns: RegExp[]): number[] => {
    const montants: number[] = [];
    for (const pattern of patterns) {
      const matches = texte.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        const montantStr = (match[1] || match[0])
          .replace(/\s/g, '')
          .replace(',', '.');
        const montant = parseFloat(montantStr);
        if (!isNaN(montant)) {
          montants.push(montant);
        }
      }
    }
    return montants;
  },
};

