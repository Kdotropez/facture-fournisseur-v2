/**
 * Service pour la gestion des factures
 * Utilise localStorage pour la persistance
 */

import type { Facture, Fournisseur, Statistiques } from '../types/facture';
import { normaliserNomFournisseur } from './fournisseursService';
import { nettoyerTousLesBackups } from '../utils/diagnosticLocalStorage';

const STORAGE_KEY = 'factures-fournisseurs';

/**
 * Charge toutes les factures depuis le stockage local
 */
export function chargerFactures(): Facture[] {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY);
    if (!donnees) return [];
    
    const factures = JSON.parse(donnees) as Facture[];
    // Convertir les dates string en objets Date et normaliser le nom du fournisseur
    return factures.map(f => ({
      ...f,
      statut: f.statut ?? 'active',
      fournisseur: normaliserNomFournisseur(f.fournisseur),
      date: new Date(f.date),
      dateLivraison: f.dateLivraison ? new Date(f.dateLivraison) : undefined,
      dateImport: new Date(f.dateImport),
    }));
  } catch (error) {
    console.error('Erreur lors du chargement des factures:', error);
    return [];
  }
}

function normaliserFactureStockage(f: Facture): Facture {
  return {
    ...f,
    statut: f.statut ?? 'active',
    fournisseur: normaliserNomFournisseur(f.fournisseur),
    date: new Date(f.date),
    dateLivraison: f.dateLivraison ? new Date(f.dateLivraison) : undefined,
    dateImport: new Date(f.dateImport),
  };
}

function trouverFactureDansListe(
  factures: Facture[],
  cible: Facture
): Facture | null {
  const fournisseurCible = normaliserNomFournisseur(cible.fournisseur);
  const matchId = factures.find(f => f.id === cible.id);
  if (matchId) return matchId;
  const matchNumero = factures.find(
    f => normaliserNomFournisseur(f.fournisseur) === fournisseurCible && f.numero === cible.numero
  );
  return matchNumero || null;
}

/**
 * Recherche une facture dans les sauvegardes locales (auto-backup + backups locaux).
 * Utile pour restaurer une version correcte après un parsing erroné.
 */
export interface FactureSauvegardeeCandidate {
  facture: Facture;
  source: string;
  dateSauvegarde?: Date;
}

function normaliserCleFacture(f: Facture): string {
  return [
    normaliserNomFournisseur(f.fournisseur),
    f.numero,
    f.totalHT?.toFixed(2),
    f.totalTTC?.toFixed(2),
    f.lignes?.length ?? 0,
  ].join('|');
}

export function listerFacturesSauvegardes(cible: Facture): FactureSauvegardeeCandidate[] {
  const candidats: FactureSauvegardeeCandidate[] = [];
  const clesVues = new Set<string>();
  const fournisseurCible = normaliserNomFournisseur(cible.fournisseur);
  const fichierCible = (cible.fichierPDF || '').split(/[/\\]/).pop() || '';

  const ajouterCandidat = (facture: Facture, source: string, dateSauvegarde?: Date) => {
    const cle = normaliserCleFacture(facture);
    if (clesVues.has(cle)) return;
    clesVues.add(cle);
    candidats.push({ facture, source, dateSauvegarde });
  };

  const ajouterCandidatsDepuisListe = (
    factures: Facture[],
    source: string,
    dateSauvegarde?: Date
  ) => {
    const normalisees = factures.map(normaliserFactureStockage);
    const matchDirect = trouverFactureDansListe(normalisees, cible);
    if (matchDirect) {
      ajouterCandidat(matchDirect, source, dateSauvegarde);
    }

    if (fichierCible) {
      normalisees
        .filter((f) => {
          if (normaliserNomFournisseur(f.fournisseur) !== fournisseurCible) return false;
          const fichier = (f.fichierPDF || '').split(/[/\\]/).pop() || '';
          return fichier && fichier === fichierCible;
        })
        .forEach((f) => ajouterCandidat(f, source, dateSauvegarde));
    }
  };

  try {
    // 1) Sauvegarde auto la plus récente
    const sauvegardeAuto = localStorage.getItem('auto-backup-dernier-contenu');
    if (sauvegardeAuto) {
      const parsed = JSON.parse(sauvegardeAuto);
      const donnees = parsed?.donnees || {};
      const dateExport = parsed?.dateExport ? new Date(parsed.dateExport) : undefined;
      const facturesAuto: Facture[] =
        donnees['factures-fournisseurs-complet'] ||
        donnees['factures-fournisseurs'] ||
        [];
      if (Array.isArray(facturesAuto) && facturesAuto.length > 0) {
        ajouterCandidatsDepuisListe(facturesAuto, 'Sauvegarde auto', dateExport);
      }
    }

    // 2) Backups locaux factures-fournisseurs-backup-*
    const backups: Array<{ cle: string; timestamp: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle && cle.startsWith(`${STORAGE_KEY}-backup-`)) {
        const match = cle.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        const timestamp = match ? new Date(match[1].replace(/-/g, ':')
          .replace('T', 'T')
          .replace(/(\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3')).getTime() : 0;
        backups.push({ cle, timestamp });
      }
    }
    backups.sort((a, b) => b.timestamp - a.timestamp);

    for (const backup of backups) {
      const data = localStorage.getItem(backup.cle);
      if (!data) continue;
      const factures = JSON.parse(data) as Facture[];
      if (!Array.isArray(factures)) continue;
      ajouterCandidatsDepuisListe(
        factures,
        'Backup local',
        backup.timestamp ? new Date(backup.timestamp) : undefined
      );
    }
  } catch (error) {
    console.warn('[FACTURES] Erreur lors du listing des sauvegardes:', error);
  }

  return candidats;
}

export function rechercherFactureDansSauvegardes(cible: Facture): Facture | null {
  try {
    // 1) Sauvegarde auto la plus récente stockée en localStorage
    const sauvegardeAuto = localStorage.getItem('auto-backup-dernier-contenu');
    if (sauvegardeAuto) {
      const parsed = JSON.parse(sauvegardeAuto);
      const donnees = parsed?.donnees || {};
      const facturesAuto: Facture[] =
        donnees['factures-fournisseurs-complet'] ||
        donnees['factures-fournisseurs'] ||
        [];
      if (Array.isArray(facturesAuto) && facturesAuto.length > 0) {
        const normalisees = facturesAuto.map(normaliserFactureStockage);
        const match = trouverFactureDansListe(normalisees, cible);
        if (match) return match;
      }
    }

    // 2) Backups locaux factures-fournisseurs-backup-*
    const backups: Array<{ cle: string; timestamp: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle && cle.startsWith(`${STORAGE_KEY}-backup-`)) {
        const match = cle.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        const timestamp = match ? new Date(match[1].replace(/-/g, ':')
          .replace('T', 'T')
          .replace(/(\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3')).getTime() : 0;
        backups.push({ cle, timestamp });
      }
    }
    backups.sort((a, b) => b.timestamp - a.timestamp);

    for (const backup of backups) {
      const data = localStorage.getItem(backup.cle);
      if (!data) continue;
      const factures = JSON.parse(data) as Facture[];
      if (!Array.isArray(factures)) continue;
      const normalisees = factures.map(normaliserFactureStockage);
      const match = trouverFactureDansListe(normalisees, cible);
      if (match) return match;
    }
  } catch (error) {
    console.warn('[FACTURES] Erreur lors de la recherche dans les sauvegardes:', error);
  }

  return null;
}

/**
 * Nettoie les anciens backups pour libérer de l'espace
 */
function nettoyerBackups(): void {
  try {
    const backups: Array<{ cle: string; timestamp: number }> = [];
    
    // Collecter tous les backups avec leur timestamp
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle && cle.startsWith(`${STORAGE_KEY}-backup-`)) {
        // Extraire le timestamp du nom de la clé
        const match = cle.match(/backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
        if (match) {
          try {
            const timestamp = new Date(match[1].replace(/-/g, ':').replace('T', 'T').replace(/(\d{2})-(\d{2})-(\d{2})/, '$1:$2:$3')).getTime();
            backups.push({ cle, timestamp });
          } catch {
            // Si le parsing échoue, garder le backup mais le considérer comme ancien
            backups.push({ cle, timestamp: 0 });
          }
        }
      }
    }
    
    // Trier par timestamp (plus récent en premier)
    backups.sort((a, b) => b.timestamp - a.timestamp);
    
    // Garder seulement les 3 derniers backups et supprimer les autres
    if (backups.length > 3) {
      for (let i = 3; i < backups.length; i++) {
        localStorage.removeItem(backups[i].cle);
        console.log(`🗑️ Backup supprimé: ${backups[i].cle}`);
      }
    }
  } catch (error) {
    console.warn('Erreur lors du nettoyage des backups:', error);
  }
}

/**
 * Vérifie l'espace disponible dans le localStorage
 */
function verifierEspaceDisponible(tailleEstimee: number): boolean {
  try {
    // Tester si on peut stocker les données
    const testKey = '__test_storage__';
    const testData = 'x'.repeat(Math.min(tailleEstimee, 100000)); // Max 100KB pour le test
    localStorage.setItem(testKey, testData);
    localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Réduit la taille des factures avant stockage pour éviter de saturer le localStorage
 * - Supprime les PDF encodés trop volumineux (`pdfOriginal`)
 * - Coupe le texte brut complet (`donneesBrutes.texteComplet`)
 * - Tronque éventuellement les extraits trop longs
 */
function optimiserFacturesPourStockage(factures: Facture[]): Facture[] {
  return factures.map((f) => {
    const copie: Facture = { ...f };

    // 1) PDF encodé en base64 (très volumineux) : on le supprime si trop gros
    if (copie.pdfOriginal && copie.pdfOriginal.length > 100_000) {
      // On garde le nom du fichier PDF mais pas le contenu encodé
      copie.pdfOriginal = undefined;
    }

    // 2) Données brutes de parsing : supprimer le texte complet, garder au plus un extrait
    if (copie.donneesBrutes) {
      const db: any = { ...copie.donneesBrutes };

      if (typeof db.texteComplet === 'string') {
        delete db.texteComplet;
      }
      if (typeof db.texteExtrait === 'string' && db.texteExtrait.length > 2_000) {
        db.texteExtrait = db.texteExtrait.slice(0, 2_000);
      }

      copie.donneesBrutes = db;
    }

    return copie;
  });
}

/**
 * Sauvegarde toutes les factures dans le stockage local
 * Crée automatiquement un backup avant de sauvegarder (si espace disponible)
 */
export function sauvegarderFactures(factures: Facture[]): void {
  try {
    // Toujours optimiser les factures avant de les sérialiser
    const facturesOptimisees = optimiserFacturesPourStockage(factures);

    // Nettoyer les anciens backups d'abord
    nettoyerBackups();
    
    // Créer un backup seulement si on a de l'espace
    const donneesActuelles = localStorage.getItem(STORAGE_KEY);
    if (donneesActuelles) {
      const tailleEstimee = donneesActuelles.length;
      
      // Vérifier si on a assez d'espace pour un backup
      if (verifierEspaceDisponible(tailleEstimee * 2)) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const cleBackup = `${STORAGE_KEY}-backup-${timestamp}`;
          localStorage.setItem(cleBackup, donneesActuelles);
          console.log(`✅ Backup créé: ${cleBackup}`);
        } catch (backupError) {
          // Si le backup échoue, nettoyer et réessayer
          console.warn('⚠️ Impossible de créer un backup, nettoyage...');
          nettoyerBackups();
          // Ne pas bloquer la sauvegarde principale si le backup échoue
        }
      } else {
        console.warn('⚠️ Espace localStorage insuffisant pour créer un backup');
        // Nettoyer encore plus agressivement
        nettoyerBackups();
      }
    }
    
    // Sauvegarder les nouvelles données optimisées
    localStorage.setItem(STORAGE_KEY, JSON.stringify(facturesOptimisees));
  } catch (error) {
    // Si l'erreur est liée au quota, nettoyer et réessayer
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('⚠️ Quota localStorage dépassé, nettoyage agressif...');
      
      // Nettoyer tous les backups (clé principale et autres backups utilitaires)
      nettoyerBackups();
      nettoyerTousLesBackups();

      // Réduire au maximum la taille des factures avant de réessayer
      const facturesOptimisees = optimiserFacturesPourStockage(factures);

      // Réessayer une dernière fois la sauvegarde après nettoyage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(facturesOptimisees));
        console.log('✅ Sauvegarde réussie après nettoyage');
      } catch (retryError) {
        console.error('❌ Impossible de sauvegarder même après nettoyage:', retryError);
        throw new Error('Espace de stockage insuffisant. Veuillez exporter vos données et nettoyer le navigateur.');
      }
    } else {
      console.error('Erreur lors de la sauvegarde des factures:', error);
      throw error;
    }
  }
}

/**
 * Ajoute une nouvelle facture
 */
export function ajouterFacture(facture: Facture): void {
  const factures = chargerFactures();
  factures.push(facture);
  sauvegarderFactures(factures);
}

/**
 * Supprime une facture par son ID
 */
export function supprimerFacture(id: string): void {
  const factures = chargerFactures();
  const facturesFiltrees = factures.filter(f => f.id !== id);
  sauvegarderFactures(facturesFiltrees);
}

/**
 * Met à jour une facture existante
 */
export function mettreAJourFacture(facture: Facture): void {
  const factures = chargerFactures();
  const index = factures.findIndex(f => f.id === facture.id);
  if (index !== -1) {
    factures[index] = facture;
    sauvegarderFactures(factures);
  }
}

/**
 * Obtient une facture par son ID
 */
export function obtenirFacture(id: string): Facture | undefined {
  const factures = chargerFactures();
  return factures.find(f => f.id === id);
}

/**
 * Obtient une facture par fournisseur + numéro
 */
export function obtenirFactureParNumeroFournisseur(
  fournisseur: Fournisseur,
  numero: string
): Facture | undefined {
  const factures = chargerFactures();
  const fournisseurNormalise = normaliserNomFournisseur(fournisseur);
  return factures.find(
    (f) =>
      normaliserNomFournisseur(f.fournisseur) === fournisseurNormalise &&
      f.numero === numero
  );
}

/**
 * Calcule les statistiques globales
 */
export function calculerStatistiques(factures: Facture[]): Statistiques {
  const stats: Statistiques = {
    nombreFactures: factures.length,
    totalHT: 0,
    totalTVA: 0,
    totalTTC: 0,
    parFournisseur: {
      'RB DRINKS': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
      'LEHMANN F': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
      'ITALESSE': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
    },
  };

  factures.forEach(facture => {
    stats.totalHT += facture.totalHT;
    stats.totalTVA += facture.totalTVA;
    stats.totalTTC += facture.totalTTC;

    const statsFournisseur = stats.parFournisseur[facture.fournisseur];
    if (statsFournisseur) {
      statsFournisseur.nombre += 1;
      statsFournisseur.totalHT += facture.totalHT;
      statsFournisseur.totalTVA += facture.totalTVA;
      statsFournisseur.totalTTC += facture.totalTTC;
    }
  });

  return stats;
}

/**
 * Recherche des factures selon un terme de recherche
 */
export function rechercherFactures(
  factures: Facture[],
  terme: string
): Facture[] {
  if (!terme.trim()) return factures;

  const termeLower = terme.toLowerCase();
  return factures.filter(facture =>
    facture.numero.toLowerCase().includes(termeLower) ||
    facture.fournisseur.toLowerCase().includes(termeLower) ||
    facture.lignes.some(ligne =>
      ligne.description.toLowerCase().includes(termeLower)
    )
  );
}

/**
 * Filtre les factures par fournisseur
 */
export function filtrerParFournisseur(
  factures: Facture[],
  fournisseur: Fournisseur | null
): Facture[] {
  if (!fournisseur) return factures;
  return factures.filter(f => f.fournisseur === fournisseur);
}



