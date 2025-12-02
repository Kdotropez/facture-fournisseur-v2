/**
 * Service pour la gestion des devis fournisseurs
 * Stockage dans localStorage (clé séparée des factures)
 */

import type {
  Devis,
  SyntheseComparaisonDevis,
  ComparaisonLigneDevis,
  LivraisonDevis,
} from '../types/devis';
import type { Facture, Fournisseur, LigneProduit } from '../types/facture';

const STORAGE_KEY_DEVIS = 'devis-fournisseurs';

/**
 * Charge tous les devis depuis le stockage local
 */
export function chargerDevis(): Devis[] {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY_DEVIS);
    if (!donnees) return [];

    const devis = JSON.parse(donnees) as Devis[];
    return devis.map(d => ({
      ...d,
      date: new Date(d.date),
      dateValidite: d.dateValidite ? new Date(d.dateValidite) : undefined,
      dateImport: new Date(d.dateImport),
    }));
  } catch (error) {
    console.error('Erreur lors du chargement des devis:', error);
    return [];
  }
}

/**
 * Sauvegarde tous les devis dans le stockage local
 */
export function sauvegarderDevis(devis: Devis[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_DEVIS, JSON.stringify(devis));
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des devis:', error);
    throw error;
  }
}

export function ajouterDevis(devis: Devis): void {
  const tous = chargerDevis();
  tous.push(devis);
  sauvegarderDevis(tous);
}

export function supprimerDevis(id: string): void {
  const tous = chargerDevis();
  const filtres = tous.filter(d => d.id !== id);
  sauvegarderDevis(filtres);
}

export function mettreAJourDevis(devis: Devis): void {
  const tous = chargerDevis();
  const index = tous.findIndex(d => d.id === devis.id);
  if (index !== -1) {
    tous[index] = devis;
    sauvegarderDevis(tous);
  }
}

export function obtenirDevis(id: string): Devis | undefined {
  return chargerDevis().find(d => d.id === id);
}

/** Ajoute une livraison à un devis et retourne le devis mis à jour */
export function ajouterLivraisonAuDevis(devis: Devis, livraison: LivraisonDevis): Devis {
  const livraisons = [...(devis.livraisons || []), livraison];
  const devisMisAJour: Devis = {
    ...devis,
    livraisons,
  };
  mettreAJourDevis(devisMisAJour);
  return devisMisAJour;
}

export function filtrerDevisParFournisseur(
  devis: Devis[],
  fournisseur: Fournisseur | null
): Devis[] {
  if (!fournisseur) return devis;
  return devis.filter(d => d.fournisseur === fournisseur);
}

/**
 * Normalise une ligne pour la comparaison (priorité ref/logo/BAT puis description)
 */
function cleLigne(ligne: LigneProduit): string {
  const base =
    ligne.refFournisseur ||
    ligne.logo ||
    ligne.bat ||
    ligne.description;

  return base
    .toString()
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * Compare un devis avec les factures liées (par ID)
 */
export function comparerDevisAvecFactures(
  devis: Devis,
  toutesLesFactures: Facture[]
): SyntheseComparaisonDevis {
  const facturesLiees = (devis.facturesLieesIds || [])
    .map(id => toutesLesFactures.find(f => f.id === id))
    .filter((f): f is Facture => !!f);

  const lignesComparaison: ComparaisonLigneDevis[] = devis.lignes.map(ligneDevis => {
    const cleDevis = cleLigne(ligneDevis);

    const lignesFacture: LigneProduit[] = [];
    facturesLiees.forEach(facture => {
      facture.lignes.forEach(ligneFacture => {
        if (cleLigne(ligneFacture) === cleDevis) {
          lignesFacture.push(ligneFacture);
        }
      });
    });

    const quantiteFactureeAuto = lignesFacture.reduce(
      (sum, l) => sum + (typeof l.quantite === 'number' ? l.quantite : 0),
      0
    );

    const montantTotalFactureHT = lignesFacture.reduce(
      (sum, l) => sum + (typeof l.montantHT === 'number' ? l.montantHT : 0),
      0
    );

    const quantiteFacturee =
      typeof ligneDevis.quantiteFactureeManuelle === 'number'
        ? ligneDevis.quantiteFactureeManuelle
        : quantiteFactureeAuto;

    const prixUnitaireMoyenFacture =
      quantiteFactureeAuto > 0 ? montantTotalFactureHT / quantiteFactureeAuto : null;

    return {
      ligneDevis,
      quantiteFacturee,
      quantiteFactureeAuto,
      ecartQuantite: quantiteFacturee - ligneDevis.quantite,
      prixUnitaireMoyenFacture,
      ecartPrixUnitaire:
        prixUnitaireMoyenFacture !== null
          ? prixUnitaireMoyenFacture - ligneDevis.prixUnitaireHT
          : null,
      montantLigneDevis: ligneDevis.montantHT,
    };
  });

  const totalDevisTTC = devis.totalTTC;
  const totalFacturesTTC = facturesLiees.reduce(
    (sum, f) => sum + (typeof f.totalTTC === 'number' ? f.totalTTC : 0),
    0
  );

  // 1) Montant HT "reçu" calculé à partir des quantités reçues (facturées ou saisies manuellement)
  const totalRecuHTFOB = lignesComparaison.reduce((sum, ligne) => {
    const qte = typeof ligne.quantiteFacturee === 'number' ? ligne.quantiteFacturee : 0;
    const pu = ligne.ligneDevis.prixUnitaireHT || 0;
    return sum + qte * pu;
  }, 0);

  // 2) Si des livraisons globales existent encore dans le devis, on les additionne par sécurité
  const totalLivraisonsTTCDepuisLivraisons = (devis.livraisons || []).reduce(
    (sum, l) => sum + (typeof l.montantTTC === 'number' ? l.montantTTC : 0),
    0
  );

  // 3) Coefficients de transport et de TVA basés sur les totaux du devis
  const donnees = devis.donneesBrutes;
  const totalHTFOBDevis =
    (donnees && typeof donnees.totalHTFOB === 'number' && donnees.totalHTFOB > 0
      ? donnees.totalHTFOB
      : devis.totalHT) || 0;
  const transportEtDouanesDevis =
    (donnees && typeof donnees.transportEtDouanes === 'number'
      ? donnees.transportEtDouanes
      : 0) || 0;
  const totalHTGlobalDevis =
    (donnees && typeof donnees.totalHTGlobal === 'number' && donnees.totalHTGlobal > 0
      ? donnees.totalHTGlobal
      : totalHTFOBDevis + transportEtDouanesDevis) || 0;

  const totalTVADevis = typeof devis.totalTVA === 'number' ? devis.totalTVA : 0;

  const coefTransport =
    totalHTFOBDevis > 0 ? transportEtDouanesDevis / totalHTFOBDevis : 0;
  const coefTVA = totalHTGlobalDevis > 0 ? totalTVADevis / totalHTGlobalDevis : 0;

  const totalRecuHTGlobal = totalRecuHTFOB * (1 + coefTransport);
  const totalLivraisonsTTCDerive = totalRecuHTGlobal * (1 + coefTVA);

  // 4) Total livraisons TTC = max(des livraisons saisies globalement, des livraisons dérivées des quantités reçues)
  const totalLivraisonsTTC = Math.max(
    totalLivraisonsTTCDerive,
    totalLivraisonsTTCDepuisLivraisons
  );

  return {
    devis,
    facturesLiees,
    lignes: lignesComparaison,
    totalDevisTTC,
    totalFacturesTTC,
    ecartGlobalTTC: totalFacturesTTC - totalDevisTTC,
    totalLivraisonsTTC,
    resteALivrerTTC: Math.max(0, totalDevisTTC - totalLivraisonsTTC),
  };
}


