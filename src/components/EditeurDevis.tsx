/**
 * Modal de création / édition d'un devis à la main
 */

import { useEffect, useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Devis, AcompteDevis } from '../types/devis';
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
    acomptesDemandes: [],
    dateImport: new Date(),
    statut: 'en_attente',
    facturesLieesIds: [],
  });

  const normaliserDate = (valeur: unknown): Date => {
    if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) {
      return valeur;
    }
    if (typeof valeur === 'string') {
      const d = new Date(valeur);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const normaliserAcomptes = (source: Devis): AcompteDevis[] => {
    if (source.acomptesDemandes && source.acomptesDemandes.length > 0) {
      return source.acomptesDemandes.map((acompte) => ({
        ...acompte,
        date: normaliserDate(acompte.date),
      }));
    }
    if (typeof source.acompteDemandeTTC === 'number' && source.acompteDemandeTTC > 0) {
      return [
        {
          id: `acompte-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: new Date(),
          montantTTC: source.acompteDemandeTTC,
          note: 'Acompte initial',
        },
      ];
    }
    return [];
  };

  const [devis, setDevis] = useState<Devis>(() =>
    devisInitial
      ? { ...devisInitial, acomptesDemandes: normaliserAcomptes(devisInitial) }
      : creerDevisInitial()
  );
  const [totalTVAInput, setTotalTVAInput] = useState(() =>
    typeof (devisInitial?.totalTVA) === 'number' ? String(devisInitial.totalTVA) : '0'
  );
  const [totalTTCInput, setTotalTTCInput] = useState(() =>
    typeof (devisInitial?.totalTTC) === 'number' ? String(devisInitial.totalTTC) : '0'
  );
  // Si on reçoit un devis existant à éditer, on le charge dans l'état local
  useEffect(() => {
    if (devisInitial) {
      setDevis({ ...devisInitial, acomptesDemandes: normaliserAcomptes(devisInitial) });
      setTotalTVAInput(
        typeof devisInitial.totalTVA === 'number' ? String(devisInitial.totalTVA) : '0'
      );
      setTotalTTCInput(
        typeof devisInitial.totalTTC === 'number' ? String(devisInitial.totalTTC) : '0'
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

  const totalAcomptesTTC = (devis.acomptesDemandes || []).reduce(
    (sum, acompte) => sum + (acompte.montantTTC || 0),
    0
  );

  const handleAjouterAcompte = () => {
    setDevis((prev) => ({
      ...prev,
      acomptesDemandes: [
        ...(prev.acomptesDemandes || []),
        {
          id: `acompte-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: new Date(),
          montantTTC: 0,
          note: '',
        },
      ],
    }));
  };

  const handleSupprimerAcompte = (id: string) => {
    setDevis((prev) => ({
      ...prev,
      acomptesDemandes: (prev.acomptesDemandes || []).filter((a) => a.id !== id),
    }));
  };

  const handleChangeAcompte = (id: string, field: keyof AcompteDevis, value: unknown) => {
    setDevis((prev) => ({
      ...prev,
      acomptesDemandes: (prev.acomptesDemandes || []).map((a) =>
        a.id === id ? { ...a, [field]: value } : a
      ),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const totalTVAParse = normaliserMontant(totalTVAInput);
    const totalTTCParse = normaliserMontant(totalTTCInput);
    const totalTVAFinal = totalTVAParse ?? 0;
    const totalTTCFinal = totalTTCParse ?? 0;
    const acompteDemandeFinal = totalAcomptesTTC;

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
      acomptesDemandes: devis.acomptesDemandes || [],
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
                        type="text"
                        inputMode="decimal"
                        value={String(ligne.quantite)}
                        onChange={(e) => {
                          const parsed = normaliserMontant(e.target.value);
                          handleChangeLigne(index, 'quantite', parsed ?? 0);
                        }}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Prix unitaire HT *</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(ligne.prixUnitaireHT)}
                        onChange={(e) => {
                          const parsed = normaliserMontant(e.target.value);
                          handleChangeLigne(index, 'prixUnitaireHT', parsed ?? 0);
                        }}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Remise</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(ligne.remise)}
                        onChange={(e) => {
                          const parsed = normaliserMontant(e.target.value);
                          handleChangeLigne(index, 'remise', parsed ?? 0);
                        }}
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
                <label>Total acomptes demandés (TTC)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={String(totalAcomptesTTC)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
            </div>
          </div>

          <div className="details-facture__modal-section">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3>Acomptes demandés</h3>
              <button
                type="button"
                onClick={handleAjouterAcompte}
                className="details-facture__btn-add"
              >
                <Plus size={16} />
                Ajouter un acompte
              </button>
            </div>
            {(devis.acomptesDemandes || []).length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                Aucun acompte pour l’instant.
              </p>
            ) : (
              <div className="details-facture__modal-lignes">
                {(devis.acomptesDemandes || []).map((acompte) => (
                  <div key={acompte.id} className="details-facture__modal-ligne">
                    <div className="details-facture__modal-ligne-header">
                      <strong>Acompte</strong>
                      <button
                        type="button"
                        onClick={() => handleSupprimerAcompte(acompte.id)}
                        className="details-facture__btn-delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="details-facture__modal-ligne-grid">
                      <div className="details-facture__modal-field">
                        <label>Date</label>
                        <input
                          type="date"
                          value={formaterDate(acompte.date)}
                          onChange={(e) =>
                            handleChangeAcompte(
                              acompte.id,
                              'date',
                              e.target.value ? new Date(e.target.value) : new Date()
                            )
                          }
                        />
                      </div>
                      <div className="details-facture__modal-field">
                        <label>Montant TTC</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={String(acompte.montantTTC ?? 0)}
                          onChange={(e) => {
                            const parsed = normaliserMontant(e.target.value);
                            handleChangeAcompte(
                              acompte.id,
                              'montantTTC',
                              parsed ?? 0
                            );
                          }}
                        />
                      </div>
                      <div className="details-facture__modal-field details-facture__modal-field--large">
                        <label>Note</label>
                        <input
                          type="text"
                          value={acompte.note || ''}
                          onChange={(e) =>
                            handleChangeAcompte(acompte.id, 'note', e.target.value || undefined)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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


