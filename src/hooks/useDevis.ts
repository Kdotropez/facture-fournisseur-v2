/**
 * Hook React pour gérer les devis fournisseurs
 */

import { useState, useEffect, useCallback } from 'react';
import type { Devis } from '../types/devis';
import type { Fournisseur } from '../types/facture';
import {
  chargerDevis,
  sauvegarderDevis,
  ajouterDevis as ajouterDevisService,
  supprimerDevis as supprimerDevisService,
  mettreAJourDevis as mettreAJourDevisService,
  filtrerDevisParFournisseur,
} from '../services/devisService';

export function useDevis() {
  const [devis, setDevis] = useState<Devis[]>([]);
  const [chargement, setChargement] = useState(true);
  const [termeRecherche, setTermeRecherche] = useState('');
  const [fournisseurFiltre, setFournisseurFiltre] = useState<Fournisseur | null>(null);

  const rechargerDevis = useCallback(async () => {
    const devisCharges = await chargerDevis();
    setDevis(devisCharges);
    setChargement(false);
  }, []);

  useEffect(() => {
    rechargerDevis();
  }, [rechargerDevis]);

  const ajouterDevis = useCallback(async (nouveauDevis: Devis) => {
    await ajouterDevisService(nouveauDevis);
    const devisCharges = await chargerDevis();
    setDevis(devisCharges);
  }, []);

  const supprimerDevis = useCallback(async (id: string) => {
    await supprimerDevisService(id);
    setDevis(prev => prev.filter(d => d.id !== id));
  }, []);

  const mettreAJourDevis = useCallback(async (devisModifie: Devis) => {
    await mettreAJourDevisService(devisModifie);
    setDevis(prev => prev.map(d => (d.id === devisModifie.id ? devisModifie : d)));
  }, []);

  const remplacerDevis = useCallback(async (nouveauxDevis: Devis[]) => {
    await sauvegarderDevis(nouveauxDevis);
    setDevis(nouveauxDevis);
  }, []);

  const devisFiltres = filtrerDevisParFournisseur(
    devis.filter(d => {
      if (!termeRecherche.trim()) return true;
      const termeLower = termeRecherche.toLowerCase();
      return (
        d.numero.toLowerCase().includes(termeLower) ||
        d.fournisseur.toLowerCase().includes(termeLower) ||
        d.lignes.some(l => l.description.toLowerCase().includes(termeLower))
      );
    }),
    fournisseurFiltre
  );

  return {
    devis: devisFiltres,
    tousLesDevis: devis,
    chargement,
    termeRecherche,
    setTermeRecherche,
    fournisseurFiltre,
    setFournisseurFiltre,
    ajouterDevis,
    supprimerDevis,
    mettreAJourDevis,
    remplacerDevis,
  };
}





