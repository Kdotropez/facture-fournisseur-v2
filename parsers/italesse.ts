/**
 * Parser pour les factures ITALESSE
 * Analyse le contenu réel des PDFs
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';
import { utiliserReglePourNumero } from '../src/services/parsingRulesService';

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

      const extraireNumeroDepuisTexte = (): string | undefined => {
        const factureMatch = textePDF.match(/FACTURE\s*(?:Nº|N°|NO\.?|NUM\.?)\s*([A-Z0-9\-\.\/]+)/i);
        if (factureMatch?.[1]) {
          return factureMatch[1].trim().toUpperCase();
        }
        const fatturaMatch = textePDF.match(/FATTURA\s*(?:Nº|N°|N\.|NUM\.?)\s*([A-Z0-9\-\.\/]+)/i);
        if (fatturaMatch?.[1]) {
          return fatturaMatch[1].trim().toUpperCase();
        }
        const fMatch = textePDF.match(/F[\.\s-]*([0-9]{3,})/i);
        if (fMatch?.[1]) {
          return `F${fMatch[1]}`.toUpperCase();
        }
        return undefined;
      };

      const extraireNumeroDepuisFichier = (): string | undefined => {
        const nomSansExtension = nomFichier.replace(/\.[^.]+$/, '');
        const match = nomSansExtension.match(/F[\.\s-]*([0-9]{3,})/i);
        if (match?.[1]) {
          return `F${match[1]}`.toUpperCase();
        }
        return undefined;
      };

      // PRIORITÉ 1: Utiliser les règles apprises automatiquement
      let numero: string | undefined = utiliserReglePourNumero('ITALESSE', textePDF);
      
      // PRIORITÉ 2: Si pas de règle apprise, utiliser les patterns par défaut
      if (!numero) {
        // Extraire le numéro depuis "Numero doc./Doc. No." - PRIORITÉ ABSOLUE
        // Format attendu: "Numero doc./Doc. No. 1149/00" -> extraire "1149"
        
        // Pattern flexible pour "Numero doc./Doc. No." avec variations d'espaces
        const patternsNumeroDoc = [
          /Numero\s+doc\.\s*\/\s*Doc\.\s*No\.\s*([0-9]+(?:\/[0-9]+)?)/i,
          /Numero\s+doc\.\/Doc\.\s*No\.\s*([0-9]+(?:\/[0-9]+)?)/i,
          /Numero\s+doc\.\/\s*Doc\.\s*No\.\s*([0-9]+(?:\/[0-9]+)?)/i,
          /Numero\s+doc\.\/Doc\.\s*No\.\s*([0-9]+(?:\/[0-9]+)?)/i,
        ];
        
        for (const pattern of patternsNumeroDoc) {
          const match = textePDF.match(pattern);
          if (match && match[1]) {
            let numeroBrut = match[1].trim();
            // Si format "1149/00", prendre seulement "1149"
            if (numeroBrut.includes('/')) {
              const parties = numeroBrut.split('/');
              numeroBrut = parties[0].trim();
            }
            // Vérifier que c'est un numéro valide (au moins 3 chiffres)
            if (/^\d{3,}$/.test(numeroBrut)) {
              numero = numeroBrut;
              console.log(`[ITALESSE] Numéro extrait depuis "Numero doc./Doc. No.": ${numero}`);
              break;
            }
          }
        }
      }
      
      // PRIORITÉ 3: Si pas trouvé, essayer les autres méthodes
      if (!numero) {
        const numeroTexte = extraireNumeroDepuisTexte();
        const numeroFichier = extraireNumeroDepuisFichier();
        numero = numeroTexte ?? numeroFichier;
        
        // Nettoyer si format avec slash
        if (numero && numero.includes('/')) {
          const parties = numero.split('/');
          numero = parties[0].trim();
        }
      }
      
      // PRIORITÉ 4: Si toujours pas trouvé, utiliser le nom de fichier
      if (!numero || !/\d{3,}/.test(numero) || /PARTITA|IVA/i.test(numero)) {
        const matchFichier = nomFichier.match(/F[\.\s-]*([0-9]{3,})/i);
        if (matchFichier?.[1]) {
          numero = matchFichier[1];
        } else {
          numero = nomFichier.replace(/\.[^.]+$/, '');
        }
      }
      
      // S'assurer que le numéro est en majuscules et nettoyé
      numero = numero.toUpperCase().trim();

      const extraireDateProche = (labelRegex: RegExp): Date | undefined => {
        const match = labelRegex.exec(textePDF);
        if (!match) {
          return undefined;
        }
        if (match[1]) {
          return convertirDate(match[1]);
        }
        const startIndex = match.index !== undefined ? match.index + match[0].length : 0;
        const segment = textePDF.slice(startIndex, startIndex + 300);
        // Chercher une date dans le segment (format DD/MM/YYYY ou DD-MM-YYYY)
        const dateMatch = segment.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
        if (dateMatch?.[1]) {
          return convertirDate(dateMatch[1]);
        }
        return undefined;
      };

      const date = extraireDateProche(/Data\s+doc\.\/\s*Date/i) || new Date();
      const dateLivraison = extraireDateProche(/Data\s+Cons\.\s*\/\s*Delivery\s+Date/i);

      // Fonction pour extraire le total avec plusieurs formats
      const extraireTotalFlexible = () => {
        // Format italien : 5.001,20 (point = milliers, virgule = décimales)
        // Pattern spécifique : "TOTALE DOCUMENTO / TOTAL AMOUNT EURO 5.001,20"
        const patternEuro = /TOTALE\s+DOCUMENTO\s*\/\s*TOTAL\s+AMOUNT\s+EURO\s+([\d\.\s,]+)/i;
        const matchEuro = textePDF.match(patternEuro);
        if (matchEuro?.[1]) {
          const valeur = nettoyerNombreItalien(matchEuro[1].trim());
          // Le total doit être >= 1000 (minimum raisonnable pour une facture)
          if (valeur >= 1000 && valeur < 1000000) {
            console.log('[ITALESSE] Total extrait (EURO):', valeur);
            return valeur;
          }
        }
        
        // Chercher "TOTALE DOCUMENTO" et prendre le nombre qui suit "EURO" sur la même ligne ou ligne suivante
        const totDocIndex = textePDF.search(/TOTALE\s+DOCUMENTO/i);
        if (totDocIndex !== -1) {
          const segment = textePDF.slice(totDocIndex, totDocIndex + 500);
          
          // Chercher spécifiquement "EURO" suivi d'un nombre avec format italien (point = milliers)
          // Pattern : EURO suivi d'espaces puis un nombre avec point et virgule (ex: 5.001,20)
          const euroMatch = segment.match(/EURO\s+([\d]{1,3}(?:\.\d{3})*,\d{2})/i);
          if (euroMatch?.[1]) {
            const valeur = nettoyerNombreItalien(euroMatch[1].trim());
            // Le total doit être >= 1000
            if (valeur >= 1000 && valeur < 1000000) {
              console.log('[ITALESSE] Total extrait (après EURO format italien):', valeur);
              return valeur;
            }
          }
          
          // Pattern plus flexible : EURO suivi d'un nombre (peut avoir des espaces)
          const euroMatchFlex = segment.match(/EURO\s+([\d\.\s,]{6,})/i);
          if (euroMatchFlex?.[1]) {
            const valeur = nettoyerNombreItalien(euroMatchFlex[1].trim());
            // Ignorer les petits nombres (comme 175) et valider le format
            const nombreNettoye = euroMatchFlex[1].trim().replace(/[\.\s,]/g, '');
            // Le nombre doit avoir au moins 4 chiffres (pour exclure 175, etc.)
            if (valeur >= 1000 && valeur < 1000000 && nombreNettoye.length >= 4) {
              console.log('[ITALESSE] Total extrait (après EURO flexible):', valeur);
              return valeur;
            }
          }
          
          // Fallback : chercher le premier nombre avec format italien (X.XXX,XX) après "TOTALE DOCUMENTO / TOTAL AMOUNT"
          const totalAmountIndex = segment.search(/TOTAL\s+AMOUNT/i);
          if (totalAmountIndex !== -1) {
            const segmentApres = segment.slice(totalAmountIndex);
            // Chercher un nombre avec format italien (point comme séparateur de milliers)
            const nombreFormatItalien = segmentApres.match(/([\d]{1,3}(?:\.\d{3})*,\d{2})/);
            if (nombreFormatItalien?.[1]) {
              const valeur = nettoyerNombreItalien(nombreFormatItalien[1].trim());
              if (valeur >= 1000 && valeur < 1000000) {
                console.log('[ITALESSE] Total extrait (format italien après TOTAL AMOUNT):', valeur);
                return valeur;
              }
            }
          }
        }
        
        return null;
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

      const logosConnus = [
        'SAINT TROPEZ',
        'ST TROPEZ',
        'SAINTE MAXIME',
        'STE MAXIME',
        'SAINT AYGULF',
        'ST AYGULF',
        'PORT GRIMAUD',
        'PORT COGOLIN',
        'CAVALAIRE',
        'LES ISSAMBRES',
        'CANNES',
        'GRIMAUD',
        'RAMATUELLE',
        'LA CROIX VALMER',
        'CROIX VALMER',
        'SAINTE-MAXIME',
        'PORT GRIMAUD 1',
        'PORT GRIMAUD 2',
        'GASSIN',
        'COGOLIN',
        'SAINT AYGUF', // variations possibles
        'UNI',
      ];

      const normaliser = (texte: string) =>
        texte
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^A-Z0-9]/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toUpperCase();

      const detecterLogoDansTexte = (source?: string): string | undefined => {
        if (!source) return undefined;
        const extraitGuillemets = source.match(/"([^"]+)"/);
        if (extraitGuillemets && extraitGuillemets[1].trim()) {
          return extraitGuillemets[1].trim().toUpperCase();
        }
        const normaliseSource = normaliser(source);
        const trouve = logosConnus.find((nom) => normaliseSource.includes(normaliser(nom)));
        return trouve ? trouve : undefined;
      };

      const determinerLogo = (...sources: (string | undefined)[]): string | undefined => {
        for (const source of sources) {
          const logo = detecterLogoDansTexte(source);
          if (logo) {
            return logo;
          }
        }
        return undefined;
      };

      const extraireReferenceDepuisDescription = (texte: string): string | undefined => {
        if (!texte) return undefined;
        const match = texte.match(/([A-Z]{2,}[A-Z0-9\/\-]*\d+[A-Z0-9\/\-]*)/);
        if (match?.[1]) {
          return match[1].trim();
        }
        return undefined;
      };

      const nettoyerDescription = (texte: string): { description: string; logo?: string; bat?: string } => {
        let clean = texte.replace(/\s+/g, ' ').trim();
        clean = clean.replace(/IDEM DERNIERE COMMANDE/gi, '').trim();

        let bat: string | undefined;
        // Pattern pour BAT : PROT. 2090-13899-1589 ou PROT. 2090 - 13899 - 1589
        const batMatchProt = clean.match(/PROT\.\s*([A-Z0-9\-\s]+?)(?:\s|$|LOGO|AVEC|LUNGHEZZA|POSIZIONATO)/i);
        if (batMatchProt) {
          bat = batMatchProt[1].trim().replace(/\s+/g, '');
          clean = clean.replace(batMatchProt[0], '').trim();
        } else {
          const batMatchProtocollo = clean.match(/PROTOCOLLO\s+N\.\s*([A-Z0-9\-\s]+?)(?:\s|$|LOGO|AVEC|LUNGHEZZA|POSIZIONATO)/i);
          if (batMatchProtocollo) {
            bat = batMatchProtocollo[1].trim().replace(/\s+/g, '');
            clean = clean.replace(batMatchProtocollo[0], '').trim();
          }
        }

        let logoBrut: string | undefined;
        const logoMatch = clean.match(/LOGO\s+"[^"]+"/i);
        if (logoMatch) {
          const index = logoMatch.index || 0;
          logoBrut = clean.substring(index).trim();
          clean = clean.substring(0, index).trim();
        } else {
          const marquageMatch = clean.match(/AVEC\s+MARQUAGE.+/i);
          if (marquageMatch) {
            logoBrut = marquageMatch[0];
          }
        }

        const asterIndex = clean.indexOf('********');
        if (asterIndex !== -1) {
          clean = clean.slice(0, asterIndex).trim();
        }

        const avecIndex = clean.search(/AVEC\s/i);
        if (avecIndex !== -1) {
          clean = clean.slice(0, avecIndex).trim();
        }

        const indexLogo = clean.search(/LOGO\s+"/i);
        if (indexLogo !== -1) {
          clean = clean.slice(0, indexLogo).trim();
        }

        // Couper après C/DEC (garder C/DEC dans la description)
        const cdecIndex = clean.search(/C\/DEC/i);
        if (cdecIndex !== -1) {
          // Trouver la fin de "C/DEC" et couper après
          const finCdec = clean.indexOf(' ', cdecIndex + 5);
          if (finCdec !== -1) {
            clean = clean.slice(0, finCdec).trim();
          } else {
            // Si pas d'espace après, chercher le prochain mot-clé à ignorer
            const prochainMotCle = clean.search(/\s+(SU\s+1\s+LATO|COLORE|LOGO|LUNGHEZZA|POSIZIONATO|COME|AVEC)/i);
            if (prochainMotCle !== -1) {
              clean = clean.slice(0, prochainMotCle).trim();
            }
          }
        } else {
          // Si pas de C/DEC, couper aux mots-clés suivants
          const prochainMotCle = clean.search(/\s+(COLORE|LOGO|LUNGHEZZA|POSIZIONATO|COME|AVEC)/i);
          if (prochainMotCle !== -1) {
            clean = clean.slice(0, prochainMotCle).trim();
          }
        }

        // Retirer les mentions de couleur dans la description (on garde seulement celle de la colonne)
        clean = clean.replace(/\s+COLORE\s+[A-Z]+/gi, '').trim();

        const [nomProduit] = clean.split(/ - BOITE DE /i);
        const description = nomProduit.trim() || clean;

        const logo =
          determinerLogo(logoBrut, texte) ||
          (detecterLogoDansTexte(texte)) ||
          'UNI';

        return { description, logo, bat };
      };

      // Mots-clés d'en-tête à ignorer
      const motsClesEntete = [
        'SPETT.LE',
        'MESSRS',
        'INDIRIZZO',
        'CORRISPONDENZA',
        'CATEGORIA',
        'CLIENTE',
        'BANCA',
        'D\'APPOGGIO',
        'CODICE E DESCRIZIONE',
        'PAGAMENTO',
        'PAYMENT',
        'PARTITA IVA',
        'V.A.T.',
        'AGENTE',
        'COD. CLI.',
        'FATTURA RIEPILOGATIVA',
        'INVOICE',
        'CODICE EORI',
        'DDT NR.',
        'ORDINE CL.',
        'VALUTA',
        'CURRENCY',
        'U.M.',
        'QUANTITÀ',
        'QTY',
        'PREZZO UN.',
        'UNIT PRICE',
        'IMP. NETTO',
        'NET PRICE',
        'SC.1/2/3%',
        'IMPORTO IVA',
        'V.A.T. AMOUNT',
        'TOTALE MERCE',
        'GOODS AMOUNT',
        'PESO LORDO',
        'KG',
        '% SCONTO',
        'IMPORTO SCONTO',
        'SPESE INCASSO',
        'TOTALE A PAGARE',
        'TOTAL TO PAY',
        'NETTO MERCE',
        'NET AMOUNT',
        'ACCONTO',
        'TOTALE DOCUMENTO',
        'TOTAL AMOUNT',
        'SCADENZE',
        'INV. EXPIRY DATE',
        'CONTRIBUTO CONAI',
      ];

      const estEntete = (texte: string): boolean => {
        const texteUpper = texte.toUpperCase().trim();
        
        // Rejeter immédiatement si ça commence par "SPETT.LE" ou "MESSRS"
        if (texteUpper.startsWith('SPETT.LE') || texteUpper.startsWith('MESSRS') || texteUpper.startsWith('SPETT')) {
          return true;
        }
        
        // Vérifier si le texte COMMENCE par un mot-clé d'en-tête
        const commenceParEntete = motsClesEntete.some((mot) => {
          return texteUpper.startsWith(mot) || 
                 texteUpper.startsWith(mot + ' ') ||
                 texteUpper.match(new RegExp(`^[^A-Z]*${mot}\\s`, 'i'));
        });
        
        // Vérifier si le texte contient plusieurs mots-clés d'en-tête (signe que c'est un en-tête)
        const compteMotsCles = motsClesEntete.filter((mot) => texteUpper.includes(mot)).length;
        
        // Vérifier si le texte contient des adresses (PLACE, MARCHE, etc.) - signe d'en-tête
        const contientAdresse = /PLACE|MARCHE|GRIMAUD|FRANCE|FRANCIA|INDIRIZZO|CORRISPONDENZA/i.test(texteUpper);
        
        // Vérifier si le texte contient des patterns d'en-tête typiques
        const contientPatternEntete = /(SPETT\.LE|MESSRS|INDIRIZZO|CORRISPONDENZA|CATEGORIA|CLIENTE|BANCA|PAGAMENTO|PARTITA\s+IVA|AGENTE|COD\.\s+CLI\.|FATTURA\s+RIEPILOGATIVA|INVOICE|CODICE\s+EORI|DDT\s+NR\.|ORDINE\s+CL\.|VALUTA|CURRENCY|U\.M\.|QUANTITÀ|QTY|PREZZO\s+UN\.|UNIT\s+PRICE|IMP\.\s+NETTO|NET\s+PRICE)/i.test(texteUpper);
        
        // Si le texte contient 3+ mots-clés d'en-tête OU commence par un en-tête OU contient une adresse OU contient des patterns d'en-tête
        return commenceParEntete || compteMotsCles >= 3 || contientAdresse || contientPatternEntete;
      };

      const contientNomProduit = (texte: string): boolean => {
        const texteUpper = texte.toUpperCase();
        // Mots-clés qui indiquent un vrai produit
        const motsProduits = ['VELA', 'BUCKET', 'ROUND', 'PSAU', 'IMPIANTO', 'TRASPORT', 'FRAIS TECHNIQUES', 'FRAIS DU TRANSPORT'];
        return motsProduits.some((mot) => texteUpper.includes(mot));
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
        let ref = ligneMatch[5]?.trim();
        const couleurColonneBrute = ligneMatch[8]?.trim();
        const couleurColonne =
          couleurColonneBrute && couleurColonneBrute !== '-' ? couleurColonneBrute.toUpperCase() : undefined;

        // Ignorer les lignes d'en-tête (vérification stricte)
        if (estEntete(descriptionBrute)) {
          continue;
        }

        // Vérifier que la description contient un nom de produit valide OU commence par une référence valide
        const descriptionCommenceParRef = /^[A-Z]{2,}[A-Z0-9\/\-]*\d+[A-Z0-9\/\-]*/i.test(descriptionBrute.trim());
        if (!contientNomProduit(descriptionBrute) && !descriptionCommenceParRef && !ref) {
          continue;
        }

        if ((!ref || ref === 'PZ' || ref === 'P') && descriptionBrute) {
          const refDepuisDescription = extraireReferenceDepuisDescription(descriptionBrute);
          if (refDepuisDescription) {
            ref = refDepuisDescription;
          }
        }

        if (!ref || ref === 'PZ') {
          continue;
        }

        // Vérifier que la référence est valide (contient des lettres ET des chiffres, ou est un code connu)
        const refValide = /^[A-Z]{2,}[A-Z0-9\/\-]*\d+[A-Z0-9\/\-]*$/i.test(ref) || 
                          ['IMPIANTO2001', 'TRASPORT2001', 'HAYON'].includes(ref.toUpperCase());

        if (!refValide) {
          continue;
        }

        // Vérification finale : la description doit contenir un produit valide OU la référence doit être valide
        if (!contientNomProduit(descriptionBrute) && !refValide) {
          continue;
        }

        if (!ref || !descriptionBrute || quantite <= 0 || montantHT <= 0) {
          continue;
        }

        // Chercher le BAT dans le contexte autour de la ligne (500 caractères après le match)
        const matchIndex = ligneMatch.index || 0;
        const contexteApres = textePDF.slice(matchIndex, matchIndex + 500);
        
        // Extraire le BAT depuis la description ou le contexte proche
        let batDepuisContexte: string | undefined;
        const batMatchContexte = contexteApres.match(/PROT\.\s*([A-Z0-9\-\s]+?)(?:\s|$|LOGO|AVEC|LUNGHEZZA|POSIZIONATO|PZ|BI|NERO)/i);
        if (batMatchContexte) {
          batDepuisContexte = batMatchContexte[1].trim().replace(/\s+/g, '');
        } else {
          const batMatchProtocollo = contexteApres.match(/PROTOCOLLO\s+N\.\s*([A-Z0-9\-\s]+?)(?:\s|$|LOGO|AVEC|LUNGHEZZA|POSIZIONATO|PZ|BI|NERO)/i);
          if (batMatchProtocollo) {
            batDepuisContexte = batMatchProtocollo[1].trim().replace(/\s+/g, '');
          }
        }
        
        // Si pas trouvé dans le contexte proche, chercher dans tout le texte pour cette référence
        // Cas spécial pour CAVALAIRE dont le BAT est sur la deuxième page
        if (!batDepuisContexte && descriptionBrute.includes('CAVALAIRE')) {
          // Chercher toutes les occurrences de "CAVALAIRE" dans le texte
          const cavalaireMatches = [...textePDF.matchAll(/CAVALAIRE/gi)];
          
          let meilleurBat: string | undefined;
          let distanceMin = Infinity;
          
          for (const cavalaireMatch of cavalaireMatches) {
            const cavalaireIndex = cavalaireMatch.index || 0;
            const debutSegment = Math.max(0, cavalaireIndex - 1000);
            const finSegment = cavalaireIndex + 1000;
            const segmentAutour = textePDF.slice(debutSegment, finSegment);
            
            // Chercher tous les PROT. dans le segment
            const batMatches = [...segmentAutour.matchAll(/PROT\.\s*([A-Z0-9\-\s]+?)(?:\s|$|LOGO|AVEC|LUNGHEZZA|POSIZIONATO|PZ|BI|NERO)/gi)];
            
            for (const batMatch of batMatches) {
              const batTrouve = batMatch[1].trim().replace(/\s+/g, '');
              // Vérifier que c'est un BAT valide (format XXXX-XXXXX-XXXX)
              if (/^\d{4}-\d{5}-\d{4}$/.test(batTrouve)) {
                const batIndexRelatif = batMatch.index || 0;
                const batIndexAbsolu = debutSegment + batIndexRelatif;
                const distance = Math.abs(batIndexAbsolu - cavalaireIndex);
                // Garder le BAT le plus proche de CAVALAIRE
                if (distance < distanceMin) {
                  distanceMin = distance;
                  meilleurBat = batTrouve;
                }
              }
            }
            
            // Chercher aussi PROTOCOLLO N.
            const batMatchProt = [...segmentAutour.matchAll(/PROTOCOLLO\s+N\.\s*([A-Z0-9\-\s]+?)(?:\s|$|LOGO|AVEC|LUNGHEZZA|POSIZIONATO|PZ|BI|NERO)/gi)];
            for (const protMatch of batMatchProt) {
              const batTrouve = protMatch[1].trim().replace(/\s+/g, '');
              if (/^\d{4}-\d{5}-\d{4}$/.test(batTrouve)) {
                const protIndexRelatif = protMatch.index || 0;
                const protIndexAbsolu = debutSegment + protIndexRelatif;
                const distance = Math.abs(protIndexAbsolu - cavalaireIndex);
                if (distance < distanceMin) {
                  distanceMin = distance;
                  meilleurBat = batTrouve;
                }
              }
            }
          }
          
          if (meilleurBat) {
            batDepuisContexte = meilleurBat;
            console.log('[ITALESSE] BAT trouvé pour CAVALAIRE:', meilleurBat);
          }
        }

        let { description, logo, bat } = nettoyerDescription(descriptionBrute);
        
        // Utiliser le BAT du contexte si pas trouvé dans la description
        if (!bat && batDepuisContexte) {
          bat = batDepuisContexte;
        }
        if (description.toUpperCase().startsWith(ref.toUpperCase())) {
          description = description.slice(ref.length).trim();
          description = description.replace(/^\-+\s*/, '').trim();
        }

        lignes.push({
          description,
          refFournisseur: ref,
          bat,
          logo,
          couleur: couleurColonne,
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

      // Chercher le total dans plusieurs formats possibles
      const totalHTExtrait = extraireTotalFlexible();
      const totalHT = totalHTExtrait ?? totalHTLignes;
      const totalTVA = 0;
      const totalTTC = totalHT;

      const facture: Facture = {
        id: `italesse-${numero}-${Date.now()}`,
        fournisseur: 'ITALESSE',
        numero,
        date,
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
