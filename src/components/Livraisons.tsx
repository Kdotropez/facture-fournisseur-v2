import { useEffect, useMemo, useState } from 'react';
import type { Devis } from '../types/devis';
import type { Facture, Fournisseur, LigneProduit } from '../types/facture';
import './DetailsFacture.css';

interface LivraisonsProps {
  devis: Devis[];
  factures: Facture[];
  onUpdateDevis: (devis: Devis) => void;
  onUpdateFacture: (facture: Facture) => void;
}

type LigneLivraison = {
  id: string;
  type: 'devis' | 'facture';
  documentId: string;
  numero: string;
  fournisseur: Fournisseur;
  date: Date;
  exercice: string;
  description: string;
  ref?: string;
  logo?: string;
  couleur?: string;
  quantite: number;
  quantiteRecue: number;
  ligneIndex: number;
};

const obtenirExerciceFiscal = (date: Date): string => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const annee = date.getFullYear();
  const mois = date.getMonth() + 1;
  return mois === 12 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`;
};

const normaliserMontant = (valeur: string): number | null => {
  const nettoyee = valeur.replace(/\s/g, '').replace(',', '.');
  if (nettoyee === '') return null;
  const parsed = Number.parseFloat(nettoyee);
  return Number.isFinite(parsed) ? parsed : null;
};

const normaliserCleLigne = (valeur?: string): string =>
  (valeur || '').trim().toUpperCase().replace(/\s+/g, ' ');

const escapeHtml = (valeur: unknown): string =>
  String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const obtenirCleLigne = (ligne: LigneProduit): string =>
  normaliserCleLigne(
    ligne.refFournisseur || ligne.logo || ligne.bat || ligne.description
  );

const normaliserTexteComparaison = (valeur: string): string[] =>
  valeur
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));

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

const synchroniserLignesRecues = (
  source: LigneProduit[],
  cible: LigneProduit[]
): LigneProduit[] => {
  const compteSource = new Map<string, number>();
  const indexSource = new Map<
    string,
    {
      quantiteFactureeManuelle?: number;
      receptions?: LigneProduit['receptions'];
    }
  >();

  source.forEach((ligne) => {
    const cle = obtenirCleLigne(ligne);
    const occurrence = compteSource.get(cle) || 0;
    compteSource.set(cle, occurrence + 1);
    indexSource.set(`${cle}__${occurrence}`, {
      quantiteFactureeManuelle: ligne.quantiteFactureeManuelle,
      receptions: ligne.receptions,
    });
  });

  const compteCible = new Map<string, number>();

  return cible.map((ligne) => {
    const cle = obtenirCleLigne(ligne);
    const occurrence = compteCible.get(cle) || 0;
    compteCible.set(cle, occurrence + 1);

    const ligneSource = indexSource.get(`${cle}__${occurrence}`);
    if (!ligneSource) return ligne;

    return {
      ...ligne,
      quantiteFactureeManuelle: ligneSource.quantiteFactureeManuelle,
      receptions:
        ligneSource.receptions !== undefined ? ligneSource.receptions : ligne.receptions,
    };
  });
};

export function Livraisons({ devis, factures, onUpdateDevis, onUpdateFacture }: LivraisonsProps) {
  const [fournisseurFiltre, setFournisseurFiltre] = useState<string>('');
  const [termeRecherche, setTermeRecherche] = useState('');
  const [afficherCompletes, setAfficherCompletes] = useState(false);
  const [typeFiltre, setTypeFiltre] = useState<'tous' | 'devis' | 'facture'>('tous');
  const [documentSelectionne, setDocumentSelectionne] = useState('');
  const [exerciceFiltre, setExerciceFiltre] = useState('');
  const [brouillonQuantites, setBrouillonQuantites] = useState<Record<string, string>>({});

  const formaterDate = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);

  const idsFacturesMasquees = useMemo(() => {
    const ids = new Set<string>(devis.flatMap((d) => d.facturesLieesIds || []));
    const idsFacturesLieesExplicitement = new Set(ids);

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
        ids.add(facture.id);
      }
    });

    return ids;
  }, [devis, factures]);

  const facturesVisibles = useMemo(
    () => factures.filter((facture) => !idsFacturesMasquees.has(facture.id)),
    [factures, idsFacturesMasquees]
  );

  const fournisseurs = useMemo(
    () => Array.from(new Set([...devis.map((d) => d.fournisseur), ...facturesVisibles.map((f) => f.fournisseur)])),
    [devis, facturesVisibles]
  );

  const lignes = useMemo<LigneLivraison[]>(() => {
    const devisLignes = devis.flatMap((d) =>
      d.lignes.map((ligne, index) => ({
        id: `devis-${d.id}-${index}`,
        type: 'devis' as const,
        documentId: d.id,
        numero: d.numero,
        fournisseur: d.fournisseur,
        date: d.date,
        exercice: obtenirExerciceFiscal(d.date),
        description: ligne.description,
        ref: ligne.refFournisseur,
        logo: ligne.logo,
        couleur: ligne.couleur,
        quantite: ligne.quantite || 0,
        quantiteRecue: ligne.quantiteFactureeManuelle || 0,
        ligneIndex: index,
      }))
    );

    const facturesLignes = facturesVisibles.flatMap((f) =>
      f.lignes.map((ligne, index) => ({
        id: `facture-${f.id}-${index}`,
        type: 'facture' as const,
        documentId: f.id,
        numero: f.numero,
        fournisseur: f.fournisseur,
        date: f.date,
        exercice: obtenirExerciceFiscal(f.date),
        description: ligne.description,
        ref: ligne.refFournisseur,
        logo: ligne.logo,
        couleur: ligne.couleur,
        quantite: ligne.quantite || 0,
        quantiteRecue: ligne.quantiteFactureeManuelle || 0,
        ligneIndex: index,
      }))
    );

    return [...devisLignes, ...facturesLignes];
  }, [devis, facturesVisibles]);

  const exercicesDisponibles = useMemo(
    () =>
      Array.from(new Set(lignes.map((ligne) => ligne.exercice).filter(Boolean))).sort().reverse(),
    [lignes]
  );

  const documentsDisponibles = useMemo(() => {
    const documents = [
      ...devis.map((d) => ({
        id: d.id,
        type: 'devis' as const,
        numero: d.numero,
        fournisseur: d.fournisseur,
      })),
      ...facturesVisibles.map((f) => ({
        id: f.id,
        type: 'facture' as const,
        numero: f.numero,
        fournisseur: f.fournisseur,
      })),
    ];

    return documents.filter((doc) => {
      if (typeFiltre !== 'tous' && doc.type !== typeFiltre) return false;
      if (fournisseurFiltre && doc.fournisseur !== fournisseurFiltre) return false;
      if (exerciceFiltre) {
        const exerciceDoc = obtenirExerciceFiscal(
          doc.type === 'devis'
            ? (devis.find((d) => d.id === doc.id)?.date || new Date(''))
            : (factures.find((f) => f.id === doc.id)?.date || new Date(''))
        );
        if (exerciceDoc !== exerciceFiltre) return false;
      }
      if (termeRecherche) {
        const terme = termeRecherche.toLowerCase();
        if (
          !doc.numero.toLowerCase().includes(terme) &&
          !doc.fournisseur.toLowerCase().includes(terme)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [devis, facturesVisibles, typeFiltre, fournisseurFiltre, exerciceFiltre, termeRecherche]);

  const lignesFiltrees = useMemo(() => {
    const terme = termeRecherche.toLowerCase();
    return lignes
      .map((ligne) => {
        const valeurBrouillon = brouillonQuantites[ligne.id];
        const quantiteRecue =
          valeurBrouillon !== undefined
            ? Math.max(0, normaliserMontant(valeurBrouillon) ?? 0)
            : ligne.quantiteRecue;
        return { ...ligne, quantiteRecue };
      })
      .filter((ligne) => {
      if (typeFiltre !== 'tous' && ligne.type !== typeFiltre) return false;
      if (documentSelectionne && ligne.documentId !== documentSelectionne) return false;
      if (fournisseurFiltre && ligne.fournisseur !== fournisseurFiltre) return false;
      if (exerciceFiltre && ligne.exercice !== exerciceFiltre) return false;
      if (terme) {
        const ref = (ligne.ref || '').toLowerCase();
        const desc = ligne.description.toLowerCase();
        const numero = ligne.numero.toLowerCase();
        if (!ref.includes(terme) && !desc.includes(terme) && !numero.includes(terme)) {
          return false;
        }
      }
      const reste = ligne.quantite - ligne.quantiteRecue;
      if (!afficherCompletes && reste <= 0) return false;
      return true;
    });
  }, [lignes, typeFiltre, documentSelectionne, fournisseurFiltre, exerciceFiltre, termeRecherche, afficherCompletes, brouillonQuantites]);

  const lignesAvecBrouillon = useMemo(
    () => lignesFiltrees,
    [lignesFiltrees]
  );

  const modificationsEnAttente = useMemo(
    () => Object.keys(brouillonQuantites).length,
    [brouillonQuantites]
  );

  const documentActif = useMemo(() => {
    if (documentSelectionne) {
      return documentsDisponibles.find((doc) => doc.id === documentSelectionne) ?? null;
    }

    const documentsVisibles = Array.from(
      new Map(
        lignesFiltrees.map((ligne) => [
          ligne.documentId,
          {
            id: ligne.documentId,
            type: ligne.type,
            numero: ligne.numero,
            fournisseur: ligne.fournisseur,
          },
        ])
      ).values()
    );

    return documentsVisibles.length === 1 ? documentsVisibles[0] : null;
  }, [documentSelectionne, documentsDisponibles, lignesFiltrees]);

  useEffect(() => {
    if (!exerciceFiltre && exercicesDisponibles.length > 0) {
      setExerciceFiltre(exercicesDisponibles[0]);
    }
  }, [exerciceFiltre, exercicesDisponibles]);

  const marquerDocumentCompletRecu = () => {
    const documentId = documentActif?.id;
    if (!documentId) return;
    const nouvellesValeurs = { ...brouillonQuantites };
    lignes
      .filter((ligne) => ligne.documentId === documentId)
      .forEach((ligne) => {
        nouvellesValeurs[ligne.id] = String(ligne.quantite || 0);
      });
    setBrouillonQuantites(nouvellesValeurs);
  };

  const enregistrerReceptions = () => {
    if (modificationsEnAttente === 0) return;

    const devisParId = new Map(devis.map((d) => [d.id, { ...d, lignes: [...d.lignes] }]));
    const facturesParId = new Map(factures.map((f) => [f.id, { ...f, lignes: [...f.lignes] }]));
    const devisModifiesDirectement = new Set<string>();
    const facturesModifieesDirectement = new Set<string>();

    Object.entries(brouillonQuantites).forEach(([ligneId, valeur]) => {
      const ligne = lignes.find((l) => l.id === ligneId);
      if (!ligne) return;
      const quantiteRecue = Math.max(0, normaliserMontant(valeur) ?? 0);

      if (ligne.type === 'devis') {
        const devisCourant = devisParId.get(ligne.documentId);
        if (!devisCourant) return;
        devisCourant.lignes[ligne.ligneIndex] = {
          ...devisCourant.lignes[ligne.ligneIndex],
          quantiteFactureeManuelle: quantiteRecue,
        };
        devisModifiesDirectement.add(ligne.documentId);
      } else {
        const factureCourante = facturesParId.get(ligne.documentId);
        if (!factureCourante) return;
        factureCourante.lignes[ligne.ligneIndex] = {
          ...factureCourante.lignes[ligne.ligneIndex],
          quantiteFactureeManuelle: quantiteRecue,
        };
        facturesModifieesDirectement.add(ligne.documentId);
      }
    });

    devisModifiesDirectement.forEach((devisId) => {
      const devisCourant = devisParId.get(devisId);
      if (!devisCourant) return;

      const facturesLiees = (devisCourant.facturesLieesIds || []).filter((id) =>
        facturesParId.has(id)
      );
      if (facturesLiees.length !== 1) return;

      const factureLieeId = facturesLiees[0];
      if (facturesModifieesDirectement.has(factureLieeId)) return;

      const factureLiee = facturesParId.get(factureLieeId);
      if (!factureLiee) return;

      facturesParId.set(factureLieeId, {
        ...factureLiee,
        lignes: synchroniserLignesRecues(devisCourant.lignes, factureLiee.lignes),
      });
    });

    facturesModifieesDirectement.forEach((factureId) => {
      const devisLies = Array.from(devisParId.values()).filter((devisCourant) =>
        (devisCourant.facturesLieesIds || []).includes(factureId)
      );
      if (devisLies.length !== 1) return;

      const devisLie = devisLies[0];
      if (devisModifiesDirectement.has(devisLie.id)) return;

      const factureCourante = facturesParId.get(factureId);
      if (!factureCourante) return;

      devisParId.set(devisLie.id, {
        ...devisLie,
        lignes: synchroniserLignesRecues(factureCourante.lignes, devisLie.lignes),
      });
    });

    devisParId.forEach((devisModifie) => {
      const original = devis.find((d) => d.id === devisModifie.id);
      if (!original) return;
      if (JSON.stringify(original.lignes) !== JSON.stringify(devisModifie.lignes)) {
        onUpdateDevis(devisModifie);
      }
    });

    facturesParId.forEach((factureModifiee) => {
      const original = factures.find((f) => f.id === factureModifiee.id);
      if (!original) return;
      if (JSON.stringify(original.lignes) !== JSON.stringify(factureModifiee.lignes)) {
        onUpdateFacture(factureModifiee);
      }
    });

    setBrouillonQuantites({});
  };

  const exporterPdfReceptions = () => {
    const fenetre = window.open('', '_blank', 'width=1200,height=800');
    if (!fenetre) return;

    const titre = afficherCompletes
      ? 'Receptions marchandises - selection filtree'
      : 'Reste a recevoir - selection filtree';

    const meta = [
      `Mode: ${afficherCompletes ? 'Toutes les lignes affichees' : 'Seulement le reste a recevoir'}`,
      `Fournisseur: ${fournisseurFiltre || 'Tous'}`,
      `Document: ${
        documentActif
          ? `${documentActif.type === 'devis' ? 'Devis' : 'Facture'} ${documentActif.numero}`
          : documentSelectionne
            ? documentsDisponibles.find((doc) => doc.id === documentSelectionne)?.numero || 'Selection'
            : 'Tous'
      }`,
      `Exercice: ${exerciceFiltre || 'Tous'}`,
      `Recherche: ${termeRecherche || 'Aucune'}`,
      `Nombre de lignes: ${lignesAvecBrouillon.length}`,
      `Date export: ${formaterDate(new Date())}`,
    ];

    const lignesHTML = lignesAvecBrouillon
      .map((ligne) => {
        const reste = Math.max(0, ligne.quantite - ligne.quantiteRecue);
        return `
          <tr>
            <td>${escapeHtml(ligne.type === 'devis' ? 'Devis' : 'Facture')}</td>
            <td>${escapeHtml(ligne.numero)}</td>
            <td>${escapeHtml(ligne.fournisseur)}</td>
            <td>${escapeHtml(ligne.ref || '-')}</td>
            <td>${escapeHtml(ligne.logo || '-')}</td>
            <td>${escapeHtml(ligne.couleur || '-')}</td>
            <td>${escapeHtml(ligne.description)}</td>
            <td class="num">${escapeHtml(ligne.quantite)}</td>
            <td class="num">${escapeHtml(ligne.quantiteRecue)}</td>
            <td class="num">${escapeHtml(reste)}</td>
          </tr>
        `;
      })
      .join('');

    const metaHTML = meta.map((ligne) => `<div class="meta">${escapeHtml(ligne)}</div>`).join('');

    fenetre.document.write(`
      <html>
        <head>
          <title>${escapeHtml(titre)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            h1 { font-size: 20px; margin: 0 0 8px; }
            .meta { font-size: 12px; color: #555; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 18px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; text-align: left; }
            th { background: #f3f4f6; }
            td.num { text-align: right; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(titre)}</h1>
          ${metaHTML}
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Numero</th>
                <th>Fournisseur</th>
                <th>Ref.</th>
                <th>Logo</th>
                <th>Couleur</th>
                <th>Description</th>
                <th>Qte</th>
                <th>Recue</th>
                <th>Reste</th>
              </tr>
            </thead>
            <tbody>
              ${lignesHTML || '<tr><td colspan="10">Aucune ligne a exporter.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    fenetre.document.close();
    fenetre.focus();
    fenetre.print();
  };

  return (
    <div className="details-facture">
      <div className="details-facture__header">
        <div>
          <h2>Réceptions de marchandises</h2>
          <div className="details-facture__meta">
            <span className="details-facture__badge">Devis & Factures</span>
          </div>
        </div>
      </div>

      <div className="details-facture__content">
        <div className="details-facture__section">
          <div className="details-facture__modal-grid">
            <div className="details-facture__modal-field">
              <label>Recherche</label>
              <input
                type="text"
                value={termeRecherche}
                onChange={(e) => setTermeRecherche(e.target.value)}
                placeholder="Réf, description, numéro..."
              />
            </div>
            <div className="details-facture__modal-field">
              <label>Type de document</label>
              <select
                value={typeFiltre}
                onChange={(e) => {
                  const valeur = e.target.value as 'tous' | 'devis' | 'facture';
                  setTypeFiltre(valeur);
                  setDocumentSelectionne('');
                }}
              >
                <option value="tous">Tous</option>
                <option value="devis">Devis</option>
                <option value="facture">Facture</option>
              </select>
            </div>
            <div className="details-facture__modal-field">
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
            <div className="details-facture__modal-field">
              <label>Document</label>
              <select
                value={documentSelectionne}
                onChange={(e) => setDocumentSelectionne(e.target.value)}
              >
                <option value="">Tous</option>
                {documentsDisponibles.map((doc) => (
                  <option key={`${doc.type}-${doc.id}`} value={doc.id}>
                    {doc.type === 'devis' ? 'Devis' : 'Facture'} {doc.numero} - {doc.fournisseur}
                  </option>
                ))}
              </select>
            </div>
            <div className="details-facture__modal-field">
              <label>Exercice</label>
              <select
                value={exerciceFiltre}
                onChange={(e) => {
                  setExerciceFiltre(e.target.value);
                  setDocumentSelectionne('');
                }}
              >
                <option value="">Tous</option>
                {exercicesDisponibles.map((exercice) => (
                  <option key={exercice} value={exercice}>
                    {exercice}
                  </option>
                ))}
              </select>
            </div>
            <div className="details-facture__modal-field">
              <label>Afficher</label>
              <select
                value={afficherCompletes ? 'toutes' : 'restantes'}
                onChange={(e) => setAfficherCompletes(e.target.value === 'toutes')}
              >
                <option value="restantes">Seulement le reste à recevoir</option>
                <option value="toutes">Toutes les lignes</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <small style={{ color: '#6b7280' }}>
              {documentActif
                ? `Le bouton marque toutes les lignes du ${documentActif.type === 'devis' ? 'devis' : 'facture'} ${documentActif.numero} comme reçues.`
                : 'Sélectionnez un devis ou filtrez jusqu’à un seul document pour activer le bouton.'}
            </small>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                onClick={exporterPdfReceptions}
                className="details-facture__btn-add"
                disabled={lignesAvecBrouillon.length === 0}
                style={lignesAvecBrouillon.length === 0 ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
              >
                Exporter PDF
              </button>
              <button
                type="button"
                onClick={marquerDocumentCompletRecu}
                className="details-facture__btn-add"
                disabled={!documentActif}
                style={!documentActif ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}
              >
                Toute la commande reçue
              </button>
              <button
                type="button"
                onClick={enregistrerReceptions}
                className="details-facture__btn-add"
                disabled={modificationsEnAttente === 0}
                style={modificationsEnAttente === 0 ? { opacity: 0.6, cursor: 'not-allowed' } : { background: '#2563eb' }}
              >
                {modificationsEnAttente > 0 ? `Enregistrer (${modificationsEnAttente})` : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>

        <div className="details-facture__section">
          <div className="details-facture__table-container">
            <table className="details-facture__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Numéro</th>
                  <th>Fournisseur</th>
                  <th>Réf.</th>
                  <th>Logo</th>
                  <th>Couleur</th>
                  <th>Description</th>
                  <th>Qté</th>
                  <th>Reçue</th>
                  <th>Reste</th>
                </tr>
              </thead>
              <tbody>
                {lignesAvecBrouillon.map((ligne) => {
                  const reste = Math.max(0, ligne.quantite - ligne.quantiteRecue);
                  return (
                    <tr key={ligne.id}>
                      <td>{ligne.type === 'devis' ? 'Devis' : 'Facture'}</td>
                      <td>{ligne.numero}</td>
                      <td>{ligne.fournisseur}</td>
                      <td>{ligne.ref || '-'}</td>
                      <td>{ligne.logo || '-'}</td>
                      <td>{ligne.couleur || '-'}</td>
                      <td>{ligne.description}</td>
                      <td className="details-facture__cell-number">{ligne.quantite}</td>
                      <td className="details-facture__cell-number">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={brouillonQuantites[ligne.id] ?? String(ligne.quantiteRecue)}
                          onChange={(e) => {
                            setBrouillonQuantites((prev) => ({
                              ...prev,
                              [ligne.id]: e.target.value,
                            }));
                          }}
                          style={{ width: '5.5rem' }}
                        />
                      </td>
                      <td className="details-facture__cell-number">{reste}</td>
                    </tr>
                  );
                })}
                {lignesAvecBrouillon.length === 0 && (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '1rem' }}>
                      Aucune ligne à afficher.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
