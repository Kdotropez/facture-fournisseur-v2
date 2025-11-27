/**
 * Composant pour afficher et charger les fichiers PDF disponibles
 * dans les dossiers fournisseurs
 */

import { useState } from 'react';
import { FileText, Upload, CheckCircle2, Loader2 } from 'lucide-react';
import { fichiersFactures, obtenirFichiersParFournisseur, obtenirStatistiquesFichiers } from '../services/fichiersFactures';
import type { Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import './ListeFichiersDisponibles.css';

interface ListeFichiersDisponiblesProps {
  onChargerFichier: (chemin: string, fournisseur: Fournisseur) => Promise<void>;
  facturesChargees: string[]; // Liste des chemins de factures déjà chargées
  chargementEnCours?: string | null; // Chemin du fichier en cours de chargement
}

export function ListeFichiersDisponibles({
  onChargerFichier,
  facturesChargees,
  chargementEnCours,
}: ListeFichiersDisponiblesProps) {
  const [fournisseurFiltre, setFournisseurFiltre] = useState<Fournisseur | 'TOUS'>('TOUS');
  const stats = obtenirStatistiquesFichiers();

  const fichiersAffiches = fournisseurFiltre === 'TOUS'
    ? fichiersFactures
    : obtenirFichiersParFournisseur(fournisseurFiltre);

  const estCharge = (chemin: string) => {
    const nomFichier = chemin.split(/[/\\]/).pop() || '';
    return facturesChargees.some(f => f === chemin || f === nomFichier || f.endsWith(nomFichier));
  };
  const estEnChargement = (chemin: string) => chargementEnCours === chemin;

  const handleChargerFichier = async (fichier: typeof fichiersFactures[0]) => {
    if (estCharge(fichier.chemin) || estEnChargement(fichier.chemin)) {
      console.log('Fichier déjà chargé ou en cours de chargement');
      return;
    }
    console.log('Début du chargement du fichier:', fichier.nom);
    try {
      await onChargerFichier(fichier.chemin, fichier.fournisseur);
      console.log('Chargement terminé avec succès');
    } catch (error) {
      console.error('Erreur lors du chargement:', error);
    }
  };

  const handleChargerTous = async () => {
    for (const fichier of fichiersAffiches) {
      if (!estCharge(fichier.chemin) && !estEnChargement(fichier.chemin)) {
        await onChargerFichier(fichier.chemin, fichier.fournisseur);
      }
    }
  };

  return (
    <div className="liste-fichiers">
      <div className="liste-fichiers__header">
        <div>
          <h3>Fichiers PDF disponibles dans les dossiers</h3>
          <p className="liste-fichiers__stats">
            {stats.total} fichier{stats.total > 1 ? 's' : ''} disponible{stats.total > 1 ? 's' : ''}
            {' • '}
            RB DRINKS: {stats.parFournisseur['RB DRINKS']} • 
            LEHMANN F: {stats.parFournisseur['LEHMANN F']} • 
            ITALESSE: {stats.parFournisseur['ITALESSE']}
          </p>
        </div>
        <div className="liste-fichiers__filtres">
          <select
            value={fournisseurFiltre}
            onChange={(e) => setFournisseurFiltre(e.target.value as Fournisseur | 'TOUS')}
            className="liste-fichiers__select"
          >
            <option value="TOUS">Tous les fournisseurs</option>
            {obtenirFournisseurs().map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          {fichiersAffiches.length > 0 && (
            <button
              type="button"
              onClick={handleChargerTous}
              className="liste-fichiers__btn-tous"
              disabled={fichiersAffiches.every(f => estCharge(f.chemin) || estEnChargement(f.chemin))}
            >
              <Upload size={16} />
              Charger tous ({fichiersAffiches.filter(f => !estCharge(f.chemin)).length})
            </button>
          )}
        </div>
      </div>

      <div className="liste-fichiers__grid">
        {fichiersAffiches.map(fichier => {
          const charge = estCharge(fichier.chemin);
          const enChargement = estEnChargement(fichier.chemin);

          return (
            <div
              key={fichier.chemin}
              className={`liste-fichiers__card ${charge ? 'liste-fichiers__card--chargee' : ''}`}
            >
              <div className="liste-fichiers__card-header">
                <FileText size={24} />
                <span className="liste-fichiers__badge">{fichier.fournisseur}</span>
              </div>
              <div className="liste-fichiers__card-body">
                <p className="liste-fichiers__nom">{fichier.nom}</p>
                <p className="liste-fichiers__chemin" title={fichier.chemin}>
                  {fichier.chemin.length > 40 ? fichier.chemin.substring(0, 40) + '...' : fichier.chemin}
                </p>
                <p className="liste-fichiers__info">
                  Cliquez sur "Charger" puis sélectionnez ce fichier depuis le dossier "{fichier.chemin.split('/')[0]}"
                </p>
              </div>
              <div className="liste-fichiers__card-footer">
                {charge ? (
                  <div className="liste-fichiers__status liste-fichiers__status--chargee">
                    <CheckCircle2 size={16} />
                    <span>Chargée</span>
                  </div>
                ) : enChargement ? (
                  <div className="liste-fichiers__status liste-fichiers__status--chargement">
                    <Loader2 size={16} className="liste-fichiers__spinner" />
                    <span>Chargement...</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleChargerFichier(fichier)}
                    className="liste-fichiers__btn-charger"
                  >
                    <Upload size={16} />
                    Charger
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {fichiersAffiches.length === 0 && (
        <div className="liste-fichiers__empty">
          <FileText size={48} />
          <p>Aucun fichier disponible pour ce fournisseur</p>
        </div>
      )}
    </div>
  );
}


