/**
 * Composant pour afficher et charger les fichiers PDF disponibles
 * dans les dossiers fournisseurs
 */

import { useState, useEffect, useRef } from 'react';
import { FileText, Upload, CheckCircle2, Loader2, RefreshCw, Plus } from 'lucide-react';
import { fichiersFactures, scannerFichiersDisponibles, type FichierFacture, ajouterFichierManuel } from '../services/fichiersFactures';
import type { Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import './ListeFichiersDisponibles.css';

interface ListeFichiersDisponiblesProps {
  onChargerFichier: (chemin: string, fournisseur: Fournisseur) => Promise<void>;
  onChargerAvecControle?: (chemin: string, fournisseur: Fournisseur) => void;
  facturesChargees: string[]; // Liste des chemins de factures déjà chargées
  chargementEnCours?: string | null; // Chemin du fichier en cours de chargement
}

export function ListeFichiersDisponibles({
  onChargerFichier,
  onChargerAvecControle,
  facturesChargees,
  chargementEnCours,
}: ListeFichiersDisponiblesProps) {
  const [fournisseurFiltre, setFournisseurFiltre] = useState<Fournisseur | 'TOUS'>('TOUS');
  const [actualisationEnCours, setActualisationEnCours] = useState(false);
  const [fichiersListe, setFichiersListe] = useState<FichierFacture[]>(fichiersFactures);
  const [afficherAjoutManuel, setAfficherAjoutManuel] = useState(false);
  const [nouveauFichierNom, setNouveauFichierNom] = useState('');
  const [nouveauFichierChemin, setNouveauFichierChemin] = useState('');
  const [nouveauFichierFournisseur, setNouveauFichierFournisseur] = useState<Fournisseur>('ITALESSE');
  const [messageScan, setMessageScan] = useState<string | null>(null);
  const [menuOuvert, setMenuOuvert] = useState<string | null>(null); // Chemin du fichier pour lequel le menu est ouvert
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermer le menu si on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOuvert(null);
      }
    };

    if (menuOuvert) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOuvert]);

  // Scanner les fichiers au chargement du composant
  useEffect(() => {
    const chargerFichiers = async () => {
      try {
        const fichiers = await scannerFichiersDisponibles();
        setFichiersListe(fichiers);
      } catch (error) {
        console.error('Erreur lors du scan initial:', error);
      }
    };
    chargerFichiers();
  }, []);

  const handleActualiser = async () => {
    setActualisationEnCours(true);
    setMessageScan(null);
    try {
      console.log('[UI] Début de l\'actualisation...');
      const fichiers = await scannerFichiersDisponibles();
      setFichiersListe(fichiers);
      
      const fichiersItalesse = fichiers.filter(f => f.fournisseur === 'ITALESSE');
      const message = `Scan terminé : ${fichiers.length} fichier(s) trouvé(s) au total (${fichiersItalesse.length} ITALESSE)`;
      setMessageScan(message);
      console.log('[UI] Actualisation terminée, fichiers trouvés:', fichiers.length);
      console.log('[UI] Liste mise à jour:', fichiers.map(f => f.nom));
      
      // Effacer le message après 5 secondes
      setTimeout(() => setMessageScan(null), 5000);
    } catch (error) {
      console.error('[UI] Erreur lors de l\'actualisation:', error);
      setMessageScan(`Erreur lors de l'actualisation: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      setTimeout(() => setMessageScan(null), 5000);
    } finally {
      setActualisationEnCours(false);
    }
  };

  const fichiersAffiches = fournisseurFiltre === 'TOUS'
    ? fichiersListe
    : fichiersListe.filter(f => f.fournisseur === fournisseurFiltre);

  const stats = {
    total: fichiersListe.length,
    parFournisseur: {
      'RB DRINKS': fichiersListe.filter(f => f.fournisseur === 'RB DRINKS').length,
      'LEHMANN F': fichiersListe.filter(f => f.fournisseur === 'LEHMANN F').length,
      'ITALESSE': fichiersListe.filter(f => f.fournisseur === 'ITALESSE').length,
    },
  };

  const estCharge = (chemin: string) => {
    const nomFichier = chemin.split(/[/\\]/).pop() || '';
    return facturesChargees.some(f => f === chemin || f === nomFichier || f.endsWith(nomFichier));
  };
  const estEnChargement = (chemin: string) => chargementEnCours === chemin;

  const handleChargerFichier = async (fichier: FichierFacture) => {
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
    const fichiersACharger = fichiersAffiches.filter(f => !estCharge(f.chemin) && !estEnChargement(f.chemin));
    
    // Charger tous les fichiers en parallèle (ou séquentiellement si nécessaire)
    for (const fichier of fichiersACharger) {
      try {
        await onChargerFichier(fichier.chemin, fichier.fournisseur);
        // Petit délai entre chaque chargement pour éviter de surcharger
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Erreur lors du chargement de ${fichier.nom}:`, error);
        // Continuer avec les autres fichiers même en cas d'erreur
      }
    }
    
    // Attendre un peu plus après le dernier chargement pour que toutes les sauvegardes soient terminées
    await new Promise(resolve => setTimeout(resolve, 300));
  };

  const handleAjouterFichierManuel = () => {
    if (!nouveauFichierNom || !nouveauFichierChemin) {
      alert('Veuillez remplir le nom et le chemin du fichier');
      return;
    }

    ajouterFichierManuel(nouveauFichierNom, nouveauFichierChemin, nouveauFichierFournisseur);
    
    // Mettre à jour la liste
    setFichiersListe([...fichiersListe, {
      nom: nouveauFichierNom,
      chemin: nouveauFichierChemin,
      fournisseur: nouveauFichierFournisseur,
    }]);

    // Réinitialiser le formulaire
    setNouveauFichierNom('');
    setNouveauFichierChemin('');
    setAfficherAjoutManuel(false);
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
          <button
            type="button"
            onClick={handleActualiser}
            className="liste-fichiers__btn-actualiser"
            disabled={actualisationEnCours}
            title="Actualiser la liste des fichiers disponibles"
          >
            <RefreshCw size={16} className={actualisationEnCours ? 'liste-fichiers__spinner' : ''} />
            Actualiser
          </button>
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
          <button
            type="button"
            onClick={() => setAfficherAjoutManuel(!afficherAjoutManuel)}
            className="liste-fichiers__btn-ajouter"
            title="Ajouter un fichier manuellement"
          >
            <Plus size={16} />
            Ajouter
          </button>
        </div>
      </div>

      {afficherAjoutManuel && (
        <div className="liste-fichiers__ajout-manuel">
          <h4>Ajouter un fichier manuellement</h4>
          <div className="liste-fichiers__ajout-form">
            <div>
              <label htmlFor="nouveau-nom">Nom du fichier :</label>
              <input
                id="nouveau-nom"
                type="text"
                value={nouveauFichierNom}
                onChange={(e) => setNouveauFichierNom(e.target.value)}
                placeholder="ex: I3.pdf"
                className="liste-fichiers__input-ajout"
              />
            </div>
            <div>
              <label htmlFor="nouveau-chemin">Chemin (dossier/fichier) :</label>
              <input
                id="nouveau-chemin"
                type="text"
                value={nouveauFichierChemin}
                onChange={(e) => setNouveauFichierChemin(e.target.value)}
                placeholder="ex: ITALESSE 2025/I3.pdf"
                className="liste-fichiers__input-ajout"
              />
            </div>
            <div>
              <label htmlFor="nouveau-fournisseur">Fournisseur :</label>
              <select
                id="nouveau-fournisseur"
                value={nouveauFichierFournisseur}
                onChange={(e) => setNouveauFichierFournisseur(e.target.value as Fournisseur)}
                className="liste-fichiers__select-ajout"
              >
                {obtenirFournisseurs().map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="liste-fichiers__ajout-actions">
              <button
                type="button"
                onClick={handleAjouterFichierManuel}
                className="liste-fichiers__btn-confirmer"
              >
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => {
                  setAfficherAjoutManuel(false);
                  setNouveauFichierNom('');
                  setNouveauFichierChemin('');
                }}
                className="liste-fichiers__btn-annuler"
              >
                Annuler
              </button>
            </div>
            </div>
          </div>
      )}

      {messageScan && (
        <div className="liste-fichiers__message-scan">
          {messageScan}
        </div>
      )}

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
                  Le fichier sera chargé directement depuis le dossier public/
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
                  <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      type="button"
                      onClick={() => setMenuOuvert(menuOuvert === fichier.chemin ? null : fichier.chemin)}
                      className="liste-fichiers__btn-charger"
                    >
                      <Upload size={16} />
                      Charger
                    </button>
                    {menuOuvert === fichier.chemin && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: '0.25rem',
                        background: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        zIndex: 10,
                        minWidth: '200px',
                      }}>
                        <button
                          type="button"
                          onClick={() => {
                            handleChargerFichier(fichier);
                            setMenuOuvert(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.75rem 1rem',
                            border: 'none',
                            background: 'white',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            borderBottom: onChargerAvecControle ? '1px solid #e5e7eb' : 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        >
                          <Upload size={16} />
                          Charger automatiquement
                        </button>
                        {onChargerAvecControle && (
                          <button
                            type="button"
                            onClick={() => {
                              onChargerAvecControle(fichier.chemin, fichier.fournisseur);
                              setMenuOuvert(null);
                            }}
                            style={{
                              width: '100%',
                              padding: '0.75rem 1rem',
                              border: 'none',
                              background: 'white',
                              textAlign: 'left',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                          >
                            <FileText size={16} />
                            Charger avec contrôle
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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


