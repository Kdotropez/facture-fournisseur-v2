/**
 * Composant de gestion des règlements de factures
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, 
  Plus, 
  Edit, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Calendar,
  Euro,
} from 'lucide-react';
import type { Facture } from '../types/facture';
import type { 
  Reglement, 
  TypeReglement, 
  StatutReglement, 
  ModePaiement,
  EtatReglementFacture
} from '../types/reglement';
import {
  chargerReglements,
  ajouterReglement,
  mettreAJourReglement,
  supprimerReglement,
  calculerEtatReglement,
  calculerStatistiquesReglements,
  creerAcomptesPrevu,
  creerAcomptesPrevuAvecPourcentage,
  obtenirReglePaiement,
  detecterDoublons,
  nettoyerDoublons,
  validerReglements,
} from '../services/reglementService';
import './Reglements.css';

interface ReglementsProps {
  factures: Facture[];
}

export function Reglements({ factures }: ReglementsProps) {
  const [reglements, setReglements] = useState<Reglement[]>([]);
  const [factureFiltre, setFactureFiltre] = useState<string>('');
  const [fournisseurFiltre, setFournisseurFiltre] = useState<string>('');
  const [statutFiltre, setStatutFiltre] = useState<StatutReglement | ''>('');
  const [afficherModal, setAfficherModal] = useState(false);
  const [reglementEdite, setReglementEdite] = useState<Reglement | null>(null);
  const [afficherModalAcomptes, setAfficherModalAcomptes] = useState(false);
  const [facturePourAcomptes, setFacturePourAcomptes] = useState<Facture | null>(null);
  const [facturesDeveloppees, setFacturesDeveloppees] = useState<Set<string>>(new Set());
  const [afficherModalMarquerRegle, setAfficherModalMarquerRegle] = useState(false);
  const [factureAMarquer, setFactureAMarquer] = useState<Facture | null>(null);

  // Charger les règlements au montage
  useEffect(() => {
    const reglementsCharges = chargerReglements();
    setReglements(reglementsCharges);
  }, []);

  // Calculer les états de règlement pour chaque facture
  const etatsReglements = useMemo(() => {
    const etats: Record<string, EtatReglementFacture> = {};
    factures.forEach(facture => {
      etats[facture.id] = calculerEtatReglement(facture);
    });
    return etats;
  }, [factures, reglements]);

  // Calculer les statistiques
  const statistiques = useMemo(() => {
    return calculerStatistiquesReglements(factures);
  }, [factures, reglements]);

  // Filtrer les factures
  const facturesFiltrees = useMemo(() => {
    return factures.filter(facture => {
      const etat = etatsReglements[facture.id];
      if (!etat) return false;

      // Filtre par numéro de facture
      if (factureFiltre && !facture.numero.toLowerCase().includes(factureFiltre.toLowerCase())) {
        return false;
      }

      // Filtre par fournisseur
      if (fournisseurFiltre && facture.fournisseur !== fournisseurFiltre) {
        return false;
      }

      // Filtre par statut
      if (statutFiltre && etat.statut !== statutFiltre) {
        return false;
      }

      return true;
    });
  }, [factures, factureFiltre, fournisseurFiltre, statutFiltre, etatsReglements]);

  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const formaterDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  const handleAjouterReglement = () => {
    setReglementEdite(null);
    setAfficherModal(true);
  };

  const handleEditerReglement = (reglement: Reglement) => {
    setReglementEdite(reglement);
    setAfficherModal(true);
  };

  const handleSupprimerReglement = (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce règlement ?')) {
      supprimerReglement(id);
      setReglements(chargerReglements());
    }
  };

  const handleSauvegarderReglement = (reglement: Omit<Reglement, 'id' | 'dateCreation' | 'dateModification'>) => {
    if (reglementEdite) {
      mettreAJourReglement(reglementEdite.id, reglement);
    } else {
      ajouterReglement(reglement);
    }
    setReglements(chargerReglements());
    setAfficherModal(false);
    setReglementEdite(null);
  };

  const handleCreerAcomptes = (facture: Facture) => {
    const regle = obtenirReglePaiement(facture.fournisseur);
    
    // Si le fournisseur nécessite un pourcentage d'acompte (RB DRINKS, ITALESSE)
    if (regle?.paiementAvance && regle.pourcentageAcompte !== undefined) {
      setFacturePourAcomptes(facture);
      setAfficherModalAcomptes(true);
    } else {
      // Sinon, créer directement les acomptes (LEHMANN F)
      const nouveauxReglements = creerAcomptesPrevu(facture);
      nouveauxReglements.forEach(reglement => ajouterReglement(reglement));
      setReglements(chargerReglements());
    }
  };

  const handleCreerAcomptesAvecPourcentage = (facture: Facture, pourcentage: number) => {
    const regle = obtenirReglePaiement(facture.fournisseur);
    if (!regle) return;
    
    // Mettre à jour le pourcentage dans la règle
    const regleAvecPourcentage = { ...regle, pourcentageAcompte: pourcentage };
    const nouveauxReglements = creerAcomptesPrevuAvecPourcentage(facture, regleAvecPourcentage);
    nouveauxReglements.forEach(reglement => ajouterReglement(reglement));
    setReglements(chargerReglements());
    setAfficherModalAcomptes(false);
    setFacturePourAcomptes(null);
  };

  const handleToggleDevelopper = (factureId: string) => {
    const nouvellesFacturesDeveloppees = new Set(facturesDeveloppees);
    if (nouvellesFacturesDeveloppees.has(factureId)) {
      nouvellesFacturesDeveloppees.delete(factureId);
    } else {
      nouvellesFacturesDeveloppees.add(factureId);
    }
    setFacturesDeveloppees(nouvellesFacturesDeveloppees);
  };

  const handleMarquerRegle = (facture: Facture) => {
    setFactureAMarquer(facture);
    setAfficherModalMarquerRegle(true);
  };

  const handleMarquerRegleRapide = (facture: Facture) => {
    // Marquer rapidement la facture comme réglée avec virement et date d'aujourd'hui
    const reglementsEnAttente = reglements.filter(
      r => r.factureId === facture.id && r.statut === 'en_attente'
    );
    
    if (reglementsEnAttente.length > 0) {
      // Marquer tous les règlements en attente comme payés avec date d'aujourd'hui
      reglementsEnAttente.forEach(reglement => {
        mettreAJourReglement(reglement.id, {
          statut: 'paye',
          dateReglement: new Date(),
          modePaiement: 'virement',
        });
      });
    } else {
      // Créer un règlement complet
      ajouterReglement({
        factureId: facture.id,
        numeroFacture: facture.numero,
        fournisseur: facture.fournisseur,
        type: 'reglement_complet',
        montant: facture.totalTTC,
        dateReglement: new Date(),
        statut: 'paye',
        modePaiement: 'virement',
      });
    }
    
    setReglements(chargerReglements());
  };

  const handleMarquerEcheancePayee = (reglement: Reglement) => {
    // Marquer rapidement une échéance comme payée avec virement et date d'aujourd'hui
    mettreAJourReglement(reglement.id, {
      statut: 'paye',
      dateReglement: new Date(),
      modePaiement: 'virement',
    });
    setReglements(chargerReglements());
  };

  const handleNettoyerDoublons = (facture: Facture) => {
    const resultat = nettoyerDoublons(facture);
    setReglements(chargerReglements());
    
    let message = '';
    if (resultat.reglementsSupprimes.length > 0) {
      message += `${resultat.reglementsSupprimes.length} règlement(s) en doublon supprimé(s).\n`;
    }
    if (resultat.reglementsAjustes.length > 0) {
      message += `${resultat.reglementsAjustes.length} règlement(s) ajusté(s).\n`;
      resultat.reglementsAjustes.forEach(ajustement => {
        message += `- ${ajustement.ancienMontant.toFixed(2)}€ → ${ajustement.nouveauMontant.toFixed(2)}€\n`;
      });
    }
    
    if (message) {
      alert(message.trim());
    } else {
      alert('Aucun doublon détecté.');
    }
  };

  // Obtenir la liste unique des fournisseurs
  const fournisseurs = useMemo(() => {
    return Array.from(new Set(factures.map(f => f.fournisseur)));
  }, [factures]);

  return (
    <div className="reglements">
      <div className="reglements__header">
        <h1>Règlements des factures</h1>
        <button className="reglements__btn-add" onClick={handleAjouterReglement}>
          <Plus size={20} />
          Ajouter un règlement
        </button>
      </div>

      {/* Section Statistiques */}
      <div className="reglements__stats">
        <div className="reglements__stat-card">
          <div className="reglements__stat-label">Total à régler</div>
          <div className="reglements__stat-value">{formaterMontant(statistiques.totalARegler)}</div>
        </div>
        <div className="reglements__stat-card">
          <div className="reglements__stat-label">Total réglé</div>
          <div className="reglements__stat-value reglements__stat-value--success">
            {formaterMontant(statistiques.totalRegle)}
          </div>
        </div>
        <div className="reglements__stat-card">
          <div className="reglements__stat-label">En attente</div>
          <div className="reglements__stat-value reglements__stat-value--warning">
            {formaterMontant(statistiques.totalEnAttente)}
          </div>
        </div>
        <div className="reglements__stat-card">
          <div className="reglements__stat-label">Factures réglées</div>
          <div className="reglements__stat-value">
            {statistiques.facturesReglees} / {statistiques.nombreFactures}
          </div>
        </div>
      </div>

      {/* Statistiques par fournisseur */}
      {statistiques.parFournisseur && Object.keys(statistiques.parFournisseur).length > 0 && (
        <div className="reglements__stats-fournisseurs">
          <h2>Statistiques par fournisseur</h2>
          {Object.entries(statistiques.parFournisseur).map(([fournisseur, stats]) => {
            const pourcentageRegle = stats.totalARegler > 0 
              ? (stats.totalRegle / stats.totalARegler) * 100 
              : 0;
            
            return (
              <div key={fournisseur} className="reglements__stats-fournisseur">
                <div className="reglements__stats-fournisseur-header">
                  <h3>{fournisseur}</h3>
                  <span className="reglements__stats-fournisseur-pourcentage">
                    {pourcentageRegle.toFixed(1)}% réglé
                  </span>
                </div>
                <div className="reglements__stats-fournisseur-details">
                  <div>
                    <span className="reglements__stats-fournisseur-label">Factures:</span>
                    <span>{stats.nombreFactures}</span>
                  </div>
                  <div>
                    <span className="reglements__stats-fournisseur-label">Total à régler:</span>
                    <span>{formaterMontant(stats.totalARegler)}</span>
                  </div>
                  <div>
                    <span className="reglements__stats-fournisseur-label">Total réglé:</span>
                    <span className="reglements__stats-fournisseur-value--success">
                      {formaterMontant(stats.totalRegle)}
                    </span>
                  </div>
                  <div>
                    <span className="reglements__stats-fournisseur-label">Réglées:</span>
                    <span>{stats.facturesReglees}</span>
                  </div>
                </div>
                <div className="reglements__stats-fournisseur-progress">
                  <div 
                    className="reglements__stats-fournisseur-progress-bar"
                    style={{ width: `${Math.min(100, pourcentageRegle)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtres */}
      <div className="reglements__filtres">
        <div className="reglements__filtre">
          <label>Rechercher une facture</label>
          <input
            type="text"
            placeholder="Numéro de facture..."
            value={factureFiltre}
            onChange={(e) => setFactureFiltre(e.target.value)}
          />
        </div>
        <div className="reglements__filtre">
          <label>Fournisseur</label>
          <select
            value={fournisseurFiltre}
            onChange={(e) => setFournisseurFiltre(e.target.value)}
          >
            <option value="">Tous</option>
            {fournisseurs.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="reglements__filtre">
          <label>Statut</label>
          <select
            value={statutFiltre}
            onChange={(e) => setStatutFiltre(e.target.value as StatutReglement | '')}
          >
            <option value="">Tous</option>
            <option value="paye">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="en_attente">En attente</option>
            <option value="non_regle">Non réglé</option>
          </select>
        </div>
      </div>

      {/* Liste des factures avec leurs règlements */}
      <div className="reglements__liste">
        {facturesFiltrees.map(facture => {
          const etat = etatsReglements[facture.id];
          if (!etat) return null;

          const reglementsFacture = reglements.filter(r => r.factureId === facture.id);
          const regle = obtenirReglePaiement(facture.fournisseur);
          const estDeveloppee = facturesDeveloppees.has(facture.id);
          
          // Calculer la prochaine échéance
          const prochaineEcheance = reglementsFacture
            .filter(r => r.statut === 'en_attente' && r.dateEcheance)
            .map(r => r.dateEcheance!)
            .sort((a, b) => a.getTime() - b.getTime())[0] || etat.prochaineEcheance;

          return (
            <div key={facture.id} className="reglements__facture">
              {/* Vue compacte (toujours visible) */}
              <div 
                className="reglements__facture-compacte"
                onClick={() => handleToggleDevelopper(facture.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="reglements__facture-compacte-info">
                  <div className="reglements__facture-compacte-header">
                    <h3>
                      Facture {facture.numero} - {facture.fournisseur}
                    </h3>
                    <div className={`reglements__badge reglements__badge--${etat.statut === 'regle' ? 'paye' : etat.statut === 'non_regle' ? 'non_regle' : etat.statut === 'partiel' ? 'partiel' : 'en_attente'}`}>
                      {etat.statut === 'regle' && <CheckCircle size={16} />}
                      {etat.statut === 'partiel' && <Clock size={16} />}
                      {etat.statut === 'non_regle' && <AlertCircle size={16} />}
                      {etat.statut === 'depasse' && <AlertCircle size={16} />}
                      <span>
                        {etat.statut === 'regle' ? 'PAYÉ' : 
                         etat.statut === 'partiel' ? 'PARTIEL' : 
                         etat.statut === 'non_regle' ? 'NON RÉGLÉ' : 
                         'DÉPASSÉ'}
                      </span>
                    </div>
                  </div>
                  <div className="reglements__facture-compacte-details">
                    <span>Date: {formaterDate(facture.date)}</span>
                    <span>Total TTC: {formaterMontant(facture.totalTTC)}</span>
                    <span className="reglements__facture-montant-du">
                      Montant dû: <strong>{formaterMontant(Math.max(0, etat.montantRestant))}</strong>
                    </span>
                    {prochaineEcheance && etat.statut !== 'regle' && (
                      <span className="reglements__facture-echeance">
                        Prochaine échéance: <strong>{formaterDate(prochaineEcheance)}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="reglements__facture-compacte-chevron">
                  {estDeveloppee ? '▼' : '▶'}
                </div>
              </div>

              {/* Vue détaillée (développée) */}
              {estDeveloppee && (
                <div className="reglements__facture-detaillee">
                  <div className="reglements__facture-header">
                    <div className="reglements__facture-info">
                      <h3>
                        Facture {facture.numero} - {facture.fournisseur}
                      </h3>
                      <div className="reglements__facture-details">
                        <span>Date: {formaterDate(facture.date)}</span>
                        <span>Total TTC: {formaterMontant(facture.totalTTC)}</span>
                      </div>
                    </div>
                    <div className="reglements__facture-actions">
                      {etat.statut !== 'regle' && reglementsFacture.length > 0 && (
                        <>
                          <button
                            className="reglements__btn-marquer-regle-rapide"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarquerRegleRapide(facture);
                            }}
                            title="Marquer tous les règlements en attente comme payés (virement, date d'aujourd'hui)"
                          >
                            <CheckCircle size={16} />
                            Tout marquer payé
                          </button>
                          <button
                            className="reglements__btn-marquer-regle"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMarquerRegle(facture);
                            }}
                            title="Marquer avec options (dates personnalisées)"
                          >
                            <Edit size={16} />
                            Options
                          </button>
                        </>
                      )}
                      {regle && etat.statut === 'non_regle' && reglementsFacture.length === 0 && (
                        <button
                          className="reglements__btn-acomptes"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreerAcomptes(facture);
                          }}
                        >
                          <Plus size={16} />
                          Créer les échéances prévues
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="reglements__facture-etat">
                    <div className={`reglements__badge reglements__badge--${etat.statut === 'regle' ? 'paye' : etat.statut === 'non_regle' ? 'non_regle' : etat.statut === 'partiel' ? 'partiel' : 'en_attente'}`}>
                      {etat.statut === 'regle' && <CheckCircle size={16} />}
                      {etat.statut === 'partiel' && <Clock size={16} />}
                      {etat.statut === 'non_regle' && <AlertCircle size={16} />}
                      {etat.statut === 'depasse' && <AlertCircle size={16} />}
                      <span>
                        {etat.statut === 'regle' ? 'PAYÉ' : 
                         etat.statut === 'partiel' ? 'PARTIEL' : 
                         etat.statut === 'non_regle' ? 'NON RÉGLÉ' : 
                         'DÉPASSÉ'}
                      </span>
                    </div>
                    <div className="reglements__facture-montants">
                      <span>Total TTC: {formaterMontant(facture.totalTTC)}</span>
                      <span>Réglé: {formaterMontant(etat.montantRegle)} ({etat.pourcentageRegle.toFixed(1)}%)</span>
                      <span>À régler: {formaterMontant(Math.max(0, etat.montantRestant))}</span>
                      {(() => {
                        const detection = detecterDoublons(facture);
                        if (detection.aDoublons && detection.montantRegleBrut !== etat.montantRegle) {
                          return (
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>
                              ⚠️ Montant brut réglé: {formaterMontant(detection.montantRegleBrut)} (doublons détectés)
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {(() => {
                        // Utiliser la nouvelle fonction de détection des doublons
                        const detection = detecterDoublons(facture);
                        
                        if (detection.aDoublons) {
                          const montantExces = detection.montantRegleBrut - facture.totalTTC;
                          return (
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.75rem',
                              padding: '0.75rem',
                              background: '#fef2f2',
                              border: '1px solid #ef4444',
                              borderRadius: '6px',
                              marginTop: '0.5rem'
                            }}>
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>
                                ⚠️ Doublons détectés : {formaterMontant(detection.montantRegleBrut)} réglés au lieu de {formaterMontant(facture.totalTTC)} (excès de {formaterMontant(montantExces)})
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Voulez-vous nettoyer automatiquement les ${detection.reglementsEnDoublon.length} règlement(s) en doublon ?`)) {
                                    handleNettoyerDoublons(facture);
                                  }
                                }}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem',
                                  fontWeight: 600,
                                  whiteSpace: 'nowrap'
                                }}
                                title="Nettoyer automatiquement les doublons"
                              >
                                Nettoyer
                              </button>
                            </div>
                          );
                        }
                        
                        // Afficher aussi les avertissements de validation
                        const validation = validerReglements(facture);
                        if (validation.avertissements.length > 0) {
                          return (
                            <div style={{ 
                              padding: '0.75rem',
                              background: '#fef3c7',
                              border: '1px solid #f59e0b',
                              borderRadius: '6px',
                              marginTop: '0.5rem'
                            }}>
                              {validation.avertissements.map((avertissement, index) => (
                                <div key={index} style={{ color: '#92400e', fontSize: '0.875rem' }}>
                                  ⚠️ {avertissement}
                                </div>
                              ))}
                            </div>
                          );
                        }
                        
                        // Ne pas afficher "En attente" si la facture est complètement réglée
                        if (etat.statut === 'regle') {
                          return null; // Ne pas afficher "En attente" si la facture est payée
                        }
                        const reglementsEnAttente = reglementsFacture.filter(r => r.statut === 'en_attente');
                        const montantEnAttente = reglementsEnAttente.reduce((sum, r) => {
                          const montant = typeof r.montant === 'number' && !isNaN(r.montant) ? r.montant : 0;
                          return sum + montant;
                        }, 0);
                        // Afficher seulement s'il y a des règlements en attente
                        return reglementsEnAttente.length > 0 && montantEnAttente > 0 ? (
                          <span>En attente ({reglementsEnAttente.length}): {formaterMontant(montantEnAttente)}</span>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Liste des règlements */}
                  <div className="reglements__reglements-liste">
                    {reglementsFacture.length === 0 ? (
                      <div className="reglements__aucun-reglement">
                        Aucun règlement enregistré
                      </div>
                    ) : (
                      reglementsFacture.map(reglement => (
                        <div
                          key={reglement.id}
                          className={`reglements__reglement ${
                            reglement.statut === 'paye' ? 'reglements__reglement--paye' : 'reglements__reglement--cliquable'
                          }`}
                          onClick={(e) => {
                            // Si le règlement est en attente, clic direct pour marquer comme payé
                            if (reglement.statut === 'en_attente' && !(e.target as HTMLElement).closest('button')) {
                              handleMarquerEcheancePayee(reglement);
                            }
                          }}
                          style={reglement.statut === 'en_attente' ? { cursor: 'pointer' } : {}}
                          title={reglement.statut === 'en_attente' ? 'Cliquer pour marquer comme payée (virement, date d\'aujourd\'hui)' : ''}
                        >
                          <div className="reglements__reglement-info">
                            <div className="reglements__reglement-type">
                              <CreditCard size={16} />
                              <span>{reglement.type.replace('_', ' ').toUpperCase()}</span>
                            </div>
                            <div className={`reglements__reglement-montant ${
                              reglement.statut === 'paye' ? 'reglements__reglement-montant--paye' : ''
                            }`}>
                              {formaterMontant(reglement.montant)}
                            </div>
                          </div>
                          <div className="reglements__reglement-details">
                            <div>
                              <Calendar size={14} />
                              <span>
                                {reglement.statut === 'paye' 
                                  ? `Payé le ${formaterDate(reglement.dateReglement)}`
                                  : reglement.dateEcheance 
                                    ? `Échéance: ${formaterDate(reglement.dateEcheance)}`
                                    : `Date: ${formaterDate(reglement.dateReglement)}`
                                }
                              </span>
                            </div>
                            {reglement.modePaiement && (
                              <div>
                                <Euro size={14} />
                                <span>{reglement.modePaiement}</span>
                              </div>
                            )}
                            {reglement.referencePaiement && (
                              <div>
                                <span>Réf: {reglement.referencePaiement}</span>
                              </div>
                            )}
                            {reglement.statut === 'paye' && (
                              <div className="reglements__reglement-badge-paye">
                                <CheckCircle size={14} />
                                <span>Payé</span>
                              </div>
                            )}
                            {reglement.statut === 'en_attente' && (
                              <div className="reglements__reglement-badge-attente" style={{ 
                                fontSize: '0.75rem', 
                                color: '#3b82f6',
                                fontStyle: 'italic'
                              }}>
                                Cliquer pour marquer payée
                              </div>
                            )}
                          </div>
                          <div className="reglements__reglement-actions" onClick={(e) => e.stopPropagation()}>
                            <button
                              className="reglements__btn-edit"
                              onClick={() => handleEditerReglement(reglement)}
                              title="Modifier les détails"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              className="reglements__btn-delete"
                              onClick={() => handleSupprimerReglement(reglement.id)}
                              title="Supprimer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Acomptes prévus - Afficher seulement s'il n'y a pas de règlements */}
                  {etat.acomptesPrevu && etat.acomptesPrevu.length > 0 && reglementsFacture.length === 0 && (
                    <div className="reglements__acomptes-prevus">
                      <h4>Échéances prévues</h4>
                      {etat.acomptesPrevu.map((acompte, index) => (
                        <div key={index} className="reglements__acompte-prevu">
                          <div className="reglements__acompte-prevu-info">
                            <div className="reglements__acompte-prevu-montant">
                              {formaterMontant(acompte.montant)}
                            </div>
                            <div className="reglements__acompte-prevu-date">
                              <Calendar size={14} />
                              <span>Échéance: {formaterDate(acompte.dateEcheance)}</span>
                            </div>
                          </div>
                          <button
                            className="reglements__btn-marquer-acompte"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Créer un règlement pour cet acompte et le marquer comme payé
                            ajouterReglement({
                              factureId: facture.id,
                              numeroFacture: facture.numero,
                              fournisseur: facture.fournisseur,
                              type: acompte.type === 'acompte' ? 'acompte' : 'solde',
                              montant: acompte.montant,
                              dateReglement: new Date(),
                              dateEcheance: acompte.dateEcheance,
                              statut: 'paye',
                              modePaiement: 'virement',
                              notes: `${acompte.type === 'acompte' ? 'Acompte' : 'Solde'} - ${formaterDate(acompte.dateEcheance)}`,
                            });
                            setReglements(chargerReglements());
                          }}
                            title="Marquer cet acompte comme payé (virement, date d'aujourd'hui)"
                          >
                            <CheckCircle size={16} />
                            Marquer payée
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal pour ajouter/éditer un règlement */}
      {afficherModal && (
        <ModalReglement
          factures={factures}
          reglement={reglementEdite}
          onSauvegarder={handleSauvegarderReglement}
          onFermer={() => {
            setAfficherModal(false);
            setReglementEdite(null);
          }}
        />
      )}

      {/* Modal pour choisir le pourcentage d'acompte */}
      {afficherModalAcomptes && facturePourAcomptes && (
        <ModalPourcentageAcompte
          facture={facturePourAcomptes}
          onCreer={(pourcentage) => handleCreerAcomptesAvecPourcentage(facturePourAcomptes!, pourcentage)}
          onFermer={() => {
            setAfficherModalAcomptes(false);
            setFacturePourAcomptes(null);
          }}
        />
      )}

      {/* Modal pour marquer une facture comme réglée */}
      {afficherModalMarquerRegle && factureAMarquer && (
        <ModalMarquerRegle
          facture={factureAMarquer}
          reglementsExistants={reglements.filter(r => r.factureId === factureAMarquer.id)}
          onSauvegarder={(mode, datesReglement = {}) => {
            if (mode === 'existant') {
              // Marquer tous les règlements en attente comme payés avec leurs dates
              const reglementsEnAttente = reglements.filter(
                r => r.factureId === factureAMarquer.id && r.statut === 'en_attente'
              );
              
              reglementsEnAttente.forEach(reglement => {
                const dateReglement = datesReglement[reglement.id] 
                  ? new Date(datesReglement[reglement.id])
                  : (reglement.dateEcheance || new Date());
                
                mettreAJourReglement(reglement.id, {
                  statut: 'paye',
                  dateReglement: dateReglement,
                });
              });
            } else {
              // Créer les règlements prévus et les marquer comme payés
              const regle = obtenirReglePaiement(factureAMarquer.fournisseur);
              if (regle) {
                const dateFacture = new Date(factureAMarquer.date);
                
                if (factureAMarquer.fournisseur === 'LEHMANN F' && regle.nombreAcomptes === 3) {
                  const montantParTranche = factureAMarquer.totalTTC / 3;
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
                      factureId: factureAMarquer.id,
                      numeroFacture: factureAMarquer.numero,
                      fournisseur: factureAMarquer.fournisseur,
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
                  // Pour les autres fournisseurs, créer un règlement complet
                  const dateReglement = datesReglement['prevu-0']
                    ? new Date(datesReglement['prevu-0'])
                    : new Date();
                  
                  ajouterReglement({
                    factureId: factureAMarquer.id,
                    numeroFacture: factureAMarquer.numero,
                    fournisseur: factureAMarquer.fournisseur,
                    type: 'reglement_complet',
                    montant: factureAMarquer.totalTTC,
                    dateReglement: dateReglement,
                    statut: 'paye',
                    modePaiement: regle.modePaiementDefaut || 'virement',
                  });
                }
              }
            }
            
            setReglements(chargerReglements());
            setAfficherModalMarquerRegle(false);
            setFactureAMarquer(null);
          }}
          onFermer={() => {
            setAfficherModalMarquerRegle(false);
            setFactureAMarquer(null);
          }}
        />
      )}
    </div>
  );
}

// Composant Modal pour ajouter/éditer un règlement
interface ModalReglementProps {
  factures: Facture[];
  reglement: Reglement | null;
  onSauvegarder: (reglement: Omit<Reglement, 'id' | 'dateCreation' | 'dateModification'>) => void;
  onFermer: () => void;
}

function ModalReglement({ factures, reglement, onSauvegarder, onFermer }: ModalReglementProps) {
  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const [factureId, setFactureId] = useState(reglement?.factureId || '');
  const [type, setType] = useState<TypeReglement>(reglement?.type || 'reglement_complet');
  // Formater le montant à 2 décimales lors de l'initialisation
  const montantInitial = reglement?.montant 
    ? parseFloat(reglement.montant.toFixed(2))
    : 0;
  const [montant, setMontant] = useState(montantInitial > 0 ? montantInitial.toFixed(2) : '');
  const [dateReglement, setDateReglement] = useState(
    reglement?.dateReglement ? new Date(reglement.dateReglement).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [dateEcheance, setDateEcheance] = useState(
    reglement?.dateEcheance ? new Date(reglement.dateEcheance).toISOString().split('T')[0] : ''
  );
  const [statut, setStatut] = useState<StatutReglement>(reglement?.statut || 'en_attente');
  const [modePaiement, setModePaiement] = useState<ModePaiement>(reglement?.modePaiement || 'virement');
  const [referencePaiement, setReferencePaiement] = useState(reglement?.referencePaiement || '');
  const [notes, setNotes] = useState(reglement?.notes || '');

  const factureSelectionnee = factures.find(f => f.id === factureId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!factureId || !montant) {
      alert('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const facture = factures.find(f => f.id === factureId);
    if (!facture) return;

    onSauvegarder({
      factureId,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type,
      montant: parseFloat(montant),
      dateReglement: new Date(dateReglement),
      dateEcheance: dateEcheance ? new Date(dateEcheance) : undefined,
      statut,
      modePaiement,
      referencePaiement: referencePaiement || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <div className="reglements__modal-overlay" onClick={onFermer}>
      <div className="reglements__modal" onClick={(e) => e.stopPropagation()}>
        <h2>{reglement ? 'Modifier le règlement' : 'Nouveau règlement'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="reglements__form-group">
            <label>Facture *</label>
            <select
              value={factureId}
              onChange={(e) => setFactureId(e.target.value)}
              required
              disabled={!!reglement}
            >
              <option value="">Sélectionner une facture</option>
              {factures.map(f => (
                <option key={f.id} value={f.id}>
                  {f.numero} - {f.fournisseur} ({formaterMontant(f.totalTTC)})
                </option>
              ))}
            </select>
          </div>

          <div className="reglements__form-group">
            <label>Type *</label>
            <select value={type} onChange={(e) => setType(e.target.value as TypeReglement)} required>
              <option value="reglement_complet">Règlement complet</option>
              <option value="acompte">Acompte</option>
              <option value="solde">Solde</option>
              <option value="avoir">Avoir</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          <div className="reglements__form-group">
            <label>Montant *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={montant}
              onChange={(e) => {
                const valeur = e.target.value;
                // Permettre la saisie libre mais valider
                if (valeur === '' || valeur === '.') {
                  setMontant(valeur);
                } else {
                  // Vérifier le format (max 2 décimales)
                  const match = valeur.match(/^\d+(\.\d{0,2})?$/);
                  if (match || valeur === '') {
                    setMontant(valeur);
                  }
                  // Si plus de 2 décimales, arrondir
                  else {
                    const nombre = parseFloat(valeur);
                    if (!isNaN(nombre)) {
                      setMontant((Math.round(nombre * 100) / 100).toFixed(2));
                    }
                  }
                }
              }}
              onBlur={(e) => {
                // Forcer le formatage à 2 décimales à la perte de focus
                const valeur = e.target.value.trim();
                if (valeur === '' || valeur === '.') {
                  setMontant('');
                } else {
                  const nombre = parseFloat(valeur.replace(',', '.'));
                  if (!isNaN(nombre) && nombre >= 0) {
                    setMontant(nombre.toFixed(2));
                  } else {
                    setMontant('');
                  }
                }
              }}
              required
            />
            {factureSelectionnee && (
              <small>Total TTC: {formaterMontant(factureSelectionnee.totalTTC)}</small>
            )}
          </div>

          <div className="reglements__form-group">
            <label>Date de règlement *</label>
            <input
              type="date"
              value={dateReglement}
              onChange={(e) => setDateReglement(e.target.value)}
              required
            />
          </div>

          <div className="reglements__form-group">
            <label>Date d'échéance</label>
            <input
              type="date"
              value={dateEcheance}
              onChange={(e) => setDateEcheance(e.target.value)}
            />
          </div>

          <div className="reglements__form-group">
            <label>Statut *</label>
            <select value={statut} onChange={(e) => setStatut(e.target.value as StatutReglement)} required>
              <option value="en_attente">En attente</option>
              <option value="paye">Payé</option>
              <option value="partiel">Partiel</option>
              <option value="annule">Annulé</option>
            </select>
          </div>

          <div className="reglements__form-group">
            <label>Mode de paiement</label>
            <select value={modePaiement} onChange={(e) => setModePaiement(e.target.value as ModePaiement)}>
              <option value="virement">Virement</option>
              <option value="cheque">Chèque</option>
              <option value="prelevement">Prélèvement</option>
              <option value="carte">Carte</option>
              <option value="especes">Espèces</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          <div className="reglements__form-group">
            <label>Référence de paiement</label>
            <input
              type="text"
              value={referencePaiement}
              onChange={(e) => setReferencePaiement(e.target.value)}
              placeholder="N° de chèque, référence virement..."
            />
          </div>

          <div className="reglements__form-group">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <div className="reglements__form-actions">
            <button type="button" onClick={onFermer}>Annuler</button>
            <button type="submit">Sauvegarder</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Composant Modal pour choisir le pourcentage d'acompte
interface ModalPourcentageAcompteProps {
  facture: Facture;
  onCreer: (pourcentage: number) => void;
  onFermer: () => void;
}

function ModalPourcentageAcompte({ facture, onCreer, onFermer }: ModalPourcentageAcompteProps) {
  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const [pourcentage, setPourcentage] = useState(30);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pourcentage > 0 && pourcentage <= 100) {
      onCreer(pourcentage);
    }
  };

  const montantAcompte = (facture.totalTTC * pourcentage) / 100;
  const montantSolde = facture.totalTTC - montantAcompte;

  return (
    <div className="reglements__modal-overlay" onClick={onFermer}>
      <div className="reglements__modal" onClick={(e) => e.stopPropagation()}>
        <h2>Créer les acomptes pour {facture.numero}</h2>
        <form onSubmit={handleSubmit}>
          <div className="reglements__form-group">
            <label>Pourcentage d'acompte (%)</label>
            <input
              type="number"
              min="1"
              max="99"
              value={pourcentage}
              onChange={(e) => setPourcentage(parseInt(e.target.value) || 0)}
              required
            />
            <small>Total TTC: {formaterMontant(facture.totalTTC)}</small>
          </div>

          <div className="reglements__form-preview">
            <div>
              <strong>Acompte:</strong> {formaterMontant(montantAcompte)} ({pourcentage}%)
            </div>
            <div>
              <strong>Solde:</strong> {formaterMontant(montantSolde)} ({100 - pourcentage}%)
            </div>
          </div>

          <div className="reglements__form-actions">
            <button type="button" onClick={onFermer}>Annuler</button>
            <button type="submit">Créer les échéances</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Composant Modal pour marquer une facture comme réglée
interface ModalMarquerRegleProps {
  facture: Facture;
  reglementsExistants: Reglement[];
  onSauvegarder: (mode: 'existant' | 'prevu', datesReglement?: Record<string, string>) => void;
  onFermer: () => void;
}

function ModalMarquerRegle({ facture, reglementsExistants, onSauvegarder, onFermer }: ModalMarquerRegleProps) {
  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const formaterDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  // Règlements en attente existants
  const reglementsEnAttente = reglementsExistants.filter(r => r.statut === 'en_attente');
  
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

  const [mode, setMode] = useState<'existant' | 'prevu'>(
    reglementsEnAttente.length > 0 ? 'existant' : 'prevu'
  );
  const [datesReglement, setDatesReglement] = useState<Record<string, string>>({});

  // Initialiser les dates avec les dates d'échéance
  useEffect(() => {
    const dates: Record<string, string> = {};
    if (mode === 'existant') {
      reglementsEnAttente.forEach(r => {
        if (r.dateEcheance) {
          dates[r.id] = new Date(r.dateEcheance).toISOString().split('T')[0];
        } else {
          dates[r.id] = new Date().toISOString().split('T')[0];
        }
      });
    } else {
      acomptesPrevu.forEach((a, index) => {
        dates[`prevu-${index}`] = new Date(a.dateEcheance).toISOString().split('T')[0];
      });
    }
    setDatesReglement(dates);
  }, [mode, reglementsEnAttente, acomptesPrevu]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSauvegarder(mode, datesReglement);
  };

  return (
    <div className="reglements__modal-overlay" onClick={onFermer}>
      <div className="reglements__modal" onClick={(e) => e.stopPropagation()}>
        <h2>Marquer la facture {facture.numero} comme réglée</h2>
        <form onSubmit={handleSubmit}>
          <div className="reglements__form-group">
            <label>Facture</label>
            <div style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: '6px' }}>
              <strong>{facture.numero}</strong> - {facture.fournisseur}
              <br />
              <small>Total TTC: {formaterMontant(facture.totalTTC)}</small>
            </div>
          </div>

          <div className="reglements__form-group">
            <label>Mode de règlement *</label>
            <select 
              value={mode} 
              onChange={(e) => {
                const nouveauMode = e.target.value as 'existant' | 'prevu';
                setMode(nouveauMode);
                
                // Réinitialiser les dates selon le mode
                const nouvellesDates: Record<string, string> = {};
                if (nouveauMode === 'existant') {
                  reglementsEnAttente.forEach(r => {
                    if (r.dateEcheance) {
                      nouvellesDates[r.id] = new Date(r.dateEcheance).toISOString().split('T')[0];
                    } else {
                      nouvellesDates[r.id] = new Date().toISOString().split('T')[0];
                    }
                  });
                } else {
                  acomptesPrevu.forEach((a, index) => {
                    nouvellesDates[`prevu-${index}`] = new Date(a.dateEcheance).toISOString().split('T')[0];
                  });
                }
                setDatesReglement(nouvellesDates);
              }}
              required
            >
              {reglementsEnAttente.length > 0 && (
                <option value="existant">
                  Utiliser les règlements existants ({reglementsEnAttente.length} en attente)
                </option>
              )}
              <option value="prevu">
                Créer les règlements prévus selon les échéances
              </option>
            </select>
            <small>
              {mode === 'existant' 
                ? 'Marquera tous les règlements en attente comme payés avec leurs dates d\'échéance'
                : 'Créera les règlements prévus et les marquera comme payés avec les dates d\'échéance'}
            </small>
          </div>

          {mode === 'existant' && reglementsEnAttente.length > 0 && (
            <div className="reglements__form-group">
              <label>Dates de règlement pour chaque échéance</label>
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

          {mode === 'prevu' && acomptesPrevu.length > 0 && (
            <div className="reglements__form-group">
              <label>Dates de règlement pour chaque échéance prévue</label>
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

          <div className="reglements__form-actions">
            <button 
              type="button" 
              onClick={() => {
                // Action rapide : marquer avec virement et date d'aujourd'hui
                if (mode === 'existant') {
                  const dates: Record<string, string> = {};
                  reglementsEnAttente.forEach(r => {
                    dates[r.id] = new Date().toISOString().split('T')[0];
                  });
                  onSauvegarder(mode, dates);
                } else {
                  const dates: Record<string, string> = {};
                  acomptesPrevu.forEach((_, index) => {
                    dates[`prevu-${index}`] = new Date().toISOString().split('T')[0];
                  });
                  onSauvegarder(mode, dates);
                }
              }}
              className="reglements__btn-rapide"
            >
              <CheckCircle size={16} />
              Marquer payée (rapide)
            </button>
            <button type="button" onClick={onFermer}>Annuler</button>
            <button type="submit">Marquer avec dates personnalisées</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Export par défaut pour éviter les problèmes de cache
export default Reglements;
