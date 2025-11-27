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

      const nettoyerNombreItalien = (valeur: string | undefined): number => {
        if (!valeur) return 0;
        const normalisee = valeur
          .replace(/\s+/g, '')
          .replace(/\./g, '')
          .replace(',', '.');
        const resultat = parseFloat(normalisee);
        return isNaN(resultat) ? 0 : resultat;
      };

      const extraireMontantItalien = (patterns: RegExp[]): number | null => {
        for (const pattern of patterns) {
          const match = textePDF.match(pattern);
          if (match && match[1]) {
            const montant = nettoyerNombreItalien(match[1]);
            if (montant > 0) {
              return montant;
            }
          }
        }
        return null;
      };

      // Extraction des lignes de produits
      const lignes: LigneProduit[] = [];
      const lignePattern = /(\d[\d\.]*)\s+(\d+,\d+)\s+(\d[\d\.,]+)\s+(.+?)\s+(?:PZ\s+)?([A-Z0-9\/]+)\s+(\d{3})\s+([0-9,]+\+[0-9,]+\+[0-9,]+)\s*([A-Z]+)?/gi;
      let ligneMatch: RegExpExecArray | null;

      while ((ligneMatch = lignePattern.exec(textePDF)) !== null) {
        const quantite = nettoyerNombreItalien(ligneMatch[1]);
        const prixUnitaire = nettoyerNombreItalien(ligneMatch[2]);
        const montantHT = nettoyerNombreItalien(ligneMatch[3]);
        const descriptionBrute = ligneMatch[4]?.replace(/\s+/g, ' ').trim() || '';
        const ref = ligneMatch[5]?.trim();
        const couleur = ligneMatch[8]?.trim();

        if (!ref || !descriptionBrute || quantite <= 0 || montantHT <= 0) {
          continue;
        }

        lignes.push({
          description: descriptionBrute,
          refFournisseur: ref,
          logo: couleur && couleur !== '-' ? couleur : undefined,
          quantite,
          prixUnitaireHT: prixUnitaire,
          remise: 0,
          montantHT,
        });
      }

      if (lignes.length === 0) {
        avertissements.push('Aucune ligne de produit détectée. Ligne par défaut créée.');
        lignes.push({
          description: 'Produits ITALESSE',
          quantite: 1,
          prixUnitaireHT: 0,
          remise: 0,
          montantHT: 0,
        });
      }

      const totalHTLignes = lignes.reduce((sum, ligne) => sum + ligne.montantHT, 0);

      const totalHTExtrait = extraireMontantItalien([
        /Totale\s+imponibile\s*\/\s*Taxable amount\s+([\d\.\s,]+)/i,
        /TOTALE\s+ORDINE\s*\/\s*TOTAL AMOUNT\s+([\d\.\s,]+)/i,
      ]);
      const totalTVAExtrait = extraireMontantItalien([
        /Totale\s+IVA\s*\/\s*V\.A\.T\. amount\s+([\d\.\s,]+)/i,
      ]);
      const totalTTCExtrait = extraireMontantItalien([
        /TOTALE\s+ORDINE\s*\/\s*TOTAL AMOUNT\s+([\d\.\s,]+)/i,
      ]);

      const totalHT = totalHTExtrait ?? totalHTLignes;
      const totalTVA = totalTVAExtrait ?? 0;
      const totalTTC = totalTTCExtrait ?? (totalHT + totalTVA);

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
