/**
 * Parser pour les factures ITALESSE
 * Analyse le contenu réel des PDFs
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';

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

      const convertirDate = (valeur?: string): Date | undefined => {
        if (!valeur) return undefined;
        const [jourStr, moisStr, anneeStr] = valeur.split(/[\/\-\.]/);
        const jour = parseInt(jourStr, 10);
        const mois = parseInt(moisStr, 10);
        let annee = parseInt(anneeStr, 10);
        if (anneeStr.length === 2) {
          annee = annee < 50 ? 2000 + annee : 1900 + annee;
        }
        if (isNaN(jour) || isNaN(mois) || isNaN(annee)) {
          return undefined;
        }
        return new Date(annee, mois - 1, jour);
      };

      const extraireDateProche = (labelRegex: RegExp): Date | undefined => {
        const match = labelRegex.exec(textePDF);
        if (!match || match.index === undefined) {
          return undefined;
        }
        const startIndex = match.index + match[0].length;
        const segment = textePDF.slice(startIndex, startIndex + 500);
        const dateMatch = segment.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
        if (!dateMatch) {
          return undefined;
        }
        return convertirDate(dateMatch[1]);
      };

      const numeroDocMatch = textePDF.match(/Numero\s+doc\.\/\s*Doc\. No\.\s+([A-Z0-9\/\-]+)/i);
      const numero = (numeroDocMatch ? numeroDocMatch[1].trim() : nomFichier.replace(/\.[^.]+$/, '')).toUpperCase();

      const dateCommande = extraireDateProche(/Data\s+doc\.\/\s*Date/i);
      const dateLivraison = extraireDateProche(/Data\s+Cons\.\s*\/\s*Delivery\s+Date/i);
      const date = dateCommande || convertirDate(textePDF.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/)?.[1]) || new Date();

      const extraireTotal = (labelRegex: RegExp) => {
        const match = textePDF.match(labelRegex);
        if (!match) return null;
        return nettoyerNombreItalien(match[1]);
      };

      const nettoyerNombreItalien = (valeur: string | undefined): number => {
        if (!valeur) return 0;
        const normalisee = valeur
          .replace(/\s+/g, '')
          .replace(/\./g, '')
          .replace(',', '.');
        const resultat = parseFloat(normalisee);
        return isNaN(resultat) ? 0 : resultat;
      };

      const nettoyerDescription = (texte: string): { description: string; logo?: string; bat?: string } => {
        let clean = texte.replace(/\s+/g, ' ').trim();
        clean = clean.replace(/IDEM DERNIERE COMMANDE/gi, '').trim();

        let bat: string | undefined;
        const batMatch = clean.match(/PROTOCOLLO\s+N\.\s*([A-Z0-9\-\s]+)/i);
        if (batMatch) {
          bat = batMatch[1].trim();
          clean = clean.replace(batMatch[0], '').trim();
        }

        let logo: string | undefined;
        const logoMatch = clean.match(/MARQUAGE.+/i);
        if (logoMatch) {
          const index = logoMatch.index || 0;
          logo = clean.substring(index).trim();
          clean = clean.substring(0, index).trim();
        }

        const [nomProduit, ...rest] = clean.split(' BOITE DE ');
        const description = rest.length > 0 ? `${nomProduit.trim()} - BOITE DE ${rest.join(' BOITE DE ').trim()}` : clean;

        return { description, logo, bat };
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

        const { description, logo, bat } = nettoyerDescription(descriptionBrute);

        lignes.push({
          description,
          refFournisseur: ref,
          bat,
          logo: couleur && couleur !== '-' ? couleur : logo,
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

      const totalHTExtrait = extraireTotal(/TOTALE\s+ORDINE\s*\/\s*TOTAL AMOUNT\s+([\d\.\s,]+)/i);
      const totalHT = totalHTExtrait ?? totalHTLignes;
      const totalTVA = 0;
      const totalTTC = totalHT;

      const facture: Facture = {
        id: `italesse-${numero}-${Date.now()}`,
        fournisseur: 'ITALESSE',
        numero,
        date,
        dateCommande,
        dateLivraison,
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
