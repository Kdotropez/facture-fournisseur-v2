/**
 * Composant d'affichage des statistiques globales
 */

import { TrendingUp, FileText, Building2, Euro } from 'lucide-react';
import type { Statistiques } from '../types/facture';
import './Statistiques.css';

interface StatistiquesProps {
  statistiques: Statistiques;
}

export function StatistiquesComponent({ statistiques }: StatistiquesProps) {
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
        <div className="statistiques__fournisseurs">
          {fournisseurs.map(([fournisseur, stats]) => (
            <div key={fournisseur} className="statistiques__fournisseur-card">
              <div className="statistiques__fournisseur-header">
                <h4 className="statistiques__fournisseur-name">{fournisseur}</h4>
                <span className="statistiques__fournisseur-count">
                  {stats.nombre} facture{stats.nombre > 1 ? 's' : ''}
                </span>
              </div>
              <div className="statistiques__fournisseur-totaux">
                <div className="statistiques__fournisseur-total">
                  <span className="statistiques__fournisseur-total-label">HT</span>
                  <span className="statistiques__fournisseur-total-value">
                    {formaterMontant(stats.totalHT)}
                  </span>
                </div>
                <div className="statistiques__fournisseur-total">
                  <span className="statistiques__fournisseur-total-label">TVA</span>
                  <span className="statistiques__fournisseur-total-value">
                    {formaterMontant(stats.totalTVA)}
                  </span>
                </div>
                <div className="statistiques__fournisseur-total statistiques__fournisseur-total--ttc">
                  <span className="statistiques__fournisseur-total-label">TTC</span>
                  <span className="statistiques__fournisseur-total-value">
                    {formaterMontant(stats.totalTTC)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}



