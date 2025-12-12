/**
 * Service pour la gestion des règlements de factures
 */

import type { 
  Reglement, 
  ReglePaiementFournisseur, 
  EtatReglementFacture,
  StatistiquesReglements,
} from '../types/reglement';
import type { Facture, Fournisseur } from '../types/facture';

const STORAGE_KEY_REGLEMENTS = 'reglements-factures';
const STORAGE_KEY_REGLES_PAIEMENT = 'regles-paiement-fournisseurs';

/**
 * Règles de paiement par défaut par fournisseur
 */
const REGLES_PAIEMENT_DEFAUT: Record<Fournisseur, ReglePaiementFournisseur> = {
  'RB DRINKS': {
    fournisseur: 'RB DRINKS',
    modePaiementDefaut: 'virement',
    paiementAvance: true,
    pourcentageAcompte: 30, // Par défaut 30%, mais peut être modifié
    nombreAcomptes: 1,
    delaiPaiement: 30,
    notes: 'Paiement généralement en avance par acompte (pourcentage variable)',
  },
  LEHMANN: {
    fournisseur: 'LEHMANN',
    modePaiementDefaut: 'virement',
    paiementAvance: false,
    nombreAcomptes: 3, // Paiement en 3 fois
    delaiPaiement: 30, // Premier paiement à 30 jours
    delaiEntreAcomptes: 30, // 30 jours entre chaque paiement (30J, 60J, 90J)
    notes: 'Paiement en 3 fois : 1/3 à 30 jours, 1/3 à 60 jours, 1/3 à 90 jours (FDM)',
  },
  'ITALESSE': {
    fournisseur: 'ITALESSE',
    modePaiementDefaut: 'virement',
    paiementAvance: true,
    pourcentageAcompte: 50, // Par défaut 50%, mais peut être modifié
    nombreAcomptes: 2, // En avance et en plusieurs fois
    delaiPaiement: 30,
    delaiEntreAcomptes: 30,
    notes: 'Paiement en avance et en plusieurs fois (pourcentage variable)',
  },
};

/**
 * Charge tous les règlements depuis le stockage local
 */
export function chargerReglements(): Reglement[] {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY_REGLEMENTS);
    if (!donnees) return [];
    
    const reglements = JSON.parse(donnees) as Reglement[];
    // Convertir les dates string en objets Date
    return reglements.map(r => ({
      ...r,
      dateReglement: new Date(r.dateReglement),
      dateEcheance: r.dateEcheance ? new Date(r.dateEcheance) : undefined,
      dateCreation: new Date(r.dateCreation),
      dateModification: new Date(r.dateModification),
    }));
  } catch (error) {
    console.error('Erreur lors du chargement des règlements:', error);
    return [];
  }
}

/**
 * Sauvegarde tous les règlements dans le stockage local
 */
export function sauvegarderReglements(reglements: Reglement[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_REGLEMENTS, JSON.stringify(reglements));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des règlements:', error);
    throw error;
  }
}

/**
 * Obtient les règlements d'une facture
 */
export function obtenirReglementsFacture(factureId: string): Reglement[] {
  const reglements = chargerReglements();
  return reglements.filter(r => r.factureId === factureId);
}

/**
 * Ajoute un nouveau règlement
 */
export function ajouterReglement(reglement: Omit<Reglement, 'id' | 'dateCreation' | 'dateModification'>): Reglement {
  const reglements = chargerReglements();
  
  const nouveauReglement: Reglement = {
    ...reglement,
    id: `reglement-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    dateCreation: new Date(),
    dateModification: new Date(),
  };
  
  reglements.push(nouveauReglement);
  sauvegarderReglements(reglements);
  
  return nouveauReglement;
}

/**
 * Met à jour un règlement
 */
export function mettreAJourReglement(id: string, modifications: Partial<Reglement>): Reglement | null {
  const reglements = chargerReglements();
  const index = reglements.findIndex(r => r.id === id);
  
  if (index === -1) {
    return null;
  }
  
  reglements[index] = {
    ...reglements[index],
    ...modifications,
    dateModification: new Date(),
  };
  
  sauvegarderReglements(reglements);
  return reglements[index];
}

/**
 * Supprime un règlement
 */
export function supprimerReglement(id: string): boolean {
  const reglements = chargerReglements();
  const nouveauxReglements = reglements.filter(r => r.id !== id);
  if (nouveauxReglements.length === reglements.length) {
    return false;
  }

  sauvegarderReglements(nouveauxReglements);
  return true;
}

/**
 * Supprime tous les règlements associés à une facture donnée
 */
export function supprimerReglementsParFactureId(factureId: string): number {
  const reglements = chargerReglements();
  const nouveauxReglements = reglements.filter(r => r.factureId !== factureId);
  const nombreSupprimes = reglements.length - nouveauxReglements.length;

  if (nombreSupprimes > 0) {
    sauvegarderReglements(nouveauxReglements);
  }

  return nombreSupprimes;
}

/**
 * Supprime tous les règlements associés à plusieurs factures
 */
export function supprimerReglementsParFactureIds(factureIds: string[]): number {
  const idsSet = new Set(factureIds);
  const reglements = chargerReglements();
  const nouveauxReglements = reglements.filter(r => !idsSet.has(r.factureId));
  const nombreSupprimes = reglements.length - nouveauxReglements.length;

  if (nombreSupprimes > 0) {
    sauvegarderReglements(nouveauxReglements);
  }

  return nombreSupprimes;
}

/**
 * Supprime tous les règlements d'un fournisseur (utile si on supprime un fournisseur)
 */
export function supprimerReglementsParFournisseur(fournisseur: Fournisseur): number {
  const reglements = chargerReglements();
  const nouveauxReglements = reglements.filter(r => r.fournisseur !== fournisseur);
  const nombreSupprimes = reglements.length - nouveauxReglements.length;

  if (nombreSupprimes > 0) {
    sauvegarderReglements(nouveauxReglements);
  }

  return nombreSupprimes;
}

/**
 * Supprime tous les règlements (utilisé uniquement pour des opérations de maintenance)
 */
export function supprimerTousLesReglements(): void {
  sauvegarderReglements([]);
}

/**
 * Supprime un règlement (ancienne API conservée pour compatibilité)
 * @deprecated Utiliser supprimerReglementsParFactureId ou supprimerReglementsParFactureIds si possible
 */
export function supprimerReglementParId(id: string): boolean {
  const reglements = chargerReglements();
  const nouveauxReglements = reglements.filter(r => r.id !== id);
  if (nouveauxReglements.length === reglements.length) {
    return false;
  }

  sauvegarderReglements(reglements);
  return true;
}

/**
 * Détecte les doublons dans les règlements d'une facture
 * Retourne les règlements qui sont en doublon (montant total payé > total TTC)
 */
export function detecterDoublons(facture: Facture): {
  aDoublons: boolean;
  montantRegleBrut: number;
  montantRegleValide: number;
  reglementsEnDoublon: Reglement[];
} {
  const reglements = obtenirReglementsFacture(facture.id);
  const totalTTC = typeof facture.totalTTC === 'number' && !isNaN(facture.totalTTC) 
    ? facture.totalTTC 
    : 0;
  
  const reglementsPayes = reglements.filter(r => r.statut === 'paye');
  const montantRegleBrut = reglementsPayes.reduce((sum, r) => {
    const montant = typeof r.montant === 'number' && !isNaN(r.montant) ? r.montant : 0;
    return sum + montant;
  }, 0);
  
  const aDoublons = montantRegleBrut > totalTTC + 0.01; // Tolérance de 1 centime
  
  // Identifier les règlements en doublon (ceux qui dépassent)
  let reglementsEnDoublon: Reglement[] = [];
  if (aDoublons) {
    // Trier par date (plus récent en premier) et par type (règlement_complet en priorité)
    const reglementsTries = [...reglementsPayes].sort((a, b) => {
      if (a.type === 'reglement_complet' && b.type !== 'reglement_complet') return -1;
      if (b.type === 'reglement_complet' && a.type !== 'reglement_complet') return 1;
      return new Date(b.dateReglement).getTime() - new Date(a.dateReglement).getTime();
    });
    
    // Identifier les règlements qui dépassent le total
    let totalCumule = 0;
    for (const reglement of reglementsTries) {
      totalCumule += reglement.montant;
      if (totalCumule > totalTTC + 0.01) {
        reglementsEnDoublon.push(reglement);
      }
    }
  }
  
  const montantRegleValide = Math.min(montantRegleBrut, totalTTC);
  
  return {
    aDoublons,
    montantRegleBrut,
    montantRegleValide,
    reglementsEnDoublon,
  };
}

/**
 * Calcule l'état de règlement d'une facture
 * Version refondue avec détection automatique des doublons
 */
export function calculerEtatReglement(facture: Facture): EtatReglementFacture {
  const reglements = obtenirReglementsFacture(facture.id);
  
  // S'assurer que facture.totalTTC est un nombre valide
  const totalTTC = typeof facture.totalTTC === 'number' && !isNaN(facture.totalTTC) 
    ? facture.totalTTC 
    : 0;
  
  // Détecter les doublons
  const detectionDoublons = detecterDoublons(facture);
  
  // Montant réglé : utiliser le montant valide (limité au total TTC)
  const montantRegle = detectionDoublons.montantRegleValide;
  
  // Montant restant à régler (basé sur le montant valide)
  const montantRestant = Math.max(0, totalTTC - montantRegle);
  
  // Pourcentage réglé (basé sur le montant valide)
  const pourcentageRegle = totalTTC > 0 
    ? (montantRegle / totalTTC) * 100 
    : 0;
  
  // Déterminer le statut
  // Si doublons détectés, on considère comme "regle" mais avec un avertissement
  let statut: 'non_regle' | 'partiel' | 'regle' | 'depasse';
  if (detectionDoublons.aDoublons) {
    // Si le montant brut dépasse, c'est un cas de "dépassé" (trop payé)
    statut = 'depasse';
  } else if (montantRegle === 0) {
    statut = 'non_regle';
  } else if (Math.abs(montantRestant) < 0.01) {
    statut = 'regle';
  } else if (montantRestant > 0) {
    statut = 'partiel';
  } else {
    statut = 'depasse'; // Cas théorique où montantRegle > totalTTC mais pas de doublons détectés
  }
  
  // Calculer les acomptes prévus selon les règles du fournisseur
  const reglePaiement = obtenirReglePaiement(facture.fournisseur);
  let acomptesPrevu: Array<{ montant: number; dateEcheance: Date; type: 'acompte' | 'solde' }> | undefined;
  
  if (reglePaiement) {
    const dateFacture = new Date(facture.date);
    const delaiBase = reglePaiement.delaiPaiement || 30;
    
    // RB DRINKS - Acompte en avance + solde
    if (reglePaiement.paiementAvance && reglePaiement.pourcentageAcompte && reglePaiement.nombreAcomptes === 1) {
      const montantAcompte = (totalTTC * reglePaiement.pourcentageAcompte) / 100;
      const montantSolde = totalTTC - montantAcompte;
      
      acomptesPrevu = [
        {
          montant: montantAcompte,
          dateEcheance: new Date(dateFacture),
          type: 'acompte',
        },
        {
          montant: montantSolde,
          dateEcheance: new Date(
            dateFacture.getTime() + delaiBase * 24 * 60 * 60 * 1000
          ),
          type: 'solde',
        },
      ];
    }
    // LEHMANN - 3 fois (1/3 à 30J, 1/3 à 60J, 1/3 à 90J)
    else if (facture.fournisseur === 'LEHMANN' && reglePaiement.nombreAcomptes === 3) {
      const montantParTranche = totalTTC / 3;
      
      acomptesPrevu = [
        {
          montant: montantParTranche,
          dateEcheance: new Date(dateFacture.getTime() + 30 * 24 * 60 * 60 * 1000),
          type: 'solde',
        },
        {
          montant: montantParTranche,
          dateEcheance: new Date(dateFacture.getTime() + 60 * 24 * 60 * 60 * 1000),
          type: 'solde',
        },
        {
          montant: montantParTranche,
          dateEcheance: new Date(dateFacture.getTime() + 90 * 24 * 60 * 60 * 1000),
          type: 'solde',
        },
      ];
    }
    // ITALESSE - En avance et en plusieurs fois
    else if (facture.fournisseur === 'ITALESSE' && reglePaiement.paiementAvance && reglePaiement.nombreAcomptes === 2) {
      const montantAvance = totalTTC / 2;
      const montantSolde = totalTTC - montantAvance;
      
      acomptesPrevu = [
        {
          montant: montantAvance,
          dateEcheance: new Date(dateFacture),
          type: 'acompte',
        },
        {
          montant: montantSolde,
          dateEcheance: new Date(
            dateFacture.getTime() + delaiBase * 24 * 60 * 60 * 1000
          ),
          type: 'solde',
        },
      ];
    }
  }
  
  // Trouver la prochaine échéance
  const prochaineEcheance = reglements
    .filter(r => r.statut === 'en_attente' && r.dateEcheance)
    .map(r => r.dateEcheance!)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  
  return {
    facture,
    reglements,
    montantRegle,
    montantRestant,
    pourcentageRegle,
    statut,
    prochaineEcheance,
    acomptesPrevu,
    // Ajouter les informations sur les doublons dans les données brutes
    // (via une extension de l'interface si nécessaire)
  } as EtatReglementFacture & { 
    aDoublons?: boolean; 
    montantRegleBrut?: number; 
    reglementsEnDoublon?: Reglement[];
  };
}

/**
 * Nettoie automatiquement les doublons d'une facture
 * Supprime les règlements en doublon en gardant les plus pertinents
 */
export function nettoyerDoublons(facture: Facture): {
  reglementsSupprimes: Reglement[];
  reglementsAjustes: Array<{ reglement: Reglement; ancienMontant: number; nouveauMontant: number }>;
} {
  const detection = detecterDoublons(facture);
  
  if (!detection.aDoublons) {
    return { reglementsSupprimes: [], reglementsAjustes: [] };
  }
  
  const reglements = obtenirReglementsFacture(facture.id);
  const totalTTC = typeof facture.totalTTC === 'number' && !isNaN(facture.totalTTC) 
    ? facture.totalTTC 
    : 0;
  
  const reglementsPayes = reglements.filter(r => r.statut === 'paye');
  
  // Trier par priorité : règlement_complet > autres, puis par date (plus récent en premier)
  const reglementsTries = [...reglementsPayes].sort((a, b) => {
    if (a.type === 'reglement_complet' && b.type !== 'reglement_complet') return -1;
    if (b.type === 'reglement_complet' && a.type !== 'reglement_complet') return 1;
    return new Date(b.dateReglement).getTime() - new Date(a.dateReglement).getTime();
  });
  
  const reglementsAGarder: Reglement[] = [];
  const reglementsASupprimer: Reglement[] = [];
  const reglementsAjustes: Array<{ reglement: Reglement; ancienMontant: number; nouveauMontant: number }> = [];
  
  let totalCumule = 0;
  
  for (const reglement of reglementsTries) {
    if (totalCumule + reglement.montant <= totalTTC + 0.01) {
      // On peut garder ce règlement en entier
      reglementsAGarder.push(reglement);
      totalCumule += reglement.montant;
    } else {
      // Ce règlement dépasse
      const montantRestant = totalTTC - totalCumule;
      
      if (montantRestant > 0.01 && reglementsAGarder.length === 0) {
        // Si c'est le premier règlement et qu'il dépasse, on l'ajuste
        const ancienMontant = reglement.montant;
        mettreAJourReglement(reglement.id, {
          montant: montantRestant,
        });
        reglementsAjustes.push({
          reglement,
          ancienMontant,
          nouveauMontant: montantRestant,
        });
        reglementsAGarder.push(reglement);
        totalCumule = totalTTC;
      } else {
        // Sinon, on le supprime
        reglementsASupprimer.push(reglement);
      }
    }
  }
  
  // Supprimer les règlements en doublon
  reglementsASupprimer.forEach(r => supprimerReglement(r.id));
  
  return {
    reglementsSupprimes: reglementsASupprimer,
    reglementsAjustes,
  };
}

/**
 * Valide la cohérence des règlements d'une facture
 * Retourne les problèmes détectés
 */
export function validerReglements(facture: Facture): {
  valide: boolean;
  problemes: string[];
  avertissements: string[];
} {
  const reglements = obtenirReglementsFacture(facture.id);
  const totalTTC = typeof facture.totalTTC === 'number' && !isNaN(facture.totalTTC) 
    ? facture.totalTTC 
    : 0;
  
  const problemes: string[] = [];
  const avertissements: string[] = [];
  
  // Vérifier les doublons
  const detection = detecterDoublons(facture);
  if (detection.aDoublons) {
    problemes.push(
      `Doublons détectés : ${detection.montantRegleBrut.toFixed(2)}€ réglés au lieu de ${totalTTC.toFixed(2)}€ (excès de ${(detection.montantRegleBrut - totalTTC).toFixed(2)}€)`
    );
  }
  
  // Vérifier les montants négatifs ou nuls
  const reglementsInvalides = reglements.filter(r => r.montant <= 0);
  if (reglementsInvalides.length > 0) {
    problemes.push(`${reglementsInvalides.length} règlement(s) avec montant invalide (≤ 0)`);
  }
  
  // Vérifier les dates incohérentes
  const reglementsDatesIncoherentes = reglements.filter(r => {
    if (r.dateEcheance && r.dateReglement) {
      return new Date(r.dateReglement) < new Date(r.dateEcheance);
    }
    return false;
  });
  if (reglementsDatesIncoherentes.length > 0) {
    avertissements.push(`${reglementsDatesIncoherentes.length} règlement(s) avec date de règlement antérieure à l'échéance`);
  }
  
  // Vérifier les règlements en attente qui dépassent le montant restant
  const montantRegle = detection.montantRegleValide;
  const montantRestant = Math.max(0, totalTTC - montantRegle);
  const reglementsEnAttente = reglements.filter(r => r.statut === 'en_attente');
  const montantEnAttente = reglementsEnAttente.reduce((sum, r) => sum + r.montant, 0);
  
  if (montantEnAttente > montantRestant + 0.01) {
    avertissements.push(
      `Montant en attente (${montantEnAttente.toFixed(2)}€) dépasse le montant restant (${montantRestant.toFixed(2)}€)`
    );
  }
  
  return {
    valide: problemes.length === 0,
    problemes,
    avertissements,
  };
}

/**
 * Charge les règles de paiement depuis le stockage local
 */
export function chargerReglesPaiement(): Map<Fournisseur, ReglePaiementFournisseur> {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY_REGLES_PAIEMENT);
    const regles = new Map<Fournisseur, ReglePaiementFournisseur>();
    
    // Charger les règles sauvegardées
    if (donnees) {
      const reglesArray = JSON.parse(donnees) as ReglePaiementFournisseur[];
      reglesArray.forEach(regle => {
        regles.set(regle.fournisseur, regle);
      });
    }
    
    // Ajouter les règles par défaut pour les fournisseurs non configurés
    Object.values(REGLES_PAIEMENT_DEFAUT).forEach(regle => {
      if (!regles.has(regle.fournisseur)) {
        regles.set(regle.fournisseur, regle);
      }
    });
    
    return regles;
  } catch (error) {
    console.error('Erreur lors du chargement des règles de paiement:', error);
    return new Map(Object.entries(REGLES_PAIEMENT_DEFAUT));
  }
}

/**
 * Obtient la règle de paiement pour un fournisseur
 */
export function obtenirReglePaiement(fournisseur: Fournisseur): ReglePaiementFournisseur | undefined {
  const regles = chargerReglesPaiement();
  return regles.get(fournisseur);
}

/**
 * Sauvegarde une règle de paiement
 */
export function sauvegarderReglePaiement(regle: ReglePaiementFournisseur): void {
  const regles = chargerReglesPaiement();
  regles.set(regle.fournisseur, regle);
  
  const reglesArray = Array.from(regles.values());
  localStorage.setItem(STORAGE_KEY_REGLES_PAIEMENT, JSON.stringify(reglesArray));
}

/**
 * Calcule les statistiques de règlements
 * Version refondue avec détection des doublons
 */
export function calculerStatistiquesReglements(factures: Facture[]): StatistiquesReglements {
  const reglements = chargerReglements();
  const reglementsPayes = reglements.filter(r => r.statut === 'paye');
  
  const etats = factures.map(f => calculerEtatReglement(f));
  
  // Compter les factures par statut (en excluant les "depasse" qui sont des doublons)
  const facturesReglees = etats.filter(e => e.statut === 'regle').length;
  const facturesPartielles = etats.filter(e => e.statut === 'partiel').length;
  const facturesNonReglees = etats.filter(e => e.statut === 'non_regle').length;
  
  // Calculer les totaux
  const totalARegler = factures.reduce((sum, f) => {
    const totalTTC = typeof f.totalTTC === 'number' && !isNaN(f.totalTTC) ? f.totalTTC : 0;
    return sum + totalTTC;
  }, 0);
  
  // Total réglé : utiliser les montants valides (sans doublons)
  const totalRegle = etats.reduce((sum, e) => sum + e.montantRegle, 0);
  
  // Total en attente : seulement les règlements en attente
  const totalEnAttente = reglements
    .filter(r => r.statut === 'en_attente')
    .reduce((sum, r) => {
      const montant = typeof r.montant === 'number' && !isNaN(r.montant) ? r.montant : 0;
      return sum + montant;
    }, 0);
  
  // Statistiques par fournisseur
  const parFournisseur: Record<Fournisseur, {
    nombreFactures: number;
    totalARegler: number;
    totalRegle: number;
    facturesReglees: number;
    facturesNonReglees: number;
  }> = {};
  
  factures.forEach(facture => {
    if (!parFournisseur[facture.fournisseur]) {
      parFournisseur[facture.fournisseur] = {
        nombreFactures: 0,
        totalARegler: 0,
        totalRegle: 0,
        facturesReglees: 0,
        facturesNonReglees: 0,
      };
    }
    
    const etat = calculerEtatReglement(facture);
    const totalTTC = typeof facture.totalTTC === 'number' && !isNaN(facture.totalTTC) ? facture.totalTTC : 0;
    
    parFournisseur[facture.fournisseur].nombreFactures++;
    parFournisseur[facture.fournisseur].totalARegler += totalTTC;
    parFournisseur[facture.fournisseur].totalRegle += etat.montantRegle;
    
    if (etat.statut === 'regle') {
      parFournisseur[facture.fournisseur].facturesReglees++;
    } else if (etat.statut === 'non_regle') {
      parFournisseur[facture.fournisseur].facturesNonReglees++;
    }
  });
  
  return {
    nombreFactures: factures.length,
    facturesReglees,
    facturesPartielles,
    facturesNonReglees,
    totalARegler,
    totalRegle,
    totalEnAttente,
    parFournisseur,
  };
}

/**
 * Crée automatiquement les acomptes prévus pour une facture selon les règles du fournisseur
 * Version simplifiée et améliorée
 */
export function creerAcomptesPrevu(facture: Facture): Reglement[] {
  const reglePaiement = obtenirReglePaiement(facture.fournisseur);
  
  if (!reglePaiement) {
    return [];
  }
  
  // Vérifier qu'il n'y a pas déjà des règlements
  const reglementsExistants = obtenirReglementsFacture(facture.id);
  if (reglementsExistants.length > 0) {
    console.warn('Des règlements existent déjà pour cette facture. Utilisez creerAcomptesPrevuAvecPourcentage pour personnaliser.');
    return [];
  }
  
  const reglements: Reglement[] = [];
  const dateFacture = new Date(facture.date);
  const delaiBase = reglePaiement.delaiPaiement || 30;
  const totalTTC = typeof facture.totalTTC === 'number' && !isNaN(facture.totalTTC) ? facture.totalTTC : 0;
  
  // Cas 1: RB DRINKS - Acompte en avance + solde (avec pourcentage par défaut)
  if (reglePaiement.paiementAvance && reglePaiement.pourcentageAcompte && reglePaiement.nombreAcomptes === 1) {
    const montantAcompte = (totalTTC * reglePaiement.pourcentageAcompte) / 100;
    const montantSolde = totalTTC - montantAcompte;
    
    // Acompte en avance (date de la facture)
    reglements.push({
      id: `acompte-${facture.id}-${Date.now()}-1`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'acompte',
      montant: montantAcompte,
      dateReglement: new Date(),
      dateEcheance: new Date(dateFacture),
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: `Acompte de ${reglePaiement.pourcentageAcompte}%`,
      dateCreation: new Date(),
      dateModification: new Date(),
    });
    
    // Solde
    const dateEcheanceSolde = new Date(
      dateFacture.getTime() + delaiBase * 24 * 60 * 60 * 1000
    );
    
    reglements.push({
      id: `solde-${facture.id}-${Date.now()}-2`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'solde',
      montant: montantSolde,
      dateReglement: new Date(),
      dateEcheance: dateEcheanceSolde,
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: `Solde (${100 - reglePaiement.pourcentageAcompte}%)`,
      dateCreation: new Date(),
      dateModification: new Date(),
    });
  }
  // Cas 2: LEHMANN - Paiement en 3 fois (1/3 à 30J, 1/3 à 60J, 1/3 à 90J)
  else if (facture.fournisseur === 'LEHMANN' && reglePaiement.nombreAcomptes === 3) {
    const montantParTranche = facture.totalTTC / 3;
    
    // 1/3 à 30 jours
    const dateEcheance1 = new Date(
      dateFacture.getTime() + 30 * 24 * 60 * 60 * 1000
    );
    reglements.push({
      id: `reglement-${facture.id}-${Date.now()}-1`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'reglement_complet',
      montant: montantParTranche,
      dateReglement: new Date(),
      dateEcheance: dateEcheance1,
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: '1/3 à 30 jours (FDM)',
      dateCreation: new Date(),
      dateModification: new Date(),
    });
    
    // 1/3 à 60 jours
    const dateEcheance2 = new Date(
      dateFacture.getTime() + 60 * 24 * 60 * 60 * 1000
    );
    reglements.push({
      id: `reglement-${facture.id}-${Date.now()}-2`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'reglement_complet',
      montant: montantParTranche,
      dateReglement: new Date(),
      dateEcheance: dateEcheance2,
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: '1/3 à 60 jours (FDM)',
      dateCreation: new Date(),
      dateModification: new Date(),
    });
    
    // 1/3 à 90 jours
    const dateEcheance3 = new Date(
      dateFacture.getTime() + 90 * 24 * 60 * 60 * 1000
    );
    reglements.push({
      id: `reglement-${facture.id}-${Date.now()}-3`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'reglement_complet',
      montant: montantParTranche,
      dateReglement: new Date(),
      dateEcheance: dateEcheance3,
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: '1/3 à 90 jours (FDM)',
      dateCreation: new Date(),
      dateModification: new Date(),
    });
  }
  // Cas 3: ITALESSE - En avance et en plusieurs fois
  else if (facture.fournisseur === 'ITALESSE' && reglePaiement.paiementAvance && reglePaiement.nombreAcomptes === 2) {
    // Premier paiement en avance (50%)
    const montantAvance = facture.totalTTC / 2;
    reglements.push({
      id: `acompte-${facture.id}-${Date.now()}-1`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'acompte',
      montant: montantAvance,
      dateReglement: new Date(),
      dateEcheance: new Date(dateFacture),
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: 'Acompte en avance',
      dateCreation: new Date(),
      dateModification: new Date(),
    });
    
    // Solde à 30 jours
    const montantSolde = facture.totalTTC - montantAvance;
    const dateEcheanceSolde = new Date(
      dateFacture.getTime() + delaiBase * 24 * 60 * 60 * 1000
    );
    reglements.push({
      id: `solde-${facture.id}-${Date.now()}-2`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'solde',
      montant: montantSolde,
      dateReglement: new Date(),
      dateEcheance: dateEcheanceSolde,
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: 'Solde',
      dateCreation: new Date(),
      dateModification: new Date(),
    });
  }
  
  return reglements;
}

/**
 * Crée automatiquement les acomptes avec un pourcentage personnalisé
 */
export function creerAcomptesPrevuAvecPourcentage(
  facture: Facture, 
  reglePaiement: ReglePaiementFournisseur
): Reglement[] {
  const reglements: Reglement[] = [];
  const dateFacture = new Date(facture.date);
  const delaiBase = reglePaiement.delaiPaiement || 30;
  
  // RB DRINKS - Acompte en avance + solde avec pourcentage personnalisé
  if (facture.fournisseur === 'RB DRINKS' && reglePaiement.paiementAvance && reglePaiement.pourcentageAcompte) {
    const montantAcompte = (facture.totalTTC * reglePaiement.pourcentageAcompte) / 100;
    const montantSolde = facture.totalTTC - montantAcompte;
    
    // Acompte en avance (date de la facture)
    reglements.push({
      id: `acompte-${facture.id}-${Date.now()}-1`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'acompte',
      montant: montantAcompte,
      dateReglement: new Date(),
      dateEcheance: new Date(dateFacture),
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: `Acompte de ${reglePaiement.pourcentageAcompte}%`,
      dateCreation: new Date(),
      dateModification: new Date(),
    });
    
    // Solde
    const dateEcheanceSolde = new Date(
      dateFacture.getTime() + delaiBase * 24 * 60 * 60 * 1000
    );
    
    reglements.push({
      id: `solde-${facture.id}-${Date.now()}-2`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'solde',
      montant: montantSolde,
      dateReglement: new Date(),
      dateEcheance: dateEcheanceSolde,
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: `Solde (${100 - reglePaiement.pourcentageAcompte}%)`,
      dateCreation: new Date(),
      dateModification: new Date(),
    });
  }
  // ITALESSE - En avance et en plusieurs fois avec pourcentage personnalisé
  else if (facture.fournisseur === 'ITALESSE' && reglePaiement.paiementAvance && reglePaiement.pourcentageAcompte) {
    const montantAvance = (facture.totalTTC * reglePaiement.pourcentageAcompte) / 100;
    const montantSolde = facture.totalTTC - montantAvance;
    
    // Premier paiement en avance
    reglements.push({
      id: `acompte-${facture.id}-${Date.now()}-1`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'acompte',
      montant: montantAvance,
      dateReglement: new Date(),
      dateEcheance: new Date(dateFacture),
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: `Acompte de ${reglePaiement.pourcentageAcompte}% en avance`,
      dateCreation: new Date(),
      dateModification: new Date(),
    });
    
    // Solde à 30 jours
    const dateEcheanceSolde = new Date(
      dateFacture.getTime() + delaiBase * 24 * 60 * 60 * 1000
    );
    reglements.push({
      id: `solde-${facture.id}-${Date.now()}-2`,
      factureId: facture.id,
      numeroFacture: facture.numero,
      fournisseur: facture.fournisseur,
      type: 'solde',
      montant: montantSolde,
      dateReglement: new Date(),
      dateEcheance: dateEcheanceSolde,
      statut: 'en_attente',
      modePaiement: reglePaiement.modePaiementDefaut,
      notes: `Solde (${100 - reglePaiement.pourcentageAcompte}%)`,
      dateCreation: new Date(),
      dateModification: new Date(),
    });
  }
  
  return reglements;
}

