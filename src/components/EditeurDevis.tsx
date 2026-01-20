/**
 * Modal de création / édition d'un devis à la main
 */

import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Devis } from '../types/devis';
import type { LigneProduit, Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import './DetailsFacture.css';

interface EditeurDevisProps {
  devisInitial?: Devis;
  onSauvegarder: (devis: Devis) => void;
  onFermer: () => void;
}

export function EditeurDevis({ devisInitial, onSauvegarder, onFermer }: EditeurDevisProps) {
  const tousLesFournisseurs = obtenirFournisseurs();

  const creerDevisInitial = (): Devis => ({
    id: `devis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fournisseur: tousLesFournisseurs[0] as Fournisseur,
    numero: '',
    date: new Date(),
    lignes: [],
    totalHT: 0,
    totalTVA: 0,
    totalTTC: 0,
    acompteDemandeTTC: 0,
    dateImport: new Date(),
    statut: 'en_attente',
    facturesLieesIds: [],
  });

  const [devis, setDevis] = useState<Devis>(() => devisInitial ?? creerDevisInitial());
  const [totalTVAInput, setTotalTVAInput] = useState(() =>
    typeof (devisInitial?.totalTVA) === 'number' ? String(devisInitial.totalTVA) : '0'
  );
  const [totalTTCInput, setTotalTTCInput] = useState(() =>
    typeof (devisInitial?.totalTTC) === 'number' ? String(devisInitial.totalTTC) : '0'
  );
  const [acompteDemandeTTCInput, setAcompteDemandeTTCInput] = useState(() =>
    typeof (devisInitial?.acompteDemandeTTC) === 'number'
      ? String(devisInitial.acompteDemandeTTC)
      : '0'
  );

  // Si on reçoit un devis existant à éditer, on le charge dans l'état local
  useEffect(() => {
    if (devisInitial) {
      setDevis(devisInitial);
      setTotalTVAInput(
        typeof devisInitial.totalTVA === 'number' ? String(devisInitial.totalTVA) : '0'
      );
      setTotalTTCInput(
        typeof devisInitial.totalTTC === 'number' ? String(devisInitial.totalTTC) : '0'
      );
      setAcompteDemandeTTCInput(
        typeof devisInitial.acompteDemandeTTC === 'number'
          ? String(devisInitial.acompteDemandeTTC)
          : '0'
      );
    }
  }, [devisInitial]);

  const handleChange = (field: keyof Devis, value: unknown) => {
    setDevis(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    const totalHT = devis.lignes.reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0);
    const totalTVA = typeof devis.totalTVA === 'number' ? devis.totalTVA : 0;
    const totalTTC = totalHT + totalTVA;

    if (totalHT !== devis.totalHT || totalTTC !== devis.totalTTC) {
      setDevis(prev => ({ ...prev, totalHT, totalTTC }));
    }

    setTotalTTCInput(String(totalTTC));
  }, [devis.lignes, devis.totalTVA, devis.totalHT, devis.totalTTC]);

  const handleChangeLigne = (index: number, field: keyof LigneProduit, value: unknown) => {
    setDevis(prev => {
      const nouvellesLignes = [...prev.lignes];
      nouvellesLignes[index] = { ...nouvellesLignes[index], [field]: value };

      // Recalculer le montant HT de la ligne
      if (field === 'quantite' || field === 'prixUnitaireHT' || field === 'remise') {
        const ligne = nouvellesLignes[index];
        const montantHT = (ligne.quantite * ligne.prixUnitaireHT) - (ligne.remise || 0);
        nouvellesLignes[index] = { ...ligne, montantHT: Math.max(0, montantHT) };
      }

      return { ...prev, lignes: nouvellesLignes };
    });
  };

  const handleAjouterLigne = () => {
    setDevis(prev => ({
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
    setDevis(prev => ({
      ...prev,
      lignes: prev.lignes.filter((_, i) => i !== index),
    }));
  };

  const formaterDate = (date: Date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().split('T')[0];
  };

  const normaliserMontant = (valeur: string): number | null => {
    const nettoyee = valeur.replace(/\s/g, '').replace(',', '.');
    if (nettoyee === '') return null;
    const parsed = Number.parseFloat(nettoyee);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const totalTVAParse = normaliserMontant(totalTVAInput);
    const totalTTCParse = normaliserMontant(totalTTCInput);
    const acompteDemandeParse = normaliserMontant(acompteDemandeTTCInput);
    const totalTVAFinal = totalTVAParse ?? 0;
    const totalTTCFinal = totalTTCParse ?? 0;
    const acompteDemandeFinal = acompteDemandeParse ?? 0;

    // Recalculer les totaux à partir des lignes
    const totalHT = devis.lignes.reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0);
    const totalTVA = totalTVAFinal; // tu pourras ajuster la TVA manuellement si besoin
    const totalTTC = totalTTCFinal || (totalHT + totalTVA);

    const devisFinal: Devis = {
      ...devis,
      totalHT,
      totalTVA,
      totalTTC,
      acompteDemandeTTC: acompteDemandeFinal,
      // Si le devis a déjà une date d'import (cas édition), on la conserve
      dateImport: devis.dateImport ?? new Date(),
    };

    onSauvegarder(devisFinal);
  };

  return (
    <div className="details-facture__modal-overlay">
      <div className="details-facture__modal" onClick={(e) => e.stopPropagation()}>
        <div className="details-facture__modal-header">
          <h2>{devisInitial ? 'Modifier le devis' : 'Nouveau devis'}</h2>
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
                  value={devis.fournisseur}
                  onChange={(e) => handleChange('fournisseur', e.target.value as Fournisseur)}
                  required
                >
                  {tousLesFournisseurs.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="details-facture__modal-field">
                <label>Numéro de devis *</label>
                <input
                  type="text"
                  value={devis.numero}
                  onChange={(e) => handleChange('numero', e.target.value)}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date du devis *</label>
                <input
                  type="date"
                  value={formaterDate(devis.date)}
                  onChange={(e) => handleChange('date', new Date(e.target.value))}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date de validité</label>
                <input
                  type="date"
                  value={devis.dateValidite ? formaterDate(devis.dateValidite) : ''}
                  onChange={(e) =>
                    handleChange(
                      'dateValidite',
                      e.target.value ? new Date(e.target.value) : undefined
                    )
                  }
                />
              </div>
            </div>
          </div>

          {/* Lignes de produits */}
          <div className="details-facture__modal-section">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3>Lignes du devis</h3>
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
              {devis.lignes.map((ligne, index) => (
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
                        onChange={(e) =>
                          handleChangeLigne(
                            index,
                            'refFournisseur',
                            e.target.value || undefined
                          )
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field details-facture__modal-field--large">
                      <label>Description *</label>
                      <input
                        type="text"
                        value={ligne.description}
                        onChange={(e) =>
                          handleChangeLigne(index, 'description', e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>BAT</label>
                      <input
                        type="text"
                        value={ligne.bat || ''}
                        onChange={(e) =>
                          handleChangeLigne(index, 'bat', e.target.value || undefined)
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Logo</label>
                      <input
                        type="text"
                        value={ligne.logo || ''}
                        onChange={(e) =>
                          handleChangeLigne(index, 'logo', e.target.value || undefined)
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Couleur</label>
                      <input
                        type="text"
                        value={ligne.couleur || ''}
                        onChange={(e) =>
                          handleChangeLigne(index, 'couleur', e.target.value || undefined)
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Quantité *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.quantite}
                        onChange={(e) =>
                          handleChangeLigne(
                            index,
                            'quantite',
                            parseFloat(e.target.value) || 0
                          )
                        }
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
                        onChange={(e) =>
                          handleChangeLigne(
                            index,
                            'prixUnitaireHT',
                            parseFloat(e.target.value) || 0
                          )
                        }
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
                        onChange={(e) =>
                          handleChangeLigne(
                            index,
                            'remise',
                            parseFloat(e.target.value) || 0
                          )
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Montant HT</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.montantHT.toFixed(2)}
                        readOnly
                        style={{ backgroundColor: '#f3f4f6' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totaux simples (facultatifs) */}
          <div className="details-facture__modal-section">
            <h3>Totaux (facultatif)</h3>
            <div className="details-facture__modal-grid">
              <div className="details-facture__modal-field">
                <label>Total TVA</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalTVAInput}
                  onChange={(e) => {
                    const valeur = e.target.value;
                    setTotalTVAInput(valeur);
                    const parsed = normaliserMontant(valeur);
                    if (parsed !== null) {
                      handleChange('totalTVA', parsed);
                    }
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total TTC</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalTTCInput}
                  onChange={(e) => {
                    const valeur = e.target.value;
                    setTotalTTCInput(valeur);
                    const parsed = normaliserMontant(valeur);
                    if (parsed !== null) {
                      handleChange('totalTTC', parsed);
                    }
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Acompte demandé (TTC)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={acompteDemandeTTCInput}
                  onChange={(e) => {
                    const valeur = e.target.value;
                    setAcompteDemandeTTCInput(valeur);
                    const parsed = normaliserMontant(valeur);
                    if (parsed !== null) {
                      handleChange('acompteDemandeTTC', parsed);
                    }
                  }}
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
              {devisInitial ? 'Mettre à jour le devis' : 'Enregistrer le devis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


