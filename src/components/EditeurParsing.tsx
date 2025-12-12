/**
 * Composant d'édition et de prévisualisation du parsing
 * Permet de tester le parsing d'un document avant l'import
 */

import { useState, useCallback, useEffect } from 'react';
import { FileText, Upload, X, Edit2, Save, RotateCcw, AlertCircle, Plus } from 'lucide-react';
import { parserFacture } from '@parsers/index';
import { extraireTextePDF } from '../utils/pdfParser';
import type { Facture, LigneProduit } from '../types/facture';
import type { Fournisseur } from '../types/facture';
import { extraireReglesDepuisFacture, memoriserModeleParsing, apprendreCorrections } from '../services/parsingRulesService';
import { detecterFournisseurDepuisContenu } from '../hooks/useImportPDF';
import { obtenirTousLesFournisseurs, ajouterFournisseurPersonnalise } from '../services/fournisseursService';
import './EditeurParsing.css';

const TAUX_TVA_PAR_DEFAUT = 0.20;

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
    const totalHT = nouvellesLignes.reduce((sum, l) => sum + l.montantHT, 0);

    // Utiliser le taux de TVA issu des données brutes si présent, sinon 20 %
    const tauxTVA =
      factureEditee.donneesBrutes && typeof factureEditee.donneesBrutes.tauxTVA === 'number'
        ? factureEditee.donneesBrutes.tauxTVA
        : TAUX_TVA_PAR_DEFAUT;
    const totalTVA = Math.round(totalHT * tauxTVA * 100) / 100;
    const totalTTC = totalHT + totalTVA;
    
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
    const totalHT = nouvellesLignes.reduce((sum, l) => sum + l.montantHT, 0);
    const tauxTVA =
      factureEditee.donneesBrutes && typeof factureEditee.donneesBrutes.tauxTVA === 'number'
        ? factureEditee.donneesBrutes.tauxTVA
        : TAUX_TVA_PAR_DEFAUT;
    const totalTVA = Math.round(totalHT * tauxTVA * 100) / 100;
    const totalTTC = totalHT + totalTVA;
    
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
    const totalHT = nouvellesLignes.reduce((sum, l) => sum + l.montantHT, 0);
    const tauxTVA =
      factureEditee.donneesBrutes && typeof factureEditee.donneesBrutes.tauxTVA === 'number'
        ? factureEditee.donneesBrutes.tauxTVA
        : TAUX_TVA_PAR_DEFAUT;
    const totalTVA = Math.round(totalHT * tauxTVA * 100) / 100;
    const totalTTC = totalHT + totalTVA;
    
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
        <h2>Éditeur de parsing</h2>
        <p className="editeur-parsing__description">
          Testez et ajustez le parsing d'un document avant l'import
        </p>
      </div>

      <div className="editeur-parsing__controls">
        <div className="editeur-parsing__file-select">
          <label htmlFor="fichier-parsing" className="editeur-parsing__label">
            <FileText size={20} />
            Sélectionner un fichier PDF
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
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <select
              id="fournisseur-parsing"
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value as Fournisseur)}
              className="editeur-parsing__select"
              disabled={!fichier}
              style={{ flex: 1 }}
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
              style={{
                padding: '0.5rem',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                background: 'white',
                color: '#3b82f6',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={18} />
            </button>
          </div>
          {afficherAjoutFournisseur && (
            <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: '#f3f4f6', borderRadius: '6px' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={nouveauFournisseur}
                  onChange={(e) => setNouveauFournisseur(e.target.value)}
                  placeholder="Nom du nouveau fournisseur"
                  className="editeur-parsing__input"
                  style={{ flex: 1 }}
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
                  style={{
                    padding: '0.5rem 1rem',
                    border: 'none',
                    borderRadius: '6px',
                    background: '#3b82f6',
                    color: 'white',
                    cursor: nouveauFournisseur.trim() ? 'pointer' : 'not-allowed',
                    opacity: nouveauFournisseur.trim() ? 1 : 0.5,
                  }}
                >
                  Ajouter
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAfficherAjoutFournisseur(false);
                    setNouveauFournisseur('');
                  }}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #dc3545',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#dc3545',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
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
          {enCours ? 'Parsing...' : 'Parser le document'}
        </button>
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
            <h3>Prévisualisation de la facture</h3>
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
                  value={factureEditee.totalHT}
                  onChange={(e) => {
                    const valeur = parseFloat(e.target.value);
                    setFactureEditee(prev => {
                      if (!prev) return prev;
                      const totalHT = Number.isNaN(valeur) ? 0 : valeur;
                      return {
                        ...prev,
                        totalHT,
                        totalTTC: totalHT + prev.totalTVA,
                      };
                    });
                  }}
                  className="editeur-parsing__input-info"
                />
              ) : (
                <span>{factureEditee.totalHT.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
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

                      // Recalculer la TVA à partir du rapport TVA/HT initial
                      const baseHT = prev.donneesBrutes && typeof prev.donneesBrutes.totalHTBrut === 'number'
                        ? prev.donneesBrutes.totalHTBrut
                        : prev.totalHT;
                      const baseTVA = prev.totalTVA;
                      const ratioTVA = baseHT > 0 ? baseTVA / baseHT : 0;
                      const totalTVA = Math.round(netHT * ratioTVA * 100) / 100;
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
              <strong>Total TTC :</strong>
              {modeEdition ? (
                <input
                  type="number"
                  step="0.01"
                  value={factureEditee.totalTTC}
                  onChange={(e) => {
                    const valeur = parseFloat(e.target.value);
                    setFactureEditee(prev => {
                      if (!prev) return prev;
                      const totalTTC = Number.isNaN(valeur) ? 0 : valeur;
                      const totalTVA = Math.max(0, totalTTC - prev.totalHT);
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
                  })}
                </span>
              )}
            </div>
          </div>

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
                              cursor: 'pointer',
                              backgroundColor: '#f8f9fa',
                            }}
                            title="Cliquez pour éditer"
                          />
                        </td>
                        <td>
                            <input
                              type="text"
                              value={ligne.description.length > 50 ? ligne.description.substring(0, 50) + '...' : ligne.description}
                              onClick={(e) => {
                                e.stopPropagation();
                                console.log('[EDITEUR] Clic sur description, ouverture modal', { index, description: ligne.description });
                                setChampEnFocus({ index, champ: 'description', valeur: ligne.description });
                              }}
                              readOnly
                              className="editeur-parsing__input-cell"
                              style={{
                                width: '100%',
                                cursor: 'pointer',
                                backgroundColor: '#f8f9fa',
                              }}
                              title={`Cliquez pour éditer le contenu complet (${ligne.description.length} caractères)`}
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

