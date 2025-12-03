/**
 * Service utilitaire pour renommer un fournisseur partout dans les données
 */

import type { Fournisseur } from '../types/facture';
import { chargerFactures, sauvegarderFactures } from './factureService';
import { chargerDevis, sauvegarderDevis } from './devisService';
import {
  chargerReferencesFournisseur,
  sauvegarderReferencesFournisseur,
} from './referencesFournisseurService';
import { chargerFournisseursPersonnalises } from './fournisseursService';

/**
 * Renomme un fournisseur dans toutes les factures
 */
function renommerFournisseurDansFactures(ancienNom: Fournisseur, nouveauNom: Fournisseur): void {
  const factures = chargerFactures();
  let modifie = false;

  const facturesModifiees = factures.map((f) => {
    if (f.fournisseur === ancienNom) {
      modifie = true;
      return { ...f, fournisseur: nouveauNom };
    }
    return f;
  });

  if (modifie) {
    sauvegarderFactures(facturesModifiees);
  }
}

/**
 * Renomme un fournisseur dans tous les devis
 */
function renommerFournisseurDansDevis(ancienNom: Fournisseur, nouveauNom: Fournisseur): void {
  const devis = chargerDevis();
  let modifie = false;

  const devisModifies = devis.map((d) => {
    if (d.fournisseur === ancienNom) {
      modifie = true;
      return { ...d, fournisseur: nouveauNom };
    }
    return d;
  });

  if (modifie) {
    sauvegarderDevis(devisModifies);
  }
}

/**
 * Renomme un fournisseur dans les références produits mémorisées
 */
function renommerFournisseurDansReferences(
  ancienNom: Fournisseur,
  nouveauNom: Fournisseur
): void {
  const references = chargerReferencesFournisseur();
  const nouvellesReferences = new Map<string, ReturnType<typeof references.get>>();

  references.forEach((ref, cle) => {
    if (!ref) return;
    const fournisseur = ref.fournisseur === ancienNom ? nouveauNom : ref.fournisseur;
    const nouvelleCle = `${fournisseur}__${ref.reference}`;
    nouvellesReferences.set(nouvelleCle, {
      ...ref,
      fournisseur,
    });
  });

  sauvegarderReferencesFournisseur(nouvellesReferences);
}

/**
 * Renomme un fournisseur dans la liste des fournisseurs personnalisés
 * (pour que les menus déroulants n'affichent pas l'ancien nom)
 */
function renommerFournisseurPersonnalise(
  ancienNom: Fournisseur,
  nouveauNom: Fournisseur
): void {
  try {
    const existants = chargerFournisseursPersonnalises();
    const misAJour = Array.from(
      new Set(
        existants.map((f) => (f === ancienNom ? (nouveauNom as Fournisseur) : f))
      )
    ) as Fournisseur[];

    // Réécrire directement dans le localStorage utilisé par fournisseursService
    localStorage.setItem('fournisseurs-personnalises', JSON.stringify(misAJour));
  } catch {
    // On ne bloque pas en cas d'erreur ici
  }
}

/**
 * Renomme un fournisseur partout (factures, devis, références, fournisseurs perso)
 */
export function renommerFournisseurGlobal(
  ancienNom: Fournisseur,
  nouveauNom: Fournisseur
): void {
  if (!nouveauNom.trim() || ancienNom === nouveauNom) {
    return;
  }

  const nomNettoye = (nouveauNom.trim() as Fournisseur);

  renommerFournisseurDansFactures(ancienNom, nomNettoye);
  renommerFournisseurDansDevis(ancienNom, nomNettoye);
  renommerFournisseurDansReferences(ancienNom, nomNettoye);
  renommerFournisseurPersonnalise(ancienNom, nomNettoye);
}


