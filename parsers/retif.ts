/**
 * Parser pour les factures RETIF
 * Colonnes attendues: code, designation, quantite, px brut, remise, px net, total ht, code interne
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';

const arrondir2 = (valeur: number) =>
  Math.round((valeur + Number.EPSILON) * 100) / 100;

function parseNombreFR(valeur?: string): number {
  if (!valeur) return 0;
  const nettoyee = valeur.replace(/\s/g, '').replace(',', '.');
  const parsed = Number.parseFloat(nettoyee);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateFR(valeur?: string): Date | null {
  if (!valeur) return null;
  const match = valeur.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  const [, jour, mois, annee] = match;
  const date = new Date(Number.parseInt(annee, 10), Number.parseInt(mois, 10) - 1, Number.parseInt(jour, 10));
  return Number.isNaN(date.getTime()) ? null : date;
}

function estCodeRetif(token: string): boolean {
  const propre = (token || '').trim().toUpperCase();
  if (!propre || propre.includes(',')) return false;
  if (propre === 'ECOMO') return true;
  return /\d/.test(propre) && propre.length >= 5;
}

function estTokenNumerique(token: string): boolean {
  return /^\d+(?:,\d{1,3})?$/.test(token);
}

function extraireLigneProduitRetif(bloc: string): LigneProduit | null {
  const tokens = bloc.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 6) return null;

  const code = tokens[0]?.toUpperCase();
  if (!estCodeRetif(code)) return null;

  const dernierToken = tokens[tokens.length - 1];
  if (dernierToken !== '4') return null;

  const corps = tokens.slice(1, -1);
  const suffixeNumerique: string[] = [];
  for (let i = corps.length - 1; i >= 0; i -= 1) {
    if (!estTokenNumerique(corps[i])) break;
    suffixeNumerique.unshift(corps[i]);
  }

  if (suffixeNumerique.length < 4) return null;

  const tenterDepuisSuffixe = (taille: 4 | 5) => {
    if (suffixeNumerique.length < taille) return null;
    const numeriques = suffixeNumerique.slice(-taille);
    const descriptionTokens = corps.slice(0, corps.length - taille);
    const description = descriptionTokens.join(' ').trim();
    if (!description) return null;

    const quantite = parseNombreFR(numeriques[0]);
    if (!(quantite > 0)) return null;

    if (taille === 5) {
      const prixBrut = parseNombreFR(numeriques[1]);
      const remisePct = parseNombreFR(numeriques[2]);
      const prixNet = parseNombreFR(numeriques[3]);
      const montantHT = parseNombreFR(numeriques[4]);
      const remise = arrondir2(Math.max(0, quantite * Math.max(0, prixBrut - prixNet)));
      const totalAttendu = arrondir2(quantite * prixNet);
      const prixNetAttendu = arrondir2(prixBrut * (1 - remisePct / 100));

      if (
        prixBrut <= 0 ||
        prixNet <= 0 ||
        montantHT <= 0 ||
        remisePct < 0 ||
        remisePct > 100 ||
        Math.abs(totalAttendu - montantHT) > 0.15 ||
        (prixBrut > 0 && Math.abs(prixNetAttendu - prixNet) > 0.15)
      ) {
        return null;
      }

      return {
        refFournisseur: code,
        description,
        quantite,
        prixUnitaireHT: arrondir2(prixNet),
        remise,
        montantHT: arrondir2(montantHT),
      } satisfies LigneProduit;
    }

    const prixBrut = parseNombreFR(numeriques[1]);
    const prixNet = parseNombreFR(numeriques[2]);
    const montantHT = parseNombreFR(numeriques[3]);
    const remise = arrondir2(Math.max(0, quantite * Math.max(0, prixBrut - prixNet)));
    const totalAttendu = arrondir2(quantite * prixNet);

    if (
      prixBrut <= 0 ||
      prixNet <= 0 ||
      montantHT <= 0 ||
      Math.abs(totalAttendu - montantHT) > 0.15
    ) {
      return null;
    }

    return {
      refFournisseur: code,
      description,
      quantite,
      prixUnitaireHT: arrondir2(prixNet),
      remise,
      montantHT: arrondir2(montantHT),
    } satisfies LigneProduit;
  };

  return tenterDepuisSuffixe(5) ?? tenterDepuisSuffixe(4);
}

export const parserRetif: Parser = {
  fournisseur: 'RETIF',
  extensionsSupportees: ['.pdf'],

  parser: async (fichier: File | string): Promise<ParserResult> => {
    const erreurs: string[] = [];
    const avertissements: string[] = [];

    try {
      let textePDF: string;
      let nomFichier: string;

      if (typeof fichier === 'string') {
        nomFichier = fichier.split(/[/\\]/).pop() || 'facture-retif.pdf';
        throw new Error('Le parsing depuis un chemin nécessite un serveur backend');
      } else {
        nomFichier = fichier.name;
        textePDF = await extraireTextePDF(fichier);
      }

      const texteNormalise = textePDF
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '\n')
        .replace(/\f+/g, '\n')
        .replace(/[“”]/g, '"')
        .replace(/[’]/g, "'");

      const numero =
        texteNormalise.match(/FACTURE\s+N(?:O|°)\s*([A-Z0-9\-\/]+)/i)?.[1]?.trim() ||
        nomFichier.replace(/\.[^.]+$/, '');
      const date =
        parseDateFR(texteNormalise.match(/FACTURE\s+N(?:O|°)\s*[A-Z0-9\-\/]+\s+DU\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]) ||
        parseDateFR(texteNormalise.match(/\bDU\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1]) ||
        new Date();

      const totalHT = parseNombreFR(
        texteNormalise.match(/TOTAL\s+HT\s*:\s*([\d\s,]+)\s*EUR/i)?.[1]
      );
      const totalTVA = parseNombreFR(
        texteNormalise.match(/TOTAL\s+TVA\s*:\s*([\d\s,]+)\s*EUR/i)?.[1]
      );
      const totalTTC = parseNombreFR(
        texteNormalise.match(/TOTAL\s+TTC\s*:\s*([\d\s,]+)\s*EUR/i)?.[1]
      );

      const enTeteMatch = texteNormalise.match(/CODE\s+DESIGNATION\s+QUANTITE\s+PX\s+BRUT/i);
      const debutTableau = enTeteMatch ? (enTeteMatch.index || 0) + enTeteMatch[0].length : -1;

      const marqueursFin = [
        texteNormalise.indexOf('CONTACTEZ NOUS AUSSI AVEC INTERNET'),
        texteNormalise.indexOf('* BASE TVA'),
        texteNormalise.indexOf('REGLEMENT MONTANT ECHEANCE'),
      ].filter((index) => index >= 0);
      const finTableau = marqueursFin.length > 0 ? Math.min(...marqueursFin) : texteNormalise.length;

      const sectionTableau =
        debutTableau >= 0 && finTableau > debutTableau
          ? texteNormalise.slice(debutTableau, finTableau)
          : texteNormalise;

      const lignesBrutes = sectionTableau
        .replace(/\s+/g, ' ')
        .split(/\s+(?=(?:\d{5,}[A-Z]*|ECOMO)\s+)/g)
        .map((ligne) => ligne.trim())
        .filter(Boolean);

      const lignes: LigneProduit[] = [];
      lignesBrutes.forEach((ligneBrute) => {
        const ligne = extraireLigneProduitRetif(ligneBrute);
        if (ligne) {
          lignes.push(ligne);
        }
      });

      const sommeLignesHT = arrondir2(
        lignes.reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0)
      );

      if (lignes.length === 0) {
        avertissements.push('Aucune ligne produit détectée pour RETIF.');
      }

      if (lignes.length > 0 && totalHT > 0 && Math.abs(sommeLignesHT - totalHT) > 0.2) {
        avertissements.push(
          `Somme des lignes HT ${sommeLignesHT.toFixed(2)} EUR vs total HT ${totalHT.toFixed(2)} EUR.`
        );
      }

      if (lignes.length !== 26) {
        avertissements.push(`RETIF: ${lignes.length} ligne(s) détectée(s).`);
      }

      return {
        facture: {
          id: `retif-${numero}-${Date.now()}`,
          fournisseur: 'RETIF',
          numero,
          date,
          fichierPDF: nomFichier,
          lignes,
          totalHT: arrondir2(totalHT || sommeLignesHT),
          totalTVA: arrondir2(totalTVA),
          totalTTC: arrondir2(totalTTC || (totalHT + totalTVA)),
          dateImport: new Date(),
          donneesBrutes: {
            texteComplet: texteNormalise,
            tauxTVA: totalHT > 0 ? arrondir2(totalTVA / totalHT) : 0,
          },
        } satisfies Facture,
        erreurs: erreurs.length > 0 ? erreurs : undefined,
        avertissements: avertissements.length > 0 ? avertissements : undefined,
      };
    } catch (error) {
      const messageErreur = error instanceof Error ? error.message : 'Erreur inconnue';
      erreurs.push(messageErreur);

      return {
        facture: {
          id: `retif-${Date.now()}`,
          fournisseur: 'RETIF',
          numero: 'N/A',
          date: new Date(),
          fichierPDF: typeof fichier === 'string' ? fichier : fichier.name,
          lignes: [],
          totalHT: 0,
          totalTVA: 0,
          totalTTC: 0,
          dateImport: new Date(),
        },
        erreurs,
      };
    }
  },
};
