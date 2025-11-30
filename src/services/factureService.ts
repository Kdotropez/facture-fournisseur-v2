/**
 * Service pour la gestion des factures
 * Utilise localStorage pour la persistance
 */

import type { Facture, Fournisseur, Statistiques } from '../types/facture';

const STORAGE_KEY = 'factures-fournisseurs';

/**
 * Charge toutes les factures depuis le stockage local
 */
export function chargerFactures(): Facture[] {
  try {
    const donnees = localStorage.getItem(STORAGE_KEY);
    if (!donnees) return [];
    
    const factures = JSON.parse(donnees) as Facture[];
    // Convertir les dates string en objets Date
    return factures.map(f => ({
      ...f,
      date: new Date(f.date),
      dateLivraison: f.dateLivraison ? new Date(f.dateLivraison) : undefined,
      dateImport: new Date(f.dateImport),
    }));
  } catch (error) {
    console.error('Erreur lors du chargement des factures:', error);
    return [];
  }
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
 * Sauvegarde toutes les factures dans le stockage local
 * Crée automatiquement un backup avant de sauvegarder (si espace disponible)
 */
export function sauvegarderFactures(factures: Facture[]): void {
  try {
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
    
    // Sauvegarder les nouvelles données
    localStorage.setItem(STORAGE_KEY, JSON.stringify(factures));
  } catch (error) {
    // Si l'erreur est liée au quota, nettoyer et réessayer
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('⚠️ Quota localStorage dépassé, nettoyage agressif...');
      
      // Nettoyer tous les backups sauf le plus récent
      nettoyerBackups();
      
      // Supprimer aussi les autres données temporaires si nécessaire
      try {
        // Réessayer la sauvegarde
        localStorage.setItem(STORAGE_KEY, JSON.stringify(factures));
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



