/**
 * Composant de liste des factures avec recherche et filtres
 */

import { useState } from 'react';
import { Search, Filter, X, Calendar, FileText, Trash2, CheckSquare, Square } from 'lucide-react';
import type { Facture, Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import './ListeFactures.css';

interface ListeFacturesProps {
  factures: Facture[];
  termeRecherche: string;
  onTermeRechercheChange: (terme: string) => void;
  fournisseurFiltre: Fournisseur | null;
  onFournisseurFiltreChange: (fournisseur: Fournisseur | null) => void;
  onFactureSelect: (facture: Facture | null) => void;
  factureSelectionnee?: Facture;
  onSupprimerFacture: (id: string) => void;
}

export function ListeFactures({
  factures,
  termeRecherche,
  onTermeRechercheChange,
  fournisseurFiltre,
  onFournisseurFiltreChange,
  onFactureSelect,
  factureSelectionnee,
  onSupprimerFacture,
}: ListeFacturesProps) {
  const [filtreOuvert, setFiltreOuvert] = useState(false);
  const [modeSelection, setModeSelection] = useState(false);
  const [facturesSelectionnees, setFacturesSelectionnees] = useState<Set<string>>(new Set());
  const [confirmationSuppression, setConfirmationSuppression] = useState<string | null>(null);

  const formaterDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const toggleSelection = (factureId: string) => {
    setFacturesSelectionnees(prev => {
      const nouveau = new Set(prev);
      if (nouveau.has(factureId)) {
        nouveau.delete(factureId);
      } else {
        nouveau.add(factureId);
      }
      return nouveau;
    });
  };

  const toggleSelectionToutes = () => {
    if (facturesSelectionnees.size === factures.length) {
      setFacturesSelectionnees(new Set());
    } else {
      setFacturesSelectionnees(new Set(factures.map(f => f.id)));
    }
  };

  const handleSupprimer = (factureId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setConfirmationSuppression(factureId);
  };

  const confirmerSuppression = (factureId: string) => {
    onSupprimerFacture(factureId);
    setConfirmationSuppression(null);
    setFacturesSelectionnees(prev => {
      const nouveau = new Set(prev);
      nouveau.delete(factureId);
      return nouveau;
    });
    // Si la facture supprimée était sélectionnée, effacer les détails
    if (factureSelectionnee?.id === factureId) {
      onFactureSelect(null);
    }
  };

  const annulerSuppression = () => {
    setConfirmationSuppression(null);
  };

  const supprimerSelectionnees = () => {
    const nombre = facturesSelectionnees.size;
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer ${nombre} facture${nombre > 1 ? 's' : ''} ?`)) {
      const factureSelectionneeSupprimee = factureSelectionnee && facturesSelectionnees.has(factureSelectionnee.id);
      
      facturesSelectionnees.forEach(id => {
        onSupprimerFacture(id);
      });
      setFacturesSelectionnees(new Set());
      setModeSelection(false);
      
      // Si la facture sélectionnée était dans la sélection à supprimer, effacer les détails
      if (factureSelectionneeSupprimee) {
        onFactureSelect(null);
      }
    }
  };

  return (
    <div className="liste-factures">
      <div className="liste-factures__header">
        <div>
          <h2>Liste des factures ({factures.length})</h2>
          {modeSelection && facturesSelectionnees.size > 0 && (
            <p className="liste-factures__selection-info">
              {facturesSelectionnees.size} facture{facturesSelectionnees.size > 1 ? 's' : ''} sélectionnée{facturesSelectionnees.size > 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="liste-factures__header-actions">
          {modeSelection ? (
            <>
              <button
                type="button"
                onClick={toggleSelectionToutes}
                className="liste-factures__btn-action"
              >
                {facturesSelectionnees.size === factures.length ? (
                  <>
                    <CheckSquare size={18} />
                    Tout désélectionner
                  </>
                ) : (
                  <>
                    <Square size={18} />
                    Tout sélectionner
                  </>
                )}
              </button>
              {facturesSelectionnees.size > 0 && (
                <button
                  type="button"
                  onClick={supprimerSelectionnees}
                  className="liste-factures__btn-action liste-factures__btn-action--danger"
                >
                  <Trash2 size={18} />
                  Supprimer ({facturesSelectionnees.size})
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setModeSelection(false);
                  setFacturesSelectionnees(new Set());
                }}
                className="liste-factures__btn-action"
              >
                Annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setModeSelection(true)}
              className="liste-factures__btn-action"
            >
              <CheckSquare size={18} />
              Sélectionner
            </button>
          )}
        </div>
      </div>

      <div className="liste-factures__filtres">
        <div className="liste-factures__recherche">
          <Search size={20} className="liste-factures__search-icon" />
          <input
            type="text"
            placeholder="Rechercher par numéro, fournisseur, produit..."
            value={termeRecherche}
            onChange={(e) => onTermeRechercheChange(e.target.value)}
            className="liste-factures__search-input"
          />
          {termeRecherche && (
            <button
              type="button"
              onClick={() => onTermeRechercheChange('')}
              className="liste-factures__clear-search"
              aria-label="Effacer la recherche"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="liste-factures__filtre-fournisseur">
          <button
            type="button"
            onClick={() => setFiltreOuvert(!filtreOuvert)}
            className={`liste-factures__filtre-btn ${filtreOuvert ? 'liste-factures__filtre-btn--active' : ''}`}
          >
            <Filter size={18} />
            {fournisseurFiltre ? `Fournisseur: ${fournisseurFiltre}` : 'Tous les fournisseurs'}
          </button>

          {filtreOuvert && (
            <div className="liste-factures__filtre-dropdown">
              <button
                type="button"
                onClick={() => {
                  onFournisseurFiltreChange(null);
                  setFiltreOuvert(false);
                }}
                className={`liste-factures__filtre-option ${!fournisseurFiltre ? 'liste-factures__filtre-option--active' : ''}`}
              >
                Tous les fournisseurs
              </button>
              {obtenirFournisseurs().map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    onFournisseurFiltreChange(f);
                    setFiltreOuvert(false);
                  }}
                  className={`liste-factures__filtre-option ${fournisseurFiltre === f ? 'liste-factures__filtre-option--active' : ''}`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {factures.length === 0 ? (
        <div className="liste-factures__empty">
          <FileText size={48} />
          <p>
            {termeRecherche || fournisseurFiltre
              ? 'Aucune facture ne correspond aux critères de recherche'
              : 'Aucune facture enregistrée'}
          </p>
          {(termeRecherche || fournisseurFiltre) && (
            <button
              type="button"
              onClick={() => {
                onTermeRechercheChange('');
                onFournisseurFiltreChange(null);
              }}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                border: '1px solid #3b82f6',
                borderRadius: '6px',
                background: 'white',
                color: '#3b82f6',
                cursor: 'pointer',
              }}
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="liste-factures__table-container">
          <table className="liste-factures__table">
            <thead>
              <tr>
                {modeSelection && (
                  <th className="liste-factures__th-checkbox">
                    <input
                      type="checkbox"
                      checked={facturesSelectionnees.size === factures.length && factures.length > 0}
                      onChange={toggleSelectionToutes}
                    />
                  </th>
                )}
                <th>Numéro</th>
                <th>Fournisseur</th>
                <th>Date</th>
                <th>Lignes</th>
                <th className="liste-factures__th-montant">Total TTC</th>
                {!modeSelection && <th className="liste-factures__th-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {factures.map(facture => (
                <tr
                  key={facture.id}
                  className={`liste-factures__row ${
                    factureSelectionnee?.id === facture.id ? 'liste-factures__row--selected' : ''
                  } ${
                    facturesSelectionnees.has(facture.id) ? 'liste-factures__row--selectionnee' : ''
                  }`}
                  onClick={() => {
                    if (modeSelection) {
                      toggleSelection(facture.id);
                    } else {
                      onFactureSelect(facture);
                    }
                  }}
                >
                  {modeSelection && (
                    <td className="liste-factures__td-checkbox" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={facturesSelectionnees.has(facture.id)}
                        onChange={() => toggleSelection(facture.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                  )}
                  <td className="liste-factures__td-numero">
                    <span className="liste-factures__numero">{facture.numero}</span>
                  </td>
                  <td className="liste-factures__td-fournisseur">
                    <span className="liste-factures__badge liste-factures__badge--fournisseur">
                      {facture.fournisseur}
                    </span>
                  </td>
                  <td className="liste-factures__td-date">
                    <div className="liste-factures__date">
                      <Calendar size={14} />
                      {formaterDate(facture.date)}
                    </div>
                  </td>
                  <td className="liste-factures__td-lignes">
                    {facture.lignes.length} ligne{facture.lignes.length > 1 ? 's' : ''}
                  </td>
                  <td className="liste-factures__td-montant">
                    <span className="liste-factures__montant-value">
                      {formaterMontant(facture.totalTTC)}
                    </span>
                  </td>
                  {!modeSelection && (
                    <td className="liste-factures__td-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => handleSupprimer(facture.id, e)}
                        className="liste-factures__btn-supprimer"
                        aria-label="Supprimer"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de confirmation de suppression */}
      {confirmationSuppression && (
        <div className="liste-factures__modal-overlay" onClick={annulerSuppression}>
          <div className="liste-factures__modal" onClick={(e) => e.stopPropagation()}>
            <h3>Confirmer la suppression</h3>
            <p>
              Êtes-vous sûr de vouloir supprimer la facture{' '}
              <strong>{factures.find(f => f.id === confirmationSuppression)?.numero}</strong> ?
            </p>
            <p className="liste-factures__modal-warning">
              Cette action est irréversible.
            </p>
            <div className="liste-factures__modal-actions">
              <button
                type="button"
                onClick={annulerSuppression}
                className="liste-factures__modal-btn liste-factures__modal-btn--cancel"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => confirmerSuppression(confirmationSuppression)}
                className="liste-factures__modal-btn liste-factures__modal-btn--confirm"
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


