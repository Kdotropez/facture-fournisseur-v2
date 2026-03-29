import { useMemo, useState } from 'react';
import { ArrowRight, Calendar, FileText, Filter, Receipt, Search, X } from 'lucide-react';
import type { DocumentFournisseur } from '../types/document';
import type { Facture, Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import { chargerReglements } from '../services/reglementService';
import { calculerTotalAcompteReferenceTTC } from '../services/devisService';
import { documentVersDevis, documentVersFacture } from '../types/document';
import './ListeFactures.css';

interface ListeDocumentsProps {
  documents: DocumentFournisseur[];
  totalDocuments: number;
  termeRecherche: string;
  onTermeRechercheChange: (terme: string) => void;
  fournisseurFiltre: Fournisseur | null;
  onFournisseurFiltreChange: (fournisseur: Fournisseur | null) => void;
  onDocumentSelect: (document: DocumentFournisseur | null) => void;
  documentSelectionne?: DocumentFournisseur | null;
}

const obtenirExerciceFiscal = (date: Date): string => {
  const mois = date.getMonth() + 1;
  const annee = date.getFullYear();
  const anneeDebut = mois >= 12 ? annee : annee - 1;
  return `${anneeDebut}-${anneeDebut + 1}`;
};

export function ListeDocuments({
  documents,
  totalDocuments,
  termeRecherche,
  onTermeRechercheChange,
  fournisseurFiltre,
  onFournisseurFiltreChange,
  onDocumentSelect,
  documentSelectionne,
}: ListeDocumentsProps) {
  const [filtreOuvert, setFiltreOuvert] = useState(false);
  const [exerciceFiltre, setExerciceFiltre] = useState('');
  const reglements = chargerReglements();
  let fournisseursDisponibles: Fournisseur[] = [];

  try {
    fournisseursDisponibles = obtenirFournisseurs();
  } catch {
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

  const getFacturesLiees = (document: DocumentFournisseur): Facture[] => {
    const facturesParIds = (document.documentsLiesIds || [])
      .map((id) => documents.find((courant) => courant.id === id && courant.typeDocument === 'facture'))
      .filter((courant): courant is DocumentFournisseur => !!courant);

    const facturesEnfants = documents.filter(
      (courant) =>
        courant.documentParentId === document.id && courant.typeDocument === 'facture'
    );

    const facturesUniques = Array.from(
      new Map(
        [...facturesParIds, ...facturesEnfants].map((courant) => [courant.id, courant])
      ).values()
    );

    return facturesUniques.map((courant) => documentVersFacture(courant));
  };

  const calculerMontants = (document: DocumentFournisseur) => {
    if (document.typeDocument === 'facture') {
      const totalRegle = reglements
        .filter((reglement) => reglement.factureId === document.id && reglement.statut !== 'annule')
        .reduce((sum, reglement) => sum + (reglement.montant || 0), 0);
      return {
        totalTTC: document.totalTTC || 0,
        totalRegle,
        reste: Math.max(0, (document.totalTTC || 0) - totalRegle),
      };
    }

    const devis = documentVersDevis(document);
    const facturesLiees = getFacturesLiees(document);
    const acompteReference = calculerTotalAcompteReferenceTTC(devis, facturesLiees, reglements);
    const totalRegle = facturesLiees.length > 0
      ? reglements
          .filter(
            (reglement) =>
              reglement.statut !== 'annule' &&
              facturesLiees.some((facture) => facture.id === reglement.factureId)
          )
          .reduce((sum, reglement) => sum + (reglement.montant || 0), 0)
      : acompteReference;

    return {
      totalTTC: document.totalTTC || 0,
      totalRegle,
      reste: Math.max(0, (document.totalTTC || 0) - totalRegle),
    };
  };

  const groupesDocuments = useMemo(() => {
    const enfantsParParent = new Map<string, DocumentFournisseur[]>();
    const racines: DocumentFournisseur[] = [];

    documents.forEach((document) => {
      if (document.documentParentId) {
        const enfants = enfantsParParent.get(document.documentParentId) || [];
        enfants.push(document);
        enfantsParParent.set(document.documentParentId, enfants);
      } else {
        racines.push(document);
      }
    });

    const racinesTriees = [...racines].sort((a, b) => {
      const fournisseurCompare = a.fournisseur.localeCompare(b.fournisseur, 'fr');
      if (fournisseurCompare !== 0) {
        return fournisseurCompare;
      }
      return b.date.getTime() - a.date.getTime();
    });

    return racinesTriees.map((document) => ({
      parent: document,
      enfants: (enfantsParParent.get(document.id) || []).sort((a, b) => a.date.getTime() - b.date.getTime()),
    }));
  }, [documents]);

  const exercicesDisponibles = useMemo(
    () =>
      Array.from(new Set(documents.map((document) => obtenirExerciceFiscal(document.date)))).sort().reverse(),
    [documents]
  );

  const documentsFiltresExercice = useMemo(() => {
    if (!exerciceFiltre) {
      return groupesDocuments.flatMap((groupe) => [groupe.parent, ...groupe.enfants]);
    }

    return groupesDocuments.flatMap((groupe) => {
      const parentDansExercice = obtenirExerciceFiscal(groupe.parent.date) === exerciceFiltre;
      const enfantsDansExercice = groupe.enfants.filter(
        (enfant) => obtenirExerciceFiscal(enfant.date) === exerciceFiltre
      );

      if (!parentDansExercice && enfantsDansExercice.length === 0) {
        return [];
      }

      return [groupe.parent, ...(parentDansExercice ? enfantsDansExercice : enfantsDansExercice)];
    });
  }, [groupesDocuments, exerciceFiltre]);

  const documentsAffiches = useMemo(() => {
    const racines = documentsFiltresExercice.filter((document) => !document.documentParentId);
    const enfantsOrphelins = documentsFiltresExercice.filter(
      (document) =>
        !!document.documentParentId &&
        !documentsFiltresExercice.some((courant) => courant.id === document.documentParentId)
    );

    const groupes = racines.map((parent) => {
      const enfants = documentsFiltresExercice.filter((courant) => courant.documentParentId === parent.id);
      const enfantsAcompte = enfants.filter((courant) => courant.natureDocument === 'demande_acompte');
      const enfantsFinal = enfants.filter((courant) => courant.natureDocument === 'facture_finale');
      const groupeSimpleDuplique =
        enfantsAcompte.length === 0 &&
        enfantsFinal.length === 1 &&
        Math.abs((enfantsFinal[0].totalTTC || 0) - (parent.totalTTC || 0)) < 0.01;

      if (groupeSimpleDuplique) {
        return enfantsFinal[0];
      }

      return parent;
    });

    return [...groupes, ...enfantsOrphelins];
  }, [documentsFiltresExercice]);

  const libelleNature = (document: DocumentFournisseur) => {
    if (document.natureDocument === 'demande_acompte') return 'Facture d’acompte';
    if (document.natureDocument === 'facture_finale') return 'Facture enfant dépendante';
    if (document.documentParentId) return 'Facture liée';
    return 'Facture fournisseur';
  };

  return (
    <div className="liste-factures">
      <div className="liste-factures__header">
        <div>
          <h2>Factures fournisseurs ({documentsAffiches.length}/{totalDocuments})</h2>
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
              {fournisseursDisponibles.map((fournisseur) => (
                <button
                  key={fournisseur}
                  type="button"
                  onClick={() => {
                    onFournisseurFiltreChange(fournisseur);
                    setFiltreOuvert(false);
                  }}
                  className={`liste-factures__filtre-option ${
                    fournisseurFiltre === fournisseur ? 'liste-factures__filtre-option--active' : ''
                  }`}
                >
                  {fournisseur}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="liste-factures__filtre-fournisseur">
          <select
            value={exerciceFiltre}
            onChange={(e) => setExerciceFiltre(e.target.value)}
            className="liste-factures__search-input"
            style={{ minWidth: '180px' }}
          >
            <option value="">Tous les exercices</option>
            {exercicesDisponibles.map((exercice) => (
              <option key={exercice} value={exercice}>
                Exercice {exercice}
              </option>
            ))}
          </select>
        </div>
      </div>

      {documentsAffiches.length === 0 ? (
        <div className="liste-factures__empty">
          <FileText size={48} />
          <p>Aucune facture enregistrée pour ce filtre</p>
        </div>
      ) : (
        <div className="liste-factures__table-container">
          <table className="liste-factures__table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Numéro</th>
                <th>Fournisseur</th>
                <th>Date</th>
                <th className="liste-factures__th-montant">Total TTC</th>
                <th className="liste-factures__th-montant">Réglé</th>
                <th className="liste-factures__th-montant">Reste</th>
              </tr>
            </thead>
            <tbody>
              {documentsAffiches.map((document) => {
                const montants = calculerMontants(document);
                const estEnfant = !!document.documentParentId;
                return (
                  <tr
                    key={document.id}
                    className={`liste-factures__row ${
                      documentSelectionne?.id === document.id ? 'liste-factures__row--selected' : ''
                    }`}
                    onClick={() => onDocumentSelect(document)}
                  >
                    <td className="liste-factures__td-fournisseur">
                      <span className="liste-factures__badge liste-factures__badge--fournisseur">
                        {document.natureDocument === 'demande_acompte' ? (
                          <>
                            <ArrowRight size={14} />
                            Acompte
                          </>
                        ) : document.natureDocument === 'facture_finale' ? (
                          <>
                            <Receipt size={14} />
                            Facture
                          </>
                        ) : !document.documentParentId && document.natureDocument === 'principal' ? (
                          <>
                            <Receipt size={14} />
                            Facture
                          </>
                        ) : (
                          <>
                            <Receipt size={14} />
                            Facture
                          </>
                        )}
                      </span>
                    </td>
                    <td className="liste-factures__td-numero">
                      <div style={{ display: 'flex', flexDirection: 'column', marginLeft: estEnfant ? '1rem' : 0 }}>
                        <span className="liste-factures__numero">{document.numero}</span>
                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{libelleNature(document)}</span>
                      </div>
                    </td>
                    <td className="liste-factures__td-fournisseur">
                      <span className="liste-factures__badge liste-factures__badge--fournisseur">
                        {document.fournisseur}
                      </span>
                    </td>
                    <td className="liste-factures__td-date">
                      <div className="liste-factures__date">
                        <Calendar size={14} />
                        {formaterDate(document.date)}
                      </div>
                    </td>
                    <td className="liste-factures__td-montant">
                      <span className="liste-factures__montant-value">
                        {formaterMontant(montants.totalTTC)}
                      </span>
                    </td>
                    <td className="liste-factures__td-montant">
                      <span className="liste-factures__montant-value">
                        {formaterMontant(montants.totalRegle)}
                      </span>
                    </td>
                    <td className="liste-factures__td-montant">
                      <span className="liste-factures__montant-value">
                        {formaterMontant(montants.reste)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
