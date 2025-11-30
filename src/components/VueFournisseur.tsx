/**
 * Vue compacte et professionnelle pour un ou plusieurs fournisseurs sélectionnés
 * Affiche les factures, montants dus, et statistiques
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import { Building2, FileText, Euro, Calendar, TrendingUp, X, Filter, CheckSquare, Square, Plus, CreditCard, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Facture, Fournisseur } from '../types/facture';
import { 
  calculerEtatReglement, 
  ajouterReglement, 
  chargerReglements,
  creerAcomptesPrevu,
  creerAcomptesPrevuAvecPourcentage,
  obtenirReglePaiement,
  obtenirReglementsFacture,
  mettreAJourReglement
} from '../services/reglementService';
import { obtenirFournisseurs } from '@parsers/index';
import './VueFournisseur.css';

// Fonction pour obtenir l'exercice fiscal d'une date
// Exercice fiscal : 1er décembre au 30 novembre
function obtenirExerciceFiscal(date: Date): string {
  const annee = date.getFullYear();
  const mois = date.getMonth() + 1; // getMonth() retourne 0-11
  
  // Si le mois est décembre (12), l'exercice commence cette année
  // Sinon, l'exercice a commencé l'année précédente
  if (mois === 12) {
    return `${annee}-${annee + 1}`;
  } else {
    return `${annee - 1}-${annee}`;
  }
}

// Fonction pour obtenir toutes les années d'exercice disponibles depuis les factures
function obtenirExercicesDisponibles(factures: Facture[]): string[] {
  const exercices = new Set<string>();
  factures.forEach(facture => {
    const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
    exercices.add(obtenirExerciceFiscal(dateFacture));
  });
  return Array.from(exercices).sort().reverse(); // Plus récent en premier
}

interface VueFournisseurProps {
  fournisseursSelectionnes: Fournisseur[];
  toutesLesFactures: Facture[];
  onFournisseursChange: (fournisseurs: Fournisseur[]) => void;
  onClose: () => void;
  onFactureSelect?: (facture: Facture) => void;
  onFactureUpdate?: () => void; // Callback pour forcer la mise à jour des factures
}

export function VueFournisseur({ 
  fournisseursSelectionnes, 
  toutesLesFactures, 
  onFournisseursChange,
  onClose, 
  onFactureSelect,
  onFactureUpdate
}: VueFournisseurProps) {
  const [filtreOuvert, setFiltreOuvert] = useState(false);
  const [filtreExerciceOuvert, setFiltreExerciceOuvert] = useState(false);
  const [exercicesSelectionnes, setExercicesSelectionnes] = useState<string[]>([]);
  const [afficherModalAcomptes, setAfficherModalAcomptes] = useState(false);
  const [facturePourAcomptes, setFacturePourAcomptes] = useState<Facture | null>(null);
  const [pourcentageAcompte, setPourcentageAcompte] = useState<number>(30);
  const [afficherModalReglement, setAfficherModalReglement] = useState(false);
  const [facturePourReglement, setFacturePourReglement] = useState<Facture | null>(null);
  const [colonneTri, setColonneTri] = useState<string>('');
  const [directionTri, setDirectionTri] = useState<'asc' | 'desc'>('asc');
  const tousLesFournisseurs = obtenirFournisseurs();
  const filtreContainerRef = useRef<HTMLDivElement>(null);
  const filtreExerciceContainerRef = useRef<HTMLDivElement>(null);
  
  // Déterminer si on doit afficher la colonne fournisseur
  const afficherColonneFournisseur = fournisseursSelectionnes.length === 0 || fournisseursSelectionnes.length > 1;

  // Fonction pour gérer le tri
  const handleTri = (colonne: string) => {
    if (colonneTri === colonne) {
      // Inverser la direction si on clique sur la même colonne
      setDirectionTri(directionTri === 'asc' ? 'desc' : 'asc');
    } else {
      // Nouvelle colonne, trier par ordre croissant
      setColonneTri(colonne);
      setDirectionTri('asc');
    }
  };

  // Fermer les dropdowns quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filtreContainerRef.current && !filtreContainerRef.current.contains(event.target as Node)) {
        setFiltreOuvert(false);
      }
      if (filtreExerciceContainerRef.current && !filtreExerciceContainerRef.current.contains(event.target as Node)) {
        setFiltreExerciceOuvert(false);
      }
    };

    if (filtreOuvert || filtreExerciceOuvert) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [filtreOuvert, filtreExerciceOuvert]);
  
  // Obtenir les exercices disponibles
  const exercicesDisponibles = useMemo(() => {
    return obtenirExercicesDisponibles(toutesLesFactures);
  }, [toutesLesFactures]);
  
  // Si aucun exercice n'est sélectionné, sélectionner le plus récent par défaut
  useEffect(() => {
    if (exercicesSelectionnes.length === 0 && exercicesDisponibles.length > 0) {
      setExercicesSelectionnes([exercicesDisponibles[0]]);
    }
  }, [exercicesDisponibles, exercicesSelectionnes.length]);

  // État local pour forcer le re-render
  const [forceUpdate, setForceUpdate] = useState(0);

  // Forcer la mise à jour quand toutesLesFactures change
  useEffect(() => {
    const ids = toutesLesFactures.map(f => f.id).join(',');
    setForceUpdate(prev => prev + 1);
    console.log('[VueFournisseur] Mise à jour forcée, factures:', toutesLesFactures.length, 'IDs:', ids.substring(0, 100));
  }, [toutesLesFactures.length, toutesLesFactures.map(f => f.id).join(',')]);

  // Fonction pour normaliser le nom du fournisseur
  const normaliserFournisseur = (fournisseur: string): string => {
    const upper = fournisseur.toUpperCase();
    if (upper.includes('LEHMANN')) {
      return 'LEHMANN F';
    }
    return fournisseur;
  };

  // Filtrer les factures selon les fournisseurs sélectionnés et l'exercice
  const factures = useMemo(() => {
    let facturesFiltrees = toutesLesFactures;
    
    // Filtrer par fournisseur
    if (fournisseursSelectionnes.length > 0) {
      const fournisseursNormalises = fournisseursSelectionnes.map(normaliserFournisseur);
      facturesFiltrees = facturesFiltrees.filter(f => {
        const fournisseurNorm = normaliserFournisseur(f.fournisseur);
        return fournisseursNormalises.includes(fournisseurNorm);
      });
    }
    
    // Filtrer par exercice fiscal
    if (exercicesSelectionnes.length > 0) {
      facturesFiltrees = facturesFiltrees.filter(f => {
        const dateFacture = f.date instanceof Date ? f.date : new Date(f.date);
        const exerciceFacture = obtenirExerciceFiscal(dateFacture);
        return exercicesSelectionnes.includes(exerciceFacture);
      });
    }
    
    const facturesParFournisseur = toutesLesFactures.reduce((acc, f) => {
      const fournisseurNorm = normaliserFournisseur(f.fournisseur);
      acc[fournisseurNorm] = (acc[fournisseurNorm] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('[VueFournisseur] Recalcul des factures filtrées', {
      totalFactures: toutesLesFactures.length,
      fournisseursSelectionnes: fournisseursSelectionnes,
      exercicesSelectionnes: exercicesSelectionnes,
      facturesParFournisseur,
      facturesFiltrees: facturesFiltrees.length,
      toutesLesFacturesLehmann: toutesLesFactures.filter(f => 
        normaliserFournisseur(f.fournisseur) === 'LEHMANN F'
      ).map(f => ({ numero: f.numero, fournisseur: f.fournisseur, fichierPDF: f.fichierPDF, exercice: obtenirExerciceFiscal(f.date instanceof Date ? f.date : new Date(f.date)) })),
      forceUpdate
    });
    
    console.log('[VueFournisseur] Détail factures filtrées:', facturesFiltrees.map(f => ({
      numero: f.numero,
      fournisseur: f.fournisseur,
      fichierPDF: f.fichierPDF,
      exercice: obtenirExerciceFiscal(f.date instanceof Date ? f.date : new Date(f.date))
    })));
    
    // Appliquer le tri si une colonne est sélectionnée
    if (colonneTri) {
      facturesFiltrees = [...facturesFiltrees].sort((a, b) => {
        let valeurA: string | number | Date;
        let valeurB: string | number | Date;
        
        switch (colonneTri) {
          case 'numero':
            valeurA = a.numero;
            valeurB = b.numero;
            break;
          case 'fournisseur':
            valeurA = a.fournisseur;
            valeurB = b.fournisseur;
            break;
          case 'date':
            valeurA = a.date instanceof Date ? a.date : new Date(a.date);
            valeurB = b.date instanceof Date ? b.date : new Date(b.date);
            break;
          case 'totalTTC':
            valeurA = a.totalTTC;
            valeurB = b.totalTTC;
            break;
          case 'etat':
            const etatA = calculerEtatReglement(a);
            const etatB = calculerEtatReglement(b);
            valeurA = etatA.etat;
            valeurB = etatB.etat;
            break;
          case 'restantDu':
            const etatARestant = calculerEtatReglement(a);
            const etatBRestant = calculerEtatReglement(b);
            valeurA = etatARestant.montantRestant;
            valeurB = etatBRestant.montantRestant;
            break;
          default:
            return 0;
        }
        
        // Comparaison
        let resultat = 0;
        if (valeurA < valeurB) {
          resultat = -1;
        } else if (valeurA > valeurB) {
          resultat = 1;
        }
        
        return directionTri === 'asc' ? resultat : -resultat;
      });
    }
    
    return facturesFiltrees;
  }, [toutesLesFactures, fournisseursSelectionnes, exercicesSelectionnes, forceUpdate, colonneTri, directionTri]);

  const formaterMontant = (montant: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(montant);

  const formaterDate = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);

  const toggleFournisseur = (fournisseur: Fournisseur) => {
    if (fournisseursSelectionnes.includes(fournisseur)) {
      onFournisseursChange(fournisseursSelectionnes.filter(f => f !== fournisseur));
    } else {
      onFournisseursChange([...fournisseursSelectionnes, fournisseur]);
    }
    setFiltreOuvert(false);
  };

  const toggleTousLesFournisseurs = () => {
    if (fournisseursSelectionnes.length === tousLesFournisseurs.length) {
      onFournisseursChange([]);
    } else {
      onFournisseursChange([...tousLesFournisseurs]);
    }
    setFiltreOuvert(false);
  };

  const toggleExercice = (exercice: string) => {
    if (exercicesSelectionnes.includes(exercice)) {
      setExercicesSelectionnes(exercicesSelectionnes.filter(e => e !== exercice));
    } else {
      setExercicesSelectionnes([...exercicesSelectionnes, exercice]);
    }
    setFiltreExerciceOuvert(false);
  };

  const toggleTousLesExercices = () => {
    if (exercicesSelectionnes.length === exercicesDisponibles.length) {
      setExercicesSelectionnes([]);
    } else {
      setExercicesSelectionnes([...exercicesDisponibles]);
    }
    setFiltreExerciceOuvert(false);
  };

  // Calculer les statistiques pour les fournisseurs sélectionnés
  const statistiques = useMemo(() => {
    // Calculer les montants dus
    const montantDu = factures.reduce((total, facture) => {
      const etat = calculerEtatReglement(facture);
      if (etat.etat === 'non_regle' || etat.etat === 'partiel') {
        return total + etat.montantRestant;
      }
      return total;
    }, 0);

    const montantRegle = factures.reduce((total, facture) => {
      const etat = calculerEtatReglement(facture);
      return total + etat.montantRegle;
    }, 0);

    return {
      totalFactures: factures.length,
      totalHT: factures.reduce((sum, f) => sum + f.totalHT, 0),
      totalTTC: factures.reduce((sum, f) => sum + f.totalTTC, 0),
      montantDu,
      montantRegle,
    };
  }, [factures]);

  const getBadgeEtat = (etat: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      non_regle: { bg: '#fee2e2', text: '#dc2626', label: 'Non réglé' },
      partiel: { bg: '#fef3c7', text: '#d97706', label: 'Partiel' },
      regle: { bg: '#d1fae5', text: '#059669', label: 'Réglé' },
      depasse: { bg: '#fce7f3', text: '#be185d', label: 'Dépassé' },
    };
    return styles[etat] || { bg: '#f3f4f6', text: '#6b7280', label: etat };
  };

  // Fonction pour ouvrir la modale de règlement
  const handleOuvrirModalReglement = (facture: Facture) => {
    setFacturePourReglement(facture);
    setAfficherModalReglement(true);
  };

  // Fonction pour créer des acomptes prévus
  const handleCreerAcomptes = (facture: Facture) => {
    const regle = obtenirReglePaiement(facture.fournisseur);
    
    // Si le fournisseur nécessite un pourcentage d'acompte (RB DRINKS, ITALESSE)
    if (regle?.paiementAvance && regle.pourcentageAcompte !== undefined) {
      setFacturePourAcomptes(facture);
      setPourcentageAcompte(regle.pourcentageAcompte);
      setAfficherModalAcomptes(true);
    } else {
      // Sinon, créer directement les acomptes (LEHMANN F)
      const nouveauxReglements = creerAcomptesPrevu(facture);
      nouveauxReglements.forEach(reglement => ajouterReglement(reglement));
      onFactureUpdate?.();
      setForceUpdate(prev => prev + 1);
    }
  };

  // Fonction pour créer des acomptes avec pourcentage
  const handleCreerAcomptesAvecPourcentage = (facture: Facture, pourcentage: number) => {
    const regle = obtenirReglePaiement(facture.fournisseur);
    if (!regle) return;
    
    // Mettre à jour le pourcentage dans la règle
    const regleAvecPourcentage = { ...regle, pourcentageAcompte: pourcentage };
    const nouveauxReglements = creerAcomptesPrevuAvecPourcentage(facture, regleAvecPourcentage);
    nouveauxReglements.forEach(reglement => ajouterReglement(reglement));
    setAfficherModalAcomptes(false);
    setFacturePourAcomptes(null);
    onFactureUpdate?.();
    setForceUpdate(prev => prev + 1);
  };

  // Fonction pour régler un acompte en attente
  const handleReglerAcompte = (facture: Facture) => {
    const reglements = obtenirReglementsFacture(facture.id);
    const reglementsEnAttente = reglements.filter(r => r.statut === 'en_attente');
    
    if (reglementsEnAttente.length === 0) {
      alert('Aucun acompte en attente pour cette facture.');
      return;
    }

    // Régler le premier acompte en attente
    const premierAcompte = reglementsEnAttente[0];
    mettreAJourReglement(premierAcompte.id, {
      statut: 'paye',
      dateReglement: new Date(),
    });
    
    onFactureUpdate?.();
    setForceUpdate(prev => prev + 1);
  };

  const titreFournisseurs = fournisseursSelectionnes.length === 0 
    ? 'Tous les fournisseurs'
    : fournisseursSelectionnes.length === 1
    ? fournisseursSelectionnes[0]
    : `${fournisseursSelectionnes.length} fournisseurs`;

  return (
    <div className="vue-fournisseur">
      <div className="vue-fournisseur__header">
        <div className="vue-fournisseur__header-content">
          <Building2 size={24} />
          <div>
            <h2 className="vue-fournisseur__title">{titreFournisseurs}</h2>
            <p className="vue-fournisseur__subtitle">{statistiques.totalFactures} facture(s)</p>
          </div>
        </div>
        <div className="vue-fournisseur__header-actions">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div className="vue-fournisseur__filtre-container" ref={filtreContainerRef}>
              <button
                type="button"
                onClick={() => setFiltreOuvert(!filtreOuvert)}
                className={`vue-fournisseur__filtre-btn ${filtreOuvert ? 'vue-fournisseur__filtre-btn--active' : ''}`}
              >
                <Filter size={18} />
                {fournisseursSelectionnes.length === 0 
                  ? 'Tous les fournisseurs'
                  : fournisseursSelectionnes.length === 1
                  ? fournisseursSelectionnes[0]
                  : `${fournisseursSelectionnes.length} sélectionné(s)`}
              </button>
              {filtreOuvert && (
                <div className="vue-fournisseur__filtre-dropdown">
                  <button
                    type="button"
                    onClick={toggleTousLesFournisseurs}
                    className="vue-fournisseur__filtre-option"
                  >
                    {fournisseursSelectionnes.length === tousLesFournisseurs.length ? (
                      <CheckSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                    <span>Tous les fournisseurs</span>
                  </button>
                  {tousLesFournisseurs.map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleFournisseur(f)}
                      className="vue-fournisseur__filtre-option"
                    >
                      {fournisseursSelectionnes.includes(f) ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                      <span>{f}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="vue-fournisseur__filtre-container" ref={filtreExerciceContainerRef}>
              <button
                type="button"
                onClick={() => setFiltreExerciceOuvert(!filtreExerciceOuvert)}
                className={`vue-fournisseur__filtre-btn ${filtreExerciceOuvert ? 'vue-fournisseur__filtre-btn--active' : ''}`}
              >
                <Calendar size={18} />
                {exercicesSelectionnes.length === 0 
                  ? 'Tous les exercices'
                  : exercicesSelectionnes.length === 1
                  ? `Exercice ${exercicesSelectionnes[0]}`
                  : `${exercicesSelectionnes.length} exercices`}
              </button>
              {filtreExerciceOuvert && (
                <div className="vue-fournisseur__filtre-dropdown">
                  <button
                    type="button"
                    onClick={toggleTousLesExercices}
                    className="vue-fournisseur__filtre-option"
                  >
                    {exercicesSelectionnes.length === exercicesDisponibles.length ? (
                      <CheckSquare size={16} />
                    ) : (
                      <Square size={16} />
                    )}
                    <span>Tous les exercices</span>
                  </button>
                  {exercicesDisponibles.map(exercice => (
                    <button
                      key={exercice}
                      type="button"
                      onClick={() => toggleExercice(exercice)}
                      className="vue-fournisseur__filtre-option"
                    >
                      {exercicesSelectionnes.includes(exercice) ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                      <span>Exercice {exercice}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="vue-fournisseur__stats-grid">
        <div className="vue-fournisseur__stat-card vue-fournisseur__stat-card--primary">
          <div className="vue-fournisseur__stat-icon">
            <Euro size={20} />
          </div>
          <div className="vue-fournisseur__stat-content">
            <span className="vue-fournisseur__stat-label">Total TTC</span>
            <span className="vue-fournisseur__stat-value">{formaterMontant(statistiques.totalTTC)}</span>
          </div>
        </div>

        <div className="vue-fournisseur__stat-card vue-fournisseur__stat-card--warning">
          <div className="vue-fournisseur__stat-icon">
            <TrendingUp size={20} />
          </div>
          <div className="vue-fournisseur__stat-content">
            <span className="vue-fournisseur__stat-label">Montant dû</span>
            <span className="vue-fournisseur__stat-value">{formaterMontant(statistiques.montantDu)}</span>
          </div>
        </div>

        <div className="vue-fournisseur__stat-card vue-fournisseur__stat-card--success">
          <div className="vue-fournisseur__stat-icon">
            <FileText size={20} />
          </div>
          <div className="vue-fournisseur__stat-content">
            <span className="vue-fournisseur__stat-label">Montant réglé</span>
            <span className="vue-fournisseur__stat-value">{formaterMontant(statistiques.montantRegle)}</span>
          </div>
        </div>

        <div className="vue-fournisseur__stat-card">
          <div className="vue-fournisseur__stat-icon">
            <Calendar size={20} />
          </div>
          <div className="vue-fournisseur__stat-content">
            <span className="vue-fournisseur__stat-label">Total HT</span>
            <span className="vue-fournisseur__stat-value">{formaterMontant(statistiques.totalHT)}</span>
          </div>
        </div>
      </div>

      <div className="vue-fournisseur__factures">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 className="vue-fournisseur__section-title">Factures</h3>
          <button
            type="button"
            onClick={() => {
              console.log('[VueFournisseur] DIAGNOSTIC - Toutes les factures:', toutesLesFactures.map(f => ({
                id: f.id,
                numero: f.numero,
                fournisseur: f.fournisseur,
                fichierPDF: f.fichierPDF,
                date: f.date
              })));
              console.log('[VueFournisseur] DIAGNOSTIC - Factures filtrées:', factures.map(f => ({
                id: f.id,
                numero: f.numero,
                fournisseur: f.fournisseur,
                fichierPDF: f.fichierPDF
              })));
              alert(`Total factures: ${toutesLesFactures.length}\nFactures filtrées: ${factures.length}\nFournisseurs sélectionnés: ${fournisseursSelectionnes.join(', ') || 'Aucun (tous)'}`);
            }}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #6b7280',
              borderRadius: '6px',
              background: 'white',
              color: '#6b7280',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            🔍 Diagnostic
          </button>
        </div>
        <div className="vue-fournisseur__table-container">
          <table className="vue-fournisseur__table">
            <thead>
              <tr>
                <th 
                  className="vue-fournisseur__table-header vue-fournisseur__table-header--sortable"
                  onClick={() => handleTri('numero')}
                >
                  <div className="vue-fournisseur__table-header-content">
                    <span>Numéro</span>
                    {colonneTri === 'numero' ? (
                      directionTri === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="vue-fournisseur__sort-icon--inactive" />
                    )}
                  </div>
                </th>
                {afficherColonneFournisseur && (
                  <th 
                    className="vue-fournisseur__table-header vue-fournisseur__table-header--sortable"
                    onClick={() => handleTri('fournisseur')}
                  >
                    <div className="vue-fournisseur__table-header-content">
                      <span>Fournisseur</span>
                      {colonneTri === 'fournisseur' ? (
                        directionTri === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                      ) : (
                        <ArrowUpDown size={14} className="vue-fournisseur__sort-icon--inactive" />
                      )}
                    </div>
                  </th>
                )}
                <th 
                  className="vue-fournisseur__table-header vue-fournisseur__table-header--sortable"
                  onClick={() => handleTri('date')}
                >
                  <div className="vue-fournisseur__table-header-content">
                    <span>Date</span>
                    {colonneTri === 'date' ? (
                      directionTri === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="vue-fournisseur__sort-icon--inactive" />
                    )}
                  </div>
                </th>
                <th 
                  className="vue-fournisseur__table-header vue-fournisseur__table-header--sortable"
                  onClick={() => handleTri('totalTTC')}
                >
                  <div className="vue-fournisseur__table-header-content">
                    <span>Total TTC</span>
                    {colonneTri === 'totalTTC' ? (
                      directionTri === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="vue-fournisseur__sort-icon--inactive" />
                    )}
                  </div>
                </th>
                <th 
                  className="vue-fournisseur__table-header vue-fournisseur__table-header--sortable"
                  onClick={() => handleTri('etat')}
                >
                  <div className="vue-fournisseur__table-header-content">
                    <span>État</span>
                    {colonneTri === 'etat' ? (
                      directionTri === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="vue-fournisseur__sort-icon--inactive" />
                    )}
                  </div>
                </th>
                <th 
                  className="vue-fournisseur__table-header vue-fournisseur__table-header--sortable"
                  onClick={() => handleTri('restantDu')}
                >
                  <div className="vue-fournisseur__table-header-content">
                    <span>Restant dû</span>
                    {colonneTri === 'restantDu' ? (
                      directionTri === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />
                    ) : (
                      <ArrowUpDown size={14} className="vue-fournisseur__sort-icon--inactive" />
                    )}
                  </div>
                </th>
                <th className="vue-fournisseur__table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {factures.length === 0 ? (
                <tr>
                  <td colSpan={afficherColonneFournisseur ? 7 : 6} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                    Aucune facture trouvée
                    {fournisseursSelectionnes.length > 0 && (
                      <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                        Fournisseurs sélectionnés: {fournisseursSelectionnes.join(', ')}
                        <br />
                        Total factures dans le système: {toutesLesFactures.length}
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                factures.map((facture) => {
                  const etat = calculerEtatReglement(facture);
                  const badge = getBadgeEtat(etat.etat);
                  return (
                    <tr
                      key={facture.id}
                      className="vue-fournisseur__table-row"
                      onClick={() => onFactureSelect?.(facture)}
                    >
                      <td className="vue-fournisseur__table-cell--numero">{facture.numero}</td>
                      {afficherColonneFournisseur && (
                        <td className="vue-fournisseur__table-cell--fournisseur">
                          <span className="vue-fournisseur__badge vue-fournisseur__badge--fournisseur">
                            {facture.fournisseur}
                          </span>
                        </td>
                      )}
                      <td className="vue-fournisseur__table-cell--date">{formaterDate(facture.date)}</td>
                      <td className="vue-fournisseur__table-cell--montant">{formaterMontant(facture.totalTTC)}</td>
                      <td className="vue-fournisseur__table-cell--etat">
                        <span
                          className="vue-fournisseur__badge"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="vue-fournisseur__table-cell--restant">
                        {etat.montantRestant > 0 ? formaterMontant(etat.montantRestant) : '—'}
                      </td>
                      <td className="vue-fournisseur__table-cell--actions">
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onFactureSelect?.(facture);
                            }}
                            className="vue-fournisseur__action-btn"
                          >
                            Voir
                          </button>
                          {etat.acomptesPrevu && etat.acomptesPrevu.length > 0 && obtenirReglementsFacture(facture.id).length === 0 ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreerAcomptes(facture);
                              }}
                              className="vue-fournisseur__action-btn vue-fournisseur__action-btn--secondary"
                              title="Créer les échéances prévues"
                            >
                              <Plus size={14} />
                            </button>
                          ) : obtenirReglementsFacture(facture.id).some(r => r.statut === 'en_attente') ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReglerAcompte(facture);
                              }}
                              className="vue-fournisseur__action-btn vue-fournisseur__action-btn--success"
                              title="Régler le prochain acompte"
                            >
                              <CreditCard size={14} />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOuvrirModalReglement(facture);
                            }}
                            className="vue-fournisseur__action-btn vue-fournisseur__action-btn--primary"
                            title="Gérer les règlements"
                          >
                            <CreditCard size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de règlement complète */}
      {afficherModalReglement && facturePourReglement && (
        <ModalReglementFacture
          facture={facturePourReglement}
          onSauvegarder={(mode, datesReglement = {}) => {
            const reglements = obtenirReglementsFacture(facturePourReglement.id);
            const reglementsEnAttente = reglements.filter(r => r.statut === 'en_attente');
            
            if (mode === 'complet') {
              // Créer un règlement complet
              const dateReglement = datesReglement['complet']
                ? new Date(datesReglement['complet'])
                : new Date();
              const regle = obtenirReglePaiement(facturePourReglement.fournisseur);
              ajouterReglement({
                factureId: facturePourReglement.id,
                numeroFacture: facturePourReglement.numero,
                fournisseur: facturePourReglement.fournisseur,
                type: 'reglement_complet',
                montant: facturePourReglement.totalTTC,
                dateReglement: dateReglement,
                statut: 'paye',
                modePaiement: regle?.modePaiementDefaut || 'virement',
              });
            } else if (mode === 'existant' && reglementsEnAttente.length > 0) {
              reglementsEnAttente.forEach(reglement => {
                const dateReglement = datesReglement[reglement.id] 
                  ? new Date(datesReglement[reglement.id])
                  : (reglement.dateEcheance || new Date());
                mettreAJourReglement(reglement.id, {
                  statut: 'paye',
                  dateReglement: dateReglement,
                });
              });
            } else if (mode === 'prevu') {
              const regle = obtenirReglePaiement(facturePourReglement.fournisseur);
              if (regle) {
                const dateFacture = new Date(facturePourReglement.date);
                if (facturePourReglement.fournisseur === 'LEHMANN F' && regle.nombreAcomptes === 3) {
                  const montantParTranche = facturePourReglement.totalTTC / 3;
                  const datesEcheance = [
                    new Date(dateFacture.getTime() + 30 * 24 * 60 * 60 * 1000),
                    new Date(dateFacture.getTime() + 60 * 24 * 60 * 60 * 1000),
                    new Date(dateFacture.getTime() + 90 * 24 * 60 * 60 * 1000),
                  ];
                  datesEcheance.forEach((dateEcheance, index) => {
                    const dateReglement = datesReglement[`prevu-${index}`]
                      ? new Date(datesReglement[`prevu-${index}`])
                      : dateEcheance;
                    ajouterReglement({
                      factureId: facturePourReglement.id,
                      numeroFacture: facturePourReglement.numero,
                      fournisseur: facturePourReglement.fournisseur,
                      type: 'reglement_complet',
                      montant: montantParTranche,
                      dateReglement: dateReglement,
                      dateEcheance: dateEcheance,
                      statut: 'paye',
                      modePaiement: regle.modePaiementDefaut || 'virement',
                      notes: `1/3 à ${30 * (index + 1)} jours (FDM)`,
                    });
                  });
                } else {
                  const dateReglement = datesReglement['prevu-0']
                    ? new Date(datesReglement['prevu-0'])
                    : new Date();
                  ajouterReglement({
                    factureId: facturePourReglement.id,
                    numeroFacture: facturePourReglement.numero,
                    fournisseur: facturePourReglement.fournisseur,
                    type: 'reglement_complet',
                    montant: facturePourReglement.totalTTC,
                    dateReglement: dateReglement,
                    statut: 'paye',
                    modePaiement: regle.modePaiementDefaut || 'virement',
                  });
                }
              }
            }
            onFactureUpdate?.();
            setForceUpdate(prev => prev + 1);
            setAfficherModalReglement(false);
            setFacturePourReglement(null);
          }}
          onFermer={() => {
            setAfficherModalReglement(false);
            setFacturePourReglement(null);
          }}
        />
      )}

      {/* Modal pour choisir le pourcentage d'acompte */}
      {afficherModalAcomptes && facturePourAcomptes && (
        <div className="vue-fournisseur__modal-overlay" onClick={() => setAfficherModalAcomptes(false)}>
          <div className="vue-fournisseur__modal" onClick={(e) => e.stopPropagation()}>
            <div className="vue-fournisseur__modal-header">
              <h3>Créer les échéances prévues</h3>
              <button
                type="button"
                onClick={() => setAfficherModalAcomptes(false)}
                className="vue-fournisseur__modal-close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="vue-fournisseur__modal-content">
              <p>Facture: <strong>{facturePourAcomptes.numero}</strong></p>
              <p>Montant total: <strong>{formaterMontant(facturePourAcomptes.totalTTC)}</strong></p>
              <div style={{ marginTop: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Pourcentage d'acompte (%):
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={pourcentageAcompte}
                  onChange={(e) => setPourcentageAcompte(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '1rem',
                  }}
                />
              </div>
            </div>
            <div className="vue-fournisseur__modal-footer">
              <button
                type="button"
                onClick={() => setAfficherModalAcomptes(false)}
                className="vue-fournisseur__modal-btn vue-fournisseur__modal-btn--secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleCreerAcomptesAvecPourcentage(facturePourAcomptes, pourcentageAcompte)}
                className="vue-fournisseur__modal-btn vue-fournisseur__modal-btn--primary"
              >
                Créer les échéances
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Composant Modal pour gérer les règlements d'une facture
interface ModalReglementFactureProps {
  facture: Facture;
  onSauvegarder: (mode: 'existant' | 'prevu' | 'complet', datesReglement?: Record<string, string>) => void;
  onFermer: () => void;
}

function ModalReglementFacture({ facture, onSauvegarder, onFermer }: ModalReglementFactureProps) {
  const [mode, setMode] = useState<'existant' | 'prevu' | 'complet'>('complet');
  const [datesReglement, setDatesReglement] = useState<Record<string, string>>({});
  
  const reglements = obtenirReglementsFacture(facture.id);
  const reglementsEnAttente = reglements.filter(r => r.statut === 'en_attente');
  const reglementsPayes = reglements.filter(r => r.statut === 'paye');
  const etat = calculerEtatReglement(facture);
  
  // Calculer les acomptes prévus
  const regle = obtenirReglePaiement(facture.fournisseur);
  const acomptesPrevu = regle ? (() => {
    const dateFacture = new Date(facture.date);
    if (facture.fournisseur === 'LEHMANN F' && regle.nombreAcomptes === 3) {
      const montantParTranche = facture.totalTTC / 3;
      return [
        { montant: montantParTranche, dateEcheance: new Date(dateFacture.getTime() + 30 * 24 * 60 * 60 * 1000), type: 'solde' as const },
        { montant: montantParTranche, dateEcheance: new Date(dateFacture.getTime() + 60 * 24 * 60 * 60 * 1000), type: 'solde' as const },
        { montant: montantParTranche, dateEcheance: new Date(dateFacture.getTime() + 90 * 24 * 60 * 60 * 1000), type: 'solde' as const },
      ];
    }
    return [];
  })() : [];

  // Initialiser le mode et les dates
  useEffect(() => {
    const reglements = obtenirReglementsFacture(facture.id);
    const reglementsEnAttente = reglements.filter(r => r.statut === 'en_attente');
    const regle = obtenirReglePaiement(facture.fournisseur);
    const acomptesPrevu = regle ? (() => {
      const dateFacture = new Date(facture.date);
      if (facture.fournisseur === 'LEHMANN F' && regle.nombreAcomptes === 3) {
        const montantParTranche = facture.totalTTC / 3;
        return [
          { montant: montantParTranche, dateEcheance: new Date(dateFacture.getTime() + 30 * 24 * 60 * 60 * 1000), type: 'solde' as const },
          { montant: montantParTranche, dateEcheance: new Date(dateFacture.getTime() + 60 * 24 * 60 * 60 * 1000), type: 'solde' as const },
          { montant: montantParTranche, dateEcheance: new Date(dateFacture.getTime() + 90 * 24 * 60 * 60 * 1000), type: 'solde' as const },
        ];
      }
      return [];
    })() : [];
    
    let nouveauMode: 'existant' | 'prevu' | 'complet' = 'complet';
    if (reglementsEnAttente.length > 0) {
      nouveauMode = 'existant';
    } else if (acomptesPrevu.length > 0) {
      nouveauMode = 'prevu';
    }
    setMode(nouveauMode);
    
    const dates: Record<string, string> = {};
    if (nouveauMode === 'existant') {
      reglementsEnAttente.forEach(r => {
        if (r.dateEcheance) {
          dates[r.id] = new Date(r.dateEcheance).toISOString().split('T')[0];
        } else {
          dates[r.id] = new Date().toISOString().split('T')[0];
        }
      });
    } else if (nouveauMode === 'prevu') {
      acomptesPrevu.forEach((a, index) => {
        dates[`prevu-${index}`] = new Date(a.dateEcheance).toISOString().split('T')[0];
      });
    } else {
      // Mode complet : date d'aujourd'hui par défaut
      dates['complet'] = new Date().toISOString().split('T')[0];
    }
    setDatesReglement(dates);
  }, [facture.id, facture.fournisseur, facture.date, facture.totalTTC]);

  const formaterMontant = (montant: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);

  const formaterDate = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSauvegarder(mode, datesReglement);
  };

  const handleMarquerRapide = () => {
    if (mode === 'existant') {
      const dates: Record<string, string> = {};
      reglementsEnAttente.forEach(r => {
        dates[r.id] = new Date().toISOString().split('T')[0];
      });
      onSauvegarder(mode, dates);
    } else if (mode === 'prevu') {
      const dates: Record<string, string> = {};
      acomptesPrevu.forEach((_, index) => {
        dates[`prevu-${index}`] = new Date().toISOString().split('T')[0];
      });
      onSauvegarder(mode, dates);
    } else {
      // Mode complet : créer un règlement complet avec date d'aujourd'hui
      const dates: Record<string, string> = {};
      dates['complet'] = new Date().toISOString().split('T')[0];
      onSauvegarder('complet', dates);
    }
  };

  return (
    <div className="vue-fournisseur__modal-overlay" onClick={onFermer}>
      <div className="vue-fournisseur__modal vue-fournisseur__modal--large" onClick={(e) => e.stopPropagation()}>
        <div className="vue-fournisseur__modal-header">
          <h3>Gestion des règlements - {facture.numero}</h3>
          <button
            type="button"
            onClick={onFermer}
            className="vue-fournisseur__modal-close"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="vue-fournisseur__modal-content">
          {/* Informations de la facture */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <strong>{facture.numero}</strong>
              <span>{facture.fournisseur}</span>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Date: {formaterDate(facture.date)} | Total TTC: {formaterMontant(facture.totalTTC)}
            </div>
          </div>

          {/* Statistiques de règlement */}
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd' }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>État des règlements</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#6b7280' }}>Montant réglé:</span>
                <strong style={{ marginLeft: '0.5rem', color: '#059669' }}>{formaterMontant(etat.montantRegle)}</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>Restant dû:</span>
                <strong style={{ marginLeft: '0.5rem', color: '#dc2626' }}>{formaterMontant(etat.montantRestant)}</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>Règlements payés:</span>
                <strong style={{ marginLeft: '0.5rem' }}>{reglementsPayes.length}</strong>
              </div>
              <div>
                <span style={{ color: '#6b7280' }}>Règlements en attente:</span>
                <strong style={{ marginLeft: '0.5rem' }}>{reglementsEnAttente.length}</strong>
              </div>
            </div>
            <div style={{ marginTop: '0.75rem', padding: '0.5rem', background: 'white', borderRadius: '4px' }}>
              <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Statut: </span>
              <span
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: etat.etat === 'regle' ? '#d1fae5' : etat.etat === 'partiel' ? '#fef3c7' : '#fee2e2',
                  color: etat.etat === 'regle' ? '#059669' : etat.etat === 'partiel' ? '#d97706' : '#dc2626',
                }}
              >
                {etat.etat === 'regle' ? 'Réglé' : etat.etat === 'partiel' ? 'Partiel' : 'Non réglé'}
              </span>
            </div>
          </div>

          {/* Liste des règlements existants */}
          {reglements.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', fontWeight: 600 }}>Règlements enregistrés</h4>
              <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '6px' }}>
                {reglements.map(r => (
                  <div
                    key={r.id}
                    style={{
                      padding: '0.75rem',
                      borderBottom: '1px solid #f3f4f6',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{formaterMontant(r.montant)}</div>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {r.dateEcheance ? `Échéance: ${formaterDate(r.dateEcheance)}` : 'Sans échéance'}
                        {r.dateReglement && ` | Payé le: ${formaterDate(r.dateReglement)}`}
                      </div>
                    </div>
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor: r.statut === 'paye' ? '#d1fae5' : '#fef3c7',
                        color: r.statut === 'paye' ? '#059669' : '#d97706',
                      }}
                    >
                      {r.statut === 'paye' ? 'Payé' : 'En attente'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulaire de règlement */}
          {etat.etat !== 'regle' && (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Mode de règlement *</label>
                <select
                  value={mode}
                  onChange={(e) => {
                    const nouveauMode = e.target.value as 'existant' | 'prevu' | 'complet';
                    setMode(nouveauMode);
                    
                    const nouvellesDates: Record<string, string> = {};
                    if (nouveauMode === 'existant') {
                      reglementsEnAttente.forEach(r => {
                        if (r.dateEcheance) {
                          nouvellesDates[r.id] = new Date(r.dateEcheance).toISOString().split('T')[0];
                        } else {
                          nouvellesDates[r.id] = new Date().toISOString().split('T')[0];
                        }
                      });
                    } else if (nouveauMode === 'prevu') {
                      acomptesPrevu.forEach((a, index) => {
                        nouvellesDates[`prevu-${index}`] = new Date(a.dateEcheance).toISOString().split('T')[0];
                      });
                    } else {
                      // Mode complet : date d'aujourd'hui par défaut
                      nouvellesDates['complet'] = new Date().toISOString().split('T')[0];
                    }
                    setDatesReglement(nouvellesDates);
                  }}
                  required
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #d1d5db' }}
                >
                  <option value="complet">
                    Règlement complet en une fois
                  </option>
                  {reglementsEnAttente.length > 0 && (
                    <option value="existant">
                      Utiliser les règlements existants ({reglementsEnAttente.length} en attente)
                    </option>
                  )}
                  {acomptesPrevu.length > 0 && (
                    <option value="prevu">
                      Créer les règlements prévus selon les échéances
                    </option>
                  )}
                </select>
              </div>

              {mode === 'existant' && reglementsEnAttente.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Dates de règlement</label>
                  {reglementsEnAttente.map(reglement => (
                    <div key={reglement.id} style={{ marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.875rem', marginBottom: '0.25rem', display: 'block' }}>
                        {formaterMontant(reglement.montant)} - 
                        {reglement.dateEcheance 
                          ? ` Échéance: ${formaterDate(reglement.dateEcheance)}`
                          : ' Sans échéance'}
                      </label>
                      <input
                        type="date"
                        value={datesReglement[reglement.id] || new Date().toISOString().split('T')[0]}
                        onChange={(e) => {
                          setDatesReglement({
                            ...datesReglement,
                            [reglement.id]: e.target.value,
                          });
                        }}
                        required
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {mode === 'complet' && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Date de règlement</label>
                  <input
                    type="date"
                    value={datesReglement['complet'] || new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      setDatesReglement({
                        ...datesReglement,
                        'complet': e.target.value,
                      });
                    }}
                    required
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#6b7280' }}>
                    Montant total: {formaterMontant(facture.totalTTC)}
                  </small>
                </div>
              )}

              {mode === 'prevu' && acomptesPrevu.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Dates de règlement pour chaque échéance prévue</label>
                  {acomptesPrevu.map((acompte, index) => (
                    <div key={index} style={{ marginBottom: '0.75rem' }}>
                      <label style={{ fontSize: '0.875rem', marginBottom: '0.25rem', display: 'block' }}>
                        {formaterMontant(acompte.montant)} - 
                        Échéance prévue: {formaterDate(acompte.dateEcheance)}
                      </label>
                      <input
                        type="date"
                        value={datesReglement[`prevu-${index}`] || new Date(acompte.dateEcheance).toISOString().split('T')[0]}
                        onChange={(e) => {
                          setDatesReglement({
                            ...datesReglement,
                            [`prevu-${index}`]: e.target.value,
                          });
                        }}
                        required
                        style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #d1d5db' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="vue-fournisseur__modal-footer">
                <button
                  type="button"
                  onClick={handleMarquerRapide}
                  className="vue-fournisseur__modal-btn vue-fournisseur__modal-btn--secondary"
                >
                  Marquer payée (rapide)
                </button>
                <button
                  type="button"
                  onClick={onFermer}
                  className="vue-fournisseur__modal-btn vue-fournisseur__modal-btn--secondary"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="vue-fournisseur__modal-btn vue-fournisseur__modal-btn--primary"
                >
                  Marquer avec dates personnalisées
                </button>
              </div>
            </form>
          )}

          {/* Si la facture est déjà réglée, afficher seulement les informations */}
          {etat.etat === 'regle' && (
            <div className="vue-fournisseur__modal-footer">
              <button
                type="button"
                onClick={onFermer}
                className="vue-fournisseur__modal-btn vue-fournisseur__modal-btn--primary"
              >
                Fermer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

