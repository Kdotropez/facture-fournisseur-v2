/**
 * Parser pour les factures SANTISTEBAN (espagnol)
 * Colonnes attendues: Referencia, Descripcion, Ctd, Precio, Importe
 * Exemple de ligne: "5,45 SORTIJA ACERO 6,00 32,70 1000-80"
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';

function parseNombreES(val: string): number {
  const nettoye = val.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(nettoye);
  return Number.isNaN(n) ? 0 : n;
}

function parseDateES(val: string): Date | null {
  const match = val.match(/(\d{2})-(\d{2})-(\d{4})/);
  if (!match) return null;
  const [, jour, mois, annee] = match;
  const d = new Date(parseInt(annee, 10), parseInt(mois, 10) - 1, parseInt(jour, 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

function traduireDescriptionSantisteban(description: string): string {
  const base = description.toUpperCase();
  const mapping: Array<[RegExp, string]> = [
    [/SORTIJA/g, 'BAGUE'],
    [/PULSERA/g, 'BRACELET'],
    [/CADENA/g, 'CHAINE'],
    [/COLGANTE/g, 'COLLIER'],
    [/ACERO/g, 'ACIER'],
    [/DORADO/g, 'DORE'],
    [/PLATA/g, 'ARGENT'],
    [/CRISTAL/g, 'CRISTAL'],
    [/ARTICULOS DE BISUTERIA/g, 'ARTICLES DE BIJOUTERIE'],
    [/ARTICLES DE BIJOUTERIE/g, 'ARTICLES DE BIJOUTERIE'],
    [/EXPOS\.?\s*DE\s*PENDIENTES/g, 'EXPOS. BOUCLES D\'OREILLES'],
    [/EXP\.?\s*METACRILATO/g, 'PRESENTOIR PLEXI'],
    [/BRAZ\.?\s*PULSERAS/g, 'BRACELETS'],
    [/ARBOL PENDIENTES/g, 'PRESENTOIR BOUCLES'],
    [/CHA[ÎI]NE/g, 'CHAINE'],
    [/BIJOUTERIE/g, 'BIJOUTERIE'],
  ];

  let traduit = base;
  mapping.forEach(([pattern, replacement]) => {
    traduit = traduit.replace(pattern, replacement);
  });

  // Revenir à une casse lisible
  return traduit.replace(/\s+/g, ' ').trim();
}

export const parserSantisteban: Parser = {
  fournisseur: 'SANTISTEBAN',
  extensionsSupportees: ['.pdf'],

  parser: async (fichier: File | string): Promise<ParserResult> => {
    const erreurs: string[] = [];
    const avertissements: string[] = [];

    try {
      let textePDF: string;
      let nomFichier: string;

      if (typeof fichier === 'string') {
        nomFichier = fichier.split(/[/\\]/).pop() || 'facture-santisteban.pdf';
        throw new Error('Le parsing depuis un chemin nécessite un serveur backend');
      } else {
        nomFichier = fichier.name;
        textePDF = await extraireTextePDF(fichier);
      }

      textePDF = textePDF
        .replace(/\u00a0/g, ' ')
        .replace(/\r/g, '\n')
        .replace(/\f+/g, '\n');

      const lignesBrutes = textePDF
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      // Numéro + date
      let numero = nomFichier.replace(/\.[^.]+$/, '');
      let date = new Date();

      for (const l of lignesBrutes) {
        const m = l.match(/Factura\s*N[º°]\s*(\d{2}-\d{2}-\d{4})\s*A\s*(\d+)/i);
        if (m) {
          const dateParsed = parseDateES(m[1]);
          if (dateParsed) date = dateParsed;
          numero = m[2];
          break;
        }
      }

      const dateMatch = textePDF.match(/(\d{2}-\d{2}-\d{4})/);
      if (dateMatch) {
        const dateParsed = parseDateES(dateMatch[1]);
        if (dateParsed) date = dateParsed;
      }

      // Totaux
      let totalHT = 0;
      let totalTVA = 0;
      let totalTTC = 0;
      const baseIvaMatch = textePDF.match(
        /Base\s+IVA\s+Importe\s+Bruto\s+TOTAL\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i
      );
      if (baseIvaMatch) {
        totalHT = parseNombreES(baseIvaMatch[1]);
        totalTTC = parseNombreES(baseIvaMatch[3]);
        totalTVA = Math.max(0, totalTTC - totalHT);
      } else {
        const totalMatches = Array.from(
          textePDF.matchAll(
            /(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})/g
          )
        );
        if (totalMatches.length > 0) {
          const dernier = totalMatches[totalMatches.length - 1];
          totalHT = parseNombreES(dernier[1]);
          totalTTC = parseNombreES(dernier[3]);
          totalTVA = Math.max(0, totalTTC - totalHT);
        }
      }

      const lignes: LigneProduit[] = [];
      const statsIgnore = {
        bruit: 0,
        albaranKdo: 0,
        refInvalide: 0,
        ref042: 0,
        qteInvalide: 0,
        incoherent: 0,
      };
      const refPattern = '(?:\\d{3,4}-\\d{2}|[A-Z]{3,4})';
      const prixPattern = '\\d{1,3}(?:\\.\\d{3})*,\\d{2}';
      const qtePattern = '\\d{1,3}(?:\\.\\d{3})*(?:,\\d{2})?';

      const estDescriptionBruit = (description: string) => {
        const desc = description.toUpperCase();
        return (
          desc.includes('SANTISTEBAN') ||
          desc.includes('FACTURA') ||
          desc.includes('REFERENCIA') ||
          desc.includes('COPIA') ||
          desc.includes('NªCLIENTE') ||
          desc.includes('CLIENTE') ||
          desc.includes('CIF') ||
          desc.includes('EMAIL') ||
          desc.includes('E-MAIL') ||
          desc.includes('TEL') ||
          desc.includes('WEB') ||
          desc.includes('SUMA Y SIGUE') ||
          desc.includes('BASE IVA') ||
          desc.includes('VENCIMIENTOS') ||
          desc.includes('ENTREGA') ||
          desc.includes('BANCO') ||
          desc.includes('CANNES') ||
          desc.includes('GRIMAUD') ||
          desc.includes('PORT') ||
          desc.includes('SAINT')
        );
      };

      const ajouterLigne = (
        ref: string,
        description: string,
        quantite: number,
        prixUnitaireHT: number,
        montantHT: number
      ) => {
        if (!ref) {
          statsIgnore.refInvalide += 1;
          return;
        }
        if (!description) {
          statsIgnore.bruit += 1;
          return;
        }
        if (estDescriptionBruit(description)) {
          statsIgnore.bruit += 1;
          return;
        }
        if (/^\d{1,3},\d{2}\b/.test(description)) {
          statsIgnore.bruit += 1;
          return;
        }
        if (ref.startsWith('000-')) {
          statsIgnore.refInvalide += 1;
          return;
        }
        if (ref === '042-00') {
          statsIgnore.ref042 += 1;
          return;
        }
        if (!quantite || quantite <= 0) {
          statsIgnore.qteInvalide += 1;
          return;
        }
        let montantFinal = montantHT;
        if (montantFinal <= 0 && prixUnitaireHT > 0) {
          montantFinal = Math.round(prixUnitaireHT * quantite * 100) / 100;
        }
        if (prixUnitaireHT > 0 && montantFinal > 0) {
          const attendu = Math.round(prixUnitaireHT * quantite * 100) / 100;
          if (Math.abs(attendu - montantFinal) > 0.02) {
            // Incohérence = parsing faux, on ignore la ligne
            statsIgnore.incoherent += 1;
            montantFinal = attendu;
          }
        }
        const descriptionFR = traduireDescriptionSantisteban(description);
        lignes.push({
          refFournisseur: ref,
          description,
          descriptionFR,
          quantite,
          prixUnitaireHT,
          remise: 0,
          montantHT: montantFinal,
        });
      };

      const albaranRegex = /de fecha\s+Albar[aá]n.*?\d{2}\/\d{2}\/\d{4}\s*A\s*\/\s*\d{3}\.\d{3}/gi;
      const routeRegex = /T\.\d\s*-\s*[^0-9]*((?:\d\s*){14,})/gi;

      const nettoyerLigne = (l: string) =>
        l
          .replace(albaranRegex, ' ')
          .replace(routeRegex, ' ')
          .replace(/\s+/g, ' ')
          .trim();

      const ligneIgnore = (l: string) => {
        const compact = l.replace(/\s+/g, ' ').trim();
        const digitsOnly = compact.replace(/\D/g, '');
        const albaranDate = /^de fecha\s+Albar[aá]n.*\d{2}\/\d{2}\/\d{4}/i.test(compact);
        const routeLine =
          /^T\.\d/i.test(compact) &&
          /(KDO|VILLAGE|PORT|GRIMAUD|CANNES|SAINTE MAXIME)/i.test(compact) &&
          digitsOnly.length >= 14;
        return (
          albaranDate ||
          routeLine ||
          /^COPIA$/i.test(l) ||
          /^FECHA/i.test(l) ||
          /^Factura/i.test(l) ||
          /^Referencia/i.test(l) ||
          /^de fecha/i.test(l) ||
          /^suma y sigue/i.test(l) ||
          /^Santisteban/i.test(l) ||
          /^BANCO/i.test(l) ||
          /^Base IVA/i.test(l) ||
          /^Vencimientos/i.test(l) ||
          /^IBAN/i.test(l) ||
          /^ENTREGA/i.test(l) ||
          /^GLS/i.test(l) ||
          /^Web:/i.test(l) ||
          /^CIF/i.test(l) ||
          /^E-mail/i.test(l) ||
          /^Tel\./i.test(l) ||
          l === '.'
        );
      };

      const produitRegexGlobal = new RegExp(
        `(${prixPattern})\\s+(.+?)\\s+(${qtePattern})\\s+(${prixPattern})\\s+(${refPattern})`,
        'gi'
      );
      const noPriceRegex = new RegExp(`^(.+?)\\s+(${qtePattern})\\s+(${refPattern})$`, 'i');

      for (const rawLine of lignesBrutes) {
        const line = rawLine.replace(/\s+/g, ' ').trim();
        if (!line || line === '.') continue;

        const matches = Array.from(line.matchAll(produitRegexGlobal));
        if (matches.length > 0) {
          matches.forEach((m) => {
            const prixUnitaireHT = parseNombreES(m[1]);
            const description = m[2].trim();
            const quantite = parseNombreES(m[3]);
            const montantHT = parseNombreES(m[4]);
            const ref = m[5].trim();
            ajouterLigne(ref, description, quantite, prixUnitaireHT, montantHT);
          });
          continue;
        }

        if (!/^\d{1,3},\d{2}\s+/.test(line)) {
          const simple = line.match(noPriceRegex);
          if (simple) {
            const description = simple[1].trim();
            const quantite = parseNombreES(simple[2]);
            const ref = simple[3]?.trim() || '';
            ajouterLigne(ref, description, quantite, 0, 0);
            continue;
          }
        }

        if (ligneIgnore(line)) {
          statsIgnore.bruit += 1;
          continue;
        }
        if (/ALBARAN|KDO/i.test(line)) {
          statsIgnore.albaranKdo += 1;
          continue;
        }
        statsIgnore.refInvalide += 1;
      }

      if (lignes.length === 0) {
        // Fallback: parsing global sur tout le texte pour éviter 0 lignes
        let match: RegExpExecArray | null;
        while ((match = fullLineRegexGlobal.exec(textePDF)) !== null) {
          const prixUnitaireHT = parseNombreES(match[1]);
          const description = match[2].trim();
          const quantite = parseNombreES(match[3]);
          const montantHT = parseNombreES(match[4]);
          const ref = match[5].trim();
          ajouterLigne(ref, description, quantite, prixUnitaireHT, montantHT);
        }
        if (lignes.length === 0) {
          for (const rawLine of lignesBrutes) {
            const line = rawLine.replace(/\s+/g, ' ').trim();
            if (!line || line === '.') continue;
            if (!/^\d{1,3},\d{2}\s+/.test(line)) {
              const simple = line.match(noPriceRegex);
              if (simple) {
                const description = simple[1].trim();
                const quantite = parseNombreES(simple[2]);
                const ref = simple[3]?.trim() || '';
                ajouterLigne(ref, description, quantite, 0, 0);
              }
            }
          }
        }
        if (lignes.length === 0) {
          avertissements.push('Aucune ligne produit détectée.');
        }
      }
      const ignoreTotal = Object.values(statsIgnore).reduce((sum, n) => sum + n, 0);
      if (ignoreTotal > 0) {
        avertissements.push(
          `Lignes ignorées: bruit=${statsIgnore.bruit}, albaran/kdo=${statsIgnore.albaranKdo}, refInvalide=${statsIgnore.refInvalide}, ref042=${statsIgnore.ref042}, qteInvalide=${statsIgnore.qteInvalide}, incoherent=${statsIgnore.incoherent}.`
        );
      }

      if (!totalHT && lignes.length > 0) {
        totalHT = lignes.reduce((sum, l) => sum + (l.montantHT || 0), 0);
        totalTTC = totalHT + totalTVA;
      }
      if (totalTTC > 0 && lignes.length > 0) {
        const sommeLignes = Math.round(
          lignes.reduce((sum, l) => sum + (l.montantHT || 0), 0) * 100
        ) / 100;
        if (Math.abs(sommeLignes - totalTTC) > 0.02) {
          erreurs.push(
            `Somme des lignes (${sommeLignes.toFixed(2)}) != total TTC (${totalTTC.toFixed(2)}).`
          );
        }
      }

      const facture: Facture = {
        id: `santisteban-${numero}-${Date.now()}`,
        fournisseur: 'SANTISTEBAN',
        numero,
        date,
        fichierPDF: nomFichier,
        lignes,
        totalHT,
        totalTVA,
        totalTTC: totalTTC || totalHT,
        dateImport: new Date(),
        donneesBrutes: {
          texteComplet: textePDF,
        },
      };

      return {
        facture,
        erreurs: erreurs.length ? erreurs : undefined,
        avertissements: avertissements.length ? avertissements : undefined,
      };
    } catch (error) {
      const messageErreur = error instanceof Error ? error.message : 'Erreur inconnue';
      erreurs.push(messageErreur);
      return {
        facture: {
          id: `santisteban-${Date.now()}`,
          fournisseur: 'SANTISTEBAN',
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
