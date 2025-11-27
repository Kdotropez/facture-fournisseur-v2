/**
 * Composant d'affichage des détails d'une facture
 */

import { useState } from 'react';
import { X, FileText, Calendar, Building2, Hash, Code, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react';
import type { Facture } from '../types/facture';
import './DetailsFacture.css';

interface DetailsFactureProps {
  facture: Facture | null;
  onClose: () => void;
}

export function DetailsFacture({ facture, onClose }: DetailsFactureProps) {
  const [debugOuvert, setDebugOuvert] = useState(false);

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
  const ecartHT = totalHTLignes - facture.totalHT;
  const totalTTCAttendu = facture.totalHT + facture.totalTVA;
  const ecartTTC = totalTTCAttendu - facture.totalTTC;
  const tolerance = 0.05;

  const ecartHTSignificatif = Math.abs(ecartHT) > tolerance;
  const ecartTTCSignificatif = Math.abs(ecartTTC) > tolerance;

  const verificationOK = !ecartHTSignificatif && !ecartTTCSignificatif;
  const texteBrut = facture.donneesBrutes
    ? typeof facture.donneesBrutes.texteComplet === 'string'
      ? facture.donneesBrutes.texteComplet
      : typeof facture.donneesBrutes.texteExtrait === 'string'
        ? facture.donneesBrutes.texteExtrait
        : 'Aucun texte extrait'
    : 'Aucun texte extrait';

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
        <button
          type="button"
          onClick={onClose}
          className="details-facture__close-btn"
          aria-label="Fermer"
        >
          <X size={24} />
        </button>
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
                      Somme des lignes HT {formaterMontant(totalHTLignes)} vs Total HT déclaré {formaterMontant(facture.totalHT)} (écart {formaterMontant(ecartHT)}).
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
            {facture.dateCommande && (
              <div className="details-facture__info-item">
                <Calendar size={18} />
                <div>
                  <span className="details-facture__info-label">Date commande</span>
                  <span className="details-facture__info-value">{formaterDate(facture.dateCommande)}</span>
                </div>
              </div>
            )}
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

        {/* Section Debug - Données brutes extraites */}
        {facture.donneesBrutes && (
          <div className="details-facture__section">
            <button
              type="button"
              onClick={() => setDebugOuvert(!debugOuvert)}
              className="details-facture__debug-toggle"
            >
              <Code size={18} />
              <h3 className="details-facture__section-title" style={{ margin: 0 }}>
                Données brutes extraites (Debug)
              </h3>
              {debugOuvert ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {debugOuvert && (
              <div className="details-facture__debug-content">
                <div className="details-facture__debug-section">
                  <h4>Texte extrait du PDF</h4>
                  <pre className="details-facture__debug-text">
                    {texteBrut}
                  </pre>
                    {typeof facture.donneesBrutes.texteComplet === 'string' && (
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                        Longueur totale: {facture.donneesBrutes.texteComplet.length} caractères
                    </p>
                  )}
                </div>
                <div className="details-facture__debug-section">
                  <h4>Données parsées</h4>
                  <pre className="details-facture__debug-json">
                    {JSON.stringify({
                      numero: facture.numero,
                      date: facture.date.toISOString(),
                      totalHT: facture.totalHT,
                      totalTVA: facture.totalTVA,
                      totalTTC: facture.totalTTC,
                      nombreLignes: facture.lignes.length,
                    }, null, 2)}
                  </pre>
                </div>
                <div className="details-facture__debug-note">
                  <strong>Note :</strong> Utilisez ces informations pour comparer avec la facture réelle et identifier les corrections à apporter au parser.
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


