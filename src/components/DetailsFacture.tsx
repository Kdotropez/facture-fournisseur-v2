/**
 * Composant d'affichage des détails d'une facture
 */

import { useState, useEffect } from 'react';
import { X, FileText, Calendar, Building2, Hash, AlertTriangle, CheckCircle, Edit, Plus, Trash2, Printer } from 'lucide-react';
import type { Facture, LigneProduit } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import './DetailsFacture.css';

interface DetailsFactureProps {
  facture: Facture | null;
  onClose: () => void;
  onUpdate?: (facture: Facture) => void;
  onDelete?: (factureId: string) => void;
}

export function DetailsFacture({ facture, onClose, onUpdate, onDelete }: DetailsFactureProps) {
  const [editionMode, setEditionMode] = useState(false);
  if (!facture) {
    return (
      <div className="details-facture details-facture--empty">
        <FileText size={64} />
        <p>Sélectionnez une facture pour voir les détails</p>
      </div>
    );
  }

  const formaterDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const totalHTLignes = facture.lignes.reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0);

  // Prendre en compte une éventuelle remise globale pour le contrôle
  const remiseGlobaleFacture =
    facture.donneesBrutes && typeof facture.donneesBrutes.remise === 'number'
      ? facture.donneesBrutes.remise
      : 0;

  const netHTAttendu = totalHTLignes - remiseGlobaleFacture;
  const ecartHT = netHTAttendu - facture.totalHT;

  const totalTTCAttendu = facture.totalHT + facture.totalTVA;
  const ecartTTC = totalTTCAttendu - facture.totalTTC;
  const tolerance = 0.05;

  const ecartHTSignificatif = Math.abs(ecartHT) > tolerance;
  const ecartTTCSignificatif = Math.abs(ecartTTC) > tolerance;

  const verificationOK = !ecartHTSignificatif && !ecartTTCSignificatif;

  return (
    <div className="details-facture">
      <div className="details-facture__header">
        <div>
          <h2>Détails de la facture</h2>
          <div className="details-facture__meta">
            <span className="details-facture__badge">{facture.fournisseur}</span>
            <span className="details-facture__numero">{facture.numero}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => window.print()}
            className="details-facture__print-btn"
            aria-label="Imprimer la facture"
            title="Imprimer la facture"
          >
            <Printer size={18} />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (!facture) return;
                const confirmer = window.confirm(
                  'Êtes-vous sûr de vouloir supprimer cette facture ?\n\n' +
                  'Cette action est définitive et tous les règlements associés à cette facture seront également supprimés.'
                );
                if (confirmer) {
                  onDelete(facture.id);
                }
              }}
              className="details-facture__delete-btn"
              aria-label="Supprimer la facture"
              title="Supprimer la facture (et ses règlements)"
            >
              <Trash2 size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditionMode(true)}
            className="details-facture__edit-btn"
            aria-label="Éditer"
            title="Éditer la facture"
          >
            <Edit size={20} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="details-facture__close-btn"
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="details-facture__content">
        <div className={`details-facture__alert ${verificationOK ? 'details-facture__alert--success' : 'details-facture__alert--warning'}`}>
          {verificationOK ? (
            <>
              <CheckCircle size={18} />
              <div>
                <strong>Contrôle réussi.</strong> La somme des lignes ({formaterMontant(totalHTLignes)}) correspond aux totaux indiqués.
              </div>
            </>
          ) : (
            <>
              <AlertTriangle size={18} />
              <div>
                <strong>Anomalie détectée.</strong> Vérifiez la facture :
                <ul>
                  {ecartHTSignificatif && (
                    <li>
                      Somme des lignes HT {formaterMontant(totalHTLignes)}
                      {remiseGlobaleFacture
                        ? ` - Remise globale ${formaterMontant(remiseGlobaleFacture)} = Net HT attendu ${formaterMontant(
                            netHTAttendu
                          )}`
                        : ''}{' '}
                      vs Total HT déclaré {formaterMontant(facture.totalHT)} (écart {formaterMontant(ecartHT)}).
                    </li>
                  )}
                  {ecartTTCSignificatif && (
                    <li>
                      Total HT + TVA {formaterMontant(totalTTCAttendu)} vs Total TTC déclaré {formaterMontant(facture.totalTTC)} (écart {formaterMontant(ecartTTC)}).
                    </li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">Informations générales</h3>
          <div className="details-facture__info-grid">
            <div className="details-facture__info-item">
              <Building2 size={18} />
              <div>
                <span className="details-facture__info-label">Fournisseur</span>
                <span className="details-facture__info-value">{facture.fournisseur}</span>
              </div>
            </div>
            <div className="details-facture__info-item">
              <Hash size={18} />
              <div>
                <span className="details-facture__info-label">Numéro</span>
                <span className="details-facture__info-value">{facture.numero}</span>
              </div>
            </div>
            <div className="details-facture__info-item">
              <Calendar size={18} />
              <div>
                <span className="details-facture__info-label">Date facture</span>
                <span className="details-facture__info-value">{formaterDate(facture.date)}</span>
              </div>
            </div>
            {facture.dateLivraison && (
              <div className="details-facture__info-item">
                <Calendar size={18} />
                <div>
                  <span className="details-facture__info-label">Date livraison</span>
                  <span className="details-facture__info-value">{formaterDate(facture.dateLivraison)}</span>
                </div>
              </div>
            )}
            {facture.fichierPDF && (
              <div className="details-facture__info-item details-facture__info-item--file">
                <FileText size={18} />
                <div>
                  <span className="details-facture__info-label">Fichier PDF</span>
                  <span className="details-facture__info-value details-facture__info-value--file">
                    {facture.fichierPDF.split(/[/\\]/).pop()}
                  </span>
                  {facture.pdfOriginal && (
                    <div className="details-facture__pdf-actions">
                      <a
                        href={facture.pdfOriginal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="details-facture__pdf-link"
                      >
                        Consulter
                      </a>
                      <a
                        href={facture.pdfOriginal}
                        download={facture.fichierPDF}
                        className="details-facture__pdf-link"
                      >
                        Télécharger
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">
            Lignes de produits ({facture.lignes.length})
          </h3>
          <div className="details-facture__table-container">
            <table className="details-facture__table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Description</th>
                  <th>BAT</th>
                  <th>Logo</th>
                  <th>Couleur</th>
                  <th>Quantité</th>
                  <th>Prix unitaire HT</th>
                  <th>Remise</th>
                  <th>Montant HT</th>
                </tr>
              </thead>
              <tbody>
                {facture.lignes.map((ligne, index) => (
                  <tr key={index}>
                    <td className="details-facture__cell-ref">{ligne.refFournisseur || '-'}</td>
                    <td className="details-facture__cell-description">{ligne.description}</td>
                    <td className="details-facture__cell-bat">{ligne.bat || '-'}</td>
                    <td className="details-facture__cell-logo">{ligne.logo || '-'}</td>
                    <td className="details-facture__cell-color">{ligne.couleur || '-'}</td>
                    <td className="details-facture__cell-number">{ligne.quantite}</td>
                    <td className="details-facture__cell-amount">{formaterMontant(ligne.prixUnitaireHT)}</td>
                    <td className="details-facture__cell-amount">{formaterMontant(ligne.remise)}</td>
                    <td className="details-facture__cell-amount details-facture__cell-amount--bold">
                      {formaterMontant(ligne.montantHT)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">Totaux</h3>
          <div className="details-facture__totaux">
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Total HT</span>
              <span className="details-facture__total-value">{formaterMontant(facture.totalHT)}</span>
            </div>
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Total TVA</span>
              <span className="details-facture__total-value">{formaterMontant(facture.totalTVA)}</span>
            </div>
            <div className="details-facture__total-item details-facture__total-item--final">
              <span className="details-facture__total-label">Total TTC</span>
              <span className="details-facture__total-value details-facture__total-value--final">
                {formaterMontant(facture.totalTTC)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal d'édition */}
      {editionMode && facture && (
        <ModalEditionFacture
          facture={facture}
          onSauvegarder={(factureModifiee) => {
            onUpdate?.(factureModifiee);
            setEditionMode(false);
          }}
          onFermer={() => setEditionMode(false)}
        />
      )}
    </div>
  );
}

// Composant Modal pour éditer une facture
interface ModalEditionFactureProps {
  facture: Facture;
  onSauvegarder: (facture: Facture) => void;
  onFermer: () => void;
}

const TAUX_TVA_PAR_DEFAUT = 0.20;

function ModalEditionFacture({ facture, onSauvegarder, onFermer }: ModalEditionFactureProps) {
  const [factureModifiee, setFactureModifiee] = useState<Facture>({ ...facture });
  const tousLesFournisseurs = obtenirFournisseurs();

  // Gestion d'une remise HT globale (en fin de facture) via les données brutes
  const totalHTBrut =
    (factureModifiee.donneesBrutes && typeof factureModifiee.donneesBrutes.totalHTBrut === 'number'
      ? factureModifiee.donneesBrutes.totalHTBrut
      : factureModifiee.totalHT) ?? 0;
  const remiseGlobale =
    (factureModifiee.donneesBrutes && typeof factureModifiee.donneesBrutes.remise === 'number'
      ? factureModifiee.donneesBrutes.remise
      : 0);
  const netHTCalcule = Math.max(0, totalHTBrut - remiseGlobale);

  // Saisie brute de la remise globale pour un comportement naturel au clavier
  const [remiseGlobaleBrute, setRemiseGlobaleBrute] = useState<string>('');
  const [tauxTVABrute, setTauxTVABrute] = useState<string>('');

  // Synchroniser les champs texte avec les valeurs numériques
  useEffect(() => {
    if (remiseGlobale && !Number.isNaN(remiseGlobale)) {
      setRemiseGlobaleBrute(remiseGlobale.toFixed(2));
    } else {
      setRemiseGlobaleBrute('');
    }
  }, [remiseGlobale]);

  useEffect(() => {
    // Déterminer le taux de TVA courant (s'il existe), sinon le calculer à partir des totaux
    const taux =
      factureModifiee.donneesBrutes && typeof factureModifiee.donneesBrutes.tauxTVA === 'number'
        ? factureModifiee.donneesBrutes.tauxTVA
        : factureModifiee.totalHT > 0
        ? factureModifiee.totalTVA / factureModifiee.totalHT
        : TAUX_TVA_PAR_DEFAUT;

    setTauxTVABrute(((taux || 0) * 100).toFixed(2));
  }, [factureModifiee.totalHT, factureModifiee.totalTVA, factureModifiee.donneesBrutes?.tauxTVA]);

  // Fonction utilitaire : recalcule HT / TVA / TTC à partir des lignes et de la remise globale
  const recalculerTotaux = (factureCourante: Facture): Facture => {
    const totalHTLignes = factureCourante.lignes.reduce(
      (sum, ligne) => sum + ligne.montantHT,
      0
    );
    const remise =
      factureCourante.donneesBrutes && typeof factureCourante.donneesBrutes.remise === 'number'
        ? factureCourante.donneesBrutes.remise
        : 0;
    const totalHT = Math.max(0, totalHTLignes - remise);

    const tauxTVA =
      factureCourante.donneesBrutes && typeof factureCourante.donneesBrutes.tauxTVA === 'number'
        ? factureCourante.donneesBrutes.tauxTVA
        : TAUX_TVA_PAR_DEFAUT;

    const totalTVA = Math.round(totalHT * tauxTVA * 100) / 100;
    const totalTTC = totalHT + totalTVA;

    return {
      ...factureCourante,
      totalHT,
      totalTVA,
      totalTTC,
      donneesBrutes: {
        ...(factureCourante.donneesBrutes || {}),
        totalHTBrut: totalHTLignes,
        remise,
        netHT: totalHT,
        tauxTVA,
      },
    };
  };

  const handleChange = (field: keyof Facture, value: unknown) => {
    setFactureModifiee(prev => recalculerTotaux({ ...prev, [field]: value }));
  };

  const handleChangeLigne = (index: number, field: keyof LigneProduit, value: unknown) => {
    setFactureModifiee(prev => {
      const nouvellesLignes = [...prev.lignes];
      nouvellesLignes[index] = { ...nouvellesLignes[index], [field]: value };
      
      // Recalculer le montant HT de la ligne
      if (field === 'quantite' || field === 'prixUnitaireHT' || field === 'remise') {
        const ligne = nouvellesLignes[index];
        const montantHT = (ligne.quantite * ligne.prixUnitaireHT) - ligne.remise;
        nouvellesLignes[index] = { ...ligne, montantHT: Math.max(0, montantHT) };
      }

      return recalculerTotaux({ ...prev, lignes: nouvellesLignes });
    });
  };

  const handleAjouterLigne = () => {
    setFactureModifiee(prev => recalculerTotaux({
      ...prev,
      lignes: [
        ...prev.lignes,
        {
          description: '',
          quantite: 1,
          prixUnitaireHT: 0,
          remise: 0,
          montantHT: 0,
        },
      ],
    }));
  };

  const handleSupprimerLigne = (index: number) => {
    setFactureModifiee(prev => recalculerTotaux({
      ...prev,
      lignes: prev.lignes.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const factureFinale = recalculerTotaux(factureModifiee);
    onSauvegarder(factureFinale);
  };

  const formaterDate = (date: Date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().split('T')[0];
  };

  return (
    <div className="details-facture__modal-overlay" onClick={onFermer}>
      <div className="details-facture__modal" onClick={(e) => e.stopPropagation()}>
        <div className="details-facture__modal-header">
          <h2>Éditer la facture {facture.numero}</h2>
          <button
            type="button"
            onClick={onFermer}
            className="details-facture__modal-close"
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="details-facture__modal-form">
          {/* Informations générales */}
          <div className="details-facture__modal-section">
            <h3>Informations générales</h3>
            <div className="details-facture__modal-grid">
              <div className="details-facture__modal-field">
                <label>Fournisseur *</label>
                <select
                  value={factureModifiee.fournisseur}
                  onChange={(e) => handleChange('fournisseur', e.target.value)}
                  required
                >
                  {tousLesFournisseurs.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="details-facture__modal-field">
                <label>Numéro *</label>
                <input
                  type="text"
                  value={factureModifiee.numero}
                  onChange={(e) => handleChange('numero', e.target.value)}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date facture *</label>
                <input
                  type="date"
                  value={formaterDate(factureModifiee.date)}
                  onChange={(e) => handleChange('date', new Date(e.target.value))}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date livraison</label>
                <input
                  type="date"
                  value={factureModifiee.dateLivraison ? formaterDate(factureModifiee.dateLivraison) : ''}
                  onChange={(e) => handleChange('dateLivraison', e.target.value ? new Date(e.target.value) : undefined)}
                />
              </div>
            </div>
          </div>

          {/* Lignes de produits */}
          <div className="details-facture__modal-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Lignes de produits</h3>
              <button
                type="button"
                onClick={handleAjouterLigne}
                className="details-facture__btn-add"
              >
                <Plus size={16} />
                Ajouter une ligne
              </button>
            </div>
            <div className="details-facture__modal-lignes">
              {factureModifiee.lignes.map((ligne, index) => (
                <div key={index} className="details-facture__modal-ligne">
                  <div className="details-facture__modal-ligne-header">
                    <strong>Ligne {index + 1}</strong>
                    <button
                      type="button"
                      onClick={() => handleSupprimerLigne(index)}
                      className="details-facture__btn-delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="details-facture__modal-ligne-grid">
                    <div className="details-facture__modal-field">
                      <label>Référence fournisseur</label>
                      <input
                        type="text"
                        value={ligne.refFournisseur || ''}
                        onChange={(e) => handleChangeLigne(index, 'refFournisseur', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field details-facture__modal-field--large">
                      <label>Description *</label>
                      <input
                        type="text"
                        value={ligne.description}
                        onChange={(e) => handleChangeLigne(index, 'description', e.target.value)}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>BAT</label>
                      <input
                        type="text"
                        value={ligne.bat || ''}
                        onChange={(e) => handleChangeLigne(index, 'bat', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Logo</label>
                      <input
                        type="text"
                        value={ligne.logo || ''}
                        onChange={(e) => handleChangeLigne(index, 'logo', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Couleur</label>
                      <input
                        type="text"
                        value={ligne.couleur || ''}
                        onChange={(e) => handleChangeLigne(index, 'couleur', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Quantité *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.quantite}
                        onChange={(e) => handleChangeLigne(index, 'quantite', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Prix unitaire HT *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.prixUnitaireHT}
                        onChange={(e) => handleChangeLigne(index, 'prixUnitaireHT', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Remise</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.remise}
                        onChange={(e) => handleChangeLigne(index, 'remise', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Montant HT</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.montantHT.toFixed(2)}
                        onChange={(e) => handleChangeLigne(index, 'montantHT', parseFloat(e.target.value) || 0)}
                        readOnly
                        style={{ backgroundColor: '#f3f4f6' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totaux */}
          <div className="details-facture__modal-section">
            <h3>Totaux</h3>
            <div className="details-facture__modal-grid">
              <div className="details-facture__modal-field">
                <label>Taux de TVA (%)</label>
                <input
                  type="text"
                  value={tauxTVABrute}
                  onChange={(e) => setTauxTVABrute(e.target.value)}
                  onBlur={(e) => {
                    const valeurTexte = e.target.value.replace(',', '.').trim();
                    const valeur = valeurTexte === '' ? 0 : parseFloat(valeurTexte);
                    const taux = Number.isNaN(valeur) ? TAUX_TVA_PAR_DEFAUT : Math.max(0, valeur) / 100;
                    setFactureModifiee(prev =>
                      recalculerTotaux({
                        ...prev,
                        donneesBrutes: {
                          ...(prev.donneesBrutes || {}),
                          tauxTVA: taux,
                        },
                      })
                    );
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Remise HT globale (fin de facture)</label>
                <input
                  type="text"
                  value={remiseGlobaleBrute}
                  onChange={(e) => setRemiseGlobaleBrute(e.target.value)}
                  onBlur={(e) => {
                    const valeurTexte = e.target.value.replace(',', '.').trim();
                    const valeur = valeurTexte === '' ? 0 : parseFloat(valeurTexte);
                    const nouvelleRemise = Number.isNaN(valeur) ? 0 : valeur;
                    setFactureModifiee(prev =>
                      recalculerTotaux({
                        ...prev,
                        donneesBrutes: {
                          ...(prev.donneesBrutes || {}),
                          totalHTBrut: totalHTBrut || prev.totalHT,
                          remise: nouvelleRemise,
                        },
                      })
                    );
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Net HT (après remise globale)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={netHTCalcule.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total HT</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={factureModifiee.totalHT.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total TVA</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={factureModifiee.totalTVA.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total TTC *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={factureModifiee.totalTTC.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
            </div>
          </div>

          <div className="details-facture__modal-footer">
            <button
              type="button"
              onClick={onFermer}
              className="details-facture__modal-btn details-facture__modal-btn--secondary"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="details-facture__modal-btn details-facture__modal-btn--primary"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


