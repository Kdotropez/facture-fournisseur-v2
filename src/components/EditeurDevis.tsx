/**
 * Modal de création / édition d'un devis à la main
 */

import { useEffect, useRef, useState } from 'react';
import { X, Plus, Trash2, Upload } from 'lucide-react';
import type { Devis, AcompteDevis } from '../types/devis';
import type { LigneProduit, Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import './DetailsFacture.css';

interface EditeurDevisProps {
  devisInitial?: Devis;
  onSauvegarder: (devis: Devis) => void;
  onFermer: () => void;
}

export function EditeurDevis({ devisInitial, onSauvegarder, onFermer }: EditeurDevisProps) {
  const tousLesFournisseurs = obtenirFournisseurs();
  const importCsvInputRef = useRef<HTMLInputElement>(null);
  const devisChargeIdRef = useRef<string | null>(devisInitial?.id ?? null);

  const creerDevisInitial = (): Devis => ({
    id: `devis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fournisseur: tousLesFournisseurs[0] as Fournisseur,
    numero: '',
    date: new Date(),
    lignes: [],
    totalHT: 0,
    totalTVA: 0,
    totalTTC: 0,
    acompteDemandeTTC: 0,
    acomptesDemandes: [],
    dateImport: new Date(),
    statut: 'en_attente',
    facturesLieesIds: [],
  });

  const normaliserDate = (valeur: unknown): Date => {
    if (valeur instanceof Date && !Number.isNaN(valeur.getTime())) {
      return valeur;
    }
    if (typeof valeur === 'string') {
      const d = new Date(valeur);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  const normaliserAcomptes = (source: Devis): AcompteDevis[] => {
    if (source.acomptesDemandes && source.acomptesDemandes.length > 0) {
      return source.acomptesDemandes.map((acompte) => ({
        ...acompte,
        date: normaliserDate(acompte.date),
      }));
    }
    if (typeof source.acompteDemandeTTC === 'number' && source.acompteDemandeTTC > 0) {
      return [
        {
          id: `acompte-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: new Date(),
          montantTTC: source.acompteDemandeTTC,
          note: 'Acompte initial',
        },
      ];
    }
    return [];
  };

  const [devis, setDevis] = useState<Devis>(() =>
    devisInitial
      ? { ...devisInitial, acomptesDemandes: normaliserAcomptes(devisInitial) }
      : creerDevisInitial()
  );
  const [totalTVAInput, setTotalTVAInput] = useState(() =>
    typeof (devisInitial?.totalTVA) === 'number' ? String(devisInitial.totalTVA) : '0'
  );
  const [totalTTCInput, setTotalTTCInput] = useState(() =>
    typeof (devisInitial?.totalTTC) === 'number' ? String(devisInitial.totalTTC) : '0'
  );
  const [messageImportCsv, setMessageImportCsv] = useState<string>('');
  // Si on reçoit un devis existant à éditer, on le charge dans l'état local
  useEffect(() => {
    if (!devisInitial) {
      if (devisChargeIdRef.current !== null) {
        devisChargeIdRef.current = null;
        const nouveauDevis = creerDevisInitial();
        setDevis(nouveauDevis);
        setTotalTVAInput('0');
        setTotalTTCInput('0');
      }
      return;
    }

    if (devisChargeIdRef.current === devisInitial.id) {
      return;
    }

    devisChargeIdRef.current = devisInitial.id;
    setDevis({ ...devisInitial, acomptesDemandes: normaliserAcomptes(devisInitial) });
    setTotalTVAInput(typeof devisInitial.totalTVA === 'number' ? String(devisInitial.totalTVA) : '0');
    setTotalTTCInput(typeof devisInitial.totalTTC === 'number' ? String(devisInitial.totalTTC) : '0');
  }, [devisInitial]);

  const handleChange = (field: keyof Devis, value: unknown) => {
    setDevis(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    const totaux = calculerTotauxDevisDepuisLignes(devis, devis.lignes);
    const donneesBrutes = devis.donneesBrutes || {};
    const totalHTFOBActuel =
      typeof donneesBrutes.totalHTFOB === 'number' ? donneesBrutes.totalHTFOB : undefined;
    const transportActuel =
      typeof donneesBrutes.transportEtDouanes === 'number'
        ? donneesBrutes.transportEtDouanes
        : undefined;
    const totalHTGlobalActuel =
      typeof donneesBrutes.totalHTGlobal === 'number' ? donneesBrutes.totalHTGlobal : undefined;

    if (
      totaux.totalHT !== devis.totalHT ||
      totaux.totalTVA !== devis.totalTVA ||
      totaux.totalTTC !== devis.totalTTC ||
      totalHTFOBActuel !== totaux.totalHTFOB ||
      transportActuel !== totaux.transportEtDouanes ||
      totalHTGlobalActuel !== totaux.totalHT
    ) {
      setDevis(prev => ({
        ...prev,
        totalHT: totaux.totalHT,
        totalTVA: totaux.totalTVA,
        totalTTC: totaux.totalTTC,
        donneesBrutes: {
          ...(prev.donneesBrutes || {}),
          totalHTFOB: totaux.totalHTFOB,
          transportEtDouanes: totaux.transportEtDouanes,
          totalHTGlobal: totaux.totalHT,
        },
      }));
    }

    setTotalTVAInput(String(totaux.totalTVA));
    setTotalTTCInput(String(totaux.totalTTC));
  }, [devis.lignes, devis.totalTVA, devis.totalHT, devis.totalTTC, devis.donneesBrutes]);

  const handleChangeLigne = (index: number, field: keyof LigneProduit, value: unknown) => {
    setDevis(prev => {
      const nouvellesLignes = [...prev.lignes];
      nouvellesLignes[index] = { ...nouvellesLignes[index], [field]: value };

      // Recalculer le montant HT de la ligne
      if (field === 'quantite' || field === 'prixUnitaireHT' || field === 'remise') {
        const ligne = nouvellesLignes[index];
        const montantHT = (ligne.quantite * ligne.prixUnitaireHT) - (ligne.remise || 0);
        nouvellesLignes[index] = { ...ligne, montantHT: Math.max(0, montantHT) };
      }

      return { ...prev, lignes: nouvellesLignes };
    });
  };

  const handleAjouterLigne = () => {
    setDevis(prev => ({
      ...prev,
      lignes: [
        ...prev.lignes,
        {
          description: '',
          quantite: 1,
          prixUnitaireHT: 0,
          remise: 0,
          montantHT: 0,
        },
      ],
    }));
  };

  const handleSupprimerLigne = (index: number) => {
    setDevis(prev => ({
      ...prev,
      lignes: prev.lignes.filter((_, i) => i !== index),
    }));
  };

  const formaterDate = (date: Date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().split('T')[0];
  };

  const normaliserMontant = (valeur: string): number | null => {
    const nettoyee = valeur.replace(/\s/g, '').replace(',', '.');
    if (nettoyee === '') return null;
    const parsed = Number.parseFloat(nettoyee);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const arrondir2 = (valeur: number) =>
    Math.round((valeur + Number.EPSILON) * 100) / 100;

  const calculerTotauxDevisDepuisLignes = (devisSource: Devis, lignes: LigneProduit[]) => {
    const totalHTFOB = arrondir2(
      lignes.reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0)
    );
    const totalHTFOBActuelDevis = arrondir2(
      (devisSource.lignes || []).reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0)
    );

    const donneesBrutes = devisSource.donneesBrutes || {};
    const totalHTFOBReference =
      typeof donneesBrutes.totalHTFOB === 'number' && donneesBrutes.totalHTFOB > 0
        ? donneesBrutes.totalHTFOB
        : totalHTFOBActuelDevis || totalHTFOB;
    const transportReference =
      typeof donneesBrutes.transportEtDouanes === 'number'
        ? donneesBrutes.transportEtDouanes
        : Math.max(0, arrondir2((devisSource.totalHT || 0) - totalHTFOBReference));
    const totalHTGlobalReference =
      typeof donneesBrutes.totalHTGlobal === 'number' && donneesBrutes.totalHTGlobal > 0
        ? donneesBrutes.totalHTGlobal
        : (typeof devisSource.totalHT === 'number' ? devisSource.totalHT : totalHTFOB);
    const totalTVAReference = typeof devisSource.totalTVA === 'number' ? devisSource.totalTVA : 0;

    const coefTransport =
      totalHTFOBReference > 0 ? transportReference / totalHTFOBReference : 0;
    const transportEtDouanes = arrondir2(totalHTFOB * coefTransport);
    const totalHT = arrondir2(totalHTFOB + transportEtDouanes);

    const coefTVA =
      totalHTGlobalReference > 0 ? totalTVAReference / totalHTGlobalReference : 0;
    const totalTVA = arrondir2(totalHT * coefTVA);
    const totalTTC = arrondir2(totalHT + totalTVA);

    return {
      totalHTFOB,
      transportEtDouanes,
      totalHT,
      totalTVA,
      totalTTC,
    };
  };

  const parserLigneCSV = (ligne: string, separateur: string): string[] => {
    const cellules: string[] = [];
    let valeurCourante = '';
    let dansGuillemets = false;

    for (let i = 0; i < ligne.length; i += 1) {
      const caractere = ligne[i];
      const suivant = ligne[i + 1];

      if (caractere === '"') {
        if (dansGuillemets && suivant === '"') {
          valeurCourante += '"';
          i += 1;
        } else {
          dansGuillemets = !dansGuillemets;
        }
        continue;
      }

      if (caractere === separateur && !dansGuillemets) {
        cellules.push(valeurCourante.trim());
        valeurCourante = '';
        continue;
      }

      valeurCourante += caractere;
    }

    cellules.push(valeurCourante.trim());
    return cellules;
  };

  const reparerTexteImporte = (valeur?: string) => {
    const texte = (valeur || '').replace(/\u0000/g, '').trim();
    if (!texte) return '';

    return texte
      .replace(/Ã‰/g, 'É')
      .replace(/Ãˆ/g, 'È')
      .replace(/ÃŠ/g, 'Ê')
      .replace(/Ã‹/g, 'Ë')
      .replace(/Ã€/g, 'À')
      .replace(/Ã‚/g, 'Â')
      .replace(/Ã„/g, 'Ä')
      .replace(/Ã‡/g, 'Ç')
      .replace(/ÃŽ/g, 'Î')
      .replace(/ÃÏ/g, 'Ï')
      .replace(/Ã”/g, 'Ô')
      .replace(/Ã–/g, 'Ö')
      .replace(/Ã™/g, 'Ù')
      .replace(/Ã›/g, 'Û')
      .replace(/Ãœ/g, 'Ü')
      .replace(/Ã©/g, 'é')
      .replace(/Ã¨/g, 'è')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã«/g, 'ë')
      .replace(/Ã /g, 'à')
      .replace(/Ã¢/g, 'â')
      .replace(/Ã¤/g, 'ä')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã®/g, 'î')
      .replace(/Ã¯/g, 'ï')
      .replace(/Ã´/g, 'ô')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã¹/g, 'ù')
      .replace(/Ã»/g, 'û')
      .replace(/Ã¼/g, 'ü')
      .replace(/Å“/g, 'œ')
      .replace(/Å’/g, 'Œ')
      .replace(/â€™/g, "'")
      .replace(/â€œ/g, '"')
      .replace(/â€/g, '"')
      .replace(/â€“/g, '-')
      .replace(/â€”/g, '-')
      .replace(/Â/g, '');
  };

  const decoderContenuCSV = (buffer: ArrayBuffer) => {
    const octets = new Uint8Array(buffer);

    if (octets.length >= 2) {
      if (octets[0] === 0xff && octets[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(buffer);
      }
      if (octets[0] === 0xfe && octets[1] === 0xff) {
        const inverse = new Uint8Array(octets.length);
        for (let i = 0; i < octets.length - 1; i += 2) {
          inverse[i] = octets[i + 1];
          inverse[i + 1] = octets[i];
        }
        if (octets.length % 2 === 1) {
          inverse[octets.length - 1] = octets[octets.length - 1];
        }
        return new TextDecoder('utf-16le').decode(inverse);
      }
    }

    let contenu = new TextDecoder('utf-8').decode(buffer);
    if (/\u0000/.test(contenu)) {
      contenu = new TextDecoder('utf-16le').decode(buffer);
    } else if (/[Ãâ€]/.test(contenu)) {
      contenu = new TextDecoder('windows-1252').decode(buffer);
    }

    return contenu.replace(/\u0000/g, '');
  };

  const importerLignesDepuisCSV = (contenu: string) => {
    const lignesBrutes = contenu
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((ligne) => ligne.trim())
      .filter(Boolean);

    const lignesSansDirective = lignesBrutes.filter((ligne) => !/^sep=./i.test(ligne));
    if (lignesSansDirective.length < 2) {
      setMessageImportCsv('Fichier CSV vide ou incomplet.');
      return;
    }

    const ligneEntete = lignesSansDirective[0];
    const separateur = ligneEntete.includes(';')
      ? ';'
      : ligneEntete.includes('\t')
      ? '\t'
      : ',';
    const normaliserEntete = (cellule: string) =>
      reparerTexteImporte(cellule)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[()]/g, ' ')
        .replace(/€/g, ' euro ')
        .replace(/[.:_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const entetes = parserLigneCSV(ligneEntete, separateur).map(normaliserEntete);

    const trouverIndex = (aliases: string[]) =>
      entetes.findIndex((cellule) =>
        aliases.some(
          (alias) =>
            cellule === alias ||
            cellule.startsWith(alias) ||
            cellule.includes(alias)
        )
      );

    const indexRef = trouverIndex(['ref', 'reference', 'reference fournisseur']);
    const indexNom = trouverIndex(['nom', 'designation', 'description']);
    const indexNomFR = trouverIndex(['nom fr']);
    const indexLogo = trouverIndex(['logo']);
    const indexQuantiteDevis = trouverIndex(['qte devis']);
    const indexQuantiteFacture = trouverIndex(['qte facture']);
    const indexPrix = trouverIndex(['pu ht', 'pu ht euro']);

    if (indexNom === -1 || indexPrix === -1) {
      setMessageImportCsv(
        `Colonnes CSV non reconnues. Entête lue: ${entetes.join(' | ')}`
      );
      return;
    }

    const rejets: string[] = [];
    const nouvellesLignes: LigneProduit[] = lignesSansDirective
      .slice(1)
      .map((ligne) => parserLigneCSV(ligne, separateur))
      .map((cellules, index) => {
        const ligneExistante = devis.lignes[index];
        const quantiteBrute =
          (indexQuantiteDevis >= 0 ? cellules[indexQuantiteDevis] : '') ||
          (indexQuantiteFacture >= 0 ? cellules[indexQuantiteFacture] : '') ||
          String(ligneExistante?.quantite ?? 0);
        const quantite = normaliserMontant(quantiteBrute) ?? ligneExistante?.quantite ?? 0;
        const prixUnitaireHT = normaliserMontant(cellules[indexPrix] || '0') ?? 0;
        const description = reparerTexteImporte(cellules[indexNom] || '');

        if (!description) {
          rejets.push(`ligne ${index + 2}: description vide`);
          return null;
        }

        const remise = ligneExistante?.remise || 0;
        const montantHT = arrondir2(Math.max(0, quantite * prixUnitaireHT - remise));

        return {
          ...ligneExistante,
          refFournisseur:
            indexRef >= 0 && reparerTexteImporte(cellules[indexRef] || '')
              ? reparerTexteImporte(cellules[indexRef] || '')
              : ligneExistante?.refFournisseur,
          description,
          descriptionFR:
            indexNomFR >= 0 && reparerTexteImporte(cellules[indexNomFR] || '')
              ? reparerTexteImporte(cellules[indexNomFR] || '')
              : ligneExistante?.descriptionFR,
          logo:
            indexLogo >= 0 && reparerTexteImporte(cellules[indexLogo] || '')
              ? reparerTexteImporte(cellules[indexLogo] || '')
              : ligneExistante?.logo,
          quantite,
          prixUnitaireHT,
          remise,
          montantHT,
        } satisfies LigneProduit;
      })
      .filter((ligne): ligne is LigneProduit => !!ligne);

    if (nouvellesLignes.length === 0) {
      setMessageImportCsv('Aucune ligne exploitable trouvée dans le CSV.');
      return;
    }

    const totauxImportes = calculerTotauxDevisDepuisLignes(devis, nouvellesLignes);

    setDevis((prev) => ({
      ...prev,
      lignes: nouvellesLignes,
      totalHT: totauxImportes.totalHT,
      totalTVA: totauxImportes.totalTVA,
      totalTTC: totauxImportes.totalTTC,
      donneesBrutes: {
        ...(prev.donneesBrutes || {}),
        totalHTFOB: totauxImportes.totalHTFOB,
        transportEtDouanes: totauxImportes.transportEtDouanes,
        totalHTGlobal: totauxImportes.totalHT,
      },
    }));
    setTotalTVAInput(String(totauxImportes.totalTVA));
    setTotalTTCInput(String(totauxImportes.totalTTC));
    const resumeImport = `${lignesSansDirective.length - 1} ligne(s) lue(s), ${nouvellesLignes.length} importée(s) depuis le CSV.`;
    setMessageImportCsv(
      rejets.length > 0 ? `${resumeImport} Rejets: ${rejets.slice(0, 5).join(' | ')}` : resumeImport
    );
  };

  const handleImporterFichierCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = event.target.files?.[0];
    if (!fichier) return;

    try {
      const buffer = await fichier.arrayBuffer();
      const contenu = decoderContenuCSV(buffer);
      importerLignesDepuisCSV(contenu);
    } catch {
      setMessageImportCsv('Impossible de lire le fichier CSV.');
    } finally {
      event.target.value = '';
    }
  };

  const totalAcomptesTTC = (devis.acomptesDemandes || []).reduce(
    (sum, acompte) => sum + (acompte.montantTTC || 0),
    0
  );
  const totauxAffiches = calculerTotauxDevisDepuisLignes(devis, devis.lignes);

  const handleAjouterAcompte = () => {
    setDevis((prev) => ({
      ...prev,
      acomptesDemandes: [
        ...(prev.acomptesDemandes || []),
        {
          id: `acompte-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: new Date(),
          montantTTC: 0,
          note: '',
        },
      ],
    }));
  };

  const handleSupprimerAcompte = (id: string) => {
    setDevis((prev) => ({
      ...prev,
      acomptesDemandes: (prev.acomptesDemandes || []).filter((a) => a.id !== id),
    }));
  };

  const handleChangeAcompte = (id: string, field: keyof AcompteDevis, value: unknown) => {
    setDevis((prev) => ({
      ...prev,
      acomptesDemandes: (prev.acomptesDemandes || []).map((a) =>
        a.id === id ? { ...a, [field]: value } : a
      ),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const totalTVAParse = normaliserMontant(totalTVAInput);
    const totalTTCParse = normaliserMontant(totalTTCInput);
    const totalTVAFinal = totalTVAParse ?? 0;
    const totalTTCFinal = totalTTCParse ?? 0;
    const acompteDemandeFinal = totalAcomptesTTC;
    const totalHTFOB = arrondir2(
      devis.lignes.reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0)
    );
    const transportEtDouanes = arrondir2(Math.max(0, (devis.totalHT || 0) - totalHTFOB));
    const totalHT = arrondir2(totalHTFOB + transportEtDouanes);
    const totalTVA = totalTVAFinal;
    const totalTTC = totalTTCFinal || arrondir2(totalHT + totalTVA);

    const devisFinal: Devis = {
      ...devis,
      totalHT,
      totalTVA,
      totalTTC,
      donneesBrutes: {
        ...(devis.donneesBrutes || {}),
        totalHTFOB,
        transportEtDouanes,
        totalHTGlobal: totalHT,
      },
      acompteDemandeTTC: acompteDemandeFinal,
      acomptesDemandes: devis.acomptesDemandes || [],
      // Si le devis a déjà une date d'import (cas édition), on la conserve
      dateImport: devis.dateImport ?? new Date(),
    };

    onSauvegarder(devisFinal);
  };

  return (
    <div className="details-facture__modal-overlay">
      <div className="details-facture__modal" onClick={(e) => e.stopPropagation()}>
        <div className="details-facture__modal-header">
          <h2>{devisInitial ? 'Modifier le devis' : 'Nouveau devis'}</h2>
          <button
            type="button"
            onClick={onFermer}
            className="details-facture__modal-close"
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="details-facture__modal-form">
          {/* Informations générales */}
          <div className="details-facture__modal-section">
            <h3>Informations générales</h3>
            <div className="details-facture__modal-grid">
              <div className="details-facture__modal-field">
                <label>Fournisseur *</label>
                <select
                  value={devis.fournisseur}
                  onChange={(e) => handleChange('fournisseur', e.target.value as Fournisseur)}
                  required
                >
                  {tousLesFournisseurs.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="details-facture__modal-field">
                <label>Numéro de devis *</label>
                <input
                  type="text"
                  value={devis.numero}
                  onChange={(e) => handleChange('numero', e.target.value)}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date du devis *</label>
                <input
                  type="date"
                  value={formaterDate(devis.date)}
                  onChange={(e) => handleChange('date', new Date(e.target.value))}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date de validité</label>
                <input
                  type="date"
                  value={devis.dateValidite ? formaterDate(devis.dateValidite) : ''}
                  onChange={(e) =>
                    handleChange(
                      'dateValidite',
                      e.target.value ? new Date(e.target.value) : undefined
                    )
                  }
                />
              </div>
            </div>
          </div>

          {/* Lignes de produits */}
          <div className="details-facture__modal-section">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3>Lignes du devis</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => importCsvInputRef.current?.click()}
                  className="details-facture__btn-add"
                >
                  <Upload size={16} />
                  Importer Excel (CSV)
                </button>
                <button
                  type="button"
                  onClick={handleAjouterLigne}
                  className="details-facture__btn-add"
                >
                  <Plus size={16} />
                  Ajouter une ligne
                </button>
              </div>
            </div>
            <input
              ref={importCsvInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleImporterFichierCSV}
              style={{ display: 'none' }}
            />
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '1rem' }}>
              Compatible avec l’export devis Excel (CSV) du programme. Les lignes importées remplacent les lignes actuelles.
            </p>
            {messageImportCsv && (
              <p style={{ fontSize: '0.9rem', color: '#2563eb', marginBottom: '1rem' }}>
                {messageImportCsv}
              </p>
            )}
            <div className="details-facture__modal-lignes">
              {devis.lignes.map((ligne, index) => (
                <div key={index} className="details-facture__modal-ligne">
                  <div className="details-facture__modal-ligne-header">
                    <strong>Ligne {index + 1}</strong>
                    <button
                      type="button"
                      onClick={() => handleSupprimerLigne(index)}
                      className="details-facture__btn-delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="details-facture__modal-ligne-grid">
                    <div className="details-facture__modal-field">
                      <label>Référence fournisseur</label>
                      <input
                        type="text"
                        value={ligne.refFournisseur || ''}
                        onChange={(e) =>
                          handleChangeLigne(
                            index,
                            'refFournisseur',
                            e.target.value || undefined
                          )
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field details-facture__modal-field--large">
                      <label>Description *</label>
                      <input
                        type="text"
                        value={ligne.description}
                        onChange={(e) =>
                          handleChangeLigne(index, 'description', e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>BAT</label>
                      <input
                        type="text"
                        value={ligne.bat || ''}
                        onChange={(e) =>
                          handleChangeLigne(index, 'bat', e.target.value || undefined)
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Logo</label>
                      <input
                        type="text"
                        value={ligne.logo || ''}
                        onChange={(e) =>
                          handleChangeLigne(index, 'logo', e.target.value || undefined)
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Couleur</label>
                      <input
                        type="text"
                        value={ligne.couleur || ''}
                        onChange={(e) =>
                          handleChangeLigne(index, 'couleur', e.target.value || undefined)
                        }
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Quantité *</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(ligne.quantite)}
                        onChange={(e) => {
                          const parsed = normaliserMontant(e.target.value);
                          handleChangeLigne(index, 'quantite', parsed ?? 0);
                        }}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Prix unitaire HT *</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(ligne.prixUnitaireHT)}
                        onChange={(e) => {
                          const parsed = normaliserMontant(e.target.value);
                          handleChangeLigne(index, 'prixUnitaireHT', parsed ?? 0);
                        }}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Remise</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={String(ligne.remise)}
                        onChange={(e) => {
                          const parsed = normaliserMontant(e.target.value);
                          handleChangeLigne(index, 'remise', parsed ?? 0);
                        }}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Montant HT</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.montantHT.toFixed(2)}
                        readOnly
                        style={{ backgroundColor: '#f3f4f6' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totaux simples (facultatifs) */}
          <div className="details-facture__modal-section">
            <h3>Totaux (facultatif)</h3>
            <div className="details-facture__modal-grid">
              <div className="details-facture__modal-field">
                <label>Transport et douanes</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={String(totauxAffiches.transportEtDouanes)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total HT</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={String(totauxAffiches.totalHT)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total TVA</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalTVAInput}
                  onChange={(e) => {
                    const valeur = e.target.value;
                    setTotalTVAInput(valeur);
                    const parsed = normaliserMontant(valeur);
                    if (parsed !== null) {
                      handleChange('totalTVA', parsed);
                    }
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total TTC</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalTTCInput}
                  onChange={(e) => {
                    const valeur = e.target.value;
                    setTotalTTCInput(valeur);
                    const parsed = normaliserMontant(valeur);
                    if (parsed !== null) {
                      handleChange('totalTTC', parsed);
                    }
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total acomptes demandés (TTC)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={String(totalAcomptesTTC)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
            </div>
          </div>

          <div className="details-facture__modal-section">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
              }}
            >
              <h3>Acomptes demandés</h3>
              <button
                type="button"
                onClick={handleAjouterAcompte}
                className="details-facture__btn-add"
              >
                <Plus size={16} />
                Ajouter un acompte
              </button>
            </div>
            {(devis.acomptesDemandes || []).length === 0 ? (
              <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                Aucun acompte pour l’instant.
              </p>
            ) : (
              <div className="details-facture__modal-lignes">
                {(devis.acomptesDemandes || []).map((acompte) => (
                  <div key={acompte.id} className="details-facture__modal-ligne">
                    <div className="details-facture__modal-ligne-header">
                      <strong>Acompte</strong>
                      <button
                        type="button"
                        onClick={() => handleSupprimerAcompte(acompte.id)}
                        className="details-facture__btn-delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="details-facture__modal-ligne-grid">
                      <div className="details-facture__modal-field">
                        <label>Date</label>
                        <input
                          type="date"
                          value={formaterDate(acompte.date)}
                          onChange={(e) =>
                            handleChangeAcompte(
                              acompte.id,
                              'date',
                              e.target.value ? new Date(e.target.value) : new Date()
                            )
                          }
                        />
                      </div>
                      <div className="details-facture__modal-field">
                        <label>Montant TTC</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={String(acompte.montantTTC ?? 0)}
                          onChange={(e) => {
                            const parsed = normaliserMontant(e.target.value);
                            handleChangeAcompte(
                              acompte.id,
                              'montantTTC',
                              parsed ?? 0
                            );
                          }}
                        />
                      </div>
                      <div className="details-facture__modal-field details-facture__modal-field--large">
                        <label>Note</label>
                        <input
                          type="text"
                          value={acompte.note || ''}
                          onChange={(e) =>
                            handleChangeAcompte(acompte.id, 'note', e.target.value || undefined)
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="details-facture__modal-footer">
            <button
              type="button"
              onClick={onFermer}
              className="details-facture__modal-btn details-facture__modal-btn--secondary"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="details-facture__modal-btn details-facture__modal-btn--primary"
            >
              {devisInitial ? 'Mettre à jour le devis' : 'Enregistrer le devis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


