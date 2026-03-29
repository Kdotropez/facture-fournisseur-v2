/**
 * Composant d'édition et de prévisualisation du parsing
 * Permet de tester le parsing d'un document avant l'import
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { FileText, Upload, X, Edit2, Save, RotateCcw, AlertCircle, Plus } from 'lucide-react';
import { parserFacture } from '@parsers/index';
import { extraireTextePDF } from '../utils/pdfParser';
import { telechargerCSVSimple } from '../utils/exportSimplifie';
import type { Facture, LigneProduit } from '../types/facture';
import type { Fournisseur } from '../types/facture';
import { extraireReglesDepuisFacture, memoriserModeleParsing, apprendreCorrections } from '../services/parsingRulesService';
import { detecterFournisseurDepuisContenu } from '../hooks/useImportPDF';
import { obtenirTousLesFournisseurs, ajouterFournisseurPersonnalise } from '../services/fournisseursService';
import './EditeurParsing.css';

const TAUX_TVA_PAR_DEFAUT = 0.20;
const arrondir2 = (valeur: number) =>
  Math.round((valeur + Number.EPSILON) * 100) / 100;

const fournisseurSansTVA = (facture: Facture | null): boolean =>
  !!facture && facture.fournisseur === 'ITALESSE';

const obtenirTauxTVAFacture = (facture: Facture): number => {
  if (fournisseurSansTVA(facture)) {
    return 0;
  }

  if (facture.donneesBrutes && typeof facture.donneesBrutes.tauxTVA === 'number') {
    return Math.max(0, facture.donneesBrutes.tauxTVA);
  }

  if (facture.totalHT > 0 && facture.totalTVA > 0) {
    return Math.max(0, facture.totalTVA / facture.totalHT);
  }

  return TAUX_TVA_PAR_DEFAUT;
};

interface EditeurParsingProps {
  onImporter: (facture: Facture) => Promise<void>;
  fichierInitial?: File;
  fournisseurInitial?: Fournisseur;
}

export function EditeurParsing({ onImporter, fichierInitial, fournisseurInitial }: EditeurParsingProps) {
  const [fichier, setFichier] = useState<File | null>(fichierInitial || null);
  const [fournisseur, setFournisseur] = useState<Fournisseur | ''>(fournisseurInitial || '');
  const [texteBrut, setTexteBrut] = useState<string>('');
  const [factureParsed, setFactureParsed] = useState<Facture | null>(null);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [avertissements, setAvertissements] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [modeEdition, setModeEdition] = useState(false);
  const [factureEditee, setFactureEditee] = useState<Facture | null>(null);
  const [messageSucces, setMessageSucces] = useState<string>('');
  const [nouveauFournisseur, setNouveauFournisseur] = useState<string>('');
  const [afficherAjoutFournisseur, setAfficherAjoutFournisseur] = useState(false);
  const [tousLesFournisseurs, setTousLesFournisseurs] = useState<Fournisseur[]>(obtenirTousLesFournisseurs());
  const [champEnFocus, setChampEnFocus] = useState<{ index: number; champ: string; valeur: string } | null>(null);
  const [lignesManuelles, setLignesManuelles] = useState<string>('');
  const [draftInfo, setDraftInfo] = useState<{ exists: boolean; savedAt?: Date }>({ exists: false });
  const [draftGlobalInfo, setDraftGlobalInfo] = useState<{ exists: boolean; savedAt?: Date }>({ exists: false });
  const draftTimerRef = useRef<number | null>(null);

  const draftKey = useMemo(() => {
    const numero = factureEditee?.numero || '';
    const fournisseurKey = factureEditee?.fournisseur || '';
    const fichierNom = fichier?.name || '';
    const ident = [fournisseurKey, numero, fichierNom].filter(Boolean).join('|') || 'editeur-parsing';
    return `editeur-parsing-draft-${ident}`;
  }, [factureEditee?.numero, factureEditee?.fournisseur, fichier?.name]);

  const chargerBrouillon = useCallback(() => {
    try {
      const brut = localStorage.getItem(draftKey);
      if (!brut) {
        setDraftInfo({ exists: false });
        return null;
      }
      const parsed = JSON.parse(brut);
      const savedAt = parsed?.savedAt ? new Date(parsed.savedAt) : undefined;
      setDraftInfo({ exists: true, savedAt });
      return parsed;
    } catch {
      setDraftInfo({ exists: false });
      return null;
    }
  }, [draftKey]);

  const restaurerBrouillon = useCallback(() => {
    const draft = chargerBrouillon();
    if (!draft) {
      setErreurs(['Aucun brouillon disponible.']);
      return;
    }
    if (draft.factureEditee) {
      setFactureEditee(draft.factureEditee);
    }
    if (typeof draft.lignesManuelles === 'string') {
      setLignesManuelles(draft.lignesManuelles);
    }
    setModeEdition(true);
  }, [chargerBrouillon]);

  const effacerBrouillon = useCallback(() => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignorer
    }
    setDraftInfo({ exists: false });
  }, [draftKey]);

  const restaurerDernierBrouillonGlobal = useCallback(() => {
    try {
      const dernierKey = localStorage.getItem('editeur-parsing-draft-last-key');
      if (!dernierKey) {
        setErreurs(['Aucun brouillon global disponible.']);
        return;
      }
      const brut = localStorage.getItem(dernierKey);
      if (!brut) {
        setErreurs(['Aucun brouillon global disponible.']);
        return;
      }
      const parsed = JSON.parse(brut);
      if (parsed?.factureEditee) {
        setFactureEditee(parsed.factureEditee);
      }
      if (typeof parsed?.lignesManuelles === 'string') {
        setLignesManuelles(parsed.lignesManuelles);
      }
      setModeEdition(true);
    } catch {
      setErreurs(['Impossible de restaurer le brouillon global.']);
    }
  }, []);
  const [historiqueSauvegardes, setHistoriqueSauvegardes] = useState<Array<{
    id: string;
    fournisseur: string;
    numero: string;
    dateFacture: string;
    dateSauvegarde: string;
  }>>([]);

  const dateFacture = factureEditee ? new Date(factureEditee.date) : null;
  const dateFactureValide = dateFacture ? !Number.isNaN(dateFacture.getTime()) : false;
  const valeurDateInput = dateFactureValide ? dateFacture!.toISOString().split('T')[0] : '';
  const dateAffichee = dateFactureValide ? dateFacture!.toLocaleDateString('fr-FR') : 'Date invalide';

  // Données complémentaires issues du parsing brut (pour gérer les remises globales, net HT, etc.)
  const totalHTBrut =
    (factureEditee?.donneesBrutes && typeof factureEditee.donneesBrutes.totalHTBrut === 'number'
      ? factureEditee.donneesBrutes.totalHTBrut
      : factureEditee?.totalHT) ?? 0;
  const remiseGlobale =
    (factureEditee?.donneesBrutes && typeof factureEditee.donneesBrutes.remise === 'number'
      ? factureEditee.donneesBrutes.remise
      : 0);
  const netHTCalcule = totalHTBrut - remiseGlobale;
  const lignesExport = factureEditee?.lignes.map((ligne) => ({
    ref: ligne.refFournisseur || '',
    nom: ligne.description,
    nomFR: ligne.descriptionFR || '',
    logo: ligne.logo || '',
    quantiteDevis: '',
    quantiteFacture: ligne.quantite,
    prixUnitaire: ligne.prixUnitaireHT,
  })) || [];

  // Saisie utilisateur brute pour la remise globale (pour éviter les blocages du type="number")
  const [remiseGlobaleBrute, setRemiseGlobaleBrute] = useState<string>('');

  useEffect(() => {
    // Mettre à jour le champ texte quand la remise globale change (par parsing ou import)
    if (remiseGlobale && !Number.isNaN(remiseGlobale)) {
      setRemiseGlobaleBrute(remiseGlobale.toFixed(2));
    } else {
      setRemiseGlobaleBrute('');
    }
  }, [remiseGlobale]);

  // Debug: logger quand champEnFocus change
  useEffect(() => {
    if (champEnFocus) {
      console.log('[EDITEUR] champEnFocus changé:', champEnFocus);
      console.log('[EDITEUR] factureEditee existe:', !!factureEditee);
    }
  }, [champEnFocus, factureEditee]);

  // Rafraîchir la liste des fournisseurs quand nécessaire
  useEffect(() => {
    setTousLesFournisseurs(obtenirTousLesFournisseurs());
  }, [afficherAjoutFournisseur]);

  useEffect(() => {
    try {
      const brut = localStorage.getItem('editeur-parsing-historique');
      if (brut) {
        const data = JSON.parse(brut);
        if (Array.isArray(data)) {
          setHistoriqueSauvegardes(data);
        }
      }
    } catch {
      // ignorer
    }
  }, []);

  const ajouterHistoriqueSauvegarde = useCallback((facture: Facture) => {
    const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
    const entree = {
      id: `facture-${facture.id}-${Date.now()}`,
      fournisseur: facture.fournisseur,
      numero: facture.numero,
      dateFacture: Number.isNaN(dateFacture.getTime()) ? '' : dateFacture.toISOString(),
      dateSauvegarde: new Date().toISOString(),
    };

    setHistoriqueSauvegardes((prev) => {
      const maj = [entree, ...prev].slice(0, 15);
      try {
        localStorage.setItem('editeur-parsing-historique', JSON.stringify(maj));
      } catch {
        // ignorer
      }
      return maj;
    });
  }, []);

  // Charger automatiquement le fichier initial s'il est fourni
  useEffect(() => {
    if (fichierInitial && !fichier) {
      setFichier(fichierInitial);
      // Extraire le texte du PDF automatiquement et détecter le fournisseur
      extraireTextePDF(fichierInitial).then(async texte => {
        setTexteBrut(texte);
        // Détecter automatiquement le fournisseur
        const fournisseurDetecte = await detecterFournisseurDepuisContenu(fichierInitial);
        if (fournisseurDetecte) {
          setFournisseur(fournisseurDetecte);
        }
      }).catch(error => {
        setErreurs([`Erreur lors de l'extraction du texte: ${error instanceof Error ? error.message : 'Erreur inconnue'}`]);
      });
    }
  }, [fichierInitial, fichier]);

  // Détecter automatiquement le fournisseur quand un fichier est sélectionné
  useEffect(() => {
    if (fichier && !fournisseur) {
      detecterFournisseurDepuisContenu(fichier).then((fournisseurDetecte: Fournisseur | null) => {
        if (fournisseurDetecte) {
          setFournisseur(fournisseurDetecte);
        }
      }).catch((error: unknown) => {
        console.warn('Erreur lors de la détection du fournisseur:', error);
      });
    }
  }, [fichier, fournisseur]);

  const handleAjouterFournisseur = useCallback(() => {
    if (!nouveauFournisseur.trim()) {
      setErreurs(['Veuillez saisir un nom de fournisseur']);
      return;
    }

    const nomFournisseur = nouveauFournisseur.trim() as Fournisseur;
    
    try {
      ajouterFournisseurPersonnalise(nomFournisseur);
      setTousLesFournisseurs(obtenirTousLesFournisseurs());
      setFournisseur(nomFournisseur);
      setNouveauFournisseur('');
      setAfficherAjoutFournisseur(false);
      setMessageSucces(`Fournisseur "${nomFournisseur}" ajouté avec succès !`);
      setTimeout(() => setMessageSucces(''), 3000);
    } catch (error) {
      setErreurs([`Erreur lors de l'ajout du fournisseur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`]);
    }
  }, [nouveauFournisseur]);

  const handleFichierChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFichier(file);
    setFactureParsed(null);
    setFactureEditee(null);
    setErreurs([]);
    setAvertissements([]);
    setModeEdition(false);

    try {
      const texte = await extraireTextePDF(file);
      setTexteBrut(texte);
    } catch (error) {
      setErreurs([`Erreur lors de l'extraction du texte: ${error instanceof Error ? error.message : 'Erreur inconnue'}`]);
    }
  }, []);

  const handleParser = useCallback(async () => {
    if (!fichier || !fournisseur) {
      setErreurs(['Veuillez sélectionner un fichier et un fournisseur']);
      return;
    }

    setEnCours(true);
    setErreurs([]);
    setAvertissements([]);

    try {
      const resultat = await parserFacture(fichier, fournisseur);
      
      if (resultat.erreurs && resultat.erreurs.length > 0) {
        setErreurs(resultat.erreurs);
      }
      
      if (resultat.avertissements && resultat.avertissements.length > 0) {
        setAvertissements(resultat.avertissements);
      }

      setFactureParsed(resultat.facture);
      setFactureEditee({ ...resultat.facture });
    } catch (error) {
      setErreurs([`Erreur lors du parsing: ${error instanceof Error ? error.message : 'Erreur inconnue'}`]);
    } finally {
      setEnCours(false);
    }
  }, [fichier, fournisseur]);

  const handleImporter = useCallback(async () => {
    if (!factureEditee || !fournisseur || !fichier) return;

    try {
      // S'assurer que le pdfOriginal est inclus si le fichier existe
      let factureAImporter = { ...factureEditee };
      
      // Si pdfOriginal n'est pas présent, le créer depuis le fichier
      if (!factureAImporter.pdfOriginal && fichier) {
        const reader = new FileReader();
        const pdfDataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(fichier);
        });
        factureAImporter.pdfOriginal = pdfDataUrl;
      }
      
      // Log pour déboguer
      console.log('[EDITEUR] Import de la facture:', {
        numero: factureAImporter.numero,
        fournisseur: factureAImporter.fournisseur,
        nombreLignes: factureAImporter.lignes.length,
        totalHT: factureAImporter.totalHT,
        aPdfOriginal: !!factureAImporter.pdfOriginal,
      });
      
              // Sauvegarder les règles de parsing avant l'import
              extraireReglesDepuisFacture(
                fournisseur as Fournisseur,
                factureAImporter.numero,
                texteBrut
              );
              
              // Mémoriser le modèle de parsing complet (facture corrigée)
              memoriserModeleParsing(
                fournisseur as Fournisseur,
                factureAImporter,
                texteBrut
              );
              
              // Apprendre les corrections faites dans l'éditeur
              if (factureParsed) {
                apprendreCorrections(
                  fournisseur as Fournisseur,
                  factureParsed,
                  factureAImporter,
                  texteBrut
                );
              }
      
      await onImporter(factureAImporter);

      ajouterHistoriqueSauvegarde(factureAImporter);
      
      // Afficher un message de succès
      setMessageSucces(`Facture importée avec succès ! Les corrections ont été mémorisées pour ${fournisseur}.`);
      
      // Réinitialiser après import
      setTimeout(() => {
        setFichier(null);
        setFournisseur('');
        setTexteBrut('');
        setFactureParsed(null);
        setFactureEditee(null);
        setErreurs([]);
        setAvertissements([]);
        setModeEdition(false);
        setMessageSucces('');
      }, 2000);
    } catch (error) {
      setErreurs([`Erreur lors de l'import: ${error instanceof Error ? error.message : 'Erreur inconnue'}`]);
    }
  }, [factureEditee, fournisseur, texteBrut, onImporter]);

  const handleEditerLigne = useCallback((index: number, ligne: Partial<LigneProduit>) => {
    if (!factureEditee) return;

    const nouvellesLignes = [...factureEditee.lignes];
    nouvellesLignes[index] = { ...nouvellesLignes[index], ...ligne };
    
    // Recalculer le total HT à partir des lignes
    const totalHT = arrondir2(nouvellesLignes.reduce((sum, l) => sum + l.montantHT, 0));

    // Utiliser le taux de TVA issu des données brutes si présent, sinon 20 %
    const tauxTVA = obtenirTauxTVAFacture(factureEditee);
    const totalTVA = arrondir2(totalHT * tauxTVA);
    const totalTTC = arrondir2(totalHT + totalTVA);
    
    setFactureEditee({
      ...factureEditee,
      lignes: nouvellesLignes,
      totalHT,
      totalTVA,
      totalTTC,
      donneesBrutes: {
        ...(factureEditee.donneesBrutes || {}),
        tauxTVA,
      },
    });
  }, [factureEditee]);

  // Autosave brouillon (facture + lignes manuelles)
  useEffect(() => {
    if (!factureEditee && !lignesManuelles.trim()) return;
    if (draftTimerRef.current) {
      window.clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({
            factureEditee,
            lignesManuelles,
            savedAt: new Date().toISOString(),
          })
        );
        localStorage.setItem('editeur-parsing-draft-last-key', draftKey);
        setDraftInfo({ exists: true, savedAt: new Date() });
        setDraftGlobalInfo({ exists: true, savedAt: new Date() });
      } catch {
        // ignorer
      }
    }, 400);
    return () => {
      if (draftTimerRef.current) {
        window.clearTimeout(draftTimerRef.current);
      }
    };
  }, [factureEditee, lignesManuelles, draftKey]);

  useEffect(() => {
    try {
      const dernierKey = localStorage.getItem('editeur-parsing-draft-last-key');
      if (!dernierKey) {
        setDraftGlobalInfo({ exists: false });
        return;
      }
      const brut = localStorage.getItem(dernierKey);
      if (!brut) {
        setDraftGlobalInfo({ exists: false });
        return;
      }
      const parsed = JSON.parse(brut);
      const savedAt = parsed?.savedAt ? new Date(parsed.savedAt) : undefined;
      setDraftGlobalInfo({ exists: true, savedAt });
    } catch {
      setDraftGlobalInfo({ exists: false });
    }
  }, []);

  const handleExporterCSV = useCallback(() => {
    if (!factureEditee) return;
    const nom = `facture-${factureEditee.numero}-${factureEditee.fournisseur}`;
    telechargerCSVSimple(nom, lignesExport);
  }, [factureEditee, lignesExport]);

  const appliquerLignesManuelles = useCallback(() => {
    if (!factureEditee) return;
    if (!lignesManuelles.trim()) return;

    const moneyRe = /\d{1,3}(?:\s\d{3})*,\d{2}/g;
    const intRe = /\d{1,3}(?:\s\d{3})*/g;
    const normaliserNombre = (valeur: string) =>
      parseFloat(valeur.replace(/\s/g, '').replace(',', '.'));
    const normaliserReference = (ref: string) => {
      const propre = ref.trim();
      if (propre === 'TAFARWA') return 'FTAFARWA';
      return propre;
    };
    const normaliserDescription = (description: string) =>
      description.replace(/\s+/g, ' ').replace(/\s+$/, '').trim();

    const lignesNettoyees = lignesManuelles
      .split(/\n+/g)
      .map((l) => l.trim())
      .filter(Boolean);

    const nouvellesLignes: LigneProduit[] = [];

    lignesNettoyees.forEach((ligne) => {
      if (/^ref\t|^nom\t|^qte facture\t|^pu ht/i.test(ligne.replace(/\s+/g, ' '))) {
        return;
      }
      if (/^\s*$/.test(ligne)) return;

      const colonnes = ligne.split('\t').map((c) => c.trim()).filter((c) => c.length > 0);
      if (colonnes.length >= 4) {
        const ref = normaliserReference(colonnes[0]);
        const description = normaliserDescription(colonnes[1]);
        const quantite = normaliserNombre(colonnes[2]);
        const prixUnitaireHT = normaliserNombre(colonnes[3]);

        if (!ref || !description || Number.isNaN(quantite) || Number.isNaN(prixUnitaireHT)) {
          return;
        }

        nouvellesLignes.push({
          refFournisseur: ref,
          description,
          quantite,
          prixUnitaireHT: arrondir2(prixUnitaireHT),
          remise: 0,
          montantHT: arrondir2(quantite * prixUnitaireHT),
        });
        return;
      }

      const segments = ligne
        .split('/')
        .map((segment) => segment.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      segments.forEach((segment) => {
        const ref = normaliserReference(segment.split(' ')[0] || '');
        if (!ref) return;

        const reste = segment.slice(ref.length).trim();
        if (!reste) return;

        const moneyMatches = Array.from(reste.matchAll(moneyRe)).map((m) => ({
          index: m.index || 0,
          valeur: parseFloat(m[0].replace(/\s/g, '').replace(',', '.')),
        })).filter((m) => !Number.isNaN(m.valeur));

        if (moneyMatches.length === 0) return;
        const montantMatch = moneyMatches[moneyMatches.length - 1];

        const intMatches = Array.from(reste.matchAll(intRe)).map((m) => {
          const index = m.index || 0;
          const fin = index + m[0].length;
          const suivant = reste[fin] || '';
          return {
            index,
            valeur: parseFloat(m[0].replace(/\s/g, '')),
            skip: suivant === ',',
          };
        }).filter((m) => !Number.isNaN(m.valeur) && !m.skip && m.index < montantMatch.index);

        if (intMatches.length === 0) return;
        const quantiteMatch = intMatches[intMatches.length - 1];

        const description = normaliserDescription(reste.slice(0, quantiteMatch.index));
        if (!description) return;

        const prixUnitaireCandidat = moneyMatches.length > 1
          ? moneyMatches[moneyMatches.length - 2].valeur
          : undefined;

        const montantHT = montantMatch.valeur;
        const quantite = quantiteMatch.valeur;
        const prixUnitaireHT = prixUnitaireCandidat !== undefined
          ? prixUnitaireCandidat
          : quantite > 0
            ? arrondir2(montantHT / quantite)
            : 0;

        nouvellesLignes.push({
          refFournisseur: ref,
          description,
          quantite,
          prixUnitaireHT: arrondir2(prixUnitaireHT),
          remise: 0,
          montantHT: arrondir2(montantHT),
        });
      });
    });

    if (nouvellesLignes.length === 0) {
      setErreurs(['Aucune ligne valide trouvée dans la saisie manuelle.']);
      return;
    }

    const totalHT = arrondir2(nouvellesLignes.reduce((sum, l) => sum + l.montantHT, 0));
    const tauxTVA = obtenirTauxTVAFacture(factureEditee);
    const totalTVA = arrondir2(totalHT * tauxTVA);
    const totalTTC = arrondir2(totalHT + totalTVA);

    setFactureEditee({
      ...factureEditee,
      lignes: nouvellesLignes,
      totalHT,
      totalTVA,
      totalTTC,
      donneesBrutes: {
        ...(factureEditee.donneesBrutes || {}),
        tauxTVA,
      },
    });
    setModeEdition(true);
    setMessageSucces(`Lignes manuelles appliquées (${nouvellesLignes.length}).`);
    setTimeout(() => setMessageSucces(''), 3000);
  }, [factureEditee, lignesManuelles]);

  const appliquerChampEnFocus = useCallback(() => {
    if (!champEnFocus || !factureEditee) {
      setChampEnFocus(null);
      return;
    }

    const { champ, index, valeur } = champEnFocus;
    const valeurNum = parseFloat(valeur);
    const ligne = factureEditee.lignes[index];

    switch (champ) {
      case 'description':
        handleEditerLigne(index, { description: valeur });
        break;
      case 'refFournisseur':
        handleEditerLigne(index, { refFournisseur: valeur });
        break;
      case 'bat':
        handleEditerLigne(index, { bat: valeur || undefined });
        break;
      case 'logo':
        handleEditerLigne(index, { logo: valeur || undefined });
        break;
      case 'quantite': {
        const quantite = Number.isNaN(valeurNum) ? 0 : valeurNum;
        const montantHT = quantite * ligne.prixUnitaireHT - (ligne.remise || 0);
        handleEditerLigne(index, { quantite, montantHT });
        break;
      }
      case 'prixUnitaireHT': {
        const prixUnitaire = Number.isNaN(valeurNum) ? 0 : valeurNum;
        const montantHT = ligne.quantite * prixUnitaire - (ligne.remise || 0);
        handleEditerLigne(index, { prixUnitaireHT: prixUnitaire, montantHT });
        break;
      }
      case 'remise': {
        const remise = Number.isNaN(valeurNum) ? 0 : valeurNum;
        const montantHT = ligne.quantite * ligne.prixUnitaireHT - remise;
        handleEditerLigne(index, { remise, montantHT });
        break;
      }
      case 'montantHT': {
        const montantHT = Number.isNaN(valeurNum) ? 0 : valeurNum;
        // Recalculer le prix unitaire à partir du montant HT, quantité et remise
        // montantHT = quantite * prixUnitaireHT - remise
        // donc: prixUnitaireHT = (montantHT + remise) / quantite
        const prixUnitaireHT = ligne.quantite > 0 
          ? (montantHT + (ligne.remise || 0)) / ligne.quantite 
          : ligne.prixUnitaireHT;
        handleEditerLigne(index, { montantHT, prixUnitaireHT });
        break;
      }
      default:
        break;
    }

    setChampEnFocus(null);
  }, [champEnFocus, factureEditee, handleEditerLigne]);

  const handleAjouterLigne = useCallback(() => {
    if (!factureEditee) return;
    
    const nouvelleLigne: LigneProduit = {
      description: '',
      quantite: 1,
      prixUnitaireHT: 0,
      remise: 0,
      montantHT: 0,
    };
    
    const nouvellesLignes = [...factureEditee.lignes, nouvelleLigne];
    const totalHT = arrondir2(nouvellesLignes.reduce((sum, l) => sum + l.montantHT, 0));
    const tauxTVA = obtenirTauxTVAFacture(factureEditee);
    const totalTVA = arrondir2(totalHT * tauxTVA);
    const totalTTC = arrondir2(totalHT + totalTVA);
    
    setFactureEditee({
      ...factureEditee,
      lignes: nouvellesLignes,
      totalHT,
      totalTVA,
      totalTTC,
      donneesBrutes: {
        ...(factureEditee.donneesBrutes || {}),
        tauxTVA,
      },
    });
  }, [factureEditee]);

  const handleSupprimerLigne = useCallback((index: number) => {
    if (!factureEditee) return;

    const nouvellesLignes = factureEditee.lignes.filter((_, i) => i !== index);
    const totalHT = arrondir2(nouvellesLignes.reduce((sum, l) => sum + l.montantHT, 0));
    const tauxTVA = obtenirTauxTVAFacture(factureEditee);
    const totalTVA = arrondir2(totalHT * tauxTVA);
    const totalTTC = arrondir2(totalHT + totalTVA);
    
    setFactureEditee({
      ...factureEditee,
      lignes: nouvellesLignes,
      totalHT,
      totalTVA,
      totalTTC,
      donneesBrutes: {
        ...(factureEditee.donneesBrutes || {}),
        tauxTVA,
      },
    });
  }, [factureEditee]);

  const handleAnnulerEdition = useCallback(() => {
    setFactureEditee(factureParsed ? { ...factureParsed } : null);
    setModeEdition(false);
  }, [factureParsed]);

  const handleEnregistrer = useCallback(() => {
    if (!factureEditee) return;
    
    // Mettre à jour factureParsed avec les modifications de factureEditee
    setFactureParsed({ ...factureEditee });
    setModeEdition(false);
  }, [factureEditee]);

  return (
    <div className="editeur-parsing">
      <div className="editeur-parsing__header">
        <h2>Contrôle avant import</h2>
        <p className="editeur-parsing__description">
          Vérifiez, corrigez et validez une facture avant son enregistrement, sans perdre les règles
          de parsing déjà apprises.
        </p>
      </div>

      <div className="editeur-parsing__intro-grid">
        <div className="editeur-parsing__intro-card">
          <strong>Étape 1</strong>
          <span>Choisissez un PDF et le fournisseur pour lancer le parsing.</span>
        </div>
        <div className="editeur-parsing__intro-card">
          <strong>Étape 2</strong>
          <span>Corrigez les lignes, les montants ou les réceptions avant import.</span>
        </div>
        <div className="editeur-parsing__intro-card">
          <strong>Étape 3</strong>
          <span>Importez la facture finale sans perdre les apprentissages précédents.</span>
        </div>
      </div>

      <div className="editeur-parsing__workspace">
        <div className="editeur-parsing__controls">
          <div className="editeur-parsing__file-select">
            <label htmlFor="fichier-parsing" className="editeur-parsing__label">
              <FileText size={20} />
              Fichier PDF
            </label>
            <input
              id="fichier-parsing"
              type="file"
              accept=".pdf"
              onChange={handleFichierChange}
              className="editeur-parsing__input"
            />
            {fichier && (
              <span className="editeur-parsing__filename">{fichier.name}</span>
            )}
          </div>

          <div className="editeur-parsing__fournisseur-select">
            <label htmlFor="fournisseur-parsing" className="editeur-parsing__label">
              Fournisseur
            </label>
            <div className="editeur-parsing__fournisseur-row">
              <select
                id="fournisseur-parsing"
                value={fournisseur}
                onChange={(e) => setFournisseur(e.target.value as Fournisseur)}
                className="editeur-parsing__select"
                disabled={!fichier}
              >
                <option value="">Sélectionner un fournisseur</option>
                {tousLesFournisseurs.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setAfficherAjoutFournisseur(!afficherAjoutFournisseur)}
                className="editeur-parsing__btn-add-fournisseur"
                title="Ajouter un nouveau fournisseur"
              >
                <Plus size={18} />
              </button>
            </div>
            {afficherAjoutFournisseur && (
              <div className="editeur-parsing__inline-panel">
                <div className="editeur-parsing__inline-actions">
                  <input
                    type="text"
                    value={nouveauFournisseur}
                    onChange={(e) => setNouveauFournisseur(e.target.value)}
                    placeholder="Nom du nouveau fournisseur"
                    className="editeur-parsing__input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAjouterFournisseur();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAjouterFournisseur}
                    disabled={!nouveauFournisseur.trim()}
                    className="editeur-parsing__btn-inline-primary"
                  >
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAfficherAjoutFournisseur(false);
                      setNouveauFournisseur('');
                    }}
                    className="editeur-parsing__btn-inline-danger"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleParser}
            disabled={!fichier || !fournisseur || enCours}
            className="editeur-parsing__btn-parser"
          >
            {enCours ? 'Parsing...' : 'Lancer le parsing'}
          </button>
        </div>
      </div>

      {erreurs.length > 0 && (
        <div className="editeur-parsing__alert editeur-parsing__alert--error">
          <AlertCircle size={20} />
          <div>
            <strong>Erreurs :</strong>
            <ul>
              {erreurs.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {avertissements.length > 0 && (
        <div className="editeur-parsing__alert editeur-parsing__alert--warning">
          <AlertCircle size={20} />
          <div>
            <strong>Avertissements :</strong>
            <ul>
              {avertissements.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {messageSucces && (
        <div className="editeur-parsing__alert editeur-parsing__alert--success">
          <strong>{messageSucces}</strong>
        </div>
      )}

      {factureEditee && (
        <div className="editeur-parsing__preview">
          <div className="editeur-parsing__preview-header">
            <div>
              <h3>Fiche de contrôle de la facture</h3>
              <p className="editeur-parsing__preview-subtitle">
                Vérifiez les informations clés, puis passez en édition si une correction est nécessaire.
              </p>
            </div>
            <div className="editeur-parsing__preview-actions">
              {!modeEdition ? (
                <button
                  type="button"
                  onClick={() => setModeEdition(true)}
                  className="editeur-parsing__btn-edit"
                >
                  <Edit2 size={16} />
                  Éditer
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleAnnulerEdition}
                    className="editeur-parsing__btn-cancel"
                  >
                    <RotateCcw size={16} />
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleEnregistrer}
                    className="editeur-parsing__btn-save"
                  >
                    <Save size={16} />
                    Enregistrer
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleImporter}
                className="editeur-parsing__btn-import"
                disabled={modeEdition}
              >
                <Upload size={16} />
                Importer
              </button>
              <button
                type="button"
                onClick={handleExporterCSV}
                className="editeur-parsing__btn-import"
                disabled={!factureEditee}
                title="Exporter la facture (CSV)"
              >
                Exporter Excel (CSV)
              </button>
              {draftInfo.exists && (
                <>
                  <button
                    type="button"
                    onClick={restaurerBrouillon}
                    className="editeur-parsing__btn-cancel"
                    title="Restaurer le brouillon"
                  >
                    Restaurer brouillon
                  </button>
                  <button
                    type="button"
                    onClick={effacerBrouillon}
                    className="editeur-parsing__btn-cancel"
                    title="Effacer le brouillon"
                  >
                    Effacer brouillon
                  </button>
                </>
              )}
              {draftGlobalInfo.exists && (
                <button
                  type="button"
                  onClick={restaurerDernierBrouillonGlobal}
                  className="editeur-parsing__btn-cancel"
                  title="Restaurer le dernier brouillon global"
                >
                  Restaurer dernier brouillon
                </button>
              )}
            </div>
          </div>

          <div className="editeur-parsing__editor-block" style={{ marginTop: '0.75rem' }}>
            <div className="editeur-parsing__info-item" style={{ width: '100%' }}>
              <strong>Ajouter ou remplacer des lignes manuellement</strong>
              <div style={{ marginTop: '0.5rem' }}>
                <textarea
                  value={lignesManuelles}
                  onChange={(e) => setLignesManuelles(e.target.value)}
                  placeholder="Collez ici des lignes au format : REF DESIGNATION QTE MONTANT (ex: LOUNGETXTR16T1C1 FLUTE LOUNGE 16CL TRITAN 500 1 225,00)"
                  rows={8}
                  style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', minHeight: '160px' }}
                />
              </div>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={appliquerLignesManuelles}
                  className="editeur-parsing__btn-save"
                  disabled={!lignesManuelles.trim()}
                >
                  Appliquer les lignes
                </button>
                <button
                  type="button"
                  onClick={() => setLignesManuelles('')}
                  className="editeur-parsing__btn-cancel"
                  disabled={!lignesManuelles.trim()}
                >
                  Effacer
                </button>
              </div>
            </div>
          </div>

          <div className="editeur-parsing__facture-info">
            <div className="editeur-parsing__info-item">
              <strong>Fournisseur :</strong> {factureEditee.fournisseur}
            </div>
            <div className="editeur-parsing__info-item">
              <strong>Numéro :</strong>
              {modeEdition ? (
                <input
                  type="text"
                  value={factureEditee.numero}
                  onChange={(e) => setFactureEditee(prev => prev ? { ...prev, numero: e.target.value } : prev)}
                  className="editeur-parsing__input-info"
                />
              ) : (
                <span>{factureEditee.numero}</span>
              )}
            </div>
            <div className="editeur-parsing__info-item">
              <strong>Date :</strong>
              {modeEdition ? (
                <input
                  type="date"
                  value={valeurDateInput}
                  onChange={(e) => {
                    const nouvelleValeur = e.target.value;
                    setFactureEditee(prev => {
                      if (!prev) return prev;
                      return nouvelleValeur
                        ? { ...prev, date: new Date(nouvelleValeur) }
                        : prev;
                    });
                  }}
                  className="editeur-parsing__input-info"
                />
              ) : (
                <span>{dateAffichee}</span>
              )}
            </div>
            <div className="editeur-parsing__info-item">
              <strong>Total HT :</strong>
              {modeEdition ? (
                <input
                  type="number"
                  step="0.01"
                  value={factureEditee.totalHT.toFixed(2)}
                  onChange={(e) => {
                    const valeur = parseFloat(e.target.value);
                    setFactureEditee(prev => {
                      if (!prev) return prev;
                      const totalHT = Number.isNaN(valeur) ? 0 : arrondir2(valeur);
                      const tauxTVA = obtenirTauxTVAFacture(prev);
                      const totalTVA = arrondir2(totalHT * tauxTVA);
                      return {
                        ...prev,
                        totalHT,
                        totalTVA,
                        totalTTC: arrondir2(totalHT + totalTVA),
                        donneesBrutes: {
                          ...(prev.donneesBrutes || {}),
                          tauxTVA,
                        },
                      };
                    });
                  }}
                  className="editeur-parsing__input-info"
                />
              ) : (
                <span>
                  {factureEditee.totalHT.toLocaleString('fr-FR', {
                    style: 'currency',
                    currency: 'EUR',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
            </div>
            <div className="editeur-parsing__info-item">
              <strong>Remise HT globale :</strong>
              {modeEdition ? (
                <input
                  type="text"
                  value={remiseGlobaleBrute}
                  onChange={(e) => setRemiseGlobaleBrute(e.target.value)}
                  onBlur={(e) => {
                    const valeurTexte = e.target.value.replace(',', '.').trim();
                    const valeur = valeurTexte === '' ? 0 : parseFloat(valeurTexte);
                    setFactureEditee(prev => {
                      if (!prev) return prev;
                      const remise = Number.isNaN(valeur) ? 0 : valeur;
                      const netHT = totalHTBrut - remise;

                      const tauxTVA = obtenirTauxTVAFacture(prev);
                      const totalTVA = Math.round(netHT * tauxTVA * 100) / 100;
                      const totalTTC = netHT + totalTVA;

                      return {
                        ...prev,
                        totalHT: netHT,
                        totalTVA,
                        totalTTC,
                        donneesBrutes: {
                          ...(prev.donneesBrutes || {}),
                          totalHTBrut,
                          remise,
                          netHT,
                          tauxTVA,
                        },
                      };
                    });
                  }}
                  className="editeur-parsing__input-info"
                />
              ) : (
                <span>
                  {remiseGlobale.toLocaleString('fr-FR', {
                    style: 'currency',
                    currency: 'EUR',
                  })}
                </span>
              )}
            </div>
            <div className="editeur-parsing__info-item">
              <strong>Net HT (info) :</strong>
              <span>
                {netHTCalcule.toLocaleString('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                })}
              </span>
            </div>
            <div className="editeur-parsing__info-item">
              <strong>Total TVA :</strong>
              <span>
                {factureEditee.totalTVA.toLocaleString('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
            <div className="editeur-parsing__info-item">
              <strong>Total TTC :</strong>
              {modeEdition ? (
                <input
                  type="number"
                  step="0.01"
                  value={factureEditee.totalTTC.toFixed(2)}
                  onChange={(e) => {
                    const valeur = parseFloat(e.target.value);
                    setFactureEditee(prev => {
                      if (!prev) return prev;
                      const totalTTC = Number.isNaN(valeur) ? 0 : arrondir2(valeur);
                      const totalTVA = Math.max(0, arrondir2(totalTTC - prev.totalHT));
                      return {
                        ...prev,
                        totalTVA,
                        totalTTC,
                      };
                    });
                  }}
                  className="editeur-parsing__input-info"
                />
              ) : (
                <span>
                  {factureEditee.totalTTC.toLocaleString('fr-FR', {
                    style: 'currency',
                    currency: 'EUR',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              )}
            </div>
          </div>

          {historiqueSauvegardes.length > 0 && (
            <div className="editeur-parsing__editor-block" style={{ marginTop: '1rem' }}>
              <div className="editeur-parsing__info-item">
                <strong>Dernières sauvegardes</strong>
              </div>
              <div className="editeur-parsing__info-item">
                {historiqueSauvegardes.map((item) => {
                  const dateFacture = item.dateFacture ? new Date(item.dateFacture) : null;
                  const dateSauvegarde = new Date(item.dateSauvegarde);
                  return (
                    <div key={item.id} style={{ fontSize: '0.9rem', marginTop: '0.25rem' }}>
                      {item.fournisseur} — {item.numero} —{' '}
                      {dateFacture && !Number.isNaN(dateFacture.getTime())
                        ? dateFacture.toLocaleDateString('fr-FR')
                        : 'date inconnue'}{' '}
                      (sauvegardé le {dateSauvegarde.toLocaleDateString('fr-FR')} à{' '}
                      {dateSauvegarde.toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })})
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="editeur-parsing__lignes">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h4>Lignes de produits ({factureEditee.lignes.length})</h4>
              {modeEdition && (
                <button
                  type="button"
                  onClick={handleAjouterLigne}
                  className="editeur-parsing__btn-add"
                  title="Ajouter une ligne"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  <Plus size={16} />
                  Ajouter une ligne
                </button>
              )}
            </div>
            <table className="editeur-parsing__table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Description</th>
                  <th>BAT</th>
                  <th>Logo</th>
                  <th>Qté</th>
                  <th>PU HT</th>
                  <th>Remise</th>
                  <th>Montant HT</th>
                  {modeEdition && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {factureEditee.lignes.map((ligne, index) => (
                  <tr key={index}>
                    {modeEdition ? (
                      <>
                        <td>
                          <input
                            type="text"
                            value={ligne.refFournisseur || ''}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChampEnFocus({ index, champ: 'refFournisseur', valeur: ligne.refFournisseur || '' });
                            }}
                            readOnly
                            className="editeur-parsing__input-cell"
                            style={{
                              width: '100%',
                              minWidth: '140px',
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                            <input
                              type="text"
                              value={ligne.description}
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('[EDITEUR] Clic sur description, ouverture modal', { index, description: ligne.description });
                                setChampEnFocus({ index, champ: 'description', valeur: ligne.description });
                              }}
                              readOnly
                              className="editeur-parsing__input-cell"
                              style={{
                                width: '100%',
                                minWidth: '360px',
                                cursor: 'pointer',
                                backgroundColor: '#f8f9fa',
                              }}
                              title={`Cliquez pour éditer (${ligne.description.length} caractères)`}
                            />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={ligne.bat || ''}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChampEnFocus({ index, champ: 'bat', valeur: ligne.bat || '' });
                            }}
                            readOnly
                            className="editeur-parsing__input-cell"
                            style={{
                              width: '100%',
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={ligne.logo || ''}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChampEnFocus({ index, champ: 'logo', valeur: ligne.logo || '' });
                            }}
                            readOnly
                            className="editeur-parsing__input-cell"
                            style={{
                              width: '100%',
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={ligne.quantite}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChampEnFocus({ index, champ: 'quantite', valeur: ligne.quantite.toString() });
                            }}
                            readOnly
                            className="editeur-parsing__input-cell"
                            style={{
                              width: '100%',
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={ligne.prixUnitaireHT}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChampEnFocus({ index, champ: 'prixUnitaireHT', valeur: ligne.prixUnitaireHT.toString() });
                            }}
                            readOnly
                            className="editeur-parsing__input-cell"
                            style={{
                              width: '100%',
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={ligne.remise || 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChampEnFocus({ index, champ: 'remise', valeur: (ligne.remise || 0).toString() });
                            }}
                            readOnly
                            className="editeur-parsing__input-cell"
                            style={{
                              width: '100%',
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            value={ligne.montantHT}
                            onClick={(e) => {
                              e.stopPropagation();
                              setChampEnFocus({ index, champ: 'montantHT', valeur: ligne.montantHT.toString() });
                            }}
                            readOnly
                            className="editeur-parsing__input-cell"
                            style={{
                              width: '100%',
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            onClick={() => handleSupprimerLigne(index)}
                            className="editeur-parsing__btn-delete"
                            title="Supprimer cette ligne"
                          >
                            <X size={16} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{ligne.refFournisseur || '-'}</td>
                        <td>{ligne.description}</td>
                        <td>{ligne.bat || '-'}</td>
                        <td>{ligne.logo || '-'}</td>
                        <td>{ligne.quantite}</td>
                        <td>{ligne.prixUnitaireHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                        <td>{(ligne.remise || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                        <td>{ligne.montantHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {texteBrut && (
        <div className="editeur-parsing__texte-brut">
          <h3>Texte brut extrait</h3>
          <details>
            <summary>Voir le texte brut ({texteBrut.length} caractères)</summary>
            <pre className="editeur-parsing__texte-content">{texteBrut}</pre>
          </details>
        </div>
      )}

      {/* Modal pour éditer les champs longs */}
      {champEnFocus && factureEditee && (
        <div 
          className="editeur-parsing__modal-overlay"
          onClick={appliquerChampEnFocus}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="editeur-parsing__modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              padding: '2rem',
              borderRadius: '8px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0' }}>
              Éditer {champEnFocus.champ === 'description' ? 'Description' : 
                      champEnFocus.champ === 'refFournisseur' ? 'Référence' :
                      champEnFocus.champ === 'bat' ? 'BAT' :
                      champEnFocus.champ === 'logo' ? 'Logo' :
                      champEnFocus.champ === 'quantite' ? 'Quantité' :
                      champEnFocus.champ === 'prixUnitaireHT' ? 'Prix unitaire HT' :
                      champEnFocus.champ === 'remise' ? 'Remise' :
                      champEnFocus.champ === 'montantHT' ? 'Montant HT' : champEnFocus.champ}
            </h3>
            {champEnFocus.champ === 'description' ? (
              <textarea
                value={champEnFocus.valeur}
                onChange={(e) => setChampEnFocus({ ...champEnFocus, valeur: e.target.value })}
                autoFocus
                style={{
                  width: '100%',
                  minHeight: '300px',
                  padding: '1rem',
                  border: '2px solid #3b82f6',
                  borderRadius: '6px',
                  fontSize: '1rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  flex: 1,
                }}
              />
            ) : (champEnFocus.champ === 'quantite' || champEnFocus.champ === 'prixUnitaireHT' || champEnFocus.champ === 'remise' || champEnFocus.champ === 'montantHT') ? (
              <input
                type="number"
                step={champEnFocus.champ === 'quantite' ? '1' : '0.01'}
                value={champEnFocus.valeur}
                onChange={(e) => setChampEnFocus({ ...champEnFocus, valeur: e.target.value })}
                autoFocus
                style={{
                  width: '100%',
                  padding: '1rem',
                  border: '2px solid #3b82f6',
                  borderRadius: '6px',
                  fontSize: '1rem',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    appliquerChampEnFocus();
                  }
                  if (e.key === 'Escape') {
                    setChampEnFocus(null);
                  }
                }}
              />
            ) : (
              <input
                type="text"
                value={champEnFocus.valeur}
                onChange={(e) => setChampEnFocus({ ...champEnFocus, valeur: e.target.value })}
                autoFocus
                style={{
                  width: '100%',
                  padding: '1rem',
                  border: '2px solid #3b82f6',
                  borderRadius: '6px',
                  fontSize: '1rem',
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    appliquerChampEnFocus();
                  }
                  if (e.key === 'Escape') {
                    setChampEnFocus(null);
                  }
                }}
              />
            )}
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={appliquerChampEnFocus}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500',
                }}
              >
                Enregistrer
              </button>
              <button
                type="button"
                onClick={() => setChampEnFocus(null)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: '500',
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

