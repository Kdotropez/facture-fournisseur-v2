/**
 * Hook React pour gérer les factures
 */

import { useState, useEffect, useCallback } from 'react';
import type { Facture, Fournisseur, Statistiques } from '../types/facture';
import {
  chargerFactures,
  sauvegarderFactures,
  ajouterFacture as ajouterFactureService,
  supprimerFacture as supprimerFactureService,
  mettreAJourFacture as mettreAJourFactureService,
  calculerStatistiques,
  rechercherFactures,
  filtrerParFournisseur,
} from '../services/factureService';
import { supprimerReglementsParFactureId } from '../services/reglementService';

export function useFactures() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [chargement, setChargement] = useState(true);
  const [termeRecherche, setTermeRecherche] = useState('');
  const [fournisseurFiltre, setFournisseurFiltre] = useState<Fournisseur | null>(null);

  // Charger les factures au montage et après chaque modification
  const rechargerFactures = useCallback(() => {
    const facturesChargees = chargerFactures();
    setFactures(facturesChargees);
    setChargement(false);
  }, []);

  useEffect(() => {
    rechargerFactures();
  }, [rechargerFactures]);

  // Ajouter une facture
  const ajouterFacture = useCallback((facture: Facture) => {
    ajouterFactureService(facture);
    // Recharger depuis le localStorage pour être sûr d'avoir les dernières données
    const facturesChargees = chargerFactures();
    setFactures(facturesChargees);
  }, []);

  // Supprimer une facture
  const supprimerFacture = useCallback((id: string) => {
    // Supprimer d'abord tous les règlements associés à cette facture
    try {
      supprimerReglementsParFactureId(id);
    } catch (error) {
      console.error('Erreur lors de la suppression des règlements liés à la facture:', error);
    }

    // Puis supprimer la facture elle-même
    supprimerFactureService(id);
    setFactures(prev => prev.filter(f => f.id !== id));
  }, []);

  // Mettre à jour une facture
  const mettreAJourFacture = useCallback((facture: Facture) => {
    mettreAJourFactureService(facture);
    setFactures(prev => prev.map(f => f.id === facture.id ? facture : f));
  }, []);

  // Remplacer toutes les factures (restauration)
  const remplacerFactures = useCallback((nouvellesFactures: Facture[]) => {
    sauvegarderFactures(nouvellesFactures);
    setFactures(nouvellesFactures);
  }, []);

  // Calculer les statistiques
  const statistiques: Statistiques = calculerStatistiques(factures);

  // Filtrer et rechercher les factures
  const facturesFiltrees = filtrerParFournisseur(
    rechercherFactures(factures, termeRecherche),
    fournisseurFiltre
  );

  return {
    factures: facturesFiltrees,
    toutesLesFactures: factures,
    chargement,
    statistiques,
    termeRecherche,
    setTermeRecherche,
    fournisseurFiltre,
    setFournisseurFiltre,
    ajouterFacture,
    supprimerFacture,
    mettreAJourFacture,
    remplacerFactures,
  };
}



