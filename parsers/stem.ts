/**
 * Parser pour les devis / factures du fournisseur STEM
 * Structure type "COTATION 1 2026 SOUV" avec tableau :
 * NAME  PRODUCT  QTY PU HT FOB TOTAL
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';
import { traduireDescriptionFR } from '../src/services/traductionProduitsService';

function parseNombreFR(val: string): number {
  const nettoye = val.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(nettoye);
  return isNaN(n) ? 0 : n;
}

export const parserStem: Parser = {
  fournisseur: 'STEM',
  extensionsSupportees: ['.pdf'],

  parser: async (fichier: File | string): Promise<ParserResult> => {
    const erreurs: string[] = [];
    const avertissements: string[] = [];

    try {
      let textePDF: string;
      let nomFichier: string;

      if (typeof fichier === 'string') {
        nomFichier = fichier.split(/[/\\]/).pop() || 'devis-stem.pdf';
        throw new Error('Le parsing depuis un chemin nécessite un serveur backend');
      } else {
        nomFichier = fichier.name;
        textePDF = await extraireTextePDF(fichier);
      }

      // Normaliser le texte
      textePDF = textePDF
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '\n')
        .replace(/\f+/g, '\n');

      const lignesBrutes = textePDF
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      // Numéro de devis : chercher "COTATION 1     2026 SOUV"
      let numero = 'DEMANDE';
      for (const l of lignesBrutes) {
        const m = l.match(/COTATION\s+(.+)/i);
        if (m) {
          numero = m[1].trim();
          break;
        }
      }
      if (!numero || numero === 'DEMANDE') {
        numero = nomFichier.replace(/\.[^.]+$/, '');
      }

      // Date : chercher un motif de type 02/12/2025
      let date = new Date();
      const dateMatch = textePDF.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (dateMatch) {
        const [jour, mois, annee] = dateMatch[1].split('/');
        const d = new Date(parseInt(annee, 10), parseInt(mois, 10) - 1, parseInt(jour, 10));
        if (!isNaN(d.getTime())) {
          date = d;
        }
      }

      const lignesProduits: LigneProduit[] = [];
      // Normaliser tout le texte pour un parsing global (on écrase les retours à la ligne)
      const texteNormalise = textePDF.replace(/\s+/g, ' ');

      // On cherche d'abord toutes les références possibles :
      // - 4 chiffres (3690)
      // - "SOUV 1", "SOUV 11-14", "SOUV 54 - 55", etc.
      const refRegex = /(\d{4}|SOUV\s+\d+(?:\s*-\s*\d+)?)/gi;
      let matchRef: RegExpExecArray | null;

      while ((matchRef = refRegex.exec(texteNormalise)) !== null) {
        const ref = matchRef[1].trim();
        const debutApresRef = refRegex.lastIndex;
        const segment = texteNormalise.slice(debutApresRef);

        // Gérer les références purement numériques (3690, 3691, etc.)
        // - le mot suivant doit commencer par une lettre (sinon c'est une QTY ou un PU)
        // - ignorer spécialement "2026 SOUV" qui est le titre de page
        if (/^\d{4}$/.test(ref)) {
          const prochainMotMatch = segment.match(/^(\S+)/);
          const prochainMot = prochainMotMatch ? prochainMotMatch[1] : '';
          const prochainMotUpper = prochainMot.toUpperCase();

          // 1400 6,80 ... => prochainMot commence par un chiffre => ce n'est PAS une réf produit
          if (!/^[A-Za-z]/.test(prochainMotUpper)) {
            continue;
          }

          // 2026 SOUV (titre "COTATION 1 2026 SOUV") => à ignorer
          if (ref === '2026' && prochainMotUpper === 'SOUV') {
            continue;
          }
        }

        // Dans le segment qui suit la ref :
        // nomProduit (non-greedy) + QTY + PU + TOTAL
        const ligneMatch = segment.match(
          /^(.+?)\s+(\d+)\s+(\d[\d\s]*,\d{2})\s*€?\s+(\d[\d\s]*,\d{2})\s*€?/
        );

        if (!ligneMatch) {
          continue;
        }

        const nomProduit = ligneMatch[1].trim();
        const qtyStr = ligneMatch[2];
        const puStr = ligneMatch[3];
        const totalStr = ligneMatch[4];

        // Filtrer les lignes de totaux globaux de bas de page
        if (
          /^TOTAL\b/i.test(nomProduit) ||
          /FOB/i.test(nomProduit) ||
          /TVA/i.test(nomProduit) ||
          /TRANSPORT/i.test(nomProduit)
        ) {
          continue;
        }

        const quantite = parseInt(qtyStr, 10);
        const prixUnitaireHT = parseNombreFR(puStr);
        const montantHT = parseNombreFR(totalStr);

        if (!quantite || !prixUnitaireHT || !montantHT) {
          continue;
        }

        lignesProduits.push({
          description: nomProduit,
          descriptionFR: traduireDescriptionFR('STEM', ref, nomProduit),
          refFournisseur: ref,
          quantite,
          prixUnitaireHT,
          remise: 0,
          montantHT,
        });
      }

      // Deuxième passe spécifique pour les références purement numériques (3690, 3691 ...)
      // au cas où elles n'auraient pas été capturées par la boucle précédente.
      const dejaPresents = new Set(
        lignesProduits.map(
          (l) => `${l.refFournisseur || ''}__${l.description}__${l.quantite}`
        )
      );

      const ligneNumRegex =
        /(\d{4})\s+([A-Z][^0-9]+?)\s+(\d+)\s+(\d[\d\s]*,\d{2})\s*€?\s+(\d[\d\s]*,\d{2})\s*€?/gi;
      let mNum: RegExpExecArray | null;
      while ((mNum = ligneNumRegex.exec(texteNormalise)) !== null) {
        const refNum = mNum[1].trim();
        const nomProduitNum = mNum[2].trim();
        const qtyStrNum = mNum[3];
        const puStrNum = mNum[4];
        const totalStrNum = mNum[5];

        const quantiteNum = parseInt(qtyStrNum, 10);
        const prixUnitaireHTNum = parseNombreFR(puStrNum);
        const montantHTNum = parseNombreFR(totalStrNum);

        if (!quantiteNum || !prixUnitaireHTNum || !montantHTNum) continue;

        const cle = `${refNum}__${nomProduitNum}__${quantiteNum}`;
        if (dejaPresents.has(cle)) continue;

        lignesProduits.unshift({
          description: nomProduitNum,
          descriptionFR: traduireDescriptionFR('STEM', refNum, nomProduitNum),
          refFournisseur: refNum,
          quantite: quantiteNum,
          prixUnitaireHT: prixUnitaireHTNum,
          remise: 0,
          montantHT: montantHTNum,
        });
        dejaPresents.add(cle);
      }

      if (lignesProduits.length === 0) {
        // Fallback : ligne globale
        const montantsGlobaux = Array.from(textePDF.matchAll(/(\d[\d\s]*,\d{2})/g));
        const dernierMontant =
          montantsGlobaux.length > 0
            ? parseNombreFR(montantsGlobaux[montantsGlobaux.length - 1][1])
            : 0;

        lignesProduits.push({
          description: `Produits STEM`,
          quantite: 1,
          prixUnitaireHT: dernierMontant,
          remise: 0,
          montantHT: dernierMontant,
        });

        avertissements.push(
          "Impossible de découper les lignes du devis STEM, une seule ligne globale a été créée."
        );
      }

      const totalHT = lignesProduits.reduce((sum, l) => sum + l.montantHT, 0);

      // Récupérer les totaux de bas de page
      const texteBas = texteNormalise;
      const totalFOBMatch = texteBas.match(/TOTAL\s+HT\s+FOB\s+(\d[\d\s]*,\d{2})/i);
      const transportMatch = texteBas.match(/Transport\s+et\s+douanes\s+(\d[\d\s]*,\d{2})/i);
      const totalHTMatch = texteBas.match(/TOTAL\s+HT(?!\s+FOB)\s+(\d[\d\s]*,\d{2})/i);
      const tvaMatch = texteBas.match(/TVA\s+20\s*%\s+(\d[\d\s]*,\d{2})/i);
      const totalTTCMatch = texteBas.match(/TOTAL\s+TTC\s+(\d[\d\s]*,\d{2})/i);

      let totalHTFOB = totalFOBMatch ? parseNombreFR(totalFOBMatch[1]) : totalHT;
      let transportEtDouanes = transportMatch ? parseNombreFR(transportMatch[1]) : 0;
      let totalHTGlobal = totalHTMatch
        ? parseNombreFR(totalHTMatch[1])
        : totalHTFOB + transportEtDouanes;
      let totalTVA = tvaMatch ? parseNombreFR(tvaMatch[1]) : 0;
      let totalTTC = totalTTCMatch
        ? parseNombreFR(totalTTCMatch[1])
        : totalHTGlobal + totalTVA;

      // Si les totaux de bas de page n'ont pas été trouvés, utiliser la logique métier : 10% de transport, 20% de TVA
      if (!totalFOBMatch || !transportMatch || !totalHTMatch || !tvaMatch || !totalTTCMatch) {
        totalHTFOB = totalHT; // somme des lignes
        transportEtDouanes = Math.round(totalHTFOB * 0.10 * 100) / 100;
        totalHTGlobal = totalHTFOB + transportEtDouanes;
        totalTVA = Math.round(totalHTGlobal * 0.20 * 100) / 100;
        totalTTC = totalHTGlobal + totalTVA;
      }

      const facture: Facture = {
        id: `stem-${numero}-${Date.now()}`,
        fournisseur: 'STEM',
        numero,
        date,
        fichierPDF: nomFichier,
        lignes: lignesProduits,
        totalHT: totalHTGlobal,
        totalTVA,
        totalTTC,
        dateImport: new Date(),
        donneesBrutes: {
          texteExtrait: textePDF.substring(0, 2000),
          texteComplet: textePDF,
          totalHTFOB,
          transportEtDouanes,
          totalHTGlobal,
        },
      };

      return {
        facture,
        erreurs: erreurs.length > 0 ? erreurs : undefined,
        avertissements: avertissements.length > 0 ? avertissements : undefined,
      };
    } catch (error) {
      const messageErreur = error instanceof Error ? error.message : 'Erreur inconnue';
      erreurs.push(messageErreur);

      const nomFichier =
        typeof fichier === 'string'
          ? fichier.split(/[/\\]/).pop() || 'devis-stem.pdf'
          : fichier.name;

      return {
        facture: {
          id: `stem-${Date.now()}`,
          fournisseur: 'STEM',
          numero: nomFichier.replace(/\.[^.]+$/, ''),
          date: new Date(),
          fichierPDF: nomFichier,
          lignes: [],
          totalHT: 0,
          totalTVA: 0,
          totalTTC: 0,
          dateImport: new Date(),
        },
        erreurs,
        avertissements: ['Parsing automatique STEM échoué, veuillez compléter manuellement.'],
      };
    }
  },
};


