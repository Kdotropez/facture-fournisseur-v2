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
  Printer,
} from 'lucide-react';
import type { Facture } from '../types/facture';
import type { Devis } from '../types/devis';
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
  devis: Devis[];
}

const obtenirExerciceFiscal = (date: Date): string => {
  const mois = date.getMonth(); // 0-11
  const annee = date.getFullYear();
  const anneeDebut = mois >= 11 ? annee : annee - 1; // exercice du 1er déc au 30 nov
  return `${anneeDebut}/${anneeDebut + 1}`;
};

type StatutSynthesePaiement = EtatReglementFacture['statut'];

interface ElementBasePaiement {
  id: string;
  numero: string;
  fournisseur: string;
  nature: 'facture' | 'facture_principale';
  totalTTC: number;
  totalRegle: number;
  totalRestant: number;
  statut: StatutSynthesePaiement;
  factureIds: string[];
  detailsSupplementaires?: string;
}

type DetailCarteId =
  | 'total_factures'
  | 'total_a_regler'
  | 'total_regle'
  | 'en_attente'
  | 'factures_reglees';

interface LigneDetailCarte {
  id: string;
  libelle: string;
  detail?: string;
  montant?: number;
  tonalite?: 'default' | 'success' | 'warning';
}

interface DetailCarte {
  id: DetailCarteId;
  titre: string;
  description: string;
  resume: string;
  lignes: LigneDetailCarte[];
  emptyMessage: string;
}

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

const scoreRattachementAcompte = (devis: Devis, facture: Facture): number => {
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

export function Reglements({ factures, devis }: ReglementsProps) {
  const [reglements, setReglements] = useState<Reglement[]>([]);
  const [factureFiltre, setFactureFiltre] = useState<string>('');
  const [fournisseurFiltre, setFournisseurFiltre] = useState<string>('');
  const [statutFiltre, setStatutFiltre] = useState<StatutReglement | 'partiel' | 'non_regle' | ''>('');
  const [exerciceFiltre, setExerciceFiltre] = useState<string>('');
  const [afficherModal, setAfficherModal] = useState(false);
  const [reglementEdite, setReglementEdite] = useState<Reglement | null>(null);
  const [facturePourNouveauReglement, setFacturePourNouveauReglement] = useState<Facture | null>(null);
  const [afficherModalAcomptes, setAfficherModalAcomptes] = useState(false);
  const [facturePourAcomptes, setFacturePourAcomptes] = useState<Facture | null>(null);
  const [facturesDeveloppees, setFacturesDeveloppees] = useState<Set<string>>(new Set());
  const [afficherModalMarquerRegle, setAfficherModalMarquerRegle] = useState(false);
  const [factureAMarquer, setFactureAMarquer] = useState<Facture | null>(null);
  const [modeJournal, setModeJournal] = useState<'individuel' | 'mois' | 'annee' | 'fournisseur' | 'facture'>('facture');
  const [afficherStatsFournisseur, setAfficherStatsFournisseur] = useState(false);
  const [afficherListeFactures, setAfficherListeFactures] = useState(false);
  const [detailCarteActive, setDetailCarteActive] = useState<DetailCarteId | null>(null);

  // Charger les règlements au montage
  useEffect(() => {
    const reglementsCharges = chargerReglements();
    setReglements(reglementsCharges);
  }, []);

  useEffect(() => {
    const exerciceMemo = localStorage.getItem('reglements-filtre-exercice');
    if (exerciceMemo) {
      setExerciceFiltre(exerciceMemo);
    }
  }, []);

  useEffect(() => {
    if (exerciceFiltre) {
      localStorage.setItem('reglements-filtre-exercice', exerciceFiltre);
    } else {
      localStorage.removeItem('reglements-filtre-exercice');
    }
  }, [exerciceFiltre]);

  // Calculer les états de règlement pour chaque facture
  const etatsReglements = useMemo(() => {
    const etats: Record<string, EtatReglementFacture> = {};
    factures.forEach(facture => {
      etats[facture.id] = calculerEtatReglement(facture);
    });
    return etats;
  }, [factures, reglements]);

  const reglementsExercice = useMemo(() => {
    if (!exerciceFiltre) return reglements;
    return reglements.filter(r => {
      const exercice = obtenirExerciceFiscal(new Date(r.dateReglement));
      return exercice === exerciceFiltre;
    });
  }, [reglements, exerciceFiltre]);

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

  const libelleTypeReglement = (type: TypeReglement) => {
    if (type === 'acompte') return 'Acompte';
    if (type === 'solde') return 'Solde';
    if (type === 'avoir') return 'Avoir';
    if (type === 'autre') return 'Autre';
    return 'Règlement';
  };

  const correspondAuFiltreStatut = (statutGlobal: StatutSynthesePaiement) => {
    if (!statutFiltre) return true;
    if (statutFiltre === 'paye') return statutGlobal === 'regle';
    if (statutFiltre === 'partiel') return statutGlobal === 'partiel';
    if (statutFiltre === 'non_regle') return statutGlobal === 'non_regle' || statutGlobal === 'depasse';
    if (statutFiltre === 'en_attente') return statutGlobal !== 'regle';
    return true;
  };

  const factureDansExercice = (facture: Facture, exercice: string): boolean => {
    const reglementsFacture = reglements.filter(r => r.factureId === facture.id);
    if (reglementsFacture.length > 0) {
      return reglementsFacture.some(r => {
        const exerciceReglement = obtenirExerciceFiscal(new Date(r.dateReglement));
        return exerciceReglement === exercice;
      });
    }

    const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
    const exerciceFacture = obtenirExerciceFiscal(dateFacture);
    return exerciceFacture === exercice;
  };

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
      if (!correspondAuFiltreStatut(etat.statut)) {
        return false;
      }

      if (exerciceFiltre) {
        if (!factureDansExercice(facture, exerciceFiltre)) return false;
      }

      return true;
    });
  }, [factures, factureFiltre, fournisseurFiltre, statutFiltre, exerciceFiltre, etatsReglements, reglements]);

  // Calculer les statistiques
  const statistiques = useMemo(() => {
    return calculerStatistiquesReglements(
      facturesFiltrees,
      exerciceFiltre ? reglementsExercice : undefined
    );
  }, [facturesFiltrees, reglementsExercice, exerciceFiltre]);

  const baseFacturationPaiements = useMemo(() => {
    const facturesParId = new Map(factures.map((facture) => [facture.id, facture]));
    const reglementsActifs = reglements.filter((reglement) => reglement.statut !== 'annule');
    const idsFacturesMasquees = new Set<string>();
    const factureVersParentInfere = new Map<string, string>();

    const elements: ElementBasePaiement[] = [];

    const estPieceComptableAcompte = (facture: Facture, totalParent?: number) => {
      const numero = (facture.numero || '').toLowerCase();
      const estAcompteParNumero = numero.includes('acompte');
      const estAcompteParReglement = reglementsActifs.some(
        (reglement) => reglement.factureId === facture.id && reglement.type === 'acompte'
      );
      const totalFacture = typeof facture.totalTTC === 'number' ? facture.totalTTC : 0;
      const estAcompteParMontant =
        typeof totalParent === 'number' &&
        totalParent > 0 &&
        totalFacture > 0 &&
        totalFacture < totalParent - 0.01;

      return {
        estAcompteParNumero,
        estAcompteParReglement,
        estAcompteParMontant,
        estAcompte: estAcompteParNumero || estAcompteParReglement || estAcompteParMontant,
      };
    };

    const idsFacturesLieesExplicitement = new Set(
      devis.flatMap((devisCourant) => devisCourant.facturesLieesIds || [])
    );

    factures.forEach((facture) => {
      if (idsFacturesLieesExplicitement.has(facture.id)) return;

      const detection = estPieceComptableAcompte(facture);
      if (!detection.estAcompteParNumero && !detection.estAcompteParReglement) return;

      const meilleurParent = devis
        .map((devisCourant) => ({
          devis: devisCourant,
          score: scoreRattachementAcompte(devisCourant, facture),
        }))
        .filter((candidat) => candidat.score > 0)
        .sort((a, b) => b.score - a.score)[0];

      if (meilleurParent) {
        factureVersParentInfere.set(facture.id, meilleurParent.devis.id);
      }
    });

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

      if (facturesLiees.length === 0) return;

      const totalDevis = typeof devisCourant.totalTTC === 'number' ? devisCourant.totalTTC : 0;
      const facturesAcompte = facturesLiees.filter((factureLiee) => {
        return estPieceComptableAcompte(factureLiee, totalDevis).estAcompte;
      });
      const facturesNonAcompte = facturesLiees.filter((factureLiee) => !facturesAcompte.includes(factureLiee));

      const estSimpleFactureFinale =
        facturesLiees.length === 1 &&
        facturesAcompte.length === 0 &&
        Math.abs((facturesLiees[0].totalTTC || 0) - totalDevis) < 0.01;

      if (estSimpleFactureFinale) {
        return;
      }

      facturesLiees.forEach((factureLiee) => idsFacturesMasquees.add(factureLiee.id));

      const totalRegle = reglementsActifs
        .filter((reglement) => facturesLiees.some((factureLiee) => factureLiee.id === reglement.factureId))
        .reduce((sum, reglement) => sum + (reglement.montant || 0), 0);

      const recherche = factureFiltre.trim().toLowerCase();
      const correspondRecherche =
        !recherche ||
        devisCourant.numero.toLowerCase().includes(recherche) ||
        facturesLiees.some((factureLiee) => factureLiee.numero.toLowerCase().includes(recherche));

      if (!correspondRecherche) return;
      if (fournisseurFiltre && devisCourant.fournisseur !== fournisseurFiltre) return;
      if (exerciceFiltre) {
        const exercice = obtenirExerciceFiscal(
          devisCourant.date instanceof Date ? devisCourant.date : new Date(devisCourant.date)
        );
        if (exercice !== exerciceFiltre) return;
      }

      const statut =
        totalRegle >= totalDevis - 0.01 ? 'regle' : totalRegle > 0 ? 'partiel' : 'non_regle';

      if (!correspondAuFiltreStatut(statut)) return;

      elements.push({
        id: `devis-${devisCourant.id}`,
        numero: devisCourant.numero,
        fournisseur: devisCourant.fournisseur,
        nature: 'facture_principale',
        totalTTC: totalDevis,
        totalRegle,
        totalRestant: Math.max(0, totalDevis - totalRegle),
        statut,
        factureIds: facturesLiees.map((factureLiee) => factureLiee.id),
        detailsSupplementaires: [
          facturesAcompte.length > 0
            ? `Pièces comptables d’acompte intégrées : ${facturesAcompte.map((factureLiee) => factureLiee.numero).join(', ')}`
            : '',
          facturesNonAcompte.length > 0
            ? `Autres pièces rattachées : ${facturesNonAcompte.map((factureLiee) => factureLiee.numero).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join(' | '),
      });
    });

    facturesFiltrees.forEach((facture) => {
      if (idsFacturesMasquees.has(facture.id)) return;
      if (factureVersParentInfere.has(facture.id)) return;

      const etat = etatsReglements[facture.id];
      if (!etat) return;

      elements.push({
        id: facture.id,
        numero: facture.numero,
        fournisseur: facture.fournisseur,
        nature: 'facture',
        totalTTC: typeof facture.totalTTC === 'number' ? facture.totalTTC : 0,
        totalRegle: etat.montantRegle,
        totalRestant: Math.max(0, etat.montantRestant),
        statut: etat.statut,
        factureIds: [facture.id],
      });
    });

    return elements;
  }, [
    devis,
    etatsReglements,
    exerciceFiltre,
    factures,
    facturesFiltrees,
    factureFiltre,
    fournisseurFiltre,
    reglements,
    statutFiltre,
  ]);

  const idsFacturesBaseAffichee = useMemo(
    () => new Set(baseFacturationPaiements.flatMap((element) => element.factureIds)),
    [baseFacturationPaiements]
  );

  const idsFacturesAutonomesAffichees = useMemo(
    () =>
      new Set(
        baseFacturationPaiements
          .filter((element) => element.nature === 'facture')
          .map((element) => element.id)
      ),
    [baseFacturationPaiements]
  );

  const idsFacturesAbsorbees = useMemo(() => {
    const ids = new Set<string>();
    idsFacturesBaseAffichee.forEach((id) => {
      if (!idsFacturesAutonomesAffichees.has(id)) {
        ids.add(id);
      }
    });
    return ids;
  }, [idsFacturesAutonomesAffichees, idsFacturesBaseAffichee]);

  const facturePrincipaleParFactureLiee = useMemo(() => {
    const map = new Map<string, { numero: string; fournisseur: string }>();
    baseFacturationPaiements.forEach((element) => {
      if (element.nature !== 'facture_principale') return;
      element.factureIds.forEach((factureId) => {
        map.set(factureId, { numero: element.numero, fournisseur: element.fournisseur });
      });
    });
    return map;
  }, [baseFacturationPaiements]);

  const totalFacturesExercice = useMemo(
    () => baseFacturationPaiements.reduce((sum, element) => sum + element.totalTTC, 0),
    [baseFacturationPaiements]
  );

  const totalRegleAffiche = useMemo(
    () => baseFacturationPaiements.reduce((sum, element) => sum + element.totalRegle, 0),
    [baseFacturationPaiements]
  );

  const totalAReglerAffiche = useMemo(
    () => Math.max(0, totalFacturesExercice - totalRegleAffiche),
    [totalFacturesExercice, totalRegleAffiche]
  );

  const facturesRegleesAffiche = useMemo(
    () => baseFacturationPaiements.filter((element) => element.statut === 'regle').length,
    [baseFacturationPaiements]
  );

  const reglementsEnAttenteAffiches = useMemo(() => {
    return reglements
      .filter((reglement) => {
        if (reglement.statut !== 'en_attente') return false;
        if (!idsFacturesBaseAffichee.has(reglement.factureId)) return false;
        if (!exerciceFiltre) return true;
        return obtenirExerciceFiscal(new Date(reglement.dateReglement)) === exerciceFiltre;
      })
      .sort(
        (a, b) =>
          new Date(b.dateReglement).getTime() - new Date(a.dateReglement).getTime()
      );
  }, [reglements, idsFacturesBaseAffichee, exerciceFiltre]);

  const totalEnAttenteAffiche = useMemo(
    () =>
      reglementsEnAttenteAffiches.reduce((sum, reglement) => {
        const montant = typeof reglement.montant === 'number' && !isNaN(reglement.montant) ? reglement.montant : 0;
        return sum + montant;
      }, 0),
    [reglementsEnAttenteAffiches]
  );

  const detailsCartes: Record<DetailCarteId, DetailCarte> = {
    total_factures: {
      id: 'total_factures',
      titre: exerciceFiltre ? 'Détail du total factures de l’exercice' : 'Détail du total factures filtrées',
      description: 'Chaque ligne correspond à une facture d’achat retenue dans la base de calcul. Les demandes d’acompte rattachées ne sont pas ajoutées comme factures supplémentaires.',
      resume: formaterMontant(totalFacturesExercice),
      lignes: [...baseFacturationPaiements]
        .sort((a, b) => b.totalTTC - a.totalTTC)
        .map((element) => ({
          id: element.id,
          libelle: `${element.numero} - ${element.fournisseur}`,
          detail:
            element.nature === 'facture_principale'
              ? `Facture principale consolidée. Les demandes d’acompte restent des pièces comptables rattachées. ${element.detailsSupplementaires || ''}`.trim()
              : 'Facture fournisseur visible dans la base de calcul.',
          montant: element.totalTTC,
        })),
      emptyMessage: 'Aucune facture retenue pour ce calcul.',
    },
    total_a_regler: {
      id: 'total_a_regler',
      titre: 'Détail du total à régler',
      description: 'Somme des restes à payer de chaque facture retenue dans le calcul.',
      resume: formaterMontant(totalAReglerAffiche),
      lignes: [...baseFacturationPaiements]
        .filter((element) => element.totalRestant > 0.009)
        .sort((a, b) => b.totalRestant - a.totalRestant)
        .map((element) => ({
          id: element.id,
          libelle: `${element.numero} - ${element.fournisseur}`,
          detail: `${formaterMontant(element.totalTTC)} total, ${formaterMontant(element.totalRegle)} déjà réglés`,
          montant: element.totalRestant,
          tonalite: 'warning',
        })),
      emptyMessage: 'Aucun montant restant à régler sur la sélection.',
    },
    total_regle: {
      id: 'total_regle',
      titre: 'Détail du total réglé',
      description: 'Somme des montants déjà payés sur les factures retenues. Les demandes d’acompte alimentent la facture principale sans créer de total facture supplémentaire.',
      resume: formaterMontant(totalRegleAffiche),
      lignes: [...baseFacturationPaiements]
        .filter((element) => element.totalRegle > 0.009)
        .sort((a, b) => b.totalRegle - a.totalRegle)
        .map((element) => ({
          id: element.id,
          libelle: `${element.numero} - ${element.fournisseur}`,
          detail:
            element.nature === 'facture_principale'
              ? `Paiements consolidés à partir des pièces comptables rattachées. ${element.detailsSupplementaires || ''}`.trim()
              : `Reste courant : ${formaterMontant(element.totalRestant)}`,
          montant: element.totalRegle,
          tonalite: 'success',
        })),
      emptyMessage: 'Aucun règlement payé sur la sélection.',
    },
    en_attente: {
      id: 'en_attente',
      titre: 'Détail des paiements en attente',
      description: 'Règlements saisis mais pas encore marqués comme payés.',
      resume: formaterMontant(totalEnAttenteAffiche),
      lignes: reglementsEnAttenteAffiches.map((reglement) => {
        const parent = facturePrincipaleParFactureLiee.get(reglement.factureId);
        return {
          id: reglement.id,
          libelle: parent
            ? `${parent.numero} - ${parent.fournisseur}`
            : `${reglement.numeroFacture} - ${reglement.fournisseur}`,
          detail: parent
            ? `${libelleTypeReglement(reglement.type)} du ${formaterDate(new Date(reglement.dateReglement))} | Pièce comptable rattachée : ${reglement.numeroFacture}`
            : `${libelleTypeReglement(reglement.type)} du ${formaterDate(new Date(reglement.dateReglement))}`,
          montant: reglement.montant,
          tonalite: 'warning' as const,
        };
      }),
      emptyMessage: 'Aucun règlement en attente sur la sélection.',
    },
    factures_reglees: {
      id: 'factures_reglees',
      titre: 'Détail des factures réglées',
      description: 'Factures dont le reste à payer est nul dans la base de calcul affichée.',
      resume: `${facturesRegleesAffiche} / ${baseFacturationPaiements.length}`,
      lignes: [...baseFacturationPaiements]
        .filter((element) => element.statut === 'regle')
        .sort((a, b) => b.totalTTC - a.totalTTC)
        .map((element) => ({
          id: element.id,
          libelle: `${element.numero} - ${element.fournisseur}`,
          detail:
            element.nature === 'facture_principale'
              ? `Facture principale soldée. ${element.detailsSupplementaires || ''}`.trim()
              : 'Facture soldée.',
          montant: element.totalTTC,
          tonalite: 'success',
        })),
      emptyMessage: 'Aucune facture complètement réglée sur la sélection.',
    },
  };

  const detailCarteSelectionnee = detailCarteActive ? detailsCartes[detailCarteActive] : null;

  const handleAjouterReglement = () => {
    setReglementEdite(null);
    setFacturePourNouveauReglement(null);
    setAfficherModal(true);
  };

  const handleRecalerReglementsRapides = () => {
    const facturesMap = new Map(factures.map(f => [f.id, f]));
    const reglementsARecaler = reglements.filter((r) => {
      if (r.statut !== 'paye') return false;
      if (r.type !== 'reglement_complet') return false;
      const facture = facturesMap.get(r.factureId);
      if (!facture) return false;
      const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
      const dateReglement = r.dateReglement instanceof Date ? r.dateReglement : new Date(r.dateReglement);
      const montantOk = Math.abs(r.montant - facture.totalTTC) < 0.01;
      return montantOk && dateReglement.getTime() > dateFacture.getTime();
    });

    if (reglementsARecaler.length === 0) {
      alert('Aucun règlement rapide à recaler.');
      return;
    }

    const confirmer = window.confirm(
      `Recaler ${reglementsARecaler.length} règlement(s) sur la date de facture ?`
    );
    if (!confirmer) return;

    reglementsARecaler.forEach((reglement) => {
      const facture = facturesMap.get(reglement.factureId);
      if (!facture) return;
      const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
      mettreAJourReglement(reglement.id, {
        dateReglement: dateFacture,
      });
    });

    setReglements(chargerReglements());
  };

  const handleEditerReglement = (reglement: Reglement) => {
    setReglementEdite(reglement);
    setFacturePourNouveauReglement(null);
    setAfficherModal(true);
  };

  const handleAjouterReglementPourFacture = (facture: Facture) => {
    setReglementEdite(null);
    setFacturePourNouveauReglement(facture);
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
    setFacturePourNouveauReglement(null);
  };

  const handleCreerAcomptes = (facture: Facture) => {
    const regle = obtenirReglePaiement(facture.fournisseur);
    
    // Si le fournisseur nécessite un pourcentage d'acompte (RB DRINKS, ITALESSE)
    if (regle?.paiementAvance && regle.pourcentageAcompte !== undefined) {
      setFacturePourAcomptes(facture);
      setAfficherModalAcomptes(true);
    } else {
      // Sinon, créer directement les acomptes (LEHMANN)
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
    // Marquer rapidement la facture comme réglée avec virement et date de la facture
    const dateReglementRapide =
      facture.date instanceof Date ? facture.date : new Date(facture.date);
    const reglementsEnAttente = reglements.filter(
      r => r.factureId === facture.id && r.statut === 'en_attente'
    );
    
    if (reglementsEnAttente.length > 0) {
      // Marquer tous les règlements en attente comme payés avec date d'aujourd'hui
      reglementsEnAttente.forEach(reglement => {
        mettreAJourReglement(reglement.id, {
          statut: 'paye',
          dateReglement: dateReglementRapide,
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
        dateReglement: dateReglementRapide,
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
    return Array.from(new Set([...factures.map(f => f.fournisseur), ...devis.map(d => d.fournisseur)]));
  }, [factures, devis]);

  const exercicesDisponibles = useMemo(() => {
    const exercices = new Set<string>();
    reglements.forEach(r => {
      exercices.add(obtenirExerciceFiscal(new Date(r.dateReglement)));
    });
    devis.forEach(d => {
      (d.acomptesDemandes || []).forEach(a => {
        exercices.add(obtenirExerciceFiscal(new Date(a.date)));
      });
    });
    factures.forEach(f => {
      const dateFacture = f.date instanceof Date ? f.date : new Date(f.date);
      exercices.add(obtenirExerciceFiscal(dateFacture));
    });
    return Array.from(exercices).sort((a, b) => b.localeCompare(a, 'fr'));
  }, [reglements, factures, devis]);

  const reglementsDevis = useMemo(() => {
    return devis.flatMap((d) => {
      const estFacture =
        d.statut === 'facture_partielle' || d.statut === 'facture_soldee';
      const aFactureLiee = (d.facturesLieesIds || []).length > 0;
      if (estFacture || aFactureLiee) return [];
      const acomptes =
        d.acomptesDemandes && d.acomptesDemandes.length > 0
          ? d.acomptesDemandes
          : typeof d.acompteDemandeTTC === 'number' && d.acompteDemandeTTC > 0
            ? [
                {
                  id: 'acompte-legacy',
                  date: d.date,
                  montantTTC: d.acompteDemandeTTC,
                  note: 'Acompte',
                },
              ]
            : [];
      return acomptes.map((a) => ({
        id: `reglement-devis-${d.id}-${a.id}`,
        factureId: `devis-${d.id}`,
        numeroFacture: d.numero,
        fournisseur: d.fournisseur,
        type: (a.note || '').toLowerCase().includes('solde') ? 'solde' : 'acompte',
        montant: a.montantTTC || 0,
        dateReglement: a.date instanceof Date ? a.date : new Date(a.date),
        statut: 'paye',
        modePaiement: 'virement',
        notes: a.note ? `Devis ${d.numero} - ${a.note}` : `Devis ${d.numero}`,
        dateCreation: d.dateImport instanceof Date ? d.dateImport : new Date(d.dateImport),
        dateModification: d.dateImport instanceof Date ? d.dateImport : new Date(d.dateImport),
        source: 'devis',
      }));
    });
  }, [devis]);

  const reglementsJournal = useMemo(
    () => [
      ...reglements.map((r) => ({ ...r, source: 'facture' as const })),
      ...reglementsDevis,
    ],
    [reglements, reglementsDevis]
  );

  const soldeParDocument = useMemo(() => {
    const totalParId = new Map<string, number>();
    factures.forEach((f) => {
      totalParId.set(f.id, typeof f.totalTTC === 'number' ? f.totalTTC : 0);
    });
    devis.forEach((d) => {
      totalParId.set(`devis-${d.id}`, typeof d.totalTTC === 'number' ? d.totalTTC : 0);
    });

    const regleParId = new Map<string, number>();
    reglementsJournal.forEach((r) => {
      const prev = regleParId.get(r.factureId) || 0;
      regleParId.set(r.factureId, prev + (r.montant || 0));
    });

    const solde = new Map<string, number>();
    totalParId.forEach((total, id) => {
      const regle = regleParId.get(id) || 0;
      solde.set(id, Math.max(0, total - regle));
    });
    return solde;
  }, [factures, devis, reglementsJournal]);

  // Règlements filtrés pour le journal en fonction des filtres actuels
  const reglementsFiltresJournal = useMemo(() => {
    const idsFacturesFiltrees = idsFacturesBaseAffichee;
    return reglementsJournal.filter(r => {
      const estDevis = r.factureId.startsWith('devis-');
      if (!estDevis && !idsFacturesFiltrees.has(r.factureId)) return false;
      if (factureFiltre && !r.numeroFacture.toLowerCase().includes(factureFiltre.toLowerCase())) {
        return false;
      }
      if (fournisseurFiltre && r.fournisseur !== fournisseurFiltre) return false;
      if (statutFiltre && r.statut !== statutFiltre) return false;
      if (exerciceFiltre) {
        const exercice = obtenirExerciceFiscal(new Date(r.dateReglement));
        if (exercice !== exerciceFiltre) return false;
      }
      return true;
    });
  }, [reglementsJournal, idsFacturesBaseAffichee, factureFiltre, fournisseurFiltre, statutFiltre, exerciceFiltre]);

  const journalReglementsIndividuels = useMemo(() => {
    return [...reglementsFiltresJournal].sort((a, b) => {
      const da = new Date(a.dateReglement).getTime();
      const db = new Date(b.dateReglement).getTime();
      return da - db;
    });
  }, [reglementsFiltresJournal]);

  type LigneJournalGroupe = {
    cle: string;
    libelle: string;
    nombre: number;
    montant: number;
  };

  const journalGroupes: LigneJournalGroupe[] = useMemo(() => {
    if (modeJournal === 'individuel' || modeJournal === 'facture') return [];

    const map = new Map<string, LigneJournalGroupe>();

    reglementsFiltresJournal.forEach(r => {
      const date = r.dateReglement instanceof Date ? r.dateReglement : new Date(r.dateReglement);
      let cle = '';
      let libelle = '';

      if (modeJournal === 'fournisseur') {
        cle = r.fournisseur;
        libelle = r.fournisseur;
      } else if (modeJournal === 'annee') {
        const annee = date.getFullYear();
        cle = String(annee);
        libelle = String(annee);
      } else if (modeJournal === 'mois') {
        const annee = date.getFullYear();
        const mois = date.getMonth(); // 0-11
        cle = `${annee}-${mois}`;
        libelle = new Intl.DateTimeFormat('fr-FR', {
          month: 'long',
          year: 'numeric',
        }).format(date);
      }

      if (!cle) return;

      const montant = typeof r.montant === 'number' && !isNaN(r.montant) ? r.montant : 0;
      const existant = map.get(cle);
      if (existant) {
        existant.nombre += 1;
        existant.montant += montant;
      } else {
        map.set(cle, {
          cle,
          libelle,
          nombre: 1,
          montant,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));
  }, [modeJournal, reglementsFiltresJournal]);

  const journalParFacture = useMemo(() => {
    if (modeJournal !== 'facture') return [];
    const map = new Map<
      string,
      { factureId: string; numero: string; fournisseur: string; montant: number }
    >();

    reglementsFiltresJournal.forEach((r) => {
      const key = r.factureId;
      const existant = map.get(key);
      if (existant) {
        existant.montant += typeof r.montant === 'number' ? r.montant : 0;
      } else {
        map.set(key, {
          factureId: r.factureId,
          numero: r.numeroFacture,
          fournisseur: r.fournisseur,
          montant: typeof r.montant === 'number' ? r.montant : 0,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.numero.localeCompare(b.numero, 'fr'));
  }, [modeJournal, reglementsFiltresJournal]);

  const devisParFactureId = useMemo(() => {
    const map = new Map<string, Devis>();
    devis.forEach((d) => {
      (d.facturesLieesIds || []).forEach((id) => {
        map.set(id, d);
      });
    });
    return map;
  }, [devis]);

  const regleParDevisId = useMemo(() => {
    const map = new Map<string, number>();
    reglements.forEach((r) => {
      const devis = devisParFactureId.get(r.factureId);
      if (!devis) return;
      const prev = map.get(devis.id) || 0;
      map.set(devis.id, prev + (r.montant || 0));
    });
    return map;
  }, [reglements, devisParFactureId]);

  return (
    <div className="reglements">
      <div className="reglements__header">
        <h1>Règlements des factures</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="reglements__btn-add" onClick={handleAjouterReglement}>
            <Plus size={20} />
            Ajouter un règlement
          </button>
          <button className="reglements__btn-add" onClick={handleRecalerReglementsRapides}>
            Recaler dates règlement
          </button>
        </div>
      </div>

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
            onChange={(e) =>
              setStatutFiltre(e.target.value as StatutReglement | 'partiel' | 'non_regle' | '')
            }
          >
            <option value="">Tous</option>
            <option value="paye">Payé</option>
            <option value="partiel">Partiel</option>
            <option value="en_attente">En attente</option>
            <option value="non_regle">Non réglé</option>
          </select>
        </div>
        <div className="reglements__filtre">
          <label>Exercice fiscal</label>
          <select
            value={exerciceFiltre}
            onChange={(e) => setExerciceFiltre(e.target.value)}
          >
            <option value="">Tous</option>
            {exercicesDisponibles.map((annee) => (
              <option key={annee} value={String(annee)}>
                {annee}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Section Statistiques */}
      <div className="reglements__stats">
        <button
          type="button"
          className="reglements__stat-card reglements__stat-card--interactive"
          onClick={() => setDetailCarteActive('total_factures')}
        >
          <div className="reglements__stat-label">
            {exerciceFiltre ? 'Total factures de l’exercice (hors acomptes)' : 'Total factures filtrées (hors acomptes)'}
          </div>
          <div className="reglements__stat-value">{formaterMontant(totalFacturesExercice)}</div>
          <div className="reglements__stat-hint">Cliquer pour voir le calcul</div>
        </button>
        <button
          type="button"
          className="reglements__stat-card reglements__stat-card--interactive"
          onClick={() => setDetailCarteActive('total_a_regler')}
        >
          <div className="reglements__stat-label">Total à régler</div>
          <div className="reglements__stat-value">{formaterMontant(totalAReglerAffiche)}</div>
          <div className="reglements__stat-hint">Cliquer pour voir le calcul</div>
        </button>
        <button
          type="button"
          className="reglements__stat-card reglements__stat-card--interactive"
          onClick={() => setDetailCarteActive('total_regle')}
        >
          <div className="reglements__stat-label">Total réglé</div>
          <div className="reglements__stat-value reglements__stat-value--success">
            {formaterMontant(totalRegleAffiche)}
          </div>
          <div className="reglements__stat-hint">Cliquer pour voir le calcul</div>
        </button>
        <button
          type="button"
          className="reglements__stat-card reglements__stat-card--interactive"
          onClick={() => setDetailCarteActive('en_attente')}
        >
          <div className="reglements__stat-label">En attente</div>
          <div className="reglements__stat-value reglements__stat-value--warning">
            {formaterMontant(totalEnAttenteAffiche)}
          </div>
          <div className="reglements__stat-hint">Cliquer pour voir le calcul</div>
        </button>
        <button
          type="button"
          className="reglements__stat-card reglements__stat-card--interactive"
          onClick={() => setDetailCarteActive('factures_reglees')}
        >
          <div className="reglements__stat-label">Factures réglées</div>
          <div className="reglements__stat-value">
            {facturesRegleesAffiche} / {baseFacturationPaiements.length}
          </div>
          <div className="reglements__stat-hint">Cliquer pour voir le détail</div>
        </button>
        <div className="reglements__stat-card" style={{ alignItems: 'flex-start' }}>
          <div className="reglements__stat-label">Stats fournisseurs</div>
          <button
            type="button"
            onClick={() => setAfficherStatsFournisseur((v) => !v)}
            className="reglements__btn-add"
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }}
          >
            {afficherStatsFournisseur ? 'Masquer' : 'Afficher'}
          </button>
        </div>
      </div>

      {/* Statistiques par fournisseur */}
      {afficherStatsFournisseur &&
        statistiques.parFournisseur &&
        Object.keys(statistiques.parFournisseur).length > 0 && (
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

      {/* Liste des factures avec leurs règlements */}
      <div className="reglements__liste">
        <div style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            onClick={() => setAfficherListeFactures((v) => !v)}
            className="reglements__btn-add"
          >
            {afficherListeFactures ? 'Masquer les dossiers de paiement' : 'Afficher les dossiers de paiement'}
          </button>
        </div>
        {afficherListeFactures &&
          facturesFiltrees
            .filter((facture) => !idsFacturesAbsorbees.has(facture.id))
            .map(facture => {
            const etat = etatsReglements[facture.id];
            if (!etat) return null;

          const reglementsFacture = reglements.filter(r => {
            if (r.factureId !== facture.id) return false;
            if (!exerciceFiltre) return true;
            const exercice = obtenirExerciceFiscal(new Date(r.dateReglement));
            return exercice === exerciceFiltre;
          });
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
                      <button
                        className="reglements__btn-add"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAjouterReglementPourFacture(facture);
                        }}
                        title="Ajouter un règlement pour cette facture"
                      >
                        <Plus size={16} />
                        Ajouter un règlement
                      </button>
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

      {/* Journal des règlements (pour impression et export papier) */}
      <div className="reglements__journal">
        <div className="reglements__journal-header">
          <h2>Journal des règlements</h2>
          <div className="reglements__journal-actions">
            <div className="reglements__journal-mode">
              <label>Vue</label>
              <select
                value={modeJournal}
                onChange={(e) => setModeJournal(e.target.value as typeof modeJournal)}
              >
                <option value="individuel">Individuel (tous les règlements)</option>
                <option value="mois">Regroupé par mois</option>
                <option value="annee">Regroupé par année</option>
                <option value="fournisseur">Regroupé par fournisseur</option>
                <option value="facture">Regroupé par facture</option>
              </select>
            </div>
            <div className="reglements__journal-mode">
              <label>Fournisseur</label>
              <select
                value={fournisseurFiltre}
                onChange={(e) => setFournisseurFiltre(e.target.value)}
              >
                <option value="">Tous</option>
                {fournisseurs.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="reglements__journal-print-btn"
              onClick={() => window.print()}
            >
              <Printer size={18} />
              Imprimer le journal
            </button>
          </div>
        </div>

        {reglementsFiltresJournal.length === 0 ? (
          <div className="reglements__journal-empty">
            <p>Aucun règlement ne correspond aux filtres actuels.</p>
          </div>
        ) : modeJournal === 'individuel' ? (
          <div className="reglements__journal-table-container">
            <table className="reglements__journal-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Fournisseur</th>
                  <th>Facture</th>
                  <th>Montant</th>
                  <th>Solde à devoir</th>
                  <th>Mode</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {journalReglementsIndividuels.map((r) => (
                  <tr key={r.id}>
                    <td>{r.source === 'devis' ? 'Devis' : 'Facture'}</td>
                    <td>{formaterDate(r.dateReglement)}</td>
                    <td>{r.fournisseur}</td>
                    <td>{r.numeroFacture}</td>
                    <td className="reglements__journal-cell-right">
                      {formaterMontant(r.montant)}
                    </td>
                    <td className="reglements__journal-cell-right">
                      {formaterMontant(soldeParDocument.get(r.factureId) || 0)}
                    </td>
                    <td>{r.modePaiement}</td>
                    <td>
                      {r.statut === 'paye'
                        ? 'Payé'
                        : r.statut === 'en_attente'
                        ? 'En attente'
                        : r.statut === 'partiel'
                        ? 'Partiel'
                        : r.statut === 'annule'
                        ? 'Annulé'
                        : r.statut}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : modeJournal === 'facture' ? (
          <div className="reglements__journal-table-container">
            <table className="reglements__journal-table">
              <thead>
                <tr>
                  <th>Facture</th>
                  <th>Fournisseur</th>
                  <th>Total réglé</th>
                  <th>Solde à devoir</th>
                  <th>Solde devis</th>
                </tr>
              </thead>
              <tbody>
                {journalParFacture.map((ligne) => (
                  <tr key={ligne.factureId}>
                    <td>{ligne.numero}</td>
                    <td>{ligne.fournisseur}</td>
                    <td className="reglements__journal-cell-right">
                      {formaterMontant(ligne.montant)}
                    </td>
                    <td className="reglements__journal-cell-right">
                      {formaterMontant(soldeParDocument.get(ligne.factureId) || 0)}
                    </td>
                    <td className="reglements__journal-cell-right">
                      {(() => {
                        const devis = devisParFactureId.get(ligne.factureId);
                        if (!devis) return '—';
                        const totalRegle = regleParDevisId.get(devis.id) || 0;
                        const reste = Math.max(0, (devis.totalTTC || 0) - totalRegle);
                        return formaterMontant(reste);
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="reglements__journal-table-container">
            <table className="reglements__journal-table">
              <thead>
                <tr>
                  <th>
                    {modeJournal === 'fournisseur'
                      ? 'Fournisseur'
                      : modeJournal === 'annee'
                      ? 'Année'
                      : 'Mois'}
                  </th>
                  <th>Nombre de règlements</th>
                  <th>Total réglé</th>
                </tr>
              </thead>
              <tbody>
                {journalGroupes.map((ligne) => (
                  <tr key={ligne.cle}>
                    <td>{ligne.libelle}</td>
                    <td className="reglements__journal-cell-right">{ligne.nombre}</td>
                    <td className="reglements__journal-cell-right">
                      {formaterMontant(ligne.montant)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal pour ajouter/éditer un règlement */}
      {afficherModal && (
        <ModalReglement
          factures={factures}
          etatsReglements={etatsReglements}
          reglement={reglementEdite}
          facturePreselectionneeId={facturePourNouveauReglement?.id}
          exerciceFiltre={exerciceFiltre}
          reglements={reglements}
          onSauvegarder={handleSauvegarderReglement}
          onFermer={() => {
            setAfficherModal(false);
            setReglementEdite(null);
            setFacturePourNouveauReglement(null);
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
                
                if (factureAMarquer.fournisseur === 'LEHMANN' && regle.nombreAcomptes === 3) {
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
      {detailCarteSelectionnee && (
        <ModalDetailCarte
          detail={detailCarteSelectionnee}
          onFermer={() => setDetailCarteActive(null)}
        />
      )}
    </div>
  );
}

interface ModalDetailCarteProps {
  detail: DetailCarte;
  onFermer: () => void;
}

function ModalDetailCarte({ detail, onFermer }: ModalDetailCarteProps) {
  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  return (
    <div className="reglements__modal-overlay" onClick={onFermer}>
      <div
        className="reglements__modal reglements__modal--large"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="reglements__detail-modal-header">
          <div>
            <h2>{detail.titre}</h2>
            <p>{detail.description}</p>
          </div>
          <button type="button" className="reglements__detail-modal-close" onClick={onFermer}>
            Fermer
          </button>
        </div>

        <div className="reglements__detail-modal-summary">
          <span className="reglements__detail-modal-summary-label">Résultat affiché</span>
          <strong className="reglements__detail-modal-summary-value">{detail.resume}</strong>
        </div>

        {detail.lignes.length === 0 ? (
          <div className="reglements__detail-empty">{detail.emptyMessage}</div>
        ) : (
          <div className="reglements__detail-list">
            {detail.lignes.map((ligne) => (
              <div key={ligne.id} className="reglements__detail-item">
                <div className="reglements__detail-item-main">
                  <strong>{ligne.libelle}</strong>
                  {ligne.detail && <span>{ligne.detail}</span>}
                </div>
                {typeof ligne.montant === 'number' && (
                  <span className={`reglements__detail-amount reglements__detail-amount--${ligne.tonalite || 'default'}`}>
                    {formaterMontant(ligne.montant)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Composant Modal pour ajouter/éditer un règlement
interface ModalReglementProps {
  factures: Facture[];
  etatsReglements: Record<string, EtatReglementFacture>;
  reglement: Reglement | null;
  facturePreselectionneeId?: string;
  exerciceFiltre?: string;
  reglements: Reglement[];
  onSauvegarder: (reglement: Omit<Reglement, 'id' | 'dateCreation' | 'dateModification'>) => void;
  onFermer: () => void;
}

function ModalReglement({
  factures,
  etatsReglements,
  reglement,
  facturePreselectionneeId,
  exerciceFiltre,
  reglements,
  onSauvegarder,
  onFermer,
}: ModalReglementProps) {
  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const [factureId, setFactureId] = useState(reglement?.factureId || facturePreselectionneeId || '');
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

  const factureDansExercice = (facture: Facture, exercice: string): boolean => {
    const reglementsFacture = reglements.filter(r => r.factureId === facture.id);
    if (reglementsFacture.length > 0) {
      return reglementsFacture.some(r => {
        const exerciceReglement = obtenirExerciceFiscal(new Date(r.dateReglement));
        return exerciceReglement === exercice;
      });
    }

    const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
    const exerciceFacture = obtenirExerciceFiscal(dateFacture);
    return exerciceFacture === exercice;
  };

  useEffect(() => {
    if (!reglement && facturePreselectionneeId) {
      setFactureId(facturePreselectionneeId);
    }
  }, [reglement, facturePreselectionneeId]);

  // Ne proposer dans la liste que les factures avec un montant restant à régler
  const facturesAvecMontantRestant = useMemo(() => {
    return factures
      .map((f) => {
        const etat = etatsReglements[f.id];
        const montantRestant = etat ? etat.montantRestant : f.totalTTC;
        return { facture: f, montantRestant };
      })
      .filter(({ facture, montantRestant }) => {
        if (montantRestant <= 0.01) return false;
        if (!exerciceFiltre) return true;
        return factureDansExercice(facture, exerciceFiltre);
      });
  }, [factures, etatsReglements, exerciceFiltre, reglements]);

  const factureSelectionnee = facturesAvecMontantRestant.find(f => f.facture.id === factureId)?.facture;

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
              {facturesAvecMontantRestant.map(({ facture, montantRestant }) => (
                <option key={facture.id} value={facture.id}>
                  {facture.numero} - {facture.fournisseur} (Restant: {formaterMontant(montantRestant)})
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
  const acomptesPrevu = regle
    ? (() => {
        const dateFacture = new Date(facture.date);
        if (facture.fournisseur === 'LEHMANN' && regle.nombreAcomptes === 3) {
          const montantParTranche = facture.totalTTC / 3;
          return [
            {
              montant: montantParTranche,
              dateEcheance: new Date(
                dateFacture.getTime() + 30 * 24 * 60 * 60 * 1000
              ),
              type: 'solde' as const,
            },
            {
              montant: montantParTranche,
              dateEcheance: new Date(
                dateFacture.getTime() + 60 * 24 * 60 * 60 * 1000
              ),
              type: 'solde' as const,
            },
            {
              montant: montantParTranche,
              dateEcheance: new Date(
                dateFacture.getTime() + 90 * 24 * 60 * 60 * 1000
              ),
              type: 'solde' as const,
            },
          ];
        }
        return [];
      })()
    : [];

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
