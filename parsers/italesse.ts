/**
 * Parser pour les factures ITALESSE
 * Analyse le contenu réel des PDFs
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';
import { extracteurs } from '../src/utils/pdfParser';

export const parserItalesse: Parser = {
  fournisseur: 'ITALESSE',
  extensionsSupportees: ['.pdf'],
  
  parser: async (fichier: File | string): Promise<ParserResult> => {
    const erreurs: string[] = [];
    const avertissements: string[] = [];
    
    try {
      let textePDF: string;
      let nomFichier: string;
      
      if (typeof fichier === 'string') {
        nomFichier = fichier.split(/[/\\]/).pop() || 'I1.pdf';
        throw new Error('Le parsing depuis un chemin nécessite un serveur backend');
      } else {
        nomFichier = fichier.name;
        textePDF = await extraireTextePDF(fichier);
      }

      // Extraction du numéro de facture
      const numeroPatterns = [
        /facture\s*n[°o]?\s*:?\s*([A-Z0-9\-]+)/i,
        /n[°o]?\s*facture\s*:?\s*([A-Z0-9\-]+)/i,
        /I\s*(\d+)/i,
        /(\d+)/,
      ];
      const numero = extracteurs.extraireNumeroFacture(textePDF, numeroPatterns) || 
                     nomFichier.match(/I(\d+)/i)?.[1] || 
                     'INCONNU';

      // Extraction de la date
      const datePatterns = [
        /date\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/,
      ];
      const date = extracteurs.extraireDate(textePDF, datePatterns) || new Date();

      // Extraction des totaux
      const totalHTPatterns = [
        /total\s*ht\s*:?\s*([\d\s,\.]+)/i,
        /ht\s*total\s*:?\s*([\d\s,\.]+)/i,
        /sous\s*total\s*ht\s*:?\s*([\d\s,\.]+)/i,
      ];
      const totalHT = extracteurs.extraireMontant(textePDF, totalHTPatterns) || 0;

      const totalTVAPatterns = [
        /tva\s*:?\s*([\d\s,\.]+)/i,
        /total\s*tva\s*:?\s*([\d\s,\.]+)/i,
      ];
      const totalTVA = extracteurs.extraireMontant(textePDF, totalTVAPatterns) || 0;

      const totalTTCPatterns = [
        /total\s*ttc\s*:?\s*([\d\s,\.]+)/i,
        /ttc\s*:?\s*([\d\s,\.]+)/i,
        /total\s*:?\s*([\d\s,\.]+)/i,
        /à\s*payer\s*:?\s*([\d\s,\.]+)/i,
      ];
      const totalTTC = extracteurs.extraireMontant(textePDF, totalTTCPatterns) || 
                       (totalHT + totalTVA);

      // Extraction des lignes de produits
      const lignes: LigneProduit[] = [];
      
      const lignesPattern = /(.+?)\s+(\d+(?:[.,]\d+)?)\s+([\d\s,\.]+)\s+([\d\s,\.]+)/g;
      const matches = [...textePDF.matchAll(lignesPattern)];
      
      if (matches.length > 0) {
        for (const match of matches.slice(0, 20)) {
          const description = match[1]?.trim() || '';
          const quantite = parseFloat(match[2]?.replace(',', '.') || '1');
          const prixUnitaire = parseFloat(match[3]?.replace(/\s/g, '').replace(',', '.') || '0');
          const montantHT = parseFloat(match[4]?.replace(/\s/g, '').replace(',', '.') || '0');
          
          if (description && !description.match(/total|tva|ht|ttc|sous-total/i)) {
            lignes.push({
              description,
              quantite,
              prixUnitaireHT: prixUnitaire,
              remise: 0,
              montantHT,
            });
          }
        }
      }

      if (lignes.length === 0) {
        lignes.push({
          description: 'Produits ITALESSE',
          quantite: 1,
          prixUnitaireHT: totalHT,
          remise: 0,
          montantHT: totalHT,
        });
        avertissements.push('Aucune ligne de produit détectée. Ligne par défaut créée.');
      }

      const facture: Facture = {
        id: `italesse-${numero}-${Date.now()}`,
        fournisseur: 'ITALESSE',
        numero: numero.startsWith('I') ? numero : `I${numero}`,
        date,
        fichierPDF: nomFichier,
        lignes,
        totalHT,
        totalTVA,
        totalTTC,
        dateImport: new Date(),
        donneesBrutes: {
          texteExtrait: textePDF.substring(0, 2000), // Garder un extrait pour debug (2000 caractères)
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
      
      const nomFichier = typeof fichier === 'string' 
        ? fichier.split(/[/\\]/).pop() || 'I1.pdf'
        : fichier.name;
      const match = nomFichier.match(/I(\d+)/i);
      const numero = match ? match[1] : '1';
      
      return {
        facture: {
          id: `italesse-${numero}-${Date.now()}`,
          fournisseur: 'ITALESSE',
          numero: `I${numero}`,
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
