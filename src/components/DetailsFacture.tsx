/**
 * Composant d'affichage des détails d'une facture
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { X, FileText, Calendar, Building2, Hash, AlertTriangle, CheckCircle, Edit, Plus, Trash2, Printer, Download, RefreshCcw } from 'lucide-react';
import type { Facture, LigneProduit } from '../types/facture';
import { obtenirFournisseurs, parserFacture } from '@parsers/index';
import { listerFacturesSauvegardes, rechercherFactureDansSauvegardes } from '../services/factureService';
import { obtenirFactureMemorisee } from '../services/parsingRulesService';
import { obtenirReglementsFacture } from '../services/reglementService';
import { imprimerPdfSimple, telechargerCSVSimple } from '../utils/exportSimplifie';
import './DetailsFacture.css';

interface DetailsFactureProps {
  facture: Facture | null;
  onClose: () => void;
  onUpdate?: (facture: Facture) => void;
  onDelete?: (factureId: string) => void;
}

const fournisseurSansTVA = (facture: Facture | null): boolean =>
  !!facture && facture.fournisseur === 'ITALESSE';

const normaliserFactureSansTVA = (facture: Facture): Facture => {
  const totalHT = arrondir2(facture.totalHT || 0);
  return {
    ...facture,
    totalTVA: 0,
    totalTTC: totalHT,
    donneesBrutes: {
      ...(facture.donneesBrutes || {}),
      totalHTBrut:
        facture.donneesBrutes && typeof facture.donneesBrutes.totalHTBrut === 'number'
          ? facture.donneesBrutes.totalHTBrut
          : totalHT,
      netHT: totalHT,
      tauxTVA: 0,
    },
  };
};

export function DetailsFacture({ facture, onClose, onUpdate, onDelete }: DetailsFactureProps) {
  const [editionMode, setEditionMode] = useState(false);
  const [reparseEnCours, setReparseEnCours] = useState(false);
  useEffect(() => {
    if (!facture || !onUpdate || !fournisseurSansTVA(facture)) return;

    const totalHT = arrondir2(facture.totalHT || 0);
    const tauxTVAStocke =
      facture.donneesBrutes && typeof facture.donneesBrutes.tauxTVA === 'number'
        ? facture.donneesBrutes.tauxTVA
        : undefined;
    const doitNormaliser =
      Math.abs((facture.totalTVA || 0)) > 0.005 ||
      Math.abs((facture.totalTTC || 0) - totalHT) > 0.005 ||
      (typeof tauxTVAStocke === 'number' && Math.abs(tauxTVAStocke) > 0.0001);

    if (!doitNormaliser) return;

    onUpdate(normaliserFactureSansTVA(facture));
  }, [facture, onUpdate]);
  if (!facture) {
    return (
      <div className="details-facture details-facture--empty">
        <FileText size={64} />
        <p>Sélectionnez une facture pour voir les détails</p>
      </div>
    );
  }

  const formaterDate = (date: Date) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
  };

  const formaterMontant = (montant: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(montant);
  };

  const lignesExport = facture.lignes.map((ligne) => ({
    ref: ligne.refFournisseur || '',
    nom: ligne.description,
    nomFR: ligne.descriptionFR || '',
    logo: ligne.logo || '',
    quantiteDevis: '',
    quantiteFacture: ligne.quantite,
    prixUnitaire: ligne.prixUnitaireHT,
  }));

  const handleExporterCSV = () => {
    const nom = `facture-${facture.numero}-${facture.fournisseur}`;
    telechargerCSVSimple(nom, lignesExport);
  };

  const handleExporterPDF = () => {
    const titre = `Facture ${facture.numero} — ${facture.fournisseur}`;
    const meta = [
      `Date facture: ${formaterDate(facture.date)}`,
      `Total TTC: ${formaterMontant(totalTTCAffiche)}`,
    ];
    imprimerPdfSimple(titre, meta, lignesExport);
  };

  const handleImprimerFactureComplete = () => {
    const fenetre = window.open('', '_blank', 'width=1200,height=800');
    if (!fenetre) return;
    const formaterLibelleReglementImpression = (type: string, statut: string, notes?: string) => {
      if (notes && notes.trim()) return notes.trim();
      if (statut === 'en_attente') {
        if (type === 'acompte') return 'Echeance acompte';
        if (type === 'solde') return 'Echeance solde';
        return 'Echeance';
      }
      if (type === 'acompte') return 'Acompte';
      if (type === 'solde') return 'Solde';
      if (type === 'reglement_complet') return 'Paiement complet';
      if (type === 'avoir') return 'Avoir';
      return 'Reglement';
    };

    const lignesHTML = facture.lignes
      .map(
        (ligne) => `
          <tr>
            <td class="refCell">${ligne.refFournisseur || '-'}</td>
            <td class="descCell">${ligne.description || ''}</td>
            <td>${ligne.bat || '-'}</td>
            <td>${ligne.logo || '-'}</td>
            <td>${ligne.couleur || '-'}</td>
            <td class="num">${ligne.quantite ?? ''}</td>
            <td class="num">${formaterMontant(ligne.prixUnitaireHT || 0)}</td>
            <td class="num">${formaterMontant(ligne.remise || 0)}</td>
            <td class="num strong">${formaterMontant(ligne.montantHT || 0)}</td>
          </tr>
        `
      )
      .join('');

    const reglementsHTML =
      reglements.length > 0
        ? `
          <div class="section">
            <h2>Règlements</h2>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Statut</th>
                  <th>Montant</th>
                </tr>
              </thead>
              <tbody>
            ${[...reglements]
              .sort((a, b) => new Date(a.dateReglement).getTime() - new Date(b.dateReglement).getTime())
              .map(
                (r) => `<tr>
                  <td>${new Intl.DateTimeFormat('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  }).format(r.dateEcheance || r.dateReglement)}</td>
                  <td>${formaterLibelleReglementImpression(r.type, r.statut, r.notes)}</td>
                  <td>${r.statut === 'en_attente' ? 'En attente' : r.statut === 'paye' ? 'Payé' : r.statut}</td>
                  <td class="num">${formaterMontant(r.montant)}</td>
                </tr>`
              )
              .join('')}
              </tbody>
            </table>
          </div>
        `
        : '';

    fenetre.document.write(`
      <html>
        <head>
          <title>Facture ${facture.numero}</title>
          <style>
            @page { size: A4 portrait; margin: 12mm; }
            body { font-family: Arial, sans-serif; color: #111; margin: 0; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            h2 { font-size: 16px; margin: 0 0 10px; }
            .header { margin-bottom: 18px; padding-bottom: 10px; border-bottom: 2px solid #ddd; }
            .badges { margin-top: 6px; font-size: 13px; color: #444; }
            .section { margin-top: 18px; break-inside: avoid; }
            .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
            .meta-row { font-size: 13px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #ddd; padding: 6px 7px; font-size: 11px; vertical-align: top; }
            th { background: #f3f4f6; text-align: left; }
            td.num { text-align: right; white-space: nowrap; }
            td.strong { font-weight: 700; }
            .ref { width: 22%; text-align: left; }
            .desc { width: 26%; text-align: left; }
            .small { width: 8%; }
            .numCol { width: 9%; }
            .refCell { text-align: left; white-space: nowrap; font-family: Consolas, monospace; min-width: 220px; }
            .descCell { text-align: left; word-break: break-word; }
            .totaux { margin-top: 16px; margin-left: auto; width: 360px; }
            .totaux-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; }
            .totaux-row.final { font-weight: 700; font-size: 16px; border-top: 2px solid #111; margin-top: 6px; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Facture ${facture.numero}</h1>
            <div class="badges">${facture.fournisseur}</div>
          </div>

          <div class="section">
            <h2>Informations générales</h2>
            <div class="grid">
              <div class="meta-row"><strong>Fournisseur :</strong> ${facture.fournisseur}</div>
              <div class="meta-row"><strong>Numéro :</strong> ${facture.numero}</div>
              <div class="meta-row"><strong>Date facture :</strong> ${formaterDate(facture.date)}</div>
              <div class="meta-row"><strong>Date livraison :</strong> ${facture.dateLivraison ? formaterDate(facture.dateLivraison) : '-'}</div>
              <div class="meta-row"><strong>Fichier PDF :</strong> ${facture.fichierPDF ? facture.fichierPDF.split(/[/\\]/).pop() : '-'}</div>
            </div>
          </div>

          <div class="section">
            <h2>Lignes de produits (${facture.lignes.length})</h2>
            <table>
              <thead>
                <tr>
                  <th class="ref">Réf.</th>
                  <th class="desc">Description</th>
                  <th class="small">BAT</th>
                  <th class="small">Logo</th>
                  <th class="small">Couleur</th>
                  <th class="numCol">Qté</th>
                  <th class="numCol">PU HT</th>
                  <th class="numCol">Remise</th>
                  <th class="numCol">Montant HT</th>
                </tr>
              </thead>
              <tbody>
                ${lignesHTML}
              </tbody>
            </table>
          </div>

          ${reglementsHTML}

          <div class="totaux">
            <div class="totaux-row"><span>Total HT</span><span>${formaterMontant(facture.totalHT)}</span></div>
            <div class="totaux-row"><span>Total TVA</span><span>${formaterMontant(totalTVAAffiche)}</span></div>
            <div class="totaux-row"><span>Total réglé</span><span>${formaterMontant(totalRegle)}</span></div>
            <div class="totaux-row"><span>Reste à régler</span><span>${formaterMontant(resteARegler)}</span></div>
            <div class="totaux-row final"><span>Total TTC</span><span>${formaterMontant(totalTTCAffiche)}</span></div>
          </div>
        </body>
      </html>
    `);

    fenetre.document.close();
    fenetre.focus();
    fenetre.print();
  };

  const dataUrlToFile = (dataUrl: string, filename: string): File => {
    const [meta, base64] = dataUrl.split(',');
    const mimeMatch = meta?.match(/data:(.*?);base64/);
    const mime = mimeMatch?.[1] || 'application/pdf';
    const binaire = atob(base64 || '');
    const bytes = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i += 1) {
      bytes[i] = binaire.charCodeAt(i);
    }
    return new File([bytes], filename, { type: mime });
  };

  const handleReparserDepuisPdf = async () => {
    if (!onUpdate) return;
    if (!facture.pdfOriginal) {
      window.alert('Aucun PDF original n’est disponible pour reparser cette facture.');
      return;
    }
    const confirmer = window.confirm(
      'Reparser la facture depuis le PDF ?\n\n' +
        'Cela remplacera les lignes actuelles.'
    );
    if (!confirmer) return;
    setReparseEnCours(true);
    try {
      const nom = facture.fichierPDF || `${facture.numero || facture.id}.pdf`;
      const fichier = dataUrlToFile(facture.pdfOriginal, nom);
      const resultat = await parserFacture(fichier, facture.fournisseur);
      if (!resultat.facture) {
        window.alert('Reparsing échoué : aucune facture extraite.');
        return;
      }
      const factureReparsee: Facture = {
        ...resultat.facture,
        id: facture.id,
        dateImport: facture.dateImport,
        fichierPDF: facture.fichierPDF ?? nom,
        pdfOriginal: facture.pdfOriginal,
      };
      onUpdate(factureReparsee);
      if (resultat.erreurs && resultat.erreurs.length > 0) {
        window.alert(`Reparsing avec avertissements : ${resultat.erreurs.join(', ')}`);
      }
    } catch (error) {
      window.alert(
        `Impossible de reparser le PDF : ${
          error instanceof Error ? error.message : 'Erreur inconnue'
        }`
      );
    } finally {
      setReparseEnCours(false);
    }
  };

  const totalHTLignes = facture.lignes.reduce((sum, ligne) => sum + (ligne.montantHT || 0), 0);
  const reglements = obtenirReglementsFacture(facture.id);
  const reglementsPayes = reglements.filter((r) => r.statut === 'paye' || r.statut === 'partiel');
  const reglementsEnAttente = reglements.filter((r) => r.statut === 'en_attente');
  const totalRegle = reglementsPayes.reduce((sum, r) => sum + (r.montant || 0), 0);
  const totalEnAttente = reglementsEnAttente.reduce((sum, r) => sum + (r.montant || 0), 0);
  const totalTVAAffiche = fournisseurSansTVA(facture) ? 0 : (facture.totalTVA || 0);
  const totalTTCAffiche = fournisseurSansTVA(facture)
    ? arrondir2(facture.totalHT || 0)
    : (facture.totalTTC || 0);
  const resteARegler = Math.max(0, totalTTCAffiche - totalRegle);
  const libelleTypePiece = 'Facture fournisseur';
  const formaterLibelleReglement = (type: string, statut: string, notes?: string) => {
    if (notes && notes.trim()) return notes.trim();
    if (statut === 'en_attente') {
      if (type === 'acompte') return 'Échéance acompte';
      if (type === 'solde') return 'Échéance solde';
      if (type === 'reglement_complet') return 'Échéance';
      return 'Échéance';
    }
    if (type === 'acompte') return 'Acompte';
    if (type === 'solde') return 'Solde';
    if (type === 'reglement_complet') return 'Paiement complet';
    if (type === 'avoir') return 'Avoir';
    return 'Règlement';
  };

  // Prendre en compte une éventuelle remise globale pour le contrôle
  const remiseGlobaleFacture =
    facture.donneesBrutes && typeof facture.donneesBrutes.remise === 'number'
      ? facture.donneesBrutes.remise
      : 0;

  const netHTAttendu = totalHTLignes - remiseGlobaleFacture;
  const ecartHT = netHTAttendu - facture.totalHT;

  const totalTTCAttendu = facture.totalHT + totalTVAAffiche;
  const ecartTTC = totalTTCAttendu - totalTTCAffiche;
  const tolerance = 0.05;

  const ecartHTSignificatif = Math.abs(ecartHT) > tolerance;
  const ecartTTCSignificatif = Math.abs(ecartTTC) > tolerance;

  const verificationOK = !ecartHTSignificatif && !ecartTTCSignificatif;

  return (
    <div className="details-facture">
      <div className="details-facture__header">
        <div>
          <h2>Fiche pièce fournisseur</h2>
          <div className="details-facture__meta">
            <span className="details-facture__badge">{libelleTypePiece}</span>
            <span className="details-facture__badge details-facture__badge--secondary">{facture.fournisseur}</span>
            <span className="details-facture__numero">{facture.numero}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleReparserDepuisPdf}
            className="details-facture__print-btn"
            aria-label="Reparser depuis PDF"
            title={facture.pdfOriginal ? 'Reparser depuis le PDF' : 'PDF original indisponible'}
            disabled={!facture.pdfOriginal || reparseEnCours}
          >
            <RefreshCcw size={18} />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!onUpdate) return;
              const candidats = listerFacturesSauvegardes(facture);
              const factureMemorisee = obtenirFactureMemorisee(facture.fournisseur, facture.numero);
              if (factureMemorisee) {
                candidats.unshift({
                  facture: factureMemorisee,
                  source: 'Modèle appris',
                  dateSauvegarde: undefined,
                });
              }
              if (candidats.length === 0) {
                const fallback = rechercherFactureDansSauvegardes(facture);
                if (!fallback) {
                  window.alert('Aucune version sauvegardée trouvée pour cette facture.');
                  return;
                }
                candidats.push({ facture: fallback, source: 'Sauvegarde', dateSauvegarde: undefined });
              }

              let indexChoisi = 0;
              if (candidats.length > 1) {
                const lignes = candidats.map((c, i) => {
                  const dateLabel = c.dateSauvegarde
                    ? ` (${c.dateSauvegarde.toLocaleString('fr-FR')})`
                    : '';
                  const totalHT = (c.facture.totalHT ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
                  const totalTTC = (c.facture.totalTTC ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
                  const lignesCount = c.facture.lignes?.length ?? 0;
                  const numero = c.facture.numero;
                  return `${i + 1}. ${c.source}${dateLabel} | ${numero} | ${lignesCount} lignes | HT ${totalHT} | TTC ${totalTTC}`;
                });
                const choix = window.prompt(
                  `Plusieurs sauvegardes trouvées :\n${lignes.join('\n')}\n\n` +
                    'Entrez le numéro à restaurer :',
                  '1'
                );
                const choisi = parseInt(choix || '1', 10);
                if (Number.isNaN(choisi) || choisi < 1 || choisi > candidats.length) {
                  return;
                }
                indexChoisi = choisi - 1;
              }

              const factureSauvegardee = candidats[indexChoisi].facture;
              const factureRestau: Facture = {
                ...factureSauvegardee,
                id: facture.id,
                fichierPDF: factureSauvegardee.fichierPDF ?? facture.fichierPDF,
                pdfOriginal: factureSauvegardee.pdfOriginal ?? facture.pdfOriginal,
                dateImport: facture.dateImport,
              };
              const confirmer = window.confirm(
                `Restaurer la sauvegarde sélectionnée (${candidats[indexChoisi].source}) ?\n` +
                  `${factureRestau.numero} — ${factureRestau.lignes.length} lignes — ` +
                  `${factureRestau.totalTTC.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}`
              );
              if (confirmer) {
                onUpdate(factureRestau);
              }
            }}
            className="details-facture__print-btn"
            aria-label="Restaurer la facture"
            title="Restaurer la facture depuis une sauvegarde"
          >
            ↺
          </button>
          <button
            type="button"
            onClick={handleExporterPDF}
            className="details-facture__print-btn"
            aria-label="Exporter PDF simplifié"
            title="Exporter PDF simplifié"
          >
            <FileText size={18} />
          </button>
          <button
            type="button"
            onClick={handleExporterCSV}
            className="details-facture__print-btn"
            aria-label="Exporter Excel (CSV)"
            title="Exporter Excel (CSV)"
          >
            <Download size={18} />
          </button>
          <button
            type="button"
            onClick={handleImprimerFactureComplete}
            className="details-facture__print-btn"
            aria-label="Imprimer la facture"
            title="Imprimer la facture"
          >
            <Printer size={18} />
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (!facture) return;
                const confirmer = window.confirm(
                  'Êtes-vous sûr de vouloir supprimer cette facture ?\n\n' +
                  'Cette action est définitive et tous les règlements associés à cette facture seront également supprimés.'
                );
                if (confirmer) {
                  onDelete(facture.id);
                }
              }}
              className="details-facture__delete-btn"
              aria-label="Supprimer la facture"
              title="Supprimer la facture (et ses règlements)"
            >
              <Trash2 size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditionMode(true)}
            className="details-facture__edit-btn"
            aria-label="Éditer"
            title="Éditer la facture"
          >
            <Edit size={20} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="details-facture__close-btn"
            aria-label="Fermer"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="details-facture__content">
        <div className="details-facture__summary-grid">
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">Type de pièce</span>
            <span className="details-facture__summary-value">{libelleTypePiece}</span>
          </div>
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">Total TTC</span>
            <span className="details-facture__summary-value">{formaterMontant(totalTTCAffiche)}</span>
          </div>
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">Réglé TTC</span>
            <span className="details-facture__summary-value">{formaterMontant(totalRegle)}</span>
          </div>
          <div className="details-facture__summary-card">
            <span className="details-facture__summary-label">Reste à régler</span>
            <span className="details-facture__summary-value">{formaterMontant(resteARegler)}</span>
          </div>
        </div>

        <div className={`details-facture__alert ${verificationOK ? 'details-facture__alert--success' : 'details-facture__alert--warning'}`}>
          {verificationOK ? (
            <>
              <CheckCircle size={18} />
              <div>
                <strong>Contrôle réussi.</strong> La somme des lignes ({formaterMontant(totalHTLignes)}) correspond aux totaux indiqués.
              </div>
            </>
          ) : (
            <>
              <AlertTriangle size={18} />
              <div>
                <strong>Anomalie détectée.</strong> Vérifiez la facture :
                <ul>
                  {ecartHTSignificatif && (
                    <li>
                      Somme des lignes HT {formaterMontant(totalHTLignes)}
                      {remiseGlobaleFacture
                        ? ` - Remise globale ${formaterMontant(remiseGlobaleFacture)} = Net HT attendu ${formaterMontant(
                            netHTAttendu
                          )}`
                        : ''}{' '}
                      vs Total HT déclaré {formaterMontant(facture.totalHT)} (écart {formaterMontant(ecartHT)}).
                    </li>
                  )}
                  {ecartTTCSignificatif && (
                    <li>
                      Total HT + TVA {formaterMontant(totalTTCAttendu)} vs Total TTC déclaré {formaterMontant(totalTTCAffiche)} (écart {formaterMontant(ecartTTC)}).
                    </li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">Informations générales</h3>
          <div className="details-facture__info-grid">
            <div className="details-facture__info-item">
              <Building2 size={18} />
              <div>
                <span className="details-facture__info-label">Fournisseur</span>
                <span className="details-facture__info-value">{facture.fournisseur}</span>
              </div>
            </div>
            <div className="details-facture__info-item">
              <Hash size={18} />
              <div>
                <span className="details-facture__info-label">Numéro</span>
                <span className="details-facture__info-value">{facture.numero}</span>
              </div>
            </div>
            <div className="details-facture__info-item">
              <Calendar size={18} />
              <div>
                <span className="details-facture__info-label">Date facture</span>
                <span className="details-facture__info-value">{formaterDate(facture.date)}</span>
              </div>
            </div>
            {facture.dateLivraison && (
              <div className="details-facture__info-item">
                <Calendar size={18} />
                <div>
                  <span className="details-facture__info-label">Date livraison</span>
                  <span className="details-facture__info-value">{formaterDate(facture.dateLivraison)}</span>
                </div>
              </div>
            )}
            {facture.fichierPDF && (
              <div className="details-facture__info-item details-facture__info-item--file">
                <FileText size={18} />
                <div>
                  <span className="details-facture__info-label">Fichier PDF</span>
                  <span className="details-facture__info-value details-facture__info-value--file">
                    {facture.fichierPDF.split(/[/\\]/).pop()}
                  </span>
                  {facture.pdfOriginal && (
                    <div className="details-facture__pdf-actions">
                      <a
                        href={facture.pdfOriginal}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="details-facture__pdf-link"
                      >
                        Consulter
                      </a>
                      <a
                        href={facture.pdfOriginal}
                        download={facture.fichierPDF}
                        className="details-facture__pdf-link"
                      >
                        Télécharger
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">
            Lignes de produits ({facture.lignes.length})
          </h3>
          <div className="details-facture__table-container">
            <table className="details-facture__table">
              <thead>
                <tr>
                  <th>Réf.</th>
                  <th>Description</th>
                  <th>BAT</th>
                  <th>Logo</th>
                  <th>Couleur</th>
                  <th>Quantité</th>
                  <th>Prix unitaire HT</th>
                  <th>Remise</th>
                  <th>Montant HT</th>
                </tr>
              </thead>
              <tbody>
                {facture.lignes.map((ligne, index) => (
                  <tr key={index}>
                    <td className="details-facture__cell-ref">{ligne.refFournisseur || '-'}</td>
                    <td className="details-facture__cell-description">{ligne.description}</td>
                    <td className="details-facture__cell-bat">{ligne.bat || '-'}</td>
                    <td className="details-facture__cell-logo">{ligne.logo || '-'}</td>
                    <td className="details-facture__cell-color">{ligne.couleur || '-'}</td>
                    <td className="details-facture__cell-number">{ligne.quantite}</td>
                    <td className="details-facture__cell-amount">{formaterMontant(ligne.prixUnitaireHT)}</td>
                    <td className="details-facture__cell-amount">{formaterMontant(ligne.remise)}</td>
                    <td className="details-facture__cell-amount details-facture__cell-amount--bold">
                      {formaterMontant(ligne.montantHT)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="details-facture__section">
          <h3 className="details-facture__section-title">Totaux</h3>
          <div className="details-facture__totaux">
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Total HT</span>
              <span className="details-facture__total-value">{formaterMontant(facture.totalHT)}</span>
            </div>
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Total TVA</span>
              <span className="details-facture__total-value">{formaterMontant(totalTVAAffiche)}</span>
            </div>
            <div className="details-facture__total-item details-facture__total-item--final">
              <span className="details-facture__total-label">Total TTC</span>
              <span className="details-facture__total-value details-facture__total-value--final">
                {formaterMontant(totalTTCAffiche)}
              </span>
            </div>
            {reglements.length > 0 && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Acomptes / règlements</span>
                <div className="details-facture__total-value">
                  {reglements.map((r) => (
                    <div key={r.id}>
                      {new Intl.DateTimeFormat('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      }).format(r.dateEcheance || r.dateReglement)}{' '}
                      – {formaterMontant(r.montant)} ({formaterLibelleReglement(r.type, r.statut, r.notes)})
                      {r.statut === 'en_attente' ? ', en attente' : ', payé'}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {reglements.length > 0 && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Total en attente</span>
                <span className="details-facture__total-value">{formaterMontant(totalEnAttente)}</span>
              </div>
            )}
            {reglements.length > 0 && (
              <div className="details-facture__total-item">
                <span className="details-facture__total-label">Total réglé</span>
                <span className="details-facture__total-value">{formaterMontant(totalRegle)}</span>
              </div>
            )}
            <div className="details-facture__total-item">
              <span className="details-facture__total-label">Reste à régler</span>
              <span className="details-facture__total-value">{formaterMontant(resteARegler)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal d'édition */}
      {editionMode && facture && (
        <ModalEditionFacture
          facture={facture}
          onSauvegarder={(factureModifiee) => {
            onUpdate?.(factureModifiee);
            setEditionMode(false);
          }}
          onFermer={() => setEditionMode(false)}
        />
      )}
    </div>
  );
}

// Composant Modal pour éditer une facture
interface ModalEditionFactureProps {
  facture: Facture;
  onSauvegarder: (facture: Facture) => void;
  onFermer: () => void;
}

const TAUX_TVA_PAR_DEFAUT = 0.20;
const arrondir2 = (valeur: number) =>
  Math.round((valeur + Number.EPSILON) * 100) / 100;

const obtenirTauxTVAFacture = (factureCourante: Facture): number => {
  if (
    factureCourante.donneesBrutes &&
    typeof factureCourante.donneesBrutes.tauxTVA === 'number'
  ) {
    return Math.max(0, factureCourante.donneesBrutes.tauxTVA);
  }

  if (factureCourante.totalHT > 0) {
    const ratio = factureCourante.totalTVA / factureCourante.totalHT;
    return Math.max(0, ratio);
  }

  if (Math.abs((factureCourante.totalTTC || 0) - (factureCourante.totalHT || 0)) < 0.01) {
    return 0;
  }

  return TAUX_TVA_PAR_DEFAUT;
};

function ModalEditionFacture({ facture, onSauvegarder, onFermer }: ModalEditionFactureProps) {
  const [factureModifiee, setFactureModifiee] = useState<Facture>({ ...facture });
  const draftKey = useMemo(() => `facture-draft-${facture.id}`, [facture.id]);
  const draftTimerRef = useRef<number | null>(null);
  const [draftInfo, setDraftInfo] = useState<{ exists: boolean; savedAt?: Date }>({ exists: false });
  const tousLesFournisseurs = obtenirFournisseurs();

  // Gestion d'une remise HT globale (en fin de facture) via les données brutes
  const totalHTBrut =
    (factureModifiee.donneesBrutes && typeof factureModifiee.donneesBrutes.totalHTBrut === 'number'
      ? factureModifiee.donneesBrutes.totalHTBrut
      : factureModifiee.totalHT) ?? 0;
  const remiseGlobale =
    (factureModifiee.donneesBrutes && typeof factureModifiee.donneesBrutes.remise === 'number'
      ? factureModifiee.donneesBrutes.remise
      : 0);
  const netHTCalcule = Math.max(0, totalHTBrut - remiseGlobale);

  // Saisie brute de la remise globale pour un comportement naturel au clavier
  const [remiseGlobaleBrute, setRemiseGlobaleBrute] = useState<string>('');
  const [tauxTVABrute, setTauxTVABrute] = useState<string>('');

  // Synchroniser les champs texte avec les valeurs numériques
  useEffect(() => {
    if (remiseGlobale && !Number.isNaN(remiseGlobale)) {
      setRemiseGlobaleBrute(remiseGlobale.toFixed(2));
    } else {
      setRemiseGlobaleBrute('');
    }
  }, [remiseGlobale]);

  useEffect(() => {
    // Déterminer le taux de TVA courant (s'il existe), sinon le calculer à partir des totaux
    const taux = obtenirTauxTVAFacture(factureModifiee);

    setTauxTVABrute(((taux || 0) * 100).toFixed(2));
  }, [factureModifiee.totalHT, factureModifiee.totalTVA, factureModifiee.donneesBrutes?.tauxTVA]);

  // Fonction utilitaire : recalcule HT / TVA / TTC à partir des lignes et de la remise globale
  const recalculerTotaux = (factureCourante: Facture): Facture => {
    const totalHTLignes = factureCourante.lignes.reduce(
      (sum, ligne) => sum + ligne.montantHT,
      0
    );
    const remise =
      factureCourante.donneesBrutes && typeof factureCourante.donneesBrutes.remise === 'number'
        ? factureCourante.donneesBrutes.remise
        : 0;
    const totalHT = arrondir2(Math.max(0, totalHTLignes - remise));

    const tauxTVA = obtenirTauxTVAFacture(factureCourante);

    const totalTVA = arrondir2(totalHT * tauxTVA);
    const totalTTC = arrondir2(totalHT + totalTVA);

    return {
      ...factureCourante,
      totalHT,
      totalTVA,
      totalTTC,
      donneesBrutes: {
        ...(factureCourante.donneesBrutes || {}),
        totalHTBrut: totalHTLignes,
        remise,
        netHT: totalHT,
        tauxTVA,
      },
    };
  };

  const handleChange = (field: keyof Facture, value: unknown) => {
    setFactureModifiee(prev => recalculerTotaux({ ...prev, [field]: value }));
  };

  const handleChangeLigne = (index: number, field: keyof LigneProduit, value: unknown) => {
    setFactureModifiee(prev => {
      const nouvellesLignes = [...prev.lignes];
      const valeurArrondie =
        typeof value === 'number' ? arrondir2(value) : value;
      nouvellesLignes[index] = { ...nouvellesLignes[index], [field]: valeurArrondie };
      
      // Recalculer le montant HT de la ligne
      if (field === 'quantite' || field === 'prixUnitaireHT' || field === 'remise') {
        const ligne = nouvellesLignes[index];
        const montantHT = (ligne.quantite * ligne.prixUnitaireHT) - ligne.remise;
        nouvellesLignes[index] = { ...ligne, montantHT: arrondir2(Math.max(0, montantHT)) };
      }

      return recalculerTotaux({ ...prev, lignes: nouvellesLignes });
    });
  };

  const handleAjouterLigne = () => {
    setFactureModifiee(prev => recalculerTotaux({
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
    setFactureModifiee(prev => recalculerTotaux({
      ...prev,
      lignes: prev.lignes.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const factureFinale = recalculerTotaux(factureModifiee);
    onSauvegarder(factureFinale);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignorer
    }
  };

  const formaterDate = (date: Date) => {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '';
    }
    return date.toISOString().split('T')[0];
  };

  const normaliserFactureDraft = (draft: Facture): Facture => ({
    ...draft,
    date: draft.date instanceof Date ? draft.date : new Date(draft.date),
    dateLivraison: draft.dateLivraison ? new Date(draft.dateLivraison) : undefined,
    dateImport: draft.dateImport ? new Date(draft.dateImport) : new Date(),
  });

  const lireBrouillon = () => {
    try {
      const brut = localStorage.getItem(draftKey);
      if (!brut) {
        setDraftInfo({ exists: false });
        return null;
      }
      const parsed = JSON.parse(brut);
      const factureDraft = parsed?.facture as Facture | undefined;
      const savedAt = parsed?.savedAt ? new Date(parsed.savedAt) : undefined;
      if (!factureDraft || factureDraft.numero !== facture.numero) {
        setDraftInfo({ exists: false });
        return null;
      }
      setDraftInfo({ exists: true, savedAt });
      return factureDraft;
    } catch {
      setDraftInfo({ exists: false });
      return null;
    }
  };

  const restaurerBrouillon = () => {
    const factureDraft = lireBrouillon();
    if (!factureDraft) {
      window.alert('Aucun brouillon disponible pour cette facture.');
      return;
    }
    setFactureModifiee(normaliserFactureDraft(factureDraft));
  };

  const effacerBrouillon = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignorer
    }
    setDraftInfo({ exists: false });
  };

  // Restaurer automatiquement un brouillon si présent
  useEffect(() => {
    const factureDraft = lireBrouillon();
    if (!factureDraft) return;
    const confirmer = window.confirm(
      'Un brouillon de saisie a été trouvé pour cette facture.\n\n' +
        'Voulez-vous le restaurer ?'
    );
    if (confirmer) {
      setFactureModifiee(normaliserFactureDraft(factureDraft));
    }
  }, [draftKey, facture.numero]);

  // Sauvegarde automatique du brouillon
  useEffect(() => {
    if (!factureModifiee) return;
    if (draftTimerRef.current) {
      window.clearTimeout(draftTimerRef.current);
    }
    draftTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ facture: factureModifiee, savedAt: new Date().toISOString() })
        );
      } catch {
        // ignorer
      }
    }, 400);
    return () => {
      if (draftTimerRef.current) {
        window.clearTimeout(draftTimerRef.current);
      }
    };
  }, [factureModifiee, draftKey]);

  return (
    <div className="details-facture__modal-overlay" onClick={onFermer}>
      <div className="details-facture__modal" onClick={(e) => e.stopPropagation()}>
        <div className="details-facture__modal-header">
          <h2>Éditer la facture {facture.numero}</h2>
          {draftInfo.exists && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <small style={{ color: '#6b7280' }}>
                Brouillon{draftInfo.savedAt ? ` (${draftInfo.savedAt.toLocaleString('fr-FR')})` : ''}
              </small>
              <button
                type="button"
                onClick={restaurerBrouillon}
                className="details-facture__modal-btn details-facture__modal-btn--secondary"
                style={{ padding: '0.25rem 0.5rem' }}
              >
                Restaurer
              </button>
              <button
                type="button"
                onClick={effacerBrouillon}
                className="details-facture__modal-btn details-facture__modal-btn--secondary"
                style={{ padding: '0.25rem 0.5rem' }}
              >
                Effacer
              </button>
            </div>
          )}
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
                  value={factureModifiee.fournisseur}
                  onChange={(e) => handleChange('fournisseur', e.target.value)}
                  required
                >
                  {tousLesFournisseurs.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <div className="details-facture__modal-field">
                <label>Numéro *</label>
                <input
                  type="text"
                  value={factureModifiee.numero}
                  onChange={(e) => handleChange('numero', e.target.value)}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date facture *</label>
                <input
                  type="date"
                  value={formaterDate(factureModifiee.date)}
                  onChange={(e) => handleChange('date', new Date(e.target.value))}
                  required
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Date livraison</label>
                <input
                  type="date"
                  value={factureModifiee.dateLivraison ? formaterDate(factureModifiee.dateLivraison) : ''}
                  onChange={(e) => handleChange('dateLivraison', e.target.value ? new Date(e.target.value) : undefined)}
                />
              </div>
            </div>
          </div>

          {/* Lignes de produits */}
          <div className="details-facture__modal-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Lignes de produits</h3>
              <button
                type="button"
                onClick={handleAjouterLigne}
                className="details-facture__btn-add"
              >
                <Plus size={16} />
                Ajouter une ligne
              </button>
            </div>
            <div className="details-facture__modal-lignes">
              {factureModifiee.lignes.map((ligne, index) => (
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
                        onChange={(e) => handleChangeLigne(index, 'refFournisseur', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field details-facture__modal-field--large">
                      <label>Description *</label>
                      <input
                        type="text"
                        value={ligne.description}
                        onChange={(e) => handleChangeLigne(index, 'description', e.target.value)}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>BAT</label>
                      <input
                        type="text"
                        value={ligne.bat || ''}
                        onChange={(e) => handleChangeLigne(index, 'bat', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Logo</label>
                      <input
                        type="text"
                        value={ligne.logo || ''}
                        onChange={(e) => handleChangeLigne(index, 'logo', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Couleur</label>
                      <input
                        type="text"
                        value={ligne.couleur || ''}
                        onChange={(e) => handleChangeLigne(index, 'couleur', e.target.value || undefined)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Quantité *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.quantite}
                        onChange={(e) => handleChangeLigne(index, 'quantite', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Prix unitaire HT *</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.prixUnitaireHT}
                        onChange={(e) => handleChangeLigne(index, 'prixUnitaireHT', parseFloat(e.target.value) || 0)}
                        required
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Remise</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.remise}
                        onChange={(e) => handleChangeLigne(index, 'remise', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="details-facture__modal-field">
                      <label>Montant HT</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={ligne.montantHT.toFixed(2)}
                        onChange={(e) => handleChangeLigne(index, 'montantHT', parseFloat(e.target.value) || 0)}
                        readOnly
                        style={{ backgroundColor: '#f3f4f6' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totaux */}
          <div className="details-facture__modal-section">
            <h3>Totaux</h3>
            <div className="details-facture__modal-grid">
              <div className="details-facture__modal-field">
                <label>Taux de TVA (%)</label>
                <input
                  type="text"
                  value={tauxTVABrute}
                  onChange={(e) => setTauxTVABrute(e.target.value)}
                  onBlur={(e) => {
                    const valeurTexte = e.target.value.replace(',', '.').trim();
                    const valeur = valeurTexte === '' ? 0 : parseFloat(valeurTexte);
                    const taux = Number.isNaN(valeur) ? TAUX_TVA_PAR_DEFAUT : Math.max(0, valeur) / 100;
                    setFactureModifiee(prev =>
                      recalculerTotaux({
                        ...prev,
                        donneesBrutes: {
                          ...(prev.donneesBrutes || {}),
                          tauxTVA: taux,
                        },
                      })
                    );
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Remise HT globale (fin de facture)</label>
                <input
                  type="text"
                  value={remiseGlobaleBrute}
                  onChange={(e) => setRemiseGlobaleBrute(e.target.value)}
                  onBlur={(e) => {
                    const valeurTexte = e.target.value.replace(',', '.').trim();
                    const valeur = valeurTexte === '' ? 0 : parseFloat(valeurTexte);
                    const nouvelleRemise = Number.isNaN(valeur) ? 0 : valeur;
                    setFactureModifiee(prev =>
                      recalculerTotaux({
                        ...prev,
                        donneesBrutes: {
                          ...(prev.donneesBrutes || {}),
                          totalHTBrut: totalHTBrut || prev.totalHT,
                          remise: nouvelleRemise,
                        },
                      })
                    );
                  }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Net HT (après remise globale)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={netHTCalcule.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total HT</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={factureModifiee.totalHT.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total TVA</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={factureModifiee.totalTVA.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
              <div className="details-facture__modal-field">
                <label>Total TTC *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={factureModifiee.totalTTC.toFixed(2)}
                  readOnly
                  style={{ backgroundColor: '#f3f4f6' }}
                />
              </div>
            </div>
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
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


