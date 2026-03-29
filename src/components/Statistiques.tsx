/**
 * Composant d'affichage des statistiques (fournisseurs / produits)
 */

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, FileText, Building2, Euro, List, Layers, Eye, Edit3, X, Calendar } from 'lucide-react';
import type { Facture, Fournisseur, Statistiques } from '../types/facture';
import type { Devis } from '../types/devis';
import { normaliserNomFournisseur } from '../services/fournisseursService';
import { renommerFournisseurGlobal } from '../services/renommageFournisseurService';
import './Statistiques.css';

interface StatistiquesProps {
  factures: Facture[];
  devis: Devis[];
  onVoirFacture?: (facture: Facture) => void;
  /** Optionnel : appelé après un renommage de fournisseur pour recharger les données */
  onFournisseursMisAJour?: () => void;
}

type TypeSource = 'facture' | 'devis';

interface DocumentSource {
  id: string;
  fournisseur: Fournisseur;
  numero: string;
  date: Date;
  lignes: Facture['lignes'];
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  type: TypeSource;
  sourceFactureId?: string;
}

interface DocumentFiltre {
  document: DocumentSource;
  lignes: Facture['lignes'];
  totalHTLignes: number;
  totalTVALignes: number;
  totalTTCLignes: number;
}

interface LigneProduitDetail {
  id: string;
  numero: string;
  date: Date;
  quantite: number;
  montantHT: number;
  description: string;
  couleur?: string;
}

interface ProduitStatsDetail {
  ref: string;
  description: string;
  logo?: string;
  couleurs: Set<string>;
  quantiteTotale: number;
  montantHTTotal: number;
  lignes: LigneProduitDetail[];
}

type FournisseurProduits = Record<string, ProduitStatsDetail>;

type SensTri = 'asc' | 'desc';
type ColonneFournisseur = 'nom' | 'factures' | 'produits' | 'quantite' | 'ht' | 'tva' | 'ttc';
type ColonneProduit = 'ref' | 'description' | 'logo' | 'couleur' | 'quantite' | 'montant' | 'dernier';
type ColonneDetail = 'facture' | 'date' | 'quantite' | 'montant';

type LigneSyntheseTemps = {
  cle: string;
  libelle: string;
  nombreFactures: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
};

const fournisseursInitial: Record<
  Fournisseur,
  { nombre: number; totalHT: number; totalTVA: number; totalTTC: number }
> = {
  'RB DRINKS': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
  LEHMANN: { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
  'ITALESSE': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
};

const normaliserTexteComparaison = (valeur: string): string[] => {
  return valeur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
};

const scoreRattachementDocument = (devis: Devis, facture: Facture): number => {
  if (devis.fournisseur !== facture.fournisseur) return -1;
  if ((facture.totalTTC || 0) >= (devis.totalTTC || 0)) return -1;

  const tokensParent = new Set(normaliserTexteComparaison(devis.numero || ''));
  const tokensEnfant = normaliserTexteComparaison(facture.numero || '');
  const correspondances = tokensEnfant.filter((token) => tokensParent.has(token)).length;
  const bonusAcompte = (facture.numero || '').toLowerCase().includes('acompte') ? 5 : 0;
  const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
  const dateDevis = devis.date instanceof Date ? devis.date : new Date(devis.date);
  const bonusChronologie = dateFacture >= dateDevis ? 1 : 0;

  return correspondances * 10 + bonusAcompte + bonusChronologie;
};

const estPieceComptableAcompte = (devis: Devis, facture: Facture): boolean => {
  const numero = (facture.numero || '').toLowerCase();
  const totalFacture = typeof facture.totalTTC === 'number' ? facture.totalTTC : 0;
  const totalDevis = typeof devis.totalTTC === 'number' ? devis.totalTTC : 0;
  return numero.includes('acompte') || (totalDevis > 0 && totalFacture > 0 && totalFacture < totalDevis - 0.01);
};

export function StatistiquesComponent({
  factures,
  devis,
  onVoirFacture,
  onFournisseursMisAJour,
}: StatistiquesProps) {
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
      month: 'long',
      year: 'numeric',
    }).format(date);

  const formaterMois = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(date);

  const obtenirExerciceFiscal = (date: Date): string => {
    const mois = date.getMonth(); // 0-11
    const annee = date.getFullYear();
    const anneeDebut = mois >= 11 ? annee : annee - 1; // exercice du 1er déc au 30 nov
    return `${anneeDebut}/${anneeDebut + 1}`;
  };

  const [filtreDateDebut, setFiltreDateDebut] = useState('');
  const [filtreDateFin, setFiltreDateFin] = useState('');
  const [filtreRecherche, setFiltreRecherche] = useState('');
  const [exerciceFiltre, setExerciceFiltre] = useState('');
  const [modeSource, setModeSource] = useState<TypeSource>('facture');

  const libelleModeSource =
    modeSource === 'facture'
      ? 'Factures enregistrées'
      : 'Base prévisionnelle héritée (anciens devis)';

  const descriptionModeSource =
    modeSource === 'facture'
      ? 'Analyse basée sur les factures réellement enregistrées dans l’application.'
      : 'Analyse basée sur les anciens devis/estimations conservés pour comparaison historique.';

  const [triFournisseur, setTriFournisseur] = useState<{ colonne: ColonneFournisseur; sens: SensTri }>({
    colonne: 'ht',
    sens: 'desc',
  });
  const [triProduit, setTriProduit] = useState<{ colonne: ColonneProduit; sens: SensTri }>({
    colonne: 'montant',
    sens: 'desc',
  });
  const [triDetail, setTriDetail] = useState<{ colonne: ColonneDetail; sens: SensTri }>({
    colonne: 'date',
    sens: 'desc',
  });

  const [fournisseurSelectionne, setFournisseurSelectionne] = useState<string>('');
  const [produitSelectionne, setProduitSelectionne] = useState<string>('');
  const [sectionsVisibles, setSectionsVisibles] = useState({
    fournisseurs: true,
    produits: true,
    detailProduit: true,
    tempsMois: true,
    tempsExercice: true,
  });

  // Édition du nom de fournisseur
  const [fournisseurEnEdition, setFournisseurEnEdition] = useState<string | null>(null);
  const [nouveauNomFournisseur, setNouveauNomFournisseur] = useState('');

  const [traductions, setTraductions] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = window.localStorage.getItem('factures-traductions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('factures-traductions', JSON.stringify(traductions));
    } catch {
      // ignore
    }
  }, [traductions]);

  useEffect(() => {
    setFournisseurSelectionne('');
    setProduitSelectionne('');
  }, [modeSource]);

  const documentsSource = useMemo<DocumentSource[]>(() => {
    if (modeSource === 'devis') {
      return devis.map((d) => ({
        id: d.id,
        fournisseur: d.fournisseur,
        numero: d.numero,
        date: d.date instanceof Date ? d.date : new Date(d.date),
        lignes: d.lignes,
        totalHT: d.totalHT,
        totalTVA: d.totalTVA,
        totalTTC: d.totalTTC,
        type: 'devis',
      }));
    }

    const facturesParId = new Map(factures.map((facture) => [facture.id, facture]));
    const idsFacturesMasquees = new Set<string>();
    const factureVersParentInfere = new Map<string, string>();
    const idsFacturesLieesExplicitement = new Set(
      devis.flatMap((devisCourant) => devisCourant.facturesLieesIds || [])
    );

    factures.forEach((facture) => {
      if (idsFacturesLieesExplicitement.has(facture.id)) return;
      const numero = (facture.numero || '').toLowerCase();
      if (!numero.includes('acompte')) return;

      const meilleurParent = devis
        .map((devisCourant) => ({
          devis: devisCourant,
          score: scoreRattachementDocument(devisCourant, facture),
        }))
        .filter((candidat) => candidat.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (meilleurParent) {
        factureVersParentInfere.set(facture.id, meilleurParent.devis.id);
      }
    });

    const sourcesConsolidees: DocumentSource[] = [];

    devis.forEach((devisCourant) => {
      const facturesLiees = [
        ...(devisCourant.facturesLieesIds || []),
        ...factures
          .filter((facture) => factureVersParentInfere.get(facture.id) === devisCourant.id)
          .map((facture) => facture.id),
      ]
        .filter((id, index, array) => array.indexOf(id) === index)
        .map((id) => facturesParId.get(id))
        .filter((facture): facture is Facture => !!facture);

      if (facturesLiees.length === 0) {
        sourcesConsolidees.push({
          id: `principal-${devisCourant.id}`,
          fournisseur: devisCourant.fournisseur,
          numero: devisCourant.numero,
          date: devisCourant.date instanceof Date ? devisCourant.date : new Date(devisCourant.date),
          lignes: devisCourant.lignes,
          totalHT: devisCourant.totalHT,
          totalTVA: devisCourant.totalTVA,
          totalTTC: devisCourant.totalTTC,
          type: 'facture',
        });
        return;
      }

      facturesLiees.forEach((facture) => idsFacturesMasquees.add(facture.id));

      const facturesAcompte = facturesLiees.filter((facture) => estPieceComptableAcompte(devisCourant, facture));
      const facturesFinales = facturesLiees.filter((facture) => !facturesAcompte.includes(facture));
      const groupeSimpleDuplique =
        facturesAcompte.length === 0 &&
        facturesFinales.length === 1 &&
        Math.abs((facturesFinales[0].totalTTC || 0) - (devisCourant.totalTTC || 0)) < 0.01;

      if (groupeSimpleDuplique) {
        const factureFinale = facturesFinales[0];
        const lignesSource =
          devisCourant.lignes.length >= factureFinale.lignes.length ? devisCourant.lignes : factureFinale.lignes;
        sourcesConsolidees.push({
          id: `principal-${devisCourant.id}`,
          fournisseur: devisCourant.fournisseur,
          numero: devisCourant.numero,
          date: devisCourant.date instanceof Date ? devisCourant.date : new Date(devisCourant.date),
          lignes: lignesSource,
          totalHT: devisCourant.totalHT,
          totalTVA: devisCourant.totalTVA,
          totalTTC: devisCourant.totalTTC,
          type: 'facture',
          sourceFactureId: factureFinale.id,
        });
        return;
      }

      sourcesConsolidees.push({
        id: `principal-${devisCourant.id}`,
        fournisseur: devisCourant.fournisseur,
        numero: devisCourant.numero,
        date: devisCourant.date instanceof Date ? devisCourant.date : new Date(devisCourant.date),
        lignes: devisCourant.lignes,
        totalHT: devisCourant.totalHT,
        totalTVA: devisCourant.totalTVA,
        totalTTC: devisCourant.totalTTC,
        type: 'facture',
      });
    });

    factures.forEach((facture) => {
      if (idsFacturesMasquees.has(facture.id)) return;

      sourcesConsolidees.push({
        id: facture.id,
        fournisseur: facture.fournisseur,
        numero: facture.numero,
        date: facture.date instanceof Date ? facture.date : new Date(facture.date),
        lignes: facture.lignes,
        totalHT: facture.totalHT,
        totalTVA: facture.totalTVA,
        totalTTC: facture.totalTTC,
        type: 'facture',
        sourceFactureId: facture.id,
      });
    });

    return sourcesConsolidees;
  }, [factures, devis, modeSource]);

  const exercicesDisponibles = useMemo(() => {
    const exercices = new Set<string>();
    documentsSource.forEach((doc) => {
      exercices.add(obtenirExerciceFiscal(doc.date));
    });
    return Array.from(exercices).sort((a, b) => b.localeCompare(a, 'fr'));
  }, [documentsSource]);

  const documentsFiltres = useMemo<DocumentFiltre[]>(() => {
    const debut = filtreDateDebut ? new Date(`${filtreDateDebut}T00:00:00`) : null;
    const fin = filtreDateFin ? new Date(`${filtreDateFin}T23:59:59`) : null;
    const recherche = filtreRecherche.trim().toLowerCase();

    return documentsSource.reduce<DocumentFiltre[]>((acc, document) => {
      const dateDocument = document.date instanceof Date ? document.date : new Date(document.date);
      if (exerciceFiltre) {
        const exercice = obtenirExerciceFiscal(dateDocument);
        if (exercice !== exerciceFiltre) return acc;
      }
      if (fournisseurSelectionne) {
        const fournisseurCanonique = normaliserNomFournisseur(document.fournisseur);
        if (fournisseurCanonique !== fournisseurSelectionne) return acc;
      }
      if (debut && dateDocument < debut) return acc;
      if (fin && dateDocument > fin) return acc;

      const lignesFiltrees = document.lignes.filter((ligne) => {
        if (!recherche) return true;
        const ref = ligne.refFournisseur?.toLowerCase() || '';
        const desc = ligne.description.toLowerCase();
        return ref.includes(recherche) || desc.includes(recherche);
      });

      if (lignesFiltrees.length === 0) return acc;

      const documentComplet = lignesFiltrees.length === document.lignes.length;
      const totalHTLignesBrut = lignesFiltrees.reduce((sum, ligne) => sum + ligne.montantHT, 0);
      const totalHTLignes = documentComplet ? document.totalHT : totalHTLignesBrut;
      const ratio = document.totalHT > 0 ? Math.min(1, totalHTLignesBrut / document.totalHT) : 0;
      const totalTVALignes = documentComplet ? document.totalTVA : document.totalTVA * ratio;
      const totalTTCLignes = documentComplet ? document.totalTTC : totalHTLignes + totalTVALignes;

      acc.push({
        document,
        lignes: lignesFiltrees,
        totalHTLignes,
        totalTVALignes,
        totalTTCLignes,
      });
      return acc;
    }, []);
  }, [documentsSource, filtreDateDebut, filtreDateFin, filtreRecherche, exerciceFiltre, fournisseurSelectionne]);

  const statistiquesFiltrees = useMemo<Statistiques>(() => {
    const base: Statistiques = {
      nombreFactures: 0,
      totalHT: 0,
      totalTVA: 0,
      totalTTC: 0,
      parFournisseur: JSON.parse(JSON.stringify(fournisseursInitial)) as typeof fournisseursInitial,
    };

    documentsFiltres.forEach(({ document, totalHTLignes, totalTVALignes, totalTTCLignes }) => {
      const fournisseurCanonique = normaliserNomFournisseur(document.fournisseur);

      base.nombreFactures += 1;
      base.totalHT += totalHTLignes;
      base.totalTVA += totalTVALignes;
      base.totalTTC += totalTTCLignes;

      // S'assurer que tous les fournisseurs présents dans les factures ont bien une entrée
      if (!base.parFournisseur[fournisseurCanonique]) {
        base.parFournisseur[fournisseurCanonique] = {
          nombre: 0,
          totalHT: 0,
          totalTVA: 0,
          totalTTC: 0,
        };
      }

      const statsFournisseur = base.parFournisseur[fournisseurCanonique];
      statsFournisseur.nombre += 1;
      statsFournisseur.totalHT += totalHTLignes;
      statsFournisseur.totalTVA += totalTVALignes;
      statsFournisseur.totalTTC += totalTTCLignes;
    });

    return base;
  }, [documentsFiltres]);

  const detailsParFournisseur = useMemo<Record<string, FournisseurProduits>>(() => {
    const result: Record<string, FournisseurProduits> = {};

    documentsFiltres.forEach(({ document, lignes }) => {
      const fournisseurCanonique = normaliserNomFournisseur(document.fournisseur);

      if (!result[fournisseurCanonique]) {
        result[fournisseurCanonique] = {};
      }
      const produits = result[fournisseurCanonique];

      lignes.forEach((ligne, index) => {
        const ref =
          ligne.refFournisseur?.trim() ||
          ligne.description?.trim() ||
          `LIGNE-${document.id}-${index}`;
        if (!produits[ref]) {
          produits[ref] = {
            ref,
            description: ligne.description,
            logo: ligne.logo,
            couleurs: new Set<string>(),
            quantiteTotale: 0,
            montantHTTotal: 0,
            lignes: [],
          };
        }

        const detail = produits[ref];
        if (!detail.description && ligne.description) {
          detail.description = ligne.description;
        }
        if (!detail.logo && ligne.logo) {
          detail.logo = ligne.logo;
        }
        if (ligne.couleur) {
          detail.couleurs.add(ligne.couleur);
        }

        detail.quantiteTotale += typeof ligne.quantite === 'number' ? ligne.quantite : 0;
        detail.montantHTTotal += typeof ligne.montantHT === 'number' ? ligne.montantHT : 0;
        detail.lignes.push({
          id: document.id,
          numero: document.numero,
          date: document.date instanceof Date ? document.date : new Date(document.date),
          quantite: typeof ligne.quantite === 'number' ? ligne.quantite : 0,
          montantHT: typeof ligne.montantHT === 'number' ? ligne.montantHT : 0,
          description: ligne.description,
          couleur: ligne.couleur,
        });
      });
    });

    return result;
  }, [documentsFiltres]);

  const quantitesParFournisseur = useMemo(() => {
    const result: Record<string, { produits: number; quantite: number }> = {};
    Object.entries(detailsParFournisseur).forEach(([fournisseur, produits]) => {
      const liste = Object.values(produits);
      const quantite = liste.reduce((sum, p) => sum + p.quantiteTotale, 0);
      result[fournisseur] = { produits: liste.length, quantite };
    });
    return result;
  }, [detailsParFournisseur]);

  const statsParMois = useMemo<LigneSyntheseTemps[]>(() => {
    const map = new Map<string, LigneSyntheseTemps>();
    documentsFiltres.forEach(({ document, totalHTLignes, totalTVALignes, totalTTCLignes }) => {
      const dateDocument = document.date instanceof Date ? document.date : new Date(document.date);
      const mois = String(dateDocument.getMonth() + 1).padStart(2, '0');
      const cle = `${dateDocument.getFullYear()}-${mois}`;
      const libelle = formaterMois(dateDocument);
      const existant = map.get(cle);
      if (existant) {
        existant.nombreFactures += 1;
        existant.totalHT += totalHTLignes;
        existant.totalTVA += totalTVALignes;
        existant.totalTTC += totalTTCLignes;
      } else {
        map.set(cle, {
          cle,
          libelle,
          nombreFactures: 1,
          totalHT: totalHTLignes,
          totalTVA: totalTVALignes,
          totalTTC: totalTTCLignes,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.cle.localeCompare(a.cle));
  }, [documentsFiltres, formaterMois]);

  const statsParExercice = useMemo<LigneSyntheseTemps[]>(() => {
    const map = new Map<string, LigneSyntheseTemps>();
    documentsFiltres.forEach(({ document, totalHTLignes, totalTVALignes, totalTTCLignes }) => {
      const dateDocument = document.date instanceof Date ? document.date : new Date(document.date);
      const cle = obtenirExerciceFiscal(dateDocument);
      const existant = map.get(cle);
      if (existant) {
        existant.nombreFactures += 1;
        existant.totalHT += totalHTLignes;
        existant.totalTVA += totalTVALignes;
        existant.totalTTC += totalTTCLignes;
      } else {
        map.set(cle, {
          cle,
          libelle: cle,
          nombreFactures: 1,
          totalHT: totalHTLignes,
          totalTVA: totalTVALignes,
          totalTTC: totalTTCLignes,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.cle.localeCompare(a.cle, 'fr'));
  }, [documentsFiltres]);


  const fournisseursStats = useMemo(() => {
    return (Object.entries(statistiquesFiltrees.parFournisseur) as Array<
      [string, (typeof statistiquesFiltrees.parFournisseur)[keyof typeof statistiquesFiltrees.parFournisseur]]
    >).filter(([, stats]) => stats.nombre > 0);
  }, [statistiquesFiltrees]);

  const fournisseursTries = useMemo(() => {
    const copie = [...fournisseursStats];
    copie.sort((a, b) => {
      const [nomA, statsA] = a;
      const [nomB, statsB] = b;
      const sens = triFournisseur.sens === 'asc' ? 1 : -1;

      const valeur = (nom: string, stats: typeof statsA): number | string => {
        switch (triFournisseur.colonne) {
          case 'nom':
            return nom;
          case 'factures':
            return stats.nombre;
          case 'produits':
            return quantitesParFournisseur[nom]?.produits ?? 0;
          case 'quantite':
            return quantitesParFournisseur[nom]?.quantite ?? 0;
          case 'ht':
            return stats.totalHT;
          case 'tva':
            return stats.totalTVA;
          case 'ttc':
            return stats.totalTTC;
          default:
            return nom;
        }
      };

      const valeurA = valeur(nomA, statsA);
      const valeurB = valeur(nomB, statsB);

      if (typeof valeurA === 'string' && typeof valeurB === 'string') {
        return valeurA.localeCompare(valeurB) * sens;
      }

      return ((valeurA as number) - (valeurB as number)) * sens;
    });
    return copie;
  }, [fournisseursStats, triFournisseur, quantitesParFournisseur]);

  useEffect(() => {
    if (!fournisseurSelectionne) {
      setProduitSelectionne('');
      return;
    }
    if (!fournisseursTries.some(([nom]) => nom === fournisseurSelectionne)) {
      setFournisseurSelectionne('');
      setProduitSelectionne('');
      return;
    }
    setProduitSelectionne('');
  }, [fournisseurSelectionne, fournisseursTries]);

  const produitsDuFournisseur =
    fournisseurSelectionne && detailsParFournisseur[fournisseurSelectionne]
      ? Object.values(detailsParFournisseur[fournisseurSelectionne])
      : [];

  const produitsTries = useMemo(() => {
    const copie = [...produitsDuFournisseur];
    copie.sort((a, b) => {
      const sens = triProduit.sens === 'asc' ? 1 : -1;
      const valeur = (produit: ProduitStatsDetail): number | string => {
        switch (triProduit.colonne) {
          case 'ref':
            return produit.ref;
          case 'description':
            return produit.description;
          case 'logo':
            return produit.logo || '';
          case 'couleur':
            return produit.couleurs.size > 0 ? Array.from(produit.couleurs).join(', ') : '';
          case 'quantite':
            return produit.quantiteTotale;
          case 'montant':
            return produit.montantHTTotal;
          case 'dernier': {
            const derniere = [...produit.lignes].sort((x, y) => y.date.getTime() - x.date.getTime())[0];
            return derniere ? derniere.date.getTime() : 0;
          }
          default:
            return produit.montantHTTotal;
        }
      };

      const valeurA = valeur(a);
      const valeurB = valeur(b);

      if (typeof valeurA === 'string' && typeof valeurB === 'string') {
        return valeurA.localeCompare(valeurB) * sens;
      }

      return ((valeurA as number) - (valeurB as number)) * sens;
    });
    return copie;
  }, [produitsDuFournisseur, triProduit]);

  useEffect(() => {
    if (produitSelectionne && !produitsTries.some((p) => p.ref === produitSelectionne)) {
      setProduitSelectionne('');
    }
  }, [produitSelectionne, produitsTries]);

  const produitsFiltres = produitSelectionne
    ? produitsTries.filter((p) => p.ref === produitSelectionne)
    : produitsTries;

  const produitDetail =
    fournisseurSelectionne && produitSelectionne
      ? detailsParFournisseur[fournisseurSelectionne]?.[produitSelectionne]
      : undefined;

  const documentsParId = useMemo(() => {
    const map = new Map<string, DocumentSource>();
    documentsSource.forEach((doc) => map.set(doc.id, doc));
    return map;
  }, [documentsSource]);

  const facturesParId = useMemo(() => {
    const map = new Map<string, Facture>();
    factures.forEach((facture) => map.set(facture.id, facture));
    return map;
  }, [factures]);

  const lignesDetailTriees = useMemo(() => {
    if (!produitDetail) return [];
    const copie = [...produitDetail.lignes];
    copie.sort((a, b) => {
      const sens = triDetail.sens === 'asc' ? 1 : -1;
      const valeur = (ligne: LigneProduitDetail): number | string => {
        switch (triDetail.colonne) {
          case 'facture':
            return ligne.numero;
          case 'date':
            return ligne.date.getTime();
          case 'quantite':
            return ligne.quantite;
          case 'montant':
            return ligne.montantHT;
          default:
            return ligne.date.getTime();
        }
      };

      const valeurA = valeur(a);
      const valeurB = valeur(b);

      if (typeof valeurA === 'string' && typeof valeurB === 'string') {
        return valeurA.localeCompare(valeurB) * sens;
      }

      return ((valeurA as number) - (valeurB as number)) * sens;
    });
    return copie;
  }, [produitDetail, triDetail]);

  const totalQuantiteProduits = produitsFiltres.reduce((sum, produit) => sum + produit.quantiteTotale, 0);
  const totalMontantProduits = produitsFiltres.reduce((sum, produit) => sum + produit.montantHTTotal, 0);
  const totalQuantiteFiltree = useMemo(
    () =>
      documentsFiltres.reduce(
        (sum, { lignes }) =>
          sum +
          lignes.reduce((ligneSum, ligne) => ligneSum + (typeof ligne.quantite === 'number' ? ligne.quantite : 0), 0),
        0
      ),
    [documentsFiltres]
  );
  const fournisseursActifs = fournisseursTries.length;
  const articlesDistincts = useMemo(() => {
    const refs = new Set<string>();
    Object.values(detailsParFournisseur).forEach((produits) => {
      Object.keys(produits).forEach((ref) => refs.add(ref));
    });
    return refs.size;
  }, [detailsParFournisseur]);
  const panierMoyenTTC =
    statistiquesFiltrees.nombreFactures > 0
      ? statistiquesFiltrees.totalTTC / statistiquesFiltrees.nombreFactures
      : 0;

  const basculerSection = (
    section: 'fournisseurs' | 'produits' | 'detailProduit' | 'tempsMois' | 'tempsExercice'
  ) => {
    setSectionsVisibles((courant) => ({
      ...courant,
      [section]: !courant[section],
    }));
  };

  const reinitialiserFiltres = () => {
    setFiltreDateDebut('');
    setFiltreDateFin('');
    setFiltreRecherche('');
    setExerciceFiltre('');
    setFournisseurSelectionne('');
    setProduitSelectionne('');
  };

  const changerTri = <T extends ColonneFournisseur | ColonneProduit | ColonneDetail>(
    courant: { colonne: T; sens: SensTri },
    colonne: T,
    setter: (tri: { colonne: T; sens: SensTri }) => void
  ) => {
    setter({
      colonne,
      sens: courant.colonne === colonne && courant.sens === 'desc' ? 'asc' : 'desc',
    });
  };

  const renderTri = (courant: { colonne: string; sens: SensTri }, colonne: string) => {
    if (courant.colonne !== colonne) return null;
    return courant.sens === 'asc' ? '▲' : '▼';
  };

  const handleTraductionChange = (ref: string, valeur: string) => {
    setTraductions((prev) => ({
      ...prev,
      [ref]: valeur,
    }));
  };

  return (
    <div className="statistiques">
      <div className="statistiques__header">
        <h2>Statistiques</h2>
        <p className="statistiques__subtitle">
          Analyse fournisseur, article et temporalité avec des vues que vous pouvez afficher ou masquer selon le besoin.
        </p>
      </div>

      <div className="statistiques__cards">
        <div className="statistiques__card statistiques__card--primary">
          <div className="statistiques__card-icon">
            <FileText size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">
              {libelleModeSource}
            </span>
            <span className="statistiques__card-value">{statistiquesFiltrees.nombreFactures}</span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <Euro size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total HT</span>
            <span className="statistiques__card-value">{formaterMontant(statistiquesFiltrees.totalHT)}</span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <TrendingUp size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total TVA</span>
            <span className="statistiques__card-value">{formaterMontant(statistiquesFiltrees.totalTVA)}</span>
          </div>
        </div>
        <div className="statistiques__card statistiques__card--highlight">
          <div className="statistiques__card-icon">
            <Euro size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total TTC</span>
            <span className="statistiques__card-value statistiques__card-value--large">
              {formaterMontant(statistiquesFiltrees.totalTTC)}
            </span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <Building2 size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Fournisseurs actifs</span>
            <span className="statistiques__card-value">{fournisseursActifs}</span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <Layers size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Articles distincts</span>
            <span className="statistiques__card-value">{articlesDistincts}</span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <List size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Quantité totale</span>
            <span className="statistiques__card-value">{totalQuantiteFiltree}</span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <TrendingUp size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Panier moyen TTC</span>
            <span className="statistiques__card-value">{formaterMontant(panierMoyenTTC)}</span>
          </div>
        </div>
      </div>

      <div className="statistiques__filters">
        <div className="statistiques__filters-group">
          <label>
            Base d’analyse
            <select value={modeSource} onChange={(e) => setModeSource(e.target.value as TypeSource)}>
              <option value="facture">Factures enregistrées</option>
              <option value="devis">Base prévisionnelle héritée</option>
            </select>
          </label>
          <label>
            Date début
            <input type="date" value={filtreDateDebut} onChange={(e) => setFiltreDateDebut(e.target.value)} />
          </label>
          <label>
            Date fin
            <input type="date" value={filtreDateFin} onChange={(e) => setFiltreDateFin(e.target.value)} />
          </label>
          <label>
            Exercice fiscal
            <select value={exerciceFiltre} onChange={(e) => setExerciceFiltre(e.target.value)}>
              <option value="">Tous</option>
              {exercicesDisponibles.map((exercice) => (
                <option key={exercice} value={exercice}>
                  {exercice}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="statistiques__filters-group">
          <label>
            Fournisseur
            <select
              value={fournisseurSelectionne}
              onChange={(e) => {
                setFournisseurSelectionne(e.target.value);
                setProduitSelectionne('');
              }}
            >
              <option value="">Tous</option>
              {fournisseursTries.map(([fournisseur]) => (
                <option key={fournisseur} value={fournisseur}>
                  {fournisseur}
                </option>
              ))}
            </select>
          </label>
          <label>
            Article
            <select
              value={produitSelectionne}
              onChange={(e) => setProduitSelectionne(e.target.value)}
              disabled={!fournisseurSelectionne}
            >
              <option value="">Tous</option>
              {produitsTries.map((produit) => (
                <option key={produit.ref} value={produit.ref}>
                  {produit.ref} - {produit.description}
                </option>
              ))}
            </select>
          </label>
          <label>
            Recherche article ou réf.
            <input
              type="text"
              placeholder="Ex : SAINT TROPEZ, VELA..."
              value={filtreRecherche}
              onChange={(e) => setFiltreRecherche(e.target.value)}
            />
          </label>
        </div>
        <div className="statistiques__filters-group">
          <div style={{ alignSelf: 'end', color: '#6b7280', fontSize: '0.9rem', maxWidth: '420px' }}>
            <strong>{libelleModeSource} :</strong> {descriptionModeSource}
          </div>
        </div>
        <div className="statistiques__filters-group statistiques__filters-group--actions">
          <button type="button" className="statistiques__action-btn" onClick={reinitialiserFiltres}>
            Réinitialiser les filtres
          </button>
        </div>
      </div>

      <div className="statistiques__view-switcher">
        <span className="statistiques__view-switcher-label">Blocs visibles</span>
        <button
          type="button"
          className={`statistiques__toggle ${sectionsVisibles.fournisseurs ? 'statistiques__toggle--active' : ''}`}
          onClick={() => basculerSection('fournisseurs')}
        >
          Stats fournisseurs
        </button>
        <button
          type="button"
          className={`statistiques__toggle ${sectionsVisibles.produits ? 'statistiques__toggle--active' : ''}`}
          onClick={() => basculerSection('produits')}
        >
          Stats articles
        </button>
        <button
          type="button"
          className={`statistiques__toggle ${sectionsVisibles.detailProduit ? 'statistiques__toggle--active' : ''}`}
          onClick={() => basculerSection('detailProduit')}
        >
          Détail article
        </button>
        <button
          type="button"
          className={`statistiques__toggle ${sectionsVisibles.tempsMois ? 'statistiques__toggle--active' : ''}`}
          onClick={() => basculerSection('tempsMois')}
        >
          Vue mensuelle
        </button>
        <button
          type="button"
          className={`statistiques__toggle ${sectionsVisibles.tempsExercice ? 'statistiques__toggle--active' : ''}`}
          onClick={() => basculerSection('tempsExercice')}
        >
          Vue exercice
        </button>
      </div>

      {(sectionsVisibles.fournisseurs || sectionsVisibles.produits || sectionsVisibles.detailProduit) && (
      <div className="statistiques__section">
        <h3 className="statistiques__section-title">
          <Building2 size={20} />
          Fournisseurs & produits
        </h3>

        <div className="statistiques__panels">
          {sectionsVisibles.fournisseurs && (
          <div className="statistiques__panel">
            <div className="statistiques__panel-header">
              <List size={18} />
              <span>Fournisseurs</span>
              <span className="statistiques__panel-badge">{fournisseursTries.length}</span>
            </div>
            <p className="statistiques__panel-help">
              Sélectionnez un fournisseur pour voir ses produits.
            </p>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th onClick={() => changerTri(triFournisseur, 'nom', setTriFournisseur)}>
                    Fournisseur {renderTri(triFournisseur, 'nom')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'factures', setTriFournisseur)}>
                    {modeSource === 'facture' ? 'Factures' : 'Devis'} {renderTri(triFournisseur, 'factures')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'produits', setTriFournisseur)}>
                    Produits {renderTri(triFournisseur, 'produits')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'quantite', setTriFournisseur)}>
                    Qtés {renderTri(triFournisseur, 'quantite')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'ht', setTriFournisseur)}>
                    Total HT {renderTri(triFournisseur, 'ht')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'tva', setTriFournisseur)}>
                    TVA {renderTri(triFournisseur, 'tva')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'ttc', setTriFournisseur)}>
                    TTC {renderTri(triFournisseur, 'ttc')}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {fournisseursTries.map(([fournisseur, stats]) => (
                  <tr
                    key={fournisseur}
                    className={
                      fournisseurSelectionne === fournisseur ? 'statistiques__table-row--active' : undefined
                    }
                    onClick={() => {
                      setFournisseurSelectionne(fournisseur);
                      setProduitSelectionne('');
                    }}
                  >
                    <td>{fournisseur}</td>
                    <td>{stats.nombre}</td>
                    <td>{quantitesParFournisseur[fournisseur]?.produits ?? 0}</td>
                    <td>{quantitesParFournisseur[fournisseur]?.quantite ?? 0}</td>
                    <td>{formaterMontant(stats.totalHT)}</td>
                    <td>{formaterMontant(stats.totalTVA)}</td>
                    <td>{formaterMontant(stats.totalTTC)}</td>
                    <td>
                      <button
                        type="button"
                        className="statistiques__action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFournisseurEnEdition(fournisseur);
                          setNouveauNomFournisseur(fournisseur);
                        }}
                      >
                        <Edit3 size={14} />
                        Renommer
                      </button>
                    </td>
                  </tr>
                ))}
                {fournisseursTries.length === 0 && (
                  <tr>
                    <td colSpan={8} className="statistiques__empty">
                      Aucune facture ne correspond aux critères.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}

          {sectionsVisibles.produits && fournisseurSelectionne && (
            <div className="statistiques__panel">
              <div className="statistiques__panel-header">
                <Layers size={18} />
                <span>Produits – {fournisseurSelectionne}</span>
                <span className="statistiques__panel-badge">{produitsFiltres.length}</span>
              </div>
              <table className="statistiques__table">
                <thead>
                  <tr>
                    <th onClick={() => changerTri(triProduit, 'ref', setTriProduit)}>
                      Réf. {renderTri(triProduit, 'ref')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'description', setTriProduit)}>
                      Description {renderTri(triProduit, 'description')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'logo', setTriProduit)}>
                      Logo {renderTri(triProduit, 'logo')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'couleur', setTriProduit)}>
                      Couleur {renderTri(triProduit, 'couleur')}
                    </th>
                    <th>PU HT</th>
                    <th onClick={() => changerTri(triProduit, 'quantite', setTriProduit)}>
                      Quantité {renderTri(triProduit, 'quantite')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'montant', setTriProduit)}>
                      Montant HT {renderTri(triProduit, 'montant')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'dernier', setTriProduit)}>
                      Dernier achat {renderTri(triProduit, 'dernier')}
                    </th>
                    {fournisseurSelectionne === 'ITALESSE' && <th>Traduction</th>}
                  </tr>
                </thead>
                <tbody>
                  {produitsFiltres.map((produit) => {
                    const couleursAffichees =
                      produit.couleurs.size > 0 ? Array.from(produit.couleurs).join(', ') : '-';
                    const derniereLigne = [...produit.lignes].sort(
                      (a, b) => b.date.getTime() - a.date.getTime()
                    )[0];
                    return (
                      <tr
                        key={produit.ref}
                        className={
                          produitSelectionne === produit.ref ? 'statistiques__table-row--active' : undefined
                        }
                        onClick={() => setProduitSelectionne(produit.ref)}
                      >
                        <td>{produit.ref}</td>
                        <td>{produit.description}</td>
                        <td>{produit.logo || '-'}</td>
                        <td>{couleursAffichees}</td>
                        <td>
                          {produit.quantiteTotale > 0
                            ? formaterMontant(produit.montantHTTotal / produit.quantiteTotale)
                            : '—'}
                        </td>
                        <td>{produit.quantiteTotale}</td>
                        <td>{formaterMontant(produit.montantHTTotal)}</td>
                        <td>
                          {derniereLigne
                            ? `${derniereLigne.numero} – ${formaterDate(derniereLigne.date)}`
                            : '—'}
                        </td>
                        {fournisseurSelectionne === 'ITALESSE' && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              placeholder="Traduction"
                              value={traductions[produit.ref] || ''}
                              onChange={(event) => handleTraductionChange(produit.ref, event.target.value)}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {produitsFiltres.length === 0 && (
                    <tr>
                      <td colSpan={fournisseurSelectionne === 'ITALESSE' ? 9 : 8} className="statistiques__empty">
                        Aucun produit ne correspond aux critères.
                      </td>
                    </tr>
                  )}
                </tbody>
                {produitsFiltres.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Total</td>
                      <td>
                        {totalQuantiteProduits > 0
                          ? formaterMontant(totalMontantProduits / totalQuantiteProduits)
                          : '—'}
                      </td>
                      <td>{totalQuantiteProduits}</td>
                      <td>{formaterMontant(totalMontantProduits)}</td>
                      <td colSpan={fournisseurSelectionne === 'ITALESSE' ? 2 : 1}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {sectionsVisibles.detailProduit && fournisseurSelectionne && produitDetail && (
          <div className="statistiques__panel statistiques__panel--full">
            <div className="statistiques__panel-header">
              <Eye size={18} />
              <span>
                Détail produit – {produitDetail.ref} ({produitDetail.description})
              </span>
            </div>
            <div className="statistiques__panel-summary">
              <div>
                <span>Quantité totale</span>
                <strong>{produitDetail.quantiteTotale}</strong>
              </div>
              <div>
                <span>Montant total HT</span>
                <strong>{formaterMontant(produitDetail.montantHTTotal)}</strong>
              </div>
              <div>
                <span>Logo</span>
                <strong>{produitDetail.logo || '-'}</strong>
              </div>
              {produitDetail.couleurs.size > 0 && (
                <div>
                  <span>Couleur</span>
                  <strong>{Array.from(produitDetail.couleurs).join(', ')}</strong>
                </div>
              )}
              {fournisseurSelectionne === 'ITALESSE' && (
                <div>
                  <span>Traduction</span>
                  <strong>{traductions[produitDetail.ref] || 'Aucune'}</strong>
                </div>
              )}
            </div>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th onClick={() => changerTri(triDetail, 'facture', setTriDetail)}>
                    Facture {renderTri(triDetail, 'facture')}
                  </th>
                  <th onClick={() => changerTri(triDetail, 'date', setTriDetail)}>
                    Date {renderTri(triDetail, 'date')}
                  </th>
                  <th>Couleur</th>
                  <th onClick={() => changerTri(triDetail, 'quantite', setTriDetail)}>
                    Quantité {renderTri(triDetail, 'quantite')}
                  </th>
                  <th onClick={() => changerTri(triDetail, 'montant', setTriDetail)}>
                    Montant HT {renderTri(triDetail, 'montant')}
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lignesDetailTriees.map((ligne) => {
                  const document = documentsParId.get(ligne.id);
                  const facture =
                    document?.type === 'facture' && document.sourceFactureId
                      ? facturesParId.get(document.sourceFactureId)
                      : undefined;
                  return (
                    <tr key={`${ligne.id}-${ligne.numero}-${ligne.date.getTime()}`}>
                      <td>{ligne.numero}</td>
                      <td>{formaterDate(ligne.date)}</td>
                      <td>{ligne.couleur || '-'}</td>
                      <td>{ligne.quantite}</td>
                      <td>{formaterMontant(ligne.montantHT)}</td>
                      <td>
                        {modeSource === 'facture' && facture ? (
                          <button
                            type="button"
                            className="statistiques__action-btn"
                            onClick={() => onVoirFacture?.(facture)}
                          >
                            Voir
                          </button>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
                {lignesDetailTriees.length === 0 && (
                  <tr>
                    <td colSpan={6} className="statistiques__empty">
                      Aucune facture correspondante.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {(sectionsVisibles.tempsMois || sectionsVisibles.tempsExercice) && (
      <div className="statistiques__section">
        <h3 className="statistiques__section-title">
          <Calendar size={20} />
          Synthèse temporelle
        </h3>
        <div className="statistiques__panels">
          {sectionsVisibles.tempsMois && (
          <div className="statistiques__panel">
            <div className="statistiques__panel-header">
              <List size={18} />
              <span>Par mois</span>
              <span className="statistiques__panel-badge">{statsParMois.length}</span>
            </div>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th>Mois</th>
                  <th>{modeSource === 'facture' ? 'Factures' : 'Devis'}</th>
                  <th>Total HT</th>
                  <th>TVA</th>
                  <th>TTC</th>
                </tr>
              </thead>
              <tbody>
                {statsParMois.map((ligne) => (
                  <tr key={ligne.cle}>
                    <td>{ligne.libelle}</td>
                    <td>{ligne.nombreFactures}</td>
                    <td>{formaterMontant(ligne.totalHT)}</td>
                    <td>{formaterMontant(ligne.totalTVA)}</td>
                    <td>{formaterMontant(ligne.totalTTC)}</td>
                  </tr>
                ))}
                {statsParMois.length === 0 && (
                  <tr>
                    <td colSpan={5} className="statistiques__empty">
                      Aucune facture pour la période sélectionnée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
          {sectionsVisibles.tempsExercice && (
          <div className="statistiques__panel">
            <div className="statistiques__panel-header">
              <Layers size={18} />
              <span>Par exercice</span>
              <span className="statistiques__panel-badge">{statsParExercice.length}</span>
            </div>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th>Exercice</th>
                  <th>{modeSource === 'facture' ? 'Factures' : 'Devis'}</th>
                  <th>Total HT</th>
                  <th>TVA</th>
                  <th>TTC</th>
                </tr>
              </thead>
              <tbody>
                {statsParExercice.map((ligne) => (
                  <tr key={ligne.cle}>
                    <td>{ligne.libelle}</td>
                    <td>{ligne.nombreFactures}</td>
                    <td>{formaterMontant(ligne.totalHT)}</td>
                    <td>{formaterMontant(ligne.totalTVA)}</td>
                    <td>{formaterMontant(ligne.totalTTC)}</td>
                  </tr>
                ))}
                {statsParExercice.length === 0 && (
                  <tr>
                    <td colSpan={5} className="statistiques__empty">
                      Aucune facture pour la période sélectionnée.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>
      )}

      {/* Modal de renommage de fournisseur */}
      {fournisseurEnEdition && (
        <div
          className="statistiques__modal-overlay"
          onClick={() => {
            setFournisseurEnEdition(null);
            setNouveauNomFournisseur('');
          }}
        >
          <div
            className="statistiques__modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="statistiques__modal-header">
              <h3>Renommer le fournisseur</h3>
              <button
                type="button"
                className="statistiques__modal-close"
                onClick={() => {
                  setFournisseurEnEdition(null);
                  setNouveauNomFournisseur('');
                }}
                aria-label="Fermer"
              >
                <X size={18} />
              </button>
            </div>
            <form
              className="statistiques__modal-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!fournisseurEnEdition) return;
                const nouveauNom = nouveauNomFournisseur.trim();
                if (!nouveauNom || nouveauNom === fournisseurEnEdition) {
                  setFournisseurEnEdition(null);
                  return;
                }

                await renommerFournisseurGlobal(
                  fournisseurEnEdition as Fournisseur,
                  nouveauNom as Fournisseur
                );

                // Demander au parent de recharger les données (factures / devis)
                onFournisseursMisAJour?.();

                setFournisseurEnEdition(null);
                setNouveauNomFournisseur('');
              }}
            >
              <div className="statistiques__modal-body">
                <label>
                  Ancien nom
                  <input type="text" value={fournisseurEnEdition} readOnly />
                </label>
                <label>
                  Nouveau nom du fournisseur
                  <input
                    type="text"
                    value={nouveauNomFournisseur}
                    onChange={(e) => setNouveauNomFournisseur(e.target.value)}
                    autoFocus
                  />
                </label>
                <p className="statistiques__modal-help">
                  Ce renommage s’appliquera aux factures, devis et références produits existants
                  pour ce fournisseur.
                </p>
              </div>
              <div className="statistiques__modal-footer">
                <button
                  type="button"
                  className="statistiques__modal-btn statistiques__modal-btn--secondary"
                  onClick={() => {
                    setFournisseurEnEdition(null);
                    setNouveauNomFournisseur('');
                  }}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="statistiques__modal-btn statistiques__modal-btn--primary"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

