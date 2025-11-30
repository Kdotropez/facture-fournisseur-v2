/**
 * Parser pour les factures RB DRINKS
 * Analyse le contenu réel des PDFs
 * 
 * NOTE: Les factures RB DRINKS peuvent avoir des variations dans leur structure.
 * Par exemple, RB3 avait une structure légèrement différente des autres factures.
 * Le parser est conçu pour être flexible et gérer ces variations.
 */

import type { Parser, ParserResult } from './types';
import type { Facture, LigneProduit } from '../src/types/facture';
import { extraireTextePDF } from '../src/utils/pdfParser';
import { extracteurs } from '../src/utils/pdfParser';

export const parserRBDrinks: Parser = {
  fournisseur: 'RB DRINKS',
  extensionsSupportees: ['.pdf'],
  
  parser: async (fichier: File | string): Promise<ParserResult> => {
    const erreurs: string[] = [];
    const avertissements: string[] = [];
    
    try {
      let textePDF: string;
      let nomFichier: string;
      
      if (typeof fichier === 'string') {
        // Pour l'analyse depuis un chemin (non supporté dans le navigateur directement)
        nomFichier = fichier.split(/[/\\]/).pop() || 'RB1.pdf';
        throw new Error('Le parsing depuis un chemin nécessite un serveur backend');
      } else {
        nomFichier = fichier.name;
        textePDF = await extraireTextePDF(fichier);
      }

      // Normaliser les sauts de ligne et de page pour faciliter l'analyse multi-pages
      textePDF = textePDF
        .replace(/\u00a0/g, ' ')     // espaces insécables
        .replace(/\r/g, '\n')
        .replace(/\f+/g, '\n');      // retours chariot de changement de page

      // Extraction du numéro de facture (format: F16749)
      const numeroPatterns = [
        /facture\s*n[°o]?\s*:?\s*([A-Z]\d+)/i,
        /n[°o]?\s*facture\s*:?\s*([A-Z]\d+)/i,
        /(F\d+)/i, // Format spécifique RB DRINKS: F suivi de chiffres
        /([A-Z]\d{4,})/i, // Format général: lettre suivie de 4+ chiffres
      ];
      const numero = extracteurs.extraireNumeroFacture(textePDF, numeroPatterns) || 
                     nomFichier.match(/RB(\d+)/i)?.[1] || 
                     'INCONNU';

      // Extraction de la date (format: 22-01-2025 ou 22/01/25)
      // Dans le texte réel: "Date   22-01-2025"
      let date = new Date();
      const datePatterns = [
        /date\s+(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/i, // Format DD-MM-YYYY ou DD/MM/YYYY
        /date\s+(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})/i, // Format DD-MM-YY ou DD/MM/YY
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/, // Format direct DD-MM-YYYY
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})/, // Format direct DD-MM-YY
      ];
      
      for (const pattern of datePatterns) {
        const match = textePDF.match(pattern);
        if (match) {
          const jour = parseInt(match[1]);
          const mois = parseInt(match[2]);
          const anneeStr = match[3];
          const annee = anneeStr.length === 2 
            ? (parseInt(anneeStr) < 50 ? 2000 + parseInt(anneeStr) : 1900 + parseInt(anneeStr))
            : parseInt(anneeStr);
          date = new Date(annee, mois - 1, jour);
          console.log('Date extraite:', match[0], '->', date);
          break;
        }
      }

      // Extraction des totaux selon la structure RB DRINKS
      // Format réel: "Total HT   28,658.75 €", "Remise   120.00 €", etc.
      // Les montants utilisent des virgules comme séparateurs de milliers
      const extraireMontantAvecVirgules = (texte: string, patterns: RegExp[]): number => {
        for (const pattern of patterns) {
          const matches = Array.from(texte.matchAll(new RegExp(pattern.source, 'gi')));
          if (matches.length > 0) {
            const dernierMatch = matches[matches.length - 1];
            const montantStr = (dernierMatch[1] || dernierMatch[0])
              .replace(/\s/g, '') // Enlever les espaces
              .replace(/,/g, '') // Enlever les virgules (séparateurs de milliers)
              .replace('€', '');
            const montant = parseFloat(montantStr);
            if (!isNaN(montant) && montant > 0) {
              return montant;
            }
          }
        }
        return 0;
      };
      
      // Total HT: 28,658.75 €
      const totalHTPatterns = [
        /Total\s+HT\s+([\d,]+\.\d{2})\s*€/i,
        /total\s*ht\s*:?\s*([\d\s,\.]+)\s*[€€]/i,
      ];
      const totalHT = extraireMontantAvecVirgules(textePDF, totalHTPatterns);

      // Remise: 120.00 €
      const remisePatterns = [
        /Remise\s+([\d,]+\.\d{2})\s*€/i,
        /remise\s*:?\s*([\d\s,\.]+)\s*[€€]/i,
      ];
      const remise = extraireMontantAvecVirgules(textePDF, remisePatterns);

      // Net HT: 28,538.75 €
      const netHTPatterns = [
        /Net\s+HT\s+([\d,]+\.\d{2})\s*€/i,
        /net\s*ht\s*:?\s*([\d\s,\.]+)\s*[€€]/i,
      ];
      const netHT = extraireMontantAvecVirgules(textePDF, netHTPatterns) || (totalHT - remise);

      // TVA: 5,707.75 €
      const totalTVAPatterns = [
        /TVA\s*\(20%\)\s+([\d,]+\.\d{2})\s*€/i,
        /TVA\s+([\d,]+\.\d{2})\s*€/i,
        /tva\s*:?\s*([\d\s,\.]+)\s*[€€]/i,
      ];
      const totalTVA = extraireMontantAvecVirgules(textePDF, totalTVAPatterns);

      // Total TTC: 34,246.50 €
      const totalTTCPatterns = [
        /Total\s+TTC\s+([\d,]+\.\d{2})\s*€/i,
        /total\s*ttc\s*:?\s*([\d\s,\.]+)\s*[€€]/i,
      ];
      const totalTTC = extraireMontantAvecVirgules(textePDF, totalTTCPatterns) || (netHT + totalTVA);
      
      // Debug: afficher les valeurs extraites
      console.log('Totaux extraits:', { totalHT, remise, netHT, totalTVA, totalTTC });

      // Extraction des lignes de produits
      // Structure RB DRINKS: Ref fournisseur | Désignation | BAT | Logo | Qté | PU HT | Remise | Montant HT
      // Format réel dans le PDF:
      // BOL-B   Bol, saladier blanc 61.5cl   3281   RELAIS TROPEZ   600   1.47 €   0.00 €   882.00 €
      // JAR150-T   Pichet transparent avec couvercle 1,75 l   3130   RELAIS TROPEZ   200   5.98 €   0.00 €   1,196.00 €
      const lignes: LigneProduit[] = [];
      
      console.log('=== DÉBUT EXTRACTION LIGNES ===');
      
      // Le texte est déjà bien formaté avec des espaces multiples séparant les colonnes
      // Chercher la section du tableau (après l'en-tête "RÉF.   DÉSIGNATION   BAT   LOGO   QTÉ.   PU HT   REMISE   MONTANT HT")
      // NOTE: Certaines factures (comme RB3) peuvent avoir des variations dans l'en-tête
      // On accepte plusieurs variantes pour être plus robuste
      const enTeteRegex = /(RÉF\.|REF\.)\s+DÉSIGNATION\s+BAT\s+LOGO\s+QT[ÉE]\.\s+PU\s+HT\s+REMISE\s+MONTANT\s+HT/i;
      const enTeteMatch = textePDF.match(enTeteRegex);
      let debutTableau = enTeteMatch ? (enTeteMatch.index || 0) + enTeteMatch[0].length : -1;
      
      // Si l'en-tête standard n'est pas trouvé, essayer des variantes (pour gérer les variations comme RB3)
      if (debutTableau < 0) {
        const enTeteVariantes = [
          /(RÉF\.|REF\.)\s+DÉSIGNATION/i,
          /DÉSIGNATION\s+BAT/i,
          /REF\s+DÉSIGNATION/i,
        ];
        for (const variante of enTeteVariantes) {
          const match = textePDF.match(variante);
          if (match) {
            debutTableau = (match.index || 0) + match[0].length;
            console.log('En-tête trouvé avec variante:', variante.source);
            break;
          }
        }
      }
      
      // Chercher la fin du tableau (avant le DERNIER "Total HT" pour gérer les factures multi-pages)
      const totalHTRegex = /Total\s+HT/gi;
      const correspondancesTotalHT = [...textePDF.matchAll(totalHTRegex)];
      const finTableau = correspondancesTotalHT.length > 0
        ? (correspondancesTotalHT[correspondancesTotalHT.length - 1].index || textePDF.length)
        : textePDF.length;
      
      // Extraire la section du tableau
      const sectionTableauBrut = (debutTableau >= 0 && finTableau > debutTableau)
        ? textePDF.substring(debutTableau, finTableau)
        : textePDF;
      
      // Normaliser la section pour lisser les retours chariot simples (factures sur plusieurs pages)
      // NOTE: Certaines factures (comme RB3) peuvent avoir des formats de saut de ligne différents
      // On normalise de manière plus agressive pour gérer ces variations
      const sectionTableau = sectionTableauBrut
        .replace(/\r?\n\s*/g, '  ')  // convertir chaque saut de ligne en double espace
        .replace(/\f+/g, '  ')       // convertir les sauts de page en double espace aussi
        .replace(/\s{3,}/g, '  ');   // limiter les groupes d'espaces à 2 pour préserver les séparateurs
      
      console.log('Section tableau extraite (longueur:', sectionTableau.length, 'caractères)');
      console.log('Section tableau (premiers 2000 caractères):', sectionTableau.substring(0, 2000));
      
      // Détecter si la structure semble différente (pour aider au debug)
      const aEnTeteStandard = enTeteMatch !== null;
      if (!aEnTeteStandard) {
        console.log('⚠️ En-tête standard non trouvé, utilisation de variantes (peut indiquer une structure différente comme RB3)');
      }
      
      // APPROCHE SIMPLIFIÉE :
      // 1. D'abord, extraire les lignes avec références spéciales (1-couleur, FT, CHFT, CHFR, TRANSPORT) - pas de BAT/LOGO
      // 2. Ensuite, extraire TOUTES les lignes complètes (avec BAT/LOGO)
      // 3. Enfin, extraire les autres lignes simples (sans BAT/LOGO) en excluant celles déjà capturées
      
      // Références spéciales qui n'ont pas de BAT ni de LOGO
      const refsSpeciales = ['1-couleur', 'FT', 'CHFT', 'CHFR', 'TRANSPORT'];
      const patternRefSpeciales = new RegExp(`(${refsSpeciales.join('|')})\\s+(.+?)\\s+([\\d,]+)\\s+([\\d,]+\\.\\d{2})\\s*€\\s+([\\d,]+\\.\\d{2})\\s*€\\s+([\\d,]+\\.\\d{2})\\s*€`, 'gi');
      
      // Pattern 1: Lignes avec BAT et LOGO (format standard)
      // Format: REF   Description   BAT (4 chiffres)   LOGO (majuscules)   Qté   PU HT   Remise   Montant HT
      // Le pattern doit être plus flexible pour capturer les logos avec espaces (ex: "RELAIS TROPEZ")
      // NOTE: Certaines factures (comme RB3) peuvent avoir des variations dans l'espacement ou le format
      // On utilise un pattern plus flexible avec des quantificateurs non-greedy pour gérer les variations
      const patternLigneComplet = /([A-Z0-9\-]+)\s+(.+?)\s+(\d{4})\s+([A-Z\s]{3,})\s+([\d,]+)\s+([\d,]+\.\d{2})\s*€\s+([\d,]+\.\d{2})\s*€\s+([\d,]+\.\d{2})\s*€/gi;
      
      let match;
      const lignesTrouvees = new Set<string>(); // Pour éviter les doublons basés sur l'index RegExp
      const clesDejaCapturees = new Set<string>(); // Pour éviter les doublons réels
      const refsSpecialesCapturees = new Set<string>(); // Références spéciales déjà traitées
      
      const creerCleLigne = (
        ref: string,
        bat: string | undefined,
        logo: string | undefined,
        quantite: number,
        montantHT: number
      ): string => {
        const quantiteCle = Number.isFinite(quantite) ? quantite.toString() : '';
        const montantCle = Number.isFinite(montantHT) ? montantHT.toString() : '';
        return [ref || '', bat || '', logo || '', quantiteCle, montantCle].join('__');
      };
      
      // ÉTAPE 1 : Extraire les lignes avec références spéciales (1-couleur, FT, CHFT, CHFR, TRANSPORT)
      console.log('=== ÉTAPE 1 : Extraction des lignes avec références spéciales ===');
      patternRefSpeciales.lastIndex = 0;
      while ((match = patternRefSpeciales.exec(sectionTableau)) !== null) {
        const refFournisseur = match[1]?.trim() || '';
        let designation = match[2]?.trim() || '';
        const quantiteStr = match[3]?.replace(/,/g, '') || '0';
        const puHTStr = match[4]?.replace(/,/g, '') || '0';
        const remiseStr = match[5]?.replace(/,/g, '') || '0';
        const montantHTStr = match[6]?.replace(/,/g, '') || '0';
        
        // Nettoyer la désignation : s'arrêter avant le montant HT de cette ligne suivi d'une référence
        // Format: "1,506.24 € FT" -> s'arrêter avant "1,506.24"
        let positionMin = designation.length;
        
        // Chercher le montant HT de cette ligne suivi d'une référence
        if (montantHTStr && montantHTStr !== '0') {
          const montantNum = parseFloat(montantHTStr);
          const montantAvecVirgules = montantNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          
          const pattern1 = new RegExp(`\\b${montantAvecVirgules.replace(/\./g, '\\.').replace(/,/g, ',?')}\\s*€\\s+([A-Z0-9\\-]{2,})`, 'i');
          const pattern2 = new RegExp(`\\b${montantHTStr.replace(/\./g, '\\.')}\\s*€\\s+([A-Z0-9\\-]{2,})`, 'i');
          
          const match1 = designation.match(pattern1);
          const match2 = designation.match(pattern2);
          
          if (match1 && match1.index !== undefined) {
            positionMin = Math.min(positionMin, match1.index);
          }
          if (match2 && match2.index !== undefined) {
            positionMin = Math.min(positionMin, match2.index);
          }
        }
        
        // Chercher un montant collé suivi d'une référence (pattern général)
        const montantRefPattern = /([\d,]+\.\d{2})\s*€\s+([A-Z0-9\-]{2,})/g;
        let montantRefMatch;
        while ((montantRefMatch = montantRefPattern.exec(designation)) !== null) {
          if (montantRefMatch.index !== undefined) {
            positionMin = Math.min(positionMin, montantRefMatch.index);
            break;
          }
        }
        
        // Couper la désignation si nécessaire
        if (positionMin < designation.length) {
          designation = designation.substring(0, positionMin).trim();
        }
        
        const quantite = parseFloat(quantiteStr);
        const puHT = parseFloat(puHTStr);
        const remiseLigne = parseFloat(remiseStr) || 0;
        const montantHT = parseFloat(montantHTStr);
        
        // Vérifier que c'est une ligne valide
        if (quantite > 0 && montantHT > 0) {
          const cleLigne = `${refFournisseur}-${match.index}`;
          if (!lignesTrouvees.has(cleLigne)) {
            lignesTrouvees.add(cleLigne);
            clesDejaCapturees.add(creerCleLigne(refFournisseur, undefined, undefined, quantite, montantHT));
            refsSpecialesCapturees.add(refFournisseur);
            clesDejaCapturees.add(creerCleLigne(refFournisseur, undefined, undefined, quantite, montantHT));
            
            const descriptionFinale = designation.trim();
            
            lignes.push({
              description: descriptionFinale,
              refFournisseur: refFournisseur || undefined,
              bat: undefined,
              logo: undefined,
              quantite,
              prixUnitaireHT: puHT,
              remise: remiseLigne,
              montantHT: montantHT,
            });
            
            console.log('Ligne extraite (référence spéciale):', { refFournisseur, designation: descriptionFinale.substring(0, 40), quantite, puHT, remise: remiseLigne, montantHT });
          }
        }
      }
      
      console.log('Lignes avec références spéciales extraites:', lignes.length);
      console.log('Références spéciales capturées:', Array.from(refsSpecialesCapturees));
      
      // ÉTAPE 2 : Extraire TOUTES les lignes complètes (avec BAT/LOGO)
      console.log('=== ÉTAPE 2 : Extraction des lignes complètes (avec BAT/LOGO) ===');
      patternLigneComplet.lastIndex = 0;
      while ((match = patternLigneComplet.exec(sectionTableau)) !== null) {
        const refFournisseur = match[1]?.trim() || '';
        let designation = match[2]?.trim() || '';
        const bat = match[3]?.trim() || '';
        const logo = match[4]?.trim() || '';
        const quantiteStr = match[5]?.replace(/,/g, '') || '0';
        // Pour les montants : enlever les virgules (séparateurs de milliers) mais garder le point décimal
        // Exemple: "1,196.00" -> "1196.00" (pas "1.196.00")
        const puHTStr = match[6]?.replace(/,/g, '') || '0';
        const remiseStr = match[7]?.replace(/,/g, '') || '0';
        const montantHTStr = match[8]?.replace(/,/g, '') || '0';
        
        // Éviter de retraiter les références spéciales déjà extraites
        if (refsSpeciales.includes(refFournisseur) && refsSpecialesCapturees.has(refFournisseur)) {
          console.log('Référence spéciale déjà capturée (ignorée):', refFournisseur);
          continue;
        }
        
        const quantite = parseFloat(quantiteStr);
        const puHT = parseFloat(puHTStr);
        const remiseLigne = parseFloat(remiseStr) || 0;
        const montantHT = parseFloat(montantHTStr);
        
        // Vérifier que c'est une ligne valide
        if (quantite > 0 && montantHT > 0 && 
            !refFournisseur.match(/^(Total|TVA|Net)/i)) {
          
          const cleLigne = `${refFournisseur}-${match.index}`;
          const cleUnique = creerCleLigne(refFournisseur, bat, logo, quantite, montantHT);
          if (!lignesTrouvees.has(cleLigne) && !clesDejaCapturees.has(cleUnique)) {
            lignesTrouvees.add(cleLigne);
            clesDejaCapturees.add(cleUnique);
            
            // Garder seulement la description pure (sans ref, BAT, logo)
            const descriptionFinale = designation.trim();
            
            lignes.push({
              description: descriptionFinale,
              refFournisseur: refFournisseur || undefined,
              bat: bat || undefined,
              logo: logo || undefined,
              quantite,
              prixUnitaireHT: puHT,
              remise: remiseLigne,
              montantHT: montantHT,
            });
            
            console.log('Ligne extraite (complet):', { refFournisseur, designation: designation.substring(0, 40), bat, logo, quantite, puHT, remise: remiseLigne, montantHT });
          } else {
            console.log('Ligne déjà trouvée (doublon ignoré):', { refFournisseur, cleLigne });
          }
        } else {
          console.log('Ligne invalide (ignorée):', { refFournisseur, quantite, montantHT });
        }
      }
      
      console.log('Lignes complètes extraites:', lignes.length);
      console.log('Clés déjà capturées:', Array.from(clesDejaCapturees));
      
      // ÉTAPE 3 : Extraire les autres lignes simples (sans BAT/LOGO) en excluant celles déjà capturées
      console.log('=== ÉTAPE 3 : Extraction des autres lignes simples (sans BAT/LOGO) ===');
      
      // Approche différente : diviser le texte en lignes en cherchant les montants HT suivis d'une référence
      // Cela permet de séparer correctement les lignes collées ensemble
      // NOTE: Cette étape est importante pour les factures avec des variations de structure (comme RB3)
      // où certaines lignes peuvent ne pas avoir de BAT/LOGO mais être valides
      const lignesSimples: Array<{ref: string, texte: string, index: number}> = [];
      const refPattern = /\b([A-Z0-9\-]+)\s+/g;
      let refMatch;
      
      // Chercher toutes les références dans le texte
      while ((refMatch = refPattern.exec(sectionTableau)) !== null) {
        const ref = refMatch[1];
        
        // Ignorer uniquement les références spéciales déjà capturées
        if (refsSpeciales.includes(ref) && refsSpecialesCapturees.has(ref)) {
          continue;
        }
        
        // Ignorer les BAT (4 chiffres uniquement) et les logos (majuscules uniquement)
        // Ignorer aussi les nombres seuls (000, 736, 3, 1, 100, etc.) qui ne sont pas des références
        // Une référence valide doit contenir au moins une lettre ou être une référence spéciale
        if (/^\d{4}$/.test(ref) || /^[A-Z\s]+$/.test(ref) || /^\d{1,3}$/.test(ref)) {
          continue;
        }
        
        // Vérifier que la référence contient au moins une lettre (sauf pour les références spéciales déjà capturées)
        if (!ref.match(/[A-Za-z]/) && !refsSpeciales.includes(ref)) {
          continue;
        }
        
        // Extraire le texte après la référence jusqu'au montant HT de cette ligne
        const texteApres = sectionTableau.substring(refMatch.index + refMatch[0].length);
        
        // Chercher le montant HT (dernier élément de la ligne) : format "X.XX €" ou "X,XXX.XX €"
        // Le montant HT est suivi soit d'une nouvelle référence, soit de la fin du texte
        const montantHTPattern = /([\d,]+\.\d{2})\s*€/g;
        let montantHTMatch;
        let finLigne = texteApres.length;
        
        // Chercher tous les montants HT dans le texte après la référence
        const montantsHT: Array<{montant: string, index: number}> = [];
        while ((montantHTMatch = montantHTPattern.exec(texteApres)) !== null) {
          if (montantHTMatch.index !== undefined) {
            montantsHT.push({
              montant: montantHTMatch[1],
              index: montantHTMatch.index
            });
          }
        }
        
        // Le dernier montant HT est celui de cette ligne
        if (montantsHT.length > 0) {
          const dernierMontant = montantsHT[montantsHT.length - 1];
          const finMontant = dernierMontant.index + montantsHT[montantsHT.length - 1].montant.length + 2; // +2 pour " €"
          
          // Chercher la prochaine référence après le montant HT
          const texteApresMontant = texteApres.substring(finMontant);
          const prochaineRef = texteApresMontant.match(/\s+([A-Z0-9\-]+)\s+/);
          if (prochaineRef && prochaineRef.index !== undefined) {
            finLigne = finMontant + prochaineRef.index;
          } else {
            finLigne = finMontant;
          }
        }
        
        const texteLigne = texteApres.substring(0, finLigne).trim();
        
        lignesSimples.push({
          ref,
          texte: texteLigne,
          index: refMatch.index
        });
        
      }
      
      console.log('Lignes simples trouvées:', lignesSimples.length);
      
      // Maintenant, parser chaque ligne simple avec le pattern
      for (const ligneSimple of lignesSimples) {
        const texteLigne = `${ligneSimple.ref}   ${ligneSimple.texte}`;
        const match = texteLigne.match(/^([A-Z0-9\-]+)\s+(.+?)\s+([\d,]+)\s+([\d,]+\.\d{2})\s*€\s+([\d,]+\.\d{2})\s*€\s+([\d,]+\.\d{2})\s*€/i);
        
        if (match) {
          const refFournisseur = match[1]?.trim() || '';
          let designation = match[2]?.trim() || '';
          const quantiteStr = match[3]?.replace(/,/g, '') || '0';
          // Pour les montants : enlever les virgules (séparateurs de milliers) mais garder le point décimal
          const puHTStr = match[4]?.replace(/,/g, '') || '0';
          const remiseStr = match[5]?.replace(/,/g, '') || '0';
          const montantHTStr = match[6]?.replace(/,/g, '') || '0';
          
          // La désignation devrait déjà être propre car on a divisé le texte en lignes
          // Mais on peut encore nettoyer si nécessaire
          // Nettoyer la désignation : s'arrêter avant une nouvelle référence qui pourrait être collée
          let positionMin = designation.length;
          
          // Chercher un montant collé suivi d'une référence (montant € + espace + REF)
          const montantRefPattern = /([\d,]+\.\d{2})\s*€\s+([A-Z0-9\-]{2,})/g;
          let montantRefMatch;
          while ((montantRefMatch = montantRefPattern.exec(designation)) !== null) {
            if (montantRefMatch.index !== undefined) {
              positionMin = Math.min(positionMin, montantRefMatch.index);
              break;
            }
          }
          
          // Couper la désignation si nécessaire
          if (positionMin < designation.length) {
            designation = designation.substring(0, positionMin).trim();
          }
          
          // Vérifier aussi si cette ligne a déjà été extraite
          const cleLigne = `${refFournisseur}-${ligneSimple.index}`;
          const cleUnique = creerCleLigne(refFournisseur, undefined, undefined, parseFloat(quantiteStr), parseFloat(montantHTStr));
          if (lignesTrouvees.has(cleLigne) || clesDejaCapturees.has(cleUnique)) {
            continue; // Déjà extraite
          }
          
          const quantite = parseFloat(quantiteStr);
          const puHT = parseFloat(puHTStr);
          const remiseLigne = parseFloat(remiseStr) || 0;
          const montantHT = parseFloat(montantHTStr);
          
          // Vérifier que c'est une ligne valide
          // La référence doit contenir au moins une lettre (sauf pour les références spéciales)
          const estRefValide = refFournisseur.match(/[A-Za-z]/) || refsSpeciales.includes(refFournisseur);
          
          if (quantite > 0 && montantHT > 0 && 
              !refFournisseur.match(/^(Total|TVA|Net)/i) &&
              estRefValide) {
            
            lignesTrouvees.add(cleLigne);
            clesDejaCapturees.add(cleUnique);
            
            // Garder seulement la description pure
            const descriptionFinale = designation.trim();
            
            lignes.push({
              description: descriptionFinale,
              refFournisseur: refFournisseur || undefined,
              bat: undefined,
              logo: undefined,
              quantite,
              prixUnitaireHT: puHT,
              remise: remiseLigne,
              montantHT: montantHT,
            });
            
            console.log('Ligne extraite (simple):', { refFournisseur, designation: descriptionFinale.substring(0, 40), quantite, puHT, remise: remiseLigne, montantHT });
          }
        }
      }
      
      console.log('Nombre de lignes extraites:', lignes.length);
      console.log('=== FIN EXTRACTION LIGNES ===');

      // Si aucune ligne n'a été trouvée, essayer une approche alternative
      // Chercher directement dans le texte complet avec des patterns plus larges
      if (lignes.length === 0) {
        console.log('Aucune ligne trouvée avec les patterns standards, essai d\'extraction alternative...');
        
        // Chercher toutes les occurrences de références dans le texte complet
        const refPattern = /\b([a-z]+\d*[a-z]?-[a-z]?\d*|[A-Z]+\d+[A-Z]?-[A-Z]?\d*)\b/gi;
        const refMatches = Array.from(textePDF.matchAll(refPattern));
        console.log('Références trouvées dans le texte complet:', refMatches.length, refMatches.slice(0, 5).map(m => m[0]));
        
        // Pour chaque référence, essayer d'extraire les données autour
        for (const refMatch of refMatches.slice(0, 20)) { // Limiter à 20 pour éviter trop de traitement
          const refIndex = refMatch.index || 0;
          const refFournisseur = refMatch[0];
          
          // Extraire un contexte autour de la référence (200 caractères avant et après)
          const debut = Math.max(0, refIndex - 200);
          const fin = Math.min(textePDF.length, refIndex + 200);
          const contexte = textePDF.substring(debut, fin);
          
          // Chercher des nombres dans le contexte (BAT, Qté, Montant)
          const nombres = contexte.match(/\b(\d{4})\b|\b(\d{3,})\b/g);
          if (nombres && nombres.length >= 3) {
            // Essayer d'extraire les données
            const batMatch = contexte.match(/\b(\d{4})\b/);
            const quantiteMatch = contexte.match(/\b(\d{3,})\b/g);
            const montantMatch = contexte.match(/\b(\d{1,3}(?:[.,]\d{2})?)\b/g);
            
            if (batMatch && quantiteMatch && montantMatch) {
              const bat = batMatch[1];
              const quantite = parseFloat(quantiteMatch[0]?.replace(/,/g, '.') || '0');
              const montantHT = parseFloat(montantMatch[montantMatch.length - 1]?.replace(/,/g, '.') || '0');
              
              if (quantite > 0 && montantHT > 0 && quantite < 10000 && montantHT < 100000) {
                // Extraire la désignation (texte entre la référence et le BAT)
                const designationMatch = contexte.match(new RegExp(refFournisseur + '\\s+(.+?)\\s+' + bat));
                const designation = designationMatch ? designationMatch[1].trim() : 'Produit';
                
                const puHT = quantite > 0 ? montantHT / quantite : 0;
                
                lignes.push({
                  description: `${designation} [BAT: ${bat}] (Ref: ${refFournisseur})`,
                  quantite,
                  prixUnitaireHT: puHT,
                  remise: 0,
                  montantHT,
                });
                
                console.log('Ligne extraite (méthode alternative):', { refFournisseur, designation, bat, quantite, montantHT });
              }
            }
          }
        }
      }
      
      // Si toujours aucune ligne, créer une ligne par défaut
      if (lignes.length === 0) {
        lignes.push({
          description: 'Produits RB DRINKS',
          quantite: 1,
          prixUnitaireHT: netHT,
          remise: 0,
          montantHT: netHT,
        });
        avertissements.push('Aucune ligne de produit détectée. Ligne par défaut créée avec le net HT. Veuillez vérifier le texte extrait dans la section Debug.');
      }

      const facture: Facture = {
        id: `rb-drinks-${numero}-${Date.now()}`,
        fournisseur: 'RB DRINKS',
        numero: numero, // Garder le format original (F16749)
        date,
        fichierPDF: nomFichier,
        lignes,
        totalHT: netHT, // Utiliser le net HT comme total HT (après remise)
        totalTVA,
        totalTTC,
        dateImport: new Date(),
        donneesBrutes: {
          texteExtrait: textePDF.substring(0, 2000), // Garder un extrait pour debug (2000 caractères)
          texteComplet: textePDF, // Texte complet pour analyse
          totalHTBrut: totalHT, // Total HT avant remise
          remise: remise,
          netHT: netHT,
        },
      };

      if (netHT === 0 && totalTTC === 0) {
        avertissements.push('Les totaux n\'ont pas pu être extraits. Vérifiez manuellement.');
      }
      
      if (lignes.length > 0) {
        // Vérifier la cohérence des totaux
        const totalHTLignes = lignes.reduce((sum, ligne) => sum + ligne.montantHT, 0);
        const difference = Math.abs(totalHTLignes - netHT);
        if (difference > 0.01) {
          avertissements.push(`Écart de ${difference.toFixed(2)}€ entre la somme des lignes (${totalHTLignes.toFixed(2)}€) et le net HT (${netHT.toFixed(2)}€).`);
        }
        
        // Log pour aider au debug des variations de structure
        console.log(`✅ Parsing terminé: ${lignes.length} lignes extraites pour ${nomFichier}`);
        if (nomFichier.includes('RB3')) {
          console.log('ℹ️ Facture RB3 détectée - structure avec variations gérées');
        }
      }

      return {
        facture,
        erreurs: erreurs.length > 0 ? erreurs : undefined,
        avertissements: avertissements.length > 0 ? avertissements : undefined,
      };
    } catch (error) {
      const messageErreur = error instanceof Error ? error.message : 'Erreur inconnue';
      erreurs.push(messageErreur);
      
      // En cas d'erreur, créer une facture minimale
      const nomFichier = typeof fichier === 'string' 
        ? fichier.split(/[/\\]/).pop() || 'RB1.pdf'
        : fichier.name;
      const match = nomFichier.match(/RB(\d+)/i);
      const numero = match ? match[1] : '1';
      
      return {
        facture: {
          id: `rb-drinks-${numero}-${Date.now()}`,
          fournisseur: 'RB DRINKS',
          numero: `RB${numero}`,
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
