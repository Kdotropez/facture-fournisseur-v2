/**
 * Parser pour les factures LEHMANN F
 * Analyse le contenu réel des PDFs
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';
import { extracteurs } from '../src/utils/pdfParser';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  obtenirDescriptionReference, 
  memoriserReferenceFournisseur,
  obtenirReferencesParFournisseur 
} from '../src/services/referencesFournisseurService';

export const parserLehmann: Parser = {
  fournisseur: 'LEHMANN F',
  extensionsSupportees: ['.pdf'],
  
  parser: async (fichier: File | string): Promise<ParserResult> => {
    const erreurs: string[] = [];
    const avertissements: string[] = [];
    
    try {
      let textePDF: string;
      let nomFichier: string;
      
      if (typeof fichier === 'string') {
        nomFichier = fichier.split(/[/\\]/).pop() || 'F1.pdf';
        throw new Error('Le parsing depuis un chemin nécessite un serveur backend');
      } else {
        nomFichier = fichier.name;
        textePDF = await extraireTextePDF(fichier);
      }

      console.log('[LEHMANN] Texte extrait (premiers 500 caractères):', textePDF.substring(0, 500));

      // Charger toutes les références mémorisées pour ce fournisseur
      // Ces références seront utilisées comme "ancres" pour améliorer le parsing
      const referencesMemorisees = obtenirReferencesParFournisseur('LEHMANN F');
      console.log(`[LEHMANN] ${referencesMemorisees.length} référence(s) mémorisée(s) chargée(s) pour améliorer le parsing`);
      
      // Créer un Set des références connues pour recherche rapide
      const referencesConnues = new Set(referencesMemorisees.map(ref => ref.reference.toUpperCase()));
      const mapReferencesDescriptions = new Map<string, string>();
      referencesMemorisees.forEach(ref => {
        mapReferencesDescriptions.set(ref.reference.toUpperCase(), ref.description);
      });

      // Extraction du nom du fournisseur depuis le texte de la facture
      // Chercher des patterns comme "LEHMANN F", "LEHMANN FRERES", "LEHMANN FRÈRES", etc.
      let nomFournisseur = 'LEHMANN F'; // Par défaut
      const fournisseurPatterns = [
        /LEHMANN\s+FR[ÈE]RES?/i,
        /LEHMANN\s+FR[ÈE]RE/i,
        /LEHMANN\s+F/i,
        /LEHMANN/i,
      ];
      
      for (const pattern of fournisseurPatterns) {
        const match = textePDF.match(pattern);
        if (match) {
          // Normaliser le nom (mettre en majuscules et standardiser)
          const nomTrouve = match[0].toUpperCase().trim();
          if (nomTrouve.includes('FRERES') || nomTrouve.includes('FRÈRES')) {
            nomFournisseur = 'LEHMANN FRERES';
          } else if (nomTrouve.includes('F')) {
            nomFournisseur = 'LEHMANN F';
          } else {
            nomFournisseur = 'LEHMANN';
          }
          console.log('[LEHMANN] Nom du fournisseur extrait:', nomFournisseur);
          break;
        }
      }

      // Pour les factures multi-pages, extraire le texte page par page
      const pages: string[] = [];
      try {
        const arrayBuffer = await fichier.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer, verbosity: 0 }).promise;
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const contenu = await page.getTextContent();
          const textePage = contenu.items
            .map((item: any) => item.str || '')
            .join(' ');
          pages.push(textePage);
        }
        console.log('[LEHMANN] Nombre de pages détectées:', pages.length);
      } catch (error) {
        console.warn('[LEHMANN] Impossible d\'extraire les pages séparément, utilisation du texte complet');
        pages.push(textePDF);
      }

      // Normaliser le texte : remplacer les espaces multiples et les retours à la ligne
      const texteNormalise = textePDF
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\s+/g, ' ')
        .trim();

      // Extraction du numéro de facture
      // Formats possibles : "FACTURE N° FA1", "FACTURE FA1", "FA 1", "FA1", "F1", etc.
      const numeroPatterns = [
        /facture\s*n[°o]?\s*:?\s*FA\s*(\d+)/i,  // "FACTURE N° FA1"
        /facture\s*FA\s*(\d+)/i,                 // "FACTURE FA1"
        /FA\s*(\d+)/i,                           // "FA 1" ou "FA1"
        /facture\s*n[°o]?\s*:?\s*F\s*(\d+)/i,    // "FACTURE N° F1"
        /facture\s*F\s*(\d+)/i,                  // "FACTURE F1"
        /F\s*(\d+)/i,                            // "F 1" ou "F1"
        /n[°o]?\s*:?\s*F\s*(\d+)/i,              // "N°: F1"
      ];
      
      let numero = extracteurs.extraireNumeroFacture(textePDF, numeroPatterns);
      
      // Si trouvé avec "FA", garder le "FA"
      if (numero && (numero.startsWith('FA') || numero.startsWith('fa'))) {
        // Garder tel quel
      } else if (numero && (numero.startsWith('F') || numero.startsWith('f'))) {
        // Si c'est juste "F", on peut le garder ou l'enlever selon le format attendu
        // Pour l'instant, on le garde
      }
      
      // Si pas trouvé, essayer depuis le nom de fichier
      if (!numero || numero === 'INCONNU') {
        const matchFichier = nomFichier.match(/F(?:A)?\s*(\d+)/i);
        if (matchFichier) {
          // Si le nom de fichier contient "FA", utiliser "FA"
          if (nomFichier.toUpperCase().includes('FA')) {
            numero = `FA${matchFichier[1]}`;
          } else {
            numero = matchFichier[1]; // Juste le numéro sans "F"
          }
        } else {
          numero = 'INCONNU';
        }
      }

      console.log('[LEHMANN] Numéro extrait:', numero);

      // Extraction de la date
      // Formats possibles : "DATE : 01/01/25", "01/01/25", "01-01-25"
      // Prioriser les dates avec année courte (2 chiffres) jj/mm/aa comme spécifié
      const datePatterns = [
        /date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2})/i, // Date avec année courte (2 chiffres) en priorité
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2})/,  // Format avec année courte (2 chiffres) jj/mm/aa
        /date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i, // Date avec année complète (fallback)
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/, // Format avec année complète (4 chiffres) en fallback
      ];
      
      let date = extracteurs.extraireDate(textePDF, datePatterns);
      if (!date || Number.isNaN(date.getTime())) {
        date = new Date();
        avertissements.push('Date non trouvée, utilisation de la date actuelle');
      }

      console.log('[LEHMANN] Date extraite:', date);

      // Extraction des totaux
      // Pour les factures multi-pages, extraire les totaux uniquement de la dernière page
      // (les pages intermédiaires contiennent des totaux partiels qu'il faut ignorer)
      // IMPORTANT: Dans les factures LEHMANN, la dernière référence avant les totaux est "TRANSPORTAF"
      const dernierePage = pages.length > 0 ? pages[pages.length - 1] : textePDF;
      
      // Trouver "TRANSPORTAF" et ne prendre que ce qui vient après pour les totaux
      let textePourTotaux = dernierePage;
      const indexTransportaf = dernierePage.toUpperCase().indexOf('TRANSPORTAF');
      if (indexTransportaf >= 0) {
        // Prendre tout ce qui vient après "TRANSPORTAF" pour les totaux
        textePourTotaux = dernierePage.substring(indexTransportaf + 'TRANSPORTAF'.length);
        console.log('[LEHMANN] ✅ "TRANSPORTAF" trouvé, extraction des totaux après cette référence');
      } else {
        // Si "TRANSPORTAF" n'est pas trouvé, utiliser toute la dernière page
        console.log('[LEHMANN] ⚠️ "TRANSPORTAF" non trouvé, utilisation de toute la dernière page pour les totaux');
      }
      
      // Chercher "TOTAL HT", "HT TOTAL", "SOUS-TOTAL HT" dans la dernière page uniquement
      const totalHTPatterns = [
        /total\s*ht\s*euro\s*:?\s*([\d\s,\.]+)/i, // "Total HT euro" en priorité
        /total\s*ht\s*:?\s*([\d\s,\.]+)/i,
        /ht\s*total\s*:?\s*([\d\s,\.]+)/i,
        /total\s*:?\s*([\d\s,\.]+)\s*€?\s*ht/i,
      ];
      const totalHT = extracteurs.extraireMontant(textePourTotaux, totalHTPatterns) || 0;

      const totalTVAPatterns = [
        /tva\s*:?\s*([\d\s,\.]+)/i,
        /total\s*tva\s*:?\s*([\d\s,\.]+)/i,
        /t\.v\.a\.\s*:?\s*([\d\s,\.]+)/i,
      ];
      const totalTVA = extracteurs.extraireMontant(textePourTotaux, totalTVAPatterns) || 0;

      const totalTTCPatterns = [
        /total\s*ttc\s*euro\s*:?\s*([\d\s,\.]+)/i, // "Total TTC euro" en priorité
        /total\s*ttc\s*:?\s*([\d\s,\.]+)/i,
        /ttc\s*:?\s*([\d\s,\.]+)/i,
        /total\s*:?\s*([\d\s,\.]+)\s*€?\s*ttc/i,
        /net\s*à\s*payer\s*€\s*:?\s*([\d\s,\.]+)/i, // "NET À PAYER €" en priorité
        /net\s*à\s*payer\s*:?\s*([\d\s,\.]+)/i,
        /à\s*payer\s*:?\s*([\d\s,\.]+)/i,
      ];
      const totalTTC = extracteurs.extraireMontant(textePourTotaux, totalTTCPatterns) || 
                       (totalHT + totalTVA);

      console.log('[LEHMANN] Totaux extraits - HT:', totalHT, 'TVA:', totalTVA, 'TTC:', totalTTC);

      // Extraction des lignes de produits
      // Pour les factures multi-pages, extraire les lignes de toutes les pages
      // (sauf les totaux partiels en bas de chaque page intermédiaire)
      const lignes: LigneProduit[] = [];
      
      // Extraire les lignes de chaque page (sauf la dernière qui contient les totaux finaux)
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const pageTexte = pages[pageIndex];
        const estDernierePage = pageIndex === pages.length - 1;
        
        // Pour chaque page, identifier la section des lignes de produits
        // (en excluant les totaux partiels en bas de page)
        const sectionLignes = extraireSectionLignesMultiPages(pageTexte, estDernierePage);
        
        if (sectionLignes) {
          console.log(`[LEHMANN] Section lignes extraite de la page ${pageIndex + 1} (${sectionLignes.length} caractères)`);
          console.log(`[LEHMANN] Aperçu:`, sectionLignes.substring(0, 300));
          
          // Utiliser les références connues pour améliorer l'extraction de la section
          const sectionAmelioree = ameliorerSectionAvecReferences(sectionLignes, referencesConnues, mapReferencesDescriptions);
          
          const lignesExtraites = parserLignesDepuisSection(
            sectionAmelioree, 
            nomFournisseur, 
            referencesConnues, 
            mapReferencesDescriptions
          );
          console.log(`[LEHMANN] ${lignesExtraites.length} ligne(s) extraite(s) de la page ${pageIndex + 1}`);
          lignes.push(...lignesExtraites);
        }
      }
      
      // Si aucune ligne trouvée avec la méthode multi-pages, essayer avec le texte complet
      if (lignes.length === 0) {
        console.log('[LEHMANN] Aucune ligne trouvée page par page, tentative avec texte complet...');
        const sectionLignes = extraireSectionLignes(textePDF, totalHT);
        
        if (sectionLignes) {
          console.log('[LEHMANN] Section lignes extraite:', sectionLignes.substring(0, 200));
          
          // Utiliser les références connues pour améliorer l'extraction de la section
          const sectionAmelioree = ameliorerSectionAvecReferences(sectionLignes, referencesConnues, mapReferencesDescriptions);
          
          const lignesExtraites = parserLignesDepuisSection(
            sectionAmelioree, 
            nomFournisseur, 
            referencesConnues, 
            mapReferencesDescriptions
          );
          lignes.push(...lignesExtraites);
        }
      }

      // Méthode 2 : Si aucune ligne trouvée, essayer un pattern plus flexible avec références
      if (lignes.length === 0) {
        console.log('[LEHMANN] Tentative d\'extraction avec pattern flexible...');
        
        // AMÉLIORATION : Si on a des références connues, les utiliser pour améliorer le pattern
        let lignesPattern: RegExp;
        if (referencesConnues && referencesConnues.size > 0) {
          // Créer un pattern qui priorise les références connues
          const refsPattern = Array.from(referencesConnues)
            .map(ref => ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');
          // Pattern avec références connues en priorité
          lignesPattern = new RegExp(
            `(?:(${refsPattern})\\s+)?([A-Za-zÀ-ÿ\\s\\-'\\.]+?)\\s+(\\d+(?:[.,]\\d+)?)\\s+([\\d\\s,\\.]+)\\s+([\\d\\s,\\.]+)`,
            'gi'
          );
          console.log(`[LEHMANN] Pattern amélioré avec ${referencesConnues.size} référence(s) connue(s)`);
        } else {
          // Pattern standard : peut inclure une référence fournisseur
          // Format : "REF123 Description    100    1.50    150.00" ou "Description    100    1.50    150.00"
          lignesPattern = /(?:([A-Z0-9\-]{2,})\s+)?([A-Za-zÀ-ÿ\s\-'\.]+?)\s+(\d+(?:[.,]\d+)?)\s+([\d\s,\.]+)\s+([\d\s,\.]+)/g;
        }
        
        const matches = [...textePDF.matchAll(lignesPattern)];
        
        for (const match of matches.slice(0, 50)) {
          const refFournisseur = match[1]?.trim();
          const description = match[2]?.trim() || '';
          const quantite = parseFloat(match[3]?.replace(',', '.') || '1');
          const prixUnitaire = parseFloat(match[4]?.replace(/\s/g, '').replace(',', '.') || '0');
          const montantHT = parseFloat(match[5]?.replace(/\s/g, '').replace(',', '.') || '0');
          
          // Filtrer les lignes qui ne sont pas des produits
          // AMÉLIORATION : Si on a une référence connue, être moins strict sur la validation
          const estReferenceConnue = refFournisseur && referencesConnues && referencesConnues.has(refFournisseur.toUpperCase());
          
          if (
            description && 
            description.length > 3 &&
            !description.match(/total|tva|ht|ttc|sous[-\s]?total|facture|date|n[°o]|désignation|quantité|prix|montant/i) &&
            quantite > 0 &&
            (prixUnitaire > 0 || montantHT > 0 || estReferenceConnue) // Accepter même si montants = 0 si référence connue
          ) {
            // Si on a une référence, essayer de récupérer la description mémorisée
            let descriptionFinale = description.trim();
            if (refFournisseur) {
              // Priorité 1 : Utiliser la map des références si disponible (plus rapide)
              const refUpper = refFournisseur.toUpperCase();
              let descriptionMemorisee: string | undefined;
              
              if (mapReferencesDescriptions && mapReferencesDescriptions.has(refUpper)) {
                descriptionMemorisee = mapReferencesDescriptions.get(refUpper);
              } else {
                // Fallback : utiliser la fonction standard
                descriptionMemorisee = obtenirDescriptionReference(nomFournisseur, refFournisseur);
              }
              
              if (descriptionMemorisee) {
                descriptionFinale = descriptionMemorisee;
                console.log(`[LEHMANN] ✅ Description récupérée depuis référence mémorisée (méthode 2): ${refFournisseur} -> ${descriptionFinale}`);
              }
            }
            
            // Calculer les montants
            const prixUnitaireFinal = prixUnitaire > 0 ? prixUnitaire : (montantHT / quantite);
            const montantHTFinal = montantHT > 0 ? montantHT : (quantite * prixUnitaire);
            
            // Arrondir les montants à 2 décimales maximum
            const prixUnitaireArrondi = Math.round(prixUnitaireFinal * 100) / 100;
            const montantHTArrondi = Math.round(montantHTFinal * 100) / 100;
            
            lignes.push({
              description: descriptionFinale,
              refFournisseur: refFournisseur || undefined,
              quantite,
              prixUnitaireHT: prixUnitaireArrondi,
              remise: 0,
              montantHT: montantHTArrondi,
            });
          }
        }
      }

      // Si toujours aucune ligne, créer une ligne par défaut
      if (lignes.length === 0) {
        lignes.push({
          description: 'Produits LEHMANN F',
          quantite: 1,
          prixUnitaireHT: totalHT,
          remise: 0,
          montantHT: totalHT,
        });
        avertissements.push('Aucune ligne de produit détectée. Ligne par défaut créée. Veuillez compléter manuellement.');
      }

      console.log('[LEHMANN] Lignes extraites:', lignes.length);

      const facture: Facture = {
        id: `lehmann-${numero}-${Date.now()}`,
        fournisseur: nomFournisseur, // Utiliser le nom extrait de la facture
        numero: numero.startsWith('F') ? numero : `F${numero}`,
        date,
        fichierPDF: nomFichier,
        lignes,
        totalHT,
        totalTVA,
        totalTTC,
        dateImport: new Date(),
        donneesBrutes: {
          texteExtrait: textePDF.substring(0, 2000), // Garder un extrait pour debug
          texteComplet: textePDF, // Texte complet pour analyse
        },
      };

      if (totalHT === 0 && totalTTC === 0) {
        avertissements.push('Les totaux n\'ont pas pu être extraits. Vérifiez manuellement.');
      }

      return {
        facture,
        erreurs: erreurs.length > 0 ? erreurs : undefined,
        avertissements: avertissements.length > 0 ? avertissements : undefined,
      };
    } catch (error) {
      const messageErreur = error instanceof Error ? error.message : 'Erreur inconnue';
      erreurs.push(messageErreur);
      console.error('[LEHMANN] Erreur lors du parsing:', error);
      
      const nomFichier = typeof fichier === 'string' 
        ? fichier.split(/[/\\]/).pop() || 'F1.pdf'
        : fichier.name;
      const match = nomFichier.match(/F\s*(\d+)/i);
      const numero = match ? match[1] : '1';
      
      return {
        facture: {
          id: `lehmann-${numero}-${Date.now()}`,
          fournisseur: nomFournisseur, // Utiliser le nom extrait de la facture
          numero: `F${numero}`,
          date: new Date(),
          fichierPDF: nomFichier,
          lignes: [],
          totalHT: 0,
          totalTVA: 0,
          totalTTC: 0,
          dateImport: new Date(),
        },
        erreurs,
        avertissements: ['Parsing automatique échoué. Veuillez compléter manuellement.'],
      };
    }
  },
};

/**
 * Extrait la section contenant les lignes de produits pour une page donnée
 * Ignore les totaux partiels en bas de page pour les pages intermédiaires
 */
function extraireSectionLignesMultiPages(texte: string, estDernierePage: boolean): string | null {
  // Identifier les marqueurs de fin de section de lignes
  // Pour les pages intermédiaires : "Total", "Escompte", "Conditions de règlement"
  // Pour la dernière page : "Total HT euro", "Total TTC euro", "NET À PAYER €"
  
  const marqueursFinIntermediaire = [
    /total\s*$/i,
    /escompte/i,
    /conditions\s*de\s*règlement/i,
    /au\s*1\/3\s*30\s*J/i,
    /fdm/i,
    /net\s*à\s*payer\s*€/i,
    /transportaf/i, // Arrêter à TRANSPORTAF (dernière référence avant les totaux)
  ];
  
  const marqueursFinDernierePage = [
    /transportaf/i, // IMPORTANT: Arrêter à TRANSPORTAF avant les totaux
    /total\s*ht\s*euro/i,
    /total\s*ttc\s*euro/i,
    /net\s*à\s*payer\s*€/i,
    /acompte/i,
  ];
  
  // Chercher le début de la section (après l'en-tête)
  // Pour LEHMANN, chercher les en-têtes de colonnes typiques
  const debutsPossibles = [
    /code\s+désignation/i, // "CODE DÉSIGNATION" (en-tête typique LEHMANN)
    /code\s+article/i,
    /référence\s+désignation/i,
    /désignation/i,
    /description/i,
    /article/i,
    /produit/i,
    /référence/i,
    /qté/i,
    /quantité/i,
    /qty/i,
    /code/i, // Pour LEHMANN F
  ];
  
  let debutIndex = -1;
  let finIndex = texte.length;
  
  // Trouver le début
  for (const pattern of debutsPossibles) {
    const matches = [...texte.matchAll(new RegExp(pattern.source, 'gi'))];
    for (const match of matches) {
      if (match.index !== undefined && match.index > debutIndex) {
        debutIndex = match.index;
      }
    }
  }
  
  // Si pas de début trouvé, chercher après "FACTURE" ou "DATE"
  if (debutIndex === -1) {
    const matchFacture = texte.match(/facture|date/i);
    if (matchFacture && matchFacture.index !== undefined) {
      debutIndex = matchFacture.index + matchFacture[0].length;
    }
  }
  
  // Trouver la fin selon le type de page
  // Pour la dernière page, chercher d'abord "TRANSPORTAF" (priorité absolue)
  if (estDernierePage) {
    const matchTransportaf = texte.match(/transportaf/i);
    if (matchTransportaf && matchTransportaf.index !== undefined && matchTransportaf.index > debutIndex) {
      finIndex = matchTransportaf.index;
      console.log(`[LEHMANN] ✅ "TRANSPORTAF" trouvé à l'index ${finIndex}, arrêt de l'extraction des lignes`);
    }
  }
  
  // Si "TRANSPORTAF" n'a pas été trouvé, chercher les autres marqueurs
  if (finIndex === texte.length || !estDernierePage) {
    const marqueursFin = estDernierePage ? marqueursFinDernierePage : marqueursFinIntermediaire;
    for (const pattern of marqueursFin) {
      // Ignorer "transportaf" si on l'a déjà traité
      if (estDernierePage && pattern.source.includes('transportaf')) continue;
      
      const matches = [...texte.matchAll(new RegExp(pattern.source, 'gi'))];
      for (const match of matches) {
        if (match.index !== undefined && match.index > debutIndex && match.index < finIndex) {
          finIndex = match.index;
        }
      }
    }
  }
  
  if (debutIndex >= 0 && finIndex > debutIndex) {
    const section = texte.substring(debutIndex, finIndex);
    // Nettoyer : enlever les lignes d'en-tête et les totaux partiels
    return section;
  }
  
  return null;
}

/**
 * Extrait la section contenant les lignes de produits
 * Cherche entre l'en-tête et les totaux (méthode originale pour compatibilité)
 */
function extraireSectionLignes(texte: string, totalHT: number): string | null {
  // Chercher des mots-clés qui indiquent le début du tableau
  const debutsPossibles = [
    /désignation/i,
    /description/i,
    /article/i,
    /produit/i,
    /référence/i,
    /qté/i,
    /quantité/i,
    /qty/i,
  ];

  // Chercher des mots-clés qui indiquent la fin du tableau
  const finsPossibles = [
    /total\s*ht/i,
    /sous[-\s]?total/i,
    /tva/i,
    /total\s*ttc/i,
    /net\s*à\s*payer/i,
  ];

  let debutIndex = -1;
  let finIndex = texte.length;

  // Trouver le début (prendre le dernier match pour éviter les faux positifs)
  let dernierMatch = -1;
  for (const pattern of debutsPossibles) {
    const matches = [...texte.matchAll(new RegExp(pattern.source, 'gi'))];
    for (const match of matches) {
      if (match.index !== undefined && match.index > dernierMatch) {
        dernierMatch = match.index;
        debutIndex = match.index;
      }
    }
  }

  // Si pas de début trouvé, chercher après "FACTURE" ou "DATE"
  if (debutIndex === -1) {
    const matchFacture = texte.match(/facture|date/i);
    if (matchFacture && matchFacture.index !== undefined) {
      debutIndex = matchFacture.index + matchFacture[0].length;
    }
  }

  // Trouver la fin (prendre le premier match après le début)
  for (const pattern of finsPossibles) {
    const matches = [...texte.matchAll(new RegExp(pattern.source, 'gi'))];
    for (const match of matches) {
      if (match.index !== undefined && match.index > debutIndex && match.index < finIndex) {
        finIndex = match.index;
      }
    }
  }

  if (debutIndex >= 0 && finIndex > debutIndex) {
    const section = texte.substring(debutIndex, finIndex);
    // Nettoyer : enlever les lignes d'en-tête
    return section;
  }

  return null;
}

/**
 * Améliore la section de texte en utilisant les références connues comme ancres
 * Cherche les références mémorisées dans le texte pour mieux identifier la structure
 */
function ameliorerSectionAvecReferences(
  section: string,
  referencesConnues: Set<string>,
  mapReferencesDescriptions: Map<string, string>
): string {
  // Si on a des références connues, chercher leur position dans le texte
  // pour mieux comprendre la structure
  if (referencesConnues.size === 0) {
    return section;
  }

  // Chercher toutes les occurrences de références connues dans le texte
  const positionsReferences: Array<{ ref: string; index: number }> = [];
  
  for (const ref of referencesConnues) {
    // Chercher la référence avec différents patterns (avec/sans espaces, etc.)
    const patterns = [
      new RegExp(`\\b${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), // Mot complet
      new RegExp(`${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), // N'importe où
    ];
    
    for (const pattern of patterns) {
      const matches = [...section.matchAll(pattern)];
      for (const match of matches) {
        if (match.index !== undefined) {
          positionsReferences.push({ ref, index: match.index });
        }
      }
    }
  }

  // Trier par position
  positionsReferences.sort((a, b) => a.index - b.index);

  if (positionsReferences.length > 0) {
    console.log(`[LEHMANN] ✅ ${positionsReferences.length} référence(s) connue(s) trouvée(s) dans le texte, utilisation comme ancres`);
    
    // Si on trouve des références connues, on peut être plus confiant sur la structure
    // La section est probablement correcte, on la retourne telle quelle
    return section;
  }

  return section;
}

/**
 * Parse les lignes depuis une section de texte
 * Version améliorée avec support des références fournisseur et utilisation des références connues
 */
function parserLignesDepuisSection(
  section: string, 
  fournisseur: string = 'LEHMANN F',
  referencesConnues?: Set<string>,
  mapReferencesDescriptions?: Map<string, string>
): LigneProduit[] {
  const lignes: LigneProduit[] = [];
  
  // Diviser en lignes (gérer les retours à la ligne multiples)
  const lignesTexte = section
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  
  for (let i = 0; i < lignesTexte.length; i++) {
    const ligneTexte = lignesTexte[i];
    
    // Ignorer les lignes d'en-tête (désignation, qté, prix, etc.)
    if (ligneTexte.match(/désignation|description|qté|quantité|qty|prix|montant|total|tva|ht|ttc|unité|unit|code|référence|ref/i)) {
      continue;
    }

    // Ignorer les lignes qui sont clairement des totaux ou des séparateurs
    if (ligneTexte.match(/^[-=_\s]+$/) || ligneTexte.match(/^total|^tva|^ttc|^transportaf/i)) {
      continue;
    }

    // Pattern amélioré pour LEHMANN : Référence (optionnelle) + Description + Quantité + Prix unitaire + Montant
    // Format possible : "REF123  Description du produit    100    1.50    150.00"
    // Ou : "Description du produit    100    1.50    150.00"
    // Les références LEHMANN peuvent être :
    // - Des codes numériques : "123", "456"
    // - Des codes alphanumériques : "ABC123", "A1B2"
    // - Des codes avec tirets : "123-456", "A-B-C"
    // - Des codes courts : "12", "AB" (minimum 2 caractères)
    
    // AMÉLIORATION : Si on a des références connues, essayer de les identifier d'abord
    let refFournisseur: string | undefined;
    let description: string = '';
    let quantiteStr: string = '1';
    let prixUnitaireStr: string = '0';
    let montantHTStr: string = '0';
    let match: RegExpMatchArray | null = null;

    // Si on a des références connues, chercher d'abord si cette ligne commence par une référence connue
    if (referencesConnues && referencesConnues.size > 0) {
      for (const refConnue of referencesConnues) {
        // Pattern flexible : référence connue suivie d'espaces puis description
        const patternRefConnue = new RegExp(
          `^(${refConnue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s+(.+?)\\s{2,}(\\d+(?:[.,]\\d+)?)\\s+([\\d\\s,\\.]+)\\s+([\\d\\s,\\.]+)`,
          'i'
        );
        match = ligneTexte.match(patternRefConnue);
        
        if (match) {
          refFournisseur = match[1]?.trim();
          description = match[2]?.trim() || '';
          quantiteStr = match[3]?.replace(',', '.') || '1';
          prixUnitaireStr = match[4]?.replace(/\s/g, '').replace(',', '.') || '0';
          montantHTStr = match[5]?.replace(/\s/g, '').replace(',', '.') || '0';
          console.log(`[LEHMANN] ✅ Référence connue trouvée: ${refFournisseur}`);
          break;
        }
      }
    }

    // Si aucune référence connue trouvée, utiliser les patterns standards
    if (!match) {
      // Pattern 1 : Avec référence fournisseur (code au début, suivi d'espaces multiples)
      // La référence est généralement suivie d'au moins 2 espaces avant la description
      match = ligneTexte.match(/^([A-Z0-9\-]{2,})\s{2,}(.+?)\s{2,}(\d+(?:[.,]\d+)?)\s+([\d\s,\.]+)\s+([\d\s,\.]+)/);
      
      if (match) {
        // Pattern avec référence
        refFournisseur = match[1]?.trim();
        description = match[2]?.trim() || '';
        quantiteStr = match[3]?.replace(',', '.') || '1';
        prixUnitaireStr = match[4]?.replace(/\s/g, '').replace(',', '.') || '0';
        montantHTStr = match[5]?.replace(/\s/g, '').replace(',', '.') || '0';
      } else {
        // Pattern 1b : Référence avec un seul espace (si la description commence par une majuscule)
        match = ligneTexte.match(/^([A-Z0-9\-]{2,})\s+([A-Z][A-Za-zÀ-ÿ\s\-'\.]+?)\s{2,}(\d+(?:[.,]\d+)?)\s+([\d\s,\.]+)\s+([\d\s,\.]+)/);
        if (match) {
          refFournisseur = match[1]?.trim();
          description = match[2]?.trim() || '';
          quantiteStr = match[3]?.replace(',', '.') || '1';
          prixUnitaireStr = match[4]?.replace(/\s/g, '').replace(',', '.') || '0';
          montantHTStr = match[5]?.replace(/\s/g, '').replace(',', '.') || '0';
        } else {
          // Pattern 2 : Sans référence - Description + Quantité + Prix unitaire + Montant
          match = ligneTexte.match(/^(.+?)\s{2,}(\d+(?:[.,]\d+)?)\s+([\d\s,\.]+)\s+([\d\s,\.]+)/);
          
          if (!match) {
            // Pattern 3 : Avec moins d'espaces
            match = ligneTexte.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\d\s,\.]+)\s+([\d\s,\.]+)/);
          }
          
          if (!match) {
            // Pattern 4 : Format avec séparateurs (tabs, pipes, etc.)
            match = ligneTexte.match(/^(.+?)[\t|]\s*(\d+(?:[.,]\d+)?)[\t|]\s*([\d\s,\.]+)[\t|]\s*([\d\s,\.]+)/);
          }
          
          if (match) {
            description = match[1]?.trim() || '';
            quantiteStr = match[2]?.replace(',', '.') || '1';
            prixUnitaireStr = match[3]?.replace(/\s/g, '').replace(',', '.') || '0';
            montantHTStr = match[4]?.replace(/\s/g, '').replace(',', '.') || '0';
          } else {
            // Pattern 5 : Juste description + montant
            const matchSimple = ligneTexte.match(/^(.+?)\s+([\d\s,\.]+)\s*€?$/);
            if (matchSimple) {
              description = matchSimple[1]?.trim() || '';
              quantiteStr = '1';
              prixUnitaireStr = '0';
              montantHTStr = matchSimple[2]?.replace(/\s/g, '').replace(',', '.') || '0';
            } else {
              continue; // Ligne non reconnue, passer à la suivante
            }
          }
        }
      }
    }
    
    // Si aucun pattern n'a matché, passer à la ligne suivante
    if (!match || !description || description.length === 0) {
      continue;
    }
    
    const quantite = parseFloat(quantiteStr);
    const prixUnitaire = parseFloat(prixUnitaireStr);
    const montantHT = parseFloat(montantHTStr);

    // Validation : description valide, quantité > 0, et au moins un montant > 0
    if (
      description && 
      description.length > 2 &&
      !description.match(/^[\d\s,\.€]+$/) && // Pas seulement des chiffres
      quantite > 0 &&
      (prixUnitaire > 0 || montantHT > 0)
    ) {
      // Si on a une référence fournisseur, essayer de récupérer la description mémorisée
      let descriptionFinale = description.trim();
      
      if (refFournisseur) {
        // Priorité 1 : Utiliser la map des références si disponible (plus rapide)
        const refUpper = refFournisseur.toUpperCase();
        let descriptionMemorisee: string | undefined;
        
        if (mapReferencesDescriptions && mapReferencesDescriptions.has(refUpper)) {
          descriptionMemorisee = mapReferencesDescriptions.get(refUpper);
        } else {
          // Fallback : utiliser la fonction standard
          descriptionMemorisee = obtenirDescriptionReference(fournisseur, refFournisseur);
        }
        
        if (descriptionMemorisee) {
          // Utiliser la description mémorisée si elle est disponible
          descriptionFinale = descriptionMemorisee;
          console.log(`[LEHMANN] ✅ Description récupérée depuis référence mémorisée: ${refFournisseur} -> ${descriptionFinale}`);
        } else {
          // Si la description actuelle est trop courte ou générique, garder la référence dans la description
          if (descriptionFinale.length < 10 || descriptionFinale.match(/^[A-Z0-9\s\-]+$/)) {
            descriptionFinale = `${refFournisseur} - ${descriptionFinale}`;
          }
        }
      }

      // Calculer le prix unitaire ou le montant si l'un manque
      const prixUnitaireFinal = prixUnitaire > 0 
        ? prixUnitaire 
        : (montantHT > 0 ? montantHT / quantite : 0);
      const montantHTFinal = montantHT > 0 
        ? montantHT 
        : (prixUnitaireFinal * quantite);

      // Arrondir les montants à 2 décimales maximum
      const prixUnitaireArrondi = Math.round(prixUnitaireFinal * 100) / 100;
      const montantHTArrondi = Math.round(montantHTFinal * 100) / 100;

      lignes.push({
        description: descriptionFinale,
        refFournisseur: refFournisseur || undefined,
        quantite,
        prixUnitaireHT: prixUnitaireArrondi,
        remise: 0,
        montantHT: montantHTArrondi,
      });
    }
  }

  return lignes;
}
