/**
 * Détails d'une facture principale compatible legacy
 */

import { useState } from 'react';
import {
  X,
  FileText,
  Calendar,
  Building2,
  Hash,
  AlertTriangle,
  CheckCircle,
  Link2,
  Edit,
  Download,
} from 'lucide-react';
import type { Devis } from '../types/devis';
import type { Facture } from '../types/facture';
import { calculerTotalAcompteReferenceTTC, comparerDevisAvecFactures } from '../services/devisService';
import { calculerEtatReglement, chargerReglements } from '../services/reglementService';
import { EditeurDevis } from './EditeurDevis';
import { imprimerPdfSimple, telechargerCSVSimple } from '../utils/exportSimplifie';
import './DetailsFacture.css';

interface DetailsDevisProps {
  devis: Devis | null;
  toutesLesFactures: Facture[];
  onClose: () => void;
  onUpdate?: (devis: Devis) => void;
  onTransformerEnFacture?: (devis: Devis) => void;
  modeAffichage?: 'devis' | 'facture_principale';
}

export function DetailsDevis({
  devis,
  toutesLesFactures,
  onClose,
  onUpdate,
  onTransformerEnFacture,
  modeAffichage = 'devis',
}: DetailsDevisProps) {
  const [editionMode, setEditionMode] = useState(false);

  if (!devis) {
    return (
      <div className="details-facture details-facture--empty">
        <FileText size={64} />
        <p>Sélectionnez une facture pour voir les détails</p>
      </div>
    );
  }

  const comparaison = comparerDevisAvecFactures(devis, toutesLesFactures);
  const reglements = chargerReglements();
  const totalDevisHT = comparaison.devis.totalHT || 0;
  const totalDevisTVA = comparaison.devis.totalTVA || 0;
  const totalFacturesHT = comparaison.facturesLiees.reduce(
    (sum, f) => sum + (typeof f.totalHT === 'number' ? f.totalHT : 0),
    0
  );
  const totalFacturesTVA = comparaison.facturesLiees.reduce(
    (sum, f) => sum + (typeof f.totalTVA === 'number' ? f.totalTVA : 0),
    0
  );
  const ecartGlobalHT = totalFacturesHT - totalDevisHT;
  const ecartGlobalTVA = totalFacturesTVA - totalDevisTVA;
  const tvaDejaRecuperee = Math.min(totalFacturesTVA, totalDevisTVA);
  const tvaRestanteARecuperer = Math.max(0, totalDevisTVA - totalFacturesTVA);

  const normaliserDate = (valeur: unknown): Date | null => {
    if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) {
      return valeur;
    }
    if (typeof valeur === 'string') {
      const d = new Date(valeur);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  };

  const formaterDate = (date: Date | null) => {
    if (!date) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const formaterMontant = (montant: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);

  const lignesExport = comparaison.lignes.map((ligne) => ({
    ref: ligne.ligneDevis.refFournisseur || '',
    nom: ligne.ligneDevis.description,
    nomFR: ligne.ligneDevis.descriptionFR || '',
    logo: ligne.ligneDevis.logo || '',
    quantiteDevis: ligne.ligneDevis.quantite,
    quantiteFacture: ligne.quantiteFacturee,
    prixUnitaire: ligne.ligneDevis.prixUnitaireHT,
  }));

  const handleExporterCSV = () => {
    const nom = `facture-${devis.numero}-${devis.fournisseur}`;
    telechargerCSVSimple(nom, lignesExport);
  };

  const handleExporterPDF = () => {
    const titre = `${estModeFacturePrincipale ? 'Facture principale' : 'Facture fournisseur'} ${devis.numero} — ${devis.fournisseur}`;
    const meta = [
      `Date document: ${formaterDate(devis.date)}`,
      `Total TTC: ${formaterMontant(comparaison.totalDevisTTC)}`,
    ];
    imprimerPdfSimple(titre, meta, lignesExport);
  };

  const aFacturesLiees = comparaison.facturesLiees.length > 0;
  const ecartGlobalSignificatif = aFacturesLiees && Math.abs(comparaison.ecartGlobalTTC) > 0.01;
  const estModeFacturePrincipale = modeAffichage === 'facture_principale';
  const libelleTypePiece = estModeFacturePrincipale ? 'Facture principale' : 'Facture fournisseur';

  const totalHTFOB =
    devis.donneesBrutes && typeof devis.donneesBrutes.totalHTFOB === 'number'
      ? devis.donneesBrutes.totalHTFOB
      : undefined;
  const transportEtDouanes =
    devis.donneesBrutes && typeof devis.donneesBrutes.transportEtDouanes === 'number'
      ? devis.donneesBrutes.transportEtDouanes
      : undefined;

  const totalLivraisonsTTC = comparaison.totalLivraisonsTTC;
  const acomptesDemandes =
    devis.acomptesDemandes && devis.acomptesDemandes.length > 0
      ? devis.acomptesDemandes.map((acompte) => ({
          ...acompte,
          date: normaliserDate(acompte.date) || devis.date,
        }))
      : typeof devis.acompteDemandeTTC === 'number' && devis.acompteDemandeTTC > 0
        ? [
            {
              id: 'acompte-legacy',
              date: devis.date,
              montantTTC: devis.acompteDemandeTTC,
              note: 'Acompte global',
            },
          ]
        : [];
  const totalAcomptesAvecSoldeTTC = acomptesDemandes.reduce(
    (sum, acompte) => sum + (acompte.montantTTC || 0),
    0
  );
  const totalAcomptesTTC = estModeFacturePrincipale
    ? totalAcomptesAvecSoldeTTC
    : calculerTotalAcompteReferenceTTC(
        devis,
        comparaison.facturesLiees,
        reglements
      );
  const baseApresAcompteTTC = Math.max(0, comparaison.totalDevisTTC - totalAcomptesTTC);
  const resteApresAcompteTTC = baseApresAcompteTTC;

  // Total déjà payé sur les factures liées (en TTC), basé sur les règlements
  const totalPayeTTC = estModeFacturePrincipale
    ? reglements
        .filter(
          (reglement) =>
            reglement.statut !== 'annule' &&
            comparaison.facturesLiees.some((facture) => facture.id === reglement.factureId)
        )
        .reduce((sum, reglement) => sum + (reglement.montant || 0), 0)
    : aFacturesLiees
      ? comparaison.facturesLiees.reduce((sum, facture) => {
          const etat = calculerEtatReglement(facture);
          return sum + etat.montantRegle;
        }, 0)
      : totalAcomptesAvecSoldeTTC;

  // Reste à payer TTC sur la facture (basé sur les paiements réels)
  const resteAPayerTTC = Math.max(0, comparaison.totalDevisTTC - totalPayeTTC);
  // Reste à livrer TTC (basé sur les livraisons réelles)
  const resteALivrerTTCApresAcompte = Math.max(
    0,
    comparaison.totalDevisTTC - totalLivraisonsTTC
  );

  const [lignePourReception, setLignePourReception] = useState<number | null>(null);
  const [dateReception, setDateReception] = useState('');
  const [numeroReception, setNumeroReception] = useState('');
  const [quantiteReception, setQuantiteReception] = useState('');
  const [liaisonFacturesOuverte, setLiaisonFacturesOuverte] = useState(false);
  const [facturesSelectionneesIds, setFacturesSelectionneesIds] = useState<string[]>(
    devis.facturesLieesIds || []
  );

  const facturesDuMemeFournisseur = toutesLesFactures.filter(
    (f) => f.fournisseur === devis.fournisseur
  );
  const factureLieeTrouvee = (devis.facturesLieesIds || []).some((id) =>
    toutesLesFactures.some((f) => f.id === id)
  );
  const handleFacturerClick = () => {
    if (!onTransformerEnFacture) return;
    if (factureLieeTrouvee) {
      const ok = window.confirm(
        'Une facture liée existe déjà pour cette facture. Voulez-vous vraiment refacturer ?'
      );
      if (!ok) return;
    }
    onTransformerEnFacture(devis);
  };

  const estFactureSelectionnee = (id: string) => facturesSelectionneesIds.includes(id);

  const toggleSelectionFacture = (id: string) => {
    setFacturesSelectionneesIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="details-facture">
      <div className="details-facture__header">
        <div>
          <h2>Fiche pièce fournisseur</h2>
          <div className="details-facture__meta">
            <span className="details-facture__badge">{libelleTypePiece}</span>
            <span className="details-facture__badge details-facture__badge--secondary">{devis.fournisseur}</span>
            <span className="details-facture__numero">{devis.numero}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleExporterPDF}
            className="details-facture__close-btn"
            aria-label="Exporter PDF simplifié"
            title="Exporter PDF simplifié"
          >
            <FileText size={18} />
          </button>
          <button
            type="button"
            onClick={handleExporterCSV}
            className="details-facture__close-btn"
            aria-label="Exporter Excel (CSV)"
            title="Exporter Excel (CSV)"
          >
            <Download size={18} />
          </button>
          {!estModeFacturePrincipale && onTransformerEnFacture && (
            <button
              type="button"
              onClick={handleFacturerClick}
              className="details-facture__close-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              aria-label="Transformer en facture"
              title="Transformer en facture"
            >
              <FileText size={18} />
              {devis.statut === 'facture_soldee' ? 'Refacturer' : 'Créer la facture'}
            </button>
          )}
          {onUpdate && (
            <button
              type="button"
              onClick={() => setEditionMode(true)}
              className="details-facture__edit-btn"
              aria-label="Éditer la facture"
              title="Éditer la facture"
            >
              <Edit size={18} />
            </button>
          )}
          {onUpdate && (
            <button
              type="button"
              onClick={() => {
                setFacturesSelectionneesIds(devis.facturesLieesIds || []);
                setLiaisonFacturesOuverte(true);
              }}
              className="details-facture__close-btn"
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <Link2 size={18} />
              {estModeFacturePrincipale ? 'Gérer les acomptes liés' : 'Gérer les factures liées'}
            </button>
          )}
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
        <div className="details-facture__summary-grid">
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">Type de pièce</span>
            <span className="details-facture__summary-value">{libelleTypePiece}</span>
          </div>
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">
              Total facture TTC
            </span>
            <span className="details-facture__summary-value">
              {formaterMontant(comparaison.totalDevisTTC)}
            </span>
          </div>
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">Réglé TTC</span>
            <span className="details-facture__summary-value">{formaterMontant(totalPayeTTC)}</span>
          </div>
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">Reste à payer TTC</span>
            <span className="details-facture__summary-value">{formaterMontant(resteAPayerTTC)}</span>
          </div>
        </div>

        {estModeFacturePrincipale ? (
          <div className="details-facture__alert details-facture__alert--success">
            <CheckCircle size={18} />
            <div>
              <strong>Facture principale avec acomptes rattachés.</strong> Les montants ci-dessous
              reflètent les acomptes déjà facturés et réglés, sans afficher d’écart entre factures.
            </div>
          </div>
        ) : aFacturesLiees ? (
          <div
            className={`details-facture__alert ${
              ecartGlobalSignificatif
                ? 'details-facture__alert--warning'
                : 'details-facture__alert--success'
            }`}
          >
            {ecartGlobalSignificatif ? (
              <>
                <AlertTriangle size={18} />
                <div>
                  <strong>Écart entre la facture et les factures liées.</strong>
                  <ul>
                    <li>
                      Facture HT {formaterMontant(totalDevisHT)} vs factures liées HT{' '}
                      {formaterMontant(totalFacturesHT)} (écart{' '}
                      {formaterMontant(ecartGlobalHT)}
                      ).
                    </li>
                    <li>
                      Facture TTC {formaterMontant(comparaison.totalDevisTTC)} vs factures liées TTC{' '}
                      {formaterMontant(comparaison.totalFacturesTTC)} (écart{' '}
                      {formaterMontant(comparaison.ecartGlobalTTC)}
                      ).
                    </li>
                    <li>
                      TVA facture {formaterMontant(totalDevisTVA)} vs TVA des factures liées{' '}
                      {formaterMontant(totalFacturesTVA)} (écart{' '}
                      {formaterMontant(ecartGlobalTVA)}
                      ).
                    </li>
                    <li>
                      TVA déjà récupérée {formaterMontant(tvaDejaRecuperee)} – TVA restante à
                      récupérer {formaterMontant(tvaRestanteARecuperer)}.
                    </li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <CheckCircle size={18} />
                <div>
                  <strong>Facture cohérente.</strong> Le total TTC des factures liées correspond au total attendu.
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="details-facture__alert details-facture__alert--success">
            <CheckCircle size={18} />
            <div>
              <strong>Aucune facture liée pour l’instant.</strong> L’écart sera calculé dès que des
              factures (acomptes / solde) seront rattachées à cette facture.
            </div>
          </div>
        )}

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">Informations générales</h3>
          <div className="details-facture__info-grid">
            <div className="details-facture__info-item">
              <Building2 size={18} />
              <div>
                <span className="details-facture__info-label">Fournisseur</span>
                <span className="details-facture__info-value">{devis.fournisseur}</span>
              </div>
            </div>
            <div className="details-facture__info-item">
              <Hash size={18} />
              <div>
                <span className="details-facture__info-label">Numéro</span>
                <span className="details-facture__info-value">{devis.numero}</span>
              </div>
            </div>
            <div className="details-facture__info-item">
              <Calendar size={18} />
              <div>
                <span className="details-facture__info-label">
                  Date facture
                </span>
                <span className="details-facture__info-value">{formaterDate(devis.date)}</span>
              </div>
            </div>
            {devis.dateValidite && (
              <div className="details-facture__info-item">
                <Calendar size={18} />
                <div>
                  <span className="details-facture__info-label">Date de validité</span>
                  <span className="details-facture__info-value">
                    {formaterDate(devis.dateValidite)}
                  </span>
                </div>
              </div>
            )}
            {devis.fichierPDF && (
              <div className="details-facture__info-item details-facture__info-item--file">
                <FileText size={18} />
                <div>
                  <span className="details-facture__info-label">Fichier PDF</span>
                  <span className="details-facture__info-value details-facture__info-value--file">
                    {devis.fichierPDF.split(/[/\\]/).pop()}
                  </span>
                  {devis.pdfOriginal && (
                    <div className="details-facture__pdf-actions">
                      <a
                        href={devis.pdfOriginal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="details-facture__pdf-link"
                      >
                        Consulter
                      </a>
                      <a
                        href={devis.pdfOriginal}
                        download={devis.fichierPDF}
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
            Lignes de la facture ({devis.lignes.length})
          </h3>
          <div className="details-facture__table-container">
            <table className="details-facture__table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Description</th>
                  <th>Traduction FR</th>
                  <th>Logo</th>
                  <th>Quantité facturée</th>
                  <th>Quantité reçue (cumulée)</th>
                  <th>Écart qtés</th>
                  <th>PU HT</th>
                  <th>Montant HT</th>
                </tr>
              </thead>
              <tbody>
                {comparaison.lignes.map((ligne, index) => {
                  const ecartQ = ligne.ecartQuantite;
                  const ecartQSignif = Math.abs(ecartQ) > 0.001;
                  const quantiteRecueAffichee = Math.round(ligne.quantiteFacturee);

                  const styleEcart = (signif: boolean) =>
                    signif
                      ? { color: '#b91c1c', fontWeight: 600 }
                      : { color: '#059669', fontWeight: 500 };

                  return (
                    <tr
                      key={index}
                      onClick={() => {
                        setLignePourReception(index);
                        const today = new Date().toISOString().slice(0, 10);
                        setDateReception(today);
                        setNumeroReception('');
                        const deja =
                          devis.lignes[index].quantiteFactureeManuelle || 0;
                        const reste = Math.max(
                          0,
                          devis.lignes[index].quantite - deja
                        );
                        setQuantiteReception(reste > 0 ? String(Math.round(reste)) : '');
                      }}
                      style={{ cursor: onUpdate ? 'pointer' : 'default' }}
                    >
                      <td className="details-facture__cell-ref">
                        {ligne.ligneDevis.refFournisseur || '-'}
                      </td>
                      <td className="details-facture__cell-description">
                        {ligne.ligneDevis.description}
                      </td>
                      <td className="details-facture__cell-description">
                        {ligne.ligneDevis.descriptionFR || ligne.ligneDevis.description}
                      </td>
                      <td className="details-facture__cell-description">
                        {ligne.ligneDevis.logo || '-'}
                      </td>
                      <td className="details-facture__cell-number">
                        {ligne.ligneDevis.quantite}
                      </td>
                      <td className="details-facture__cell-number">
                        {quantiteRecueAffichee}
                      </td>
                      <td
                        className="details-facture__cell-number"
                        style={styleEcart(ecartQSignif)}
                      >
                        {Math.round(ecartQ)}
                      </td>
                      <td className="details-facture__cell-amount">
                        {formaterMontant(ligne.ligneDevis.prixUnitaireHT)}
                      </td>
                      <td className="details-facture__cell-amount">
                        {formaterMontant(ligne.montantLigneDevis)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">Totaux</h3>
          <div className="details-facture__totaux">
            {typeof totalHTFOB === 'number' && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Total HT FOB</span>
                <span className="details-facture__total-value">
                  {formaterMontant(totalHTFOB)}
                </span>
              </div>
            )}
            {typeof transportEtDouanes === 'number' && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Transport et douanes</span>
                <span className="details-facture__total-value">
                  {formaterMontant(transportEtDouanes)}
                </span>
              </div>
            )}
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Total HT</span>
              <span className="details-facture__total-value">
                {formaterMontant(comparaison.devis.totalHT)}
              </span>
            </div>
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">TVA</span>
              <span className="details-facture__total-value">
                {formaterMontant(comparaison.devis.totalTVA)}
              </span>
            </div>
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">
                Total facture TTC
              </span>
              <span className="details-facture__total-value">
                {formaterMontant(comparaison.totalDevisTTC)}
              </span>
            </div>
            {totalAcomptesTTC > 0 && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Total acomptes TTC (hors solde)</span>
                <span className="details-facture__total-value">
                  {formaterMontant(totalAcomptesTTC)}
                </span>
              </div>
            )}
            {totalAcomptesTTC > 0 && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Reste après acomptes TTC</span>
                <span className="details-facture__total-value">
                  {formaterMontant(resteApresAcompteTTC)}
                </span>
              </div>
            )}
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Total livraisons TTC</span>
              <span className="details-facture__total-value">
                {formaterMontant(totalLivraisonsTTC)}
              </span>
            </div>
            {acomptesDemandes.length > 0 && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Factures enfants intégrées (acomptes)</span>
                <div className="details-facture__total-value">
                  {acomptesDemandes.map((acompte) => (
                    <div key={acompte.id}>
                      {formaterDate(acompte.date)} – {formaterMontant(acompte.montantTTC)}
                      {acompte.note ? ` (${acompte.note})` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Total payé TTC</span>
              <span className="details-facture__total-value">
                {formaterMontant(totalPayeTTC)}
              </span>
            </div>
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Reste à payer TTC</span>
              <span className="details-facture__total-value">
                {formaterMontant(resteAPayerTTC)}
              </span>
            </div>
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Reste à livrer TTC</span>
              <span className="details-facture__total-value">
                {formaterMontant(resteALivrerTTCApresAcompte)}
              </span>
            </div>
            {!estModeFacturePrincipale && (
              <div className="details-facture__total-item details-facture__total-item--final">
                <span className="details-facture__total-label">Écart global TTC</span>
                <span
                  className="details-facture__total-value details-facture__total-value--final"
                  style={{
                    color: ecartGlobalSignificatif ? '#b91c1c' : '#059669',
                  }}
                >
                  {formaterMontant(comparaison.ecartGlobalTTC)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Modal de saisie d'une réception de marchandise pour une ligne */}
        {lignePourReception !== null && onUpdate && (
          <div
            className="details-facture__modal-overlay"
            onClick={() => setLignePourReception(null)}
          >
            <div
              className="details-facture__modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="details-facture__modal-header">
                <h2>Saisir une réception</h2>
                <button
                  type="button"
                  onClick={() => setLignePourReception(null)}
                  className="details-facture__modal-close"
                  aria-label="Fermer"
                >
                  <X size={24} />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!onUpdate || lignePourReception === null) return;
                  const q = parseInt(quantiteReception, 10);
                  if (!quantiteReception || isNaN(q) || q <= 0) {
                    return;
                  }
                  const nouvellesLignes = [...devis.lignes];
                  const ligne = nouvellesLignes[lignePourReception];
                  const anciennesReceptions = ligne.receptions || [];
                  const dateStr = dateReception || new Date().toISOString().slice(0, 10);
                  const numeroFinal = numeroReception || dateStr;
                  const nouvelleReception = {
                    id: `reception-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    numero: numeroFinal,
                    date: dateStr,
                    quantite: q,
                  };
                  const quantiteCumulee =
                    (ligne.quantiteFactureeManuelle || 0) + q;
                  nouvellesLignes[lignePourReception] = {
                    ...ligne,
                    quantiteFactureeManuelle: quantiteCumulee,
                    receptions: [...anciennesReceptions, nouvelleReception],
                  };
                  onUpdate({ ...devis, lignes: nouvellesLignes });
                  setLignePourReception(null);
                }}
                className="details-facture__modal-form"
              >
                <div className="details-facture__modal-section">
                  <h3>Article</h3>
                  <p style={{ fontSize: '0.9rem', color: '#4b5563' }}>
                    <strong>
                      {devis.lignes[lignePourReception].refFournisseur || '-'}
                    </strong>{' '}
                    – {devis.lignes[lignePourReception].description}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Quantité facture : {devis.lignes[lignePourReception].quantite} – Quantité déjà reçue :{' '}
                    {devis.lignes[lignePourReception].quantiteFactureeManuelle || 0} – Quantité restante :{' '}
                    {Math.max(
                      0,
                      devis.lignes[lignePourReception].quantite -
                        (devis.lignes[lignePourReception].quantiteFactureeManuelle || 0)
                    )}
                  </p>
                </div>
                <div className="details-facture__modal-section">
                  <h3>Nouvelle réception</h3>
                  <div className="details-facture__modal-grid">
                    <div className="details-facture__modal-field">
                      <label>Numéro de livraison / BL</label>
                      <input
                        type="text"
                        value={numeroReception}
                        onChange={(e) => setNumeroReception(e.target.value)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Date de réception</label>
                      <input
                        type="date"
                        value={dateReception}
                        onChange={(e) => setDateReception(e.target.value)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Quantité reçue (partielle ou totale) *</label>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={quantiteReception}
                        onChange={(e) => setQuantiteReception(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const ligne = devis.lignes[lignePourReception];
                          const deja = ligne.quantiteFactureeManuelle || 0;
                          const reste = Math.max(0, ligne.quantite - deja);
                          setQuantiteReception(reste > 0 ? String(Math.round(reste)) : '0');
                        }}
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.8rem',
                          borderRadius: '4px',
                          border: '1px solid #3b82f6',
                          background: 'white',
                          color: '#3b82f6',
                          cursor: 'pointer',
                        }}
                      >
                        Tout recevoir (reste)
                      </button>
                    </div>
                  </div>
                </div>

                {devis.lignes[lignePourReception].receptions &&
                  devis.lignes[lignePourReception].receptions!.length > 0 && (
                    <div className="details-facture__modal-section">
                      <h3>Historique des réceptions</h3>
                      <div className="details-facture__table-container">
                        <table className="details-facture__table">
                          <thead>
                            <tr>
                              <th>BL</th>
                              <th>Date</th>
                              <th>Quantité</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {devis.lignes[lignePourReception].receptions!.map((r) => (
                              <tr key={r.id}>
                                <td>{r.numero || '—'}</td>
                                <td>{r.date}</td>
                                <td style={{ textAlign: 'right' }}>{r.quantite}</td>
                                <td>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!onUpdate || lignePourReception === null) return;
                                      const nouvellesLignes = [...devis.lignes];
                                      const ligne = nouvellesLignes[lignePourReception];
                                      const nouvellesReceptions = (ligne.receptions || []).filter(
                                        (x) => x.id !== r.id
                                      );
                                      const nouvelleQuantite = nouvellesReceptions.reduce(
                                        (sum, x) => sum + x.quantite,
                                        0
                                      );
                                      nouvellesLignes[lignePourReception] = {
                                        ...ligne,
                                        receptions: nouvellesReceptions,
                                        quantiteFactureeManuelle: nouvelleQuantite || undefined,
                                      };
                                      onUpdate({ ...devis, lignes: nouvellesLignes });
                                    }}
                                    style={{
                                      padding: '0.25rem 0.5rem',
                                      fontSize: '0.8rem',
                                      borderRadius: '4px',
                                      border: '1px solid #ef4444',
                                      background: 'white',
                                      color: '#ef4444',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Supprimer
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                <div className="details-facture__modal-footer">
                  <button
                    type="button"
                    onClick={() => setLignePourReception(null)}
                    className="details-facture__modal-btn details-facture__modal-btn--secondary"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="details-facture__modal-btn details-facture__modal-btn--primary"
                  >
                    Enregistrer la réception
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de liaison des factures à la facture principale */}
        {liaisonFacturesOuverte && onUpdate && (
          <div
            className="details-facture__modal-overlay"
            onClick={() => setLiaisonFacturesOuverte(false)}
          >
            <div
              className="details-facture__modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="details-facture__modal-header">
                <h2>Gérer les factures liées à cette facture</h2>
                <button
                  type="button"
                  onClick={() => setLiaisonFacturesOuverte(false)}
                  className="details-facture__modal-close"
                  aria-label="Fermer"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="details-facture__modal-form">
                <div className="details-facture__modal-section">
                  <p style={{ fontSize: '0.9rem', color: '#4b5563', marginBottom: '0.75rem' }}>
                    Sélectionnez les factures enfants dépendantes de <strong>{devis.fournisseur}</strong>
                    qui doivent être intégrées à cette facture principale. Vous pouvez cocher ou
                    décocher pour corriger une erreur de rattachement.
                  </p>
                  {facturesDuMemeFournisseur.length === 0 ? (
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '6px',
                        background: '#f3f4f6',
                        fontSize: '0.9rem',
                        color: '#4b5563',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <FileText size={18} />
                      <span>
                        Aucune facture de ce fournisseur n’est encore enregistrée. Importez
                        d’abord les factures dans l’onglet <strong>Pièces</strong>.
                      </span>
                    </div>
                  ) : (
                    <div className="details-facture__table-container">
                      <table className="details-facture__table">
                        <thead>
                          <tr>
                            <th style={{ width: '3rem' }}>Lier</th>
                            <th>Numéro</th>
                            <th>Date</th>
                            <th className="details-facture__th-montant">Total TTC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {facturesDuMemeFournisseur.map((facture) => (
                            <tr
                              key={facture.id}
                              onClick={() => toggleSelectionFacture(facture.id)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={estFactureSelectionnee(facture.id)}
                                  onChange={() => toggleSelectionFacture(facture.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              <td>{facture.numero}</td>
                              <td>
                                {new Intl.DateTimeFormat('fr-FR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                }).format(facture.date)}
                              </td>
                              <td className="details-facture__cell-amount">
                                {formaterMontant(facture.totalTTC)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="details-facture__modal-footer">
                  <button
                    type="button"
                    onClick={() => {
                      setFacturesSelectionneesIds([]);
                    }}
                    className="details-facture__modal-btn details-facture__modal-btn--secondary"
                    style={{ marginRight: 'auto' }}
                  >
                    Délier toutes les factures
                  </button>
                  <button
                    type="button"
                    onClick={() => setLiaisonFacturesOuverte(false)}
                    className="details-facture__modal-btn details-facture__modal-btn--secondary"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="details-facture__modal-btn details-facture__modal-btn--primary"
                    onClick={() => {
                      if (!onUpdate) return;
                      onUpdate({
                        ...devis,
                        facturesLieesIds: facturesSelectionneesIds,
                      });
                      setLiaisonFacturesOuverte(false);
                    }}
                  >
                    Enregistrer la liaison
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal d'édition du devis complet (fournisseur, lignes, totaux) */}
        {editionMode && devis && onUpdate && (
          <EditeurDevis
            devisInitial={devis}
            onSauvegarder={(devisModifie) => {
              onUpdate(devisModifie);
              setEditionMode(false);
            }}
            onFermer={() => setEditionMode(false)}
          />
        )}
      </div>
    </div>
  );
}

