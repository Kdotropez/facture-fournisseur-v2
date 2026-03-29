/**
 * Liste des devis fournisseurs (vue simple, proche de la liste des factures)
 */

import { useState } from 'react';
import { Search, Filter, X, Calendar, FileText, Trash2 } from 'lucide-react';
import type { Devis } from '../types/devis';
import type { Facture, Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import { chargerReglements } from '../services/reglementService';
import { calculerTotalAcompteReferenceTTC } from '../services/devisService';
import './ListeFactures.css';

interface ListeDevisProps {
  devis: Devis[];
  totalDevis: number;
  factures: Facture[];
  termeRecherche: string;
  onTermeRechercheChange: (terme: string) => void;
  fournisseurFiltre: Fournisseur | null;
  onFournisseurFiltreChange: (fournisseur: Fournisseur | null) => void;
  onDevisSelect: (devis: Devis | null) => void;
  devisSelectionne?: Devis | null;
  onSupprimerDevis?: (id: string) => void;
}

export function ListeDevis({
  devis,
  totalDevis,
  factures,
  termeRecherche,
  onTermeRechercheChange,
  fournisseurFiltre,
  onFournisseurFiltreChange,
  onDevisSelect,
  devisSelectionne,
  onSupprimerDevis,
}: ListeDevisProps) {
  const [filtreOuvert, setFiltreOuvert] = useState(false);
  let fournisseursDisponibles: Fournisseur[] = [];
  try {
    fournisseursDisponibles = obtenirFournisseurs();
  } catch (e) {
    console.error('Erreur lors de la récupération des fournisseurs pour les devis:', e);
    fournisseursDisponibles = [];
  }

  const formaterDate = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);

  const formaterMontant = (montant: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);

  const reglements = chargerReglements();

  const getFacturesLiees = (d: Devis): Facture[] => {
    return (d.facturesLieesIds || [])
      .map((id) => factures.find((f) => f.id === id))
      .filter((f): f is Facture => !!f);
  };

  const calculerAcompteDemandeTTC = (d: Devis) =>
    calculerTotalAcompteReferenceTTC(d, getFacturesLiees(d), reglements);

  const calculerTotalRegleTTC = (d: Devis) => {
    const facturesLiees = getFacturesLiees(d);
    if (facturesLiees.length === 0) {
      return calculerAcompteDemandeTTC(d);
    }
    const idsLiees = new Set(facturesLiees.map((f) => f.id));

    const reglementsLiees = reglements.filter(
      (r) => r.fournisseur === d.fournisseur && idsLiees.has(r.factureId)
    );

    return reglementsLiees.reduce((sum, r) => sum + (r.montant || 0), 0);
  };

  return (
    <div className="liste-factures">
      <div className="liste-factures__header">
        <div>
          <h2>Liste des devis ({devis.length}/{totalDevis})</h2>
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
            className={`liste-factures__filtre-btn ${
              filtreOuvert ? 'liste-factures__filtre-btn--active' : ''
            }`}
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
                className={`liste-factures__filtre-option ${
                  !fournisseurFiltre ? 'liste-factures__filtre-option--active' : ''
                }`}
              >
                Tous les fournisseurs
              </button>
              {fournisseursDisponibles.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    onFournisseurFiltreChange(f);
                    setFiltreOuvert(false);
                  }}
                  className={`liste-factures__filtre-option ${
                    fournisseurFiltre === f ? 'liste-factures__filtre-option--active' : ''
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
        {(termeRecherche || fournisseurFiltre) && (
          <button
            type="button"
            onClick={() => {
              onTermeRechercheChange('');
              onFournisseurFiltreChange(null);
            }}
            className="liste-factures__filtre-btn"
            style={{ marginLeft: 'auto' }}
          >
            Réinitialiser filtres
          </button>
        )}
      </div>

      {devis.length === 0 ? (
        <div className="liste-factures__empty">
          <FileText size={48} />
          <p>
            {termeRecherche || fournisseurFiltre
              ? 'Aucun devis ne correspond aux critères de recherche'
              : 'Aucun devis enregistré'}
          </p>
        </div>
      ) : (
        <div className="liste-factures__table-container">
          <table className="liste-factures__table">
            <thead>
              <tr>
                <th>Numéro</th>
                <th>Fournisseur</th>
                <th>Date</th>
                <th className="liste-factures__th-montant">Total TTC</th>
                <th className="liste-factures__th-montant">Acompte demandé</th>
                <th className="liste-factures__th-montant">Acompte réglé</th>
                <th className="liste-factures__th-montant">Reste à régler</th>
                {onSupprimerDevis && <th className="liste-factures__th-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {devis.map((d) => (
                (() => {
                  const acompteDemande = calculerAcompteDemandeTTC(d);
                  const totalRegle = calculerTotalRegleTTC(d);
                  const totalTTC = d.totalTTC || 0;
                  const acompteRegle = Math.min(totalRegle, totalTTC);
                  const reste = Math.max(0, totalTTC - totalRegle);
                  return (
                <tr
                  key={d.id}
                  className={`liste-factures__row ${
                    devisSelectionne?.id === d.id ? 'liste-factures__row--selected' : ''
                  }`}
                  onClick={() => onDevisSelect(d)}
                >
                  <td className="liste-factures__td-numero">
                    <span className="liste-factures__numero">{d.numero}</span>
                  </td>
                  <td className="liste-factures__td-fournisseur">
                    <span className="liste-factures__badge liste-factures__badge--fournisseur">
                      {d.fournisseur}
                    </span>
                  </td>
                  <td className="liste-factures__td-date">
                    <div className="liste-factures__date">
                      <Calendar size={14} />
                      {formaterDate(d.date)}
                    </div>
                  </td>
                  <td className="liste-factures__td-montant">
                    <span className="liste-factures__montant-value">
                      {formaterMontant(d.totalTTC)}
                    </span>
                  </td>
                  <td className="liste-factures__td-montant">
                    <span className="liste-factures__montant-value">
                      {formaterMontant(acompteDemande)}
                    </span>
                  </td>
                  <td className="liste-factures__td-montant">
                    <span className="liste-factures__montant-value">
                      {formaterMontant(acompteRegle)}
                    </span>
                  </td>
                  <td className="liste-factures__td-montant">
                    <span className="liste-factures__montant-value">
                      {formaterMontant(reste)}
                    </span>
                  </td>
                  {onSupprimerDevis && (
                    <td
                      className="liste-factures__td-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onSupprimerDevis(d.id)}
                        className="liste-factures__btn-supprimer"
                        aria-label="Supprimer le devis"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
                  );
                })()
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


