/**
 * Composant d'affichage des statistiques globales
 */

import { useMemo, useState, useEffect } from 'react';
import { TrendingUp, FileText, Building2, Euro, List, Layers, Eye } from 'lucide-react';
import type { Facture, Statistiques } from '../types/facture';
import './Statistiques.css';

interface StatistiquesProps {
  statistiques: Statistiques;
  factures: Facture[];
  onVoirFacture?: (facture: Facture) => void;
}

interface LigneFactureDetail {
  id: string;
  numero: string;
  date: Date;
  quantite: number;
  montantHT: number;
  description: string;
}

interface ProduitStatsDetail {
  ref: string;
  description: string;
  logo?: string;
  quantiteTotale: number;
  montantHTTotal: number;
  lignes: LigneFactureDetail[];
}

type FournisseurProduits = Record<string, ProduitStatsDetail>;

export function StatistiquesComponent({ statistiques, factures, onVoirFacture }: StatistiquesProps) {
  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(montant);
  };

  const fournisseurs = Object.entries(statistiques.parFournisseur) as [
    string,
    typeof statistiques.parFournisseur[keyof typeof statistiques.parFournisseur]
  ][];

  const detailsParFournisseur = useMemo<Record<string, FournisseurProduits>>(() => {
    const result: Record<string, FournisseurProduits> = {};

    factures.forEach((facture) => {
      if (!result[facture.fournisseur]) {
        result[facture.fournisseur] = {};
      }
      const produits = result[facture.fournisseur];

      facture.lignes.forEach((ligne) => {
        if (!ligne.refFournisseur) {
          return;
        }
        const ref = ligne.refFournisseur;
        if (!produits[ref]) {
          produits[ref] = {
            ref,
            description: ligne.description,
            logo: ligne.logo,
            quantiteTotale: 0,
            montantHTTotal: 0,
            lignes: [],
          };
        }

        const detail = produits[ref];
        if (!detail.description && ligne.description) {
          detail.description = ligne.description;
        }
        if (!detail.logo && ligne.logo) {
          detail.logo = ligne.logo;
        }

        detail.quantiteTotale += ligne.quantite;
        detail.montantHTTotal += ligne.montantHT;
        detail.lignes.push({
          id: facture.id,
          numero: facture.numero,
          date: facture.date,
          quantite: ligne.quantite,
          montantHT: ligne.montantHT,
          description: ligne.description,
        });
      });
    });

    return result;
  }, [factures]);

  const [fournisseurSelectionne, setFournisseurSelectionne] = useState<string | null>(null);
  const [produitSelectionne, setProduitSelectionne] = useState<string | null>(null);

  useEffect(() => {
    if (!fournisseurSelectionne) {
      const premier = fournisseurs[0]?.[0] ?? null;
      setFournisseurSelectionne(premier);
      setProduitSelectionne(null);
    } else if (!detailsParFournisseur[fournisseurSelectionne]) {
      setFournisseurSelectionne(null);
      setProduitSelectionne(null);
    } else {
      setProduitSelectionne(null);
    }
  }, [fournisseurSelectionne, fournisseurs, detailsParFournisseur]);

  const produitsDuFournisseur =
    fournisseurSelectionne && detailsParFournisseur[fournisseurSelectionne]
      ? Object.values(detailsParFournisseur[fournisseurSelectionne]).sort(
          (a, b) => b.montantHTTotal - a.montantHTTotal
        )
      : [];

  const produitDetail =
    fournisseurSelectionne && produitSelectionne && detailsParFournisseur[fournisseurSelectionne]
      ? detailsParFournisseur[fournisseurSelectionne][produitSelectionne]
      : undefined;

  const formaterDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  return (
    <div className="statistiques">
      <div className="statistiques__header">
        <h2>Statistiques globales</h2>
      </div>

      <div className="statistiques__cards">
        <div className="statistiques__card statistiques__card--primary">
          <div className="statistiques__card-icon">
            <FileText size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Nombre de factures</span>
            <span className="statistiques__card-value">{statistiques.nombreFactures}</span>
          </div>
        </div>

        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <Euro size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total HT</span>
            <span className="statistiques__card-value">{formaterMontant(statistiques.totalHT)}</span>
          </div>
        </div>

        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <TrendingUp size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total TVA</span>
            <span className="statistiques__card-value">{formaterMontant(statistiques.totalTVA)}</span>
          </div>
        </div>

        <div className="statistiques__card statistiques__card--highlight">
          <div className="statistiques__card-icon">
            <Euro size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total TTC</span>
            <span className="statistiques__card-value statistiques__card-value--large">
              {formaterMontant(statistiques.totalTTC)}
            </span>
          </div>
        </div>
      </div>

      <div className="statistiques__section">
        <h3 className="statistiques__section-title">
          <Building2 size={20} />
          Par fournisseur
        </h3>
        <div className="statistiques__panels">
          <div className="statistiques__panel">
            <div className="statistiques__panel-header">
              <List size={18} />
              <span>Fournisseurs</span>
            </div>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th>Fournisseur</th>
                  <th>Factures</th>
                  <th>Total HT</th>
                  <th>TVA</th>
                  <th>TTC</th>
                </tr>
              </thead>
              <tbody>
                {fournisseurs.map(([fournisseur, stats]) => (
                  <tr
                    key={fournisseur}
                    className={
                      fournisseurSelectionne === fournisseur
                        ? 'statistiques__table-row--active'
                        : undefined
                    }
                    onClick={() => setFournisseurSelectionne(fournisseur)}
                  >
                    <td>{fournisseur}</td>
                    <td>{stats.nombre}</td>
                    <td>{formaterMontant(stats.totalHT)}</td>
                    <td>{formaterMontant(stats.totalTVA)}</td>
                    <td>{formaterMontant(stats.totalTTC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {fournisseurSelectionne && (
            <div className="statistiques__panel">
              <div className="statistiques__panel-header">
                <Layers size={18} />
                <span>Produits – {fournisseurSelectionne}</span>
              </div>
              {produitsDuFournisseur.length === 0 ? (
                <p className="statistiques__empty">Aucun produit trouvé pour ce fournisseur.</p>
              ) : (
                <table className="statistiques__table">
                  <thead>
                    <tr>
                      <th>Réf.</th>
                      <th>Description</th>
                      <th>Quantité</th>
                      <th>Montant HT</th>
                      <th>Dernier achat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produitsDuFournisseur.map((produit) => {
                      const derniereLigne = [...produit.lignes].sort(
                        (a, b) => b.date.getTime() - a.date.getTime()
                      )[0];
                      return (
                        <tr
                          key={produit.ref}
                          className={
                            produitSelectionne === produit.ref
                              ? 'statistiques__table-row--active'
                              : undefined
                          }
                          onClick={() => setProduitSelectionne(produit.ref)}
                        >
                          <td>{produit.ref}</td>
                          <td>{produit.description}</td>
                          <td>{produit.quantiteTotale}</td>
                          <td>{formaterMontant(produit.montantHTTotal)}</td>
                          <td>
                            {derniereLigne
                              ? `${derniereLigne.numero} – ${formaterDate(derniereLigne.date)}`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {fournisseurSelectionne && produitDetail && (
          <div className="statistiques__panel statistiques__panel--full">
            <div className="statistiques__panel-header">
              <Eye size={18} />
              <span>
                Détail produit – {produitDetail.ref} ({produitDetail.description})
              </span>
            </div>
            <div className="statistiques__panel-summary">
              <div>
                <span>Quantité totale</span>
                <strong>{produitDetail.quantiteTotale}</strong>
              </div>
              <div>
                <span>Montant total HT</span>
                <strong>{formaterMontant(produitDetail.montantHTTotal)}</strong>
              </div>
              {produitDetail.logo && (
                <div>
                  <span>Marquage / Logo</span>
                  <strong>{produitDetail.logo}</strong>
                </div>
              )}
            </div>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Date</th>
                  <th>Quantité</th>
                  <th>Montant HT</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {[...produitDetail.lignes]
                  .sort((a, b) => b.date.getTime() - a.date.getTime())
                  .map((ligne) => {
                    const facture = factures.find((f) => f.id === ligne.id);
                    return (
                      <tr key={`${ligne.id}-${ligne.numero}-${ligne.date.getTime()}`}>
                        <td>{ligne.numero}</td>
                        <td>{formaterDate(ligne.date)}</td>
                        <td>{ligne.quantite}</td>
                        <td>{formaterMontant(ligne.montantHT)}</td>
                        <td>
                          <button
                            type="button"
                            className="statistiques__action-btn"
                            onClick={() => facture && onVoirFacture?.(facture)}
                          >
                            Voir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}



