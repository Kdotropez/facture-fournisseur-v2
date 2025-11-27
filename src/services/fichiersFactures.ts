/**
 * Service pour référencer les fichiers PDF de factures existants
 * dans les dossiers fournisseurs
 */

import type { Fournisseur } from '../types/facture';

export interface FichierFacture {
  nom: string;
  chemin: string;
  fournisseur: Fournisseur;
}

/**
 * Liste de base des fichiers PDF disponibles
 * Cette liste est complétée par le scan automatique
 */
const fichiersFacturesBase: FichierFacture[] = [
  // RB DRINKS 2025
  { nom: 'RB2.pdf', chemin: 'RB DRINKS 2025/RB2.pdf', fournisseur: 'RB DRINKS' },
  
  // LEHMANN F 2025
  { nom: 'F1.pdf', chemin: 'LEHMANN F 2025/F1.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F2.pdf', chemin: 'LEHMANN F 2025/F2.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F3.pdf', chemin: 'LEHMANN F 2025/F3.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F4.pdf', chemin: 'LEHMANN F 2025/F4.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F5.pdf', chemin: 'LEHMANN F 2025/F5.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F6.pdf', chemin: 'LEHMANN F 2025/F6.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F7.pdf', chemin: 'LEHMANN F 2025/F7.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F8.pdf', chemin: 'LEHMANN F 2025/F8.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F9.pdf', chemin: 'LEHMANN F 2025/F9.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F10.pdf', chemin: 'LEHMANN F 2025/F10.pdf', fournisseur: 'LEHMANN F' },
  { nom: 'F11.pdf', chemin: 'LEHMANN F 2025/F11.pdf', fournisseur: 'LEHMANN F' },
  
  // ITALESSE 2025
  { nom: 'I1.pdf', chemin: 'ITALESSE 2025/I1.pdf', fournisseur: 'ITALESSE' },
  { nom: 'I2.pdf', chemin: 'ITALESSE 2025/I2.pdf', fournisseur: 'ITALESSE' },
  { nom: 'I3.pdf', chemin: 'ITALESSE 2025/I3.pdf', fournisseur: 'ITALESSE' },
  { nom: 'I4.pdf', chemin: 'ITALESSE 2025/I4.pdf', fournisseur: 'ITALESSE' },
];

/**
 * Liste des fichiers PDF disponibles (peut être mise à jour par le scan)
 */
let fichiersFactures: FichierFacture[] = [...fichiersFacturesBase];

/**
 * Obtient la liste actuelle des fichiers (exporté pour compatibilité)
 */
export { fichiersFactures };

/**
 * Obtient la liste actuelle des fichiers
 */
export function obtenirFichiersFactures(): FichierFacture[] {
  return fichiersFactures;
}

/**
 * Vérifie si un fichier existe en essayant de le charger
 * IMPORTANT: Vérifie toujours la signature PDF pour éviter les faux positifs
 */
async function fichierExiste(chemin: string): Promise<boolean> {
  try {
    const cheminPublic = chemin.startsWith('/') ? chemin : `/${chemin}`;
    
    // TOUJOURS vérifier la signature PDF, même si HEAD retourne 200
    // Car certains serveurs peuvent retourner 200 pour des fichiers inexistants
    try {
      const getResponse = await fetch(cheminPublic, {
        method: 'GET',
        cache: 'no-cache',
        headers: {
          'Range': 'bytes=0-3', // Charger seulement les 4 premiers bytes
        },
      });
      
      // Si 404, le fichier n'existe pas
      if (getResponse.status === 404) {
        console.debug(`[SCAN] Fichier non trouvé (404): ${chemin}`);
        return false;
      }
      
      // Si 200 ou 206, vérifier la signature PDF
      if (getResponse.status === 200 || getResponse.status === 206) {
        const blob = await getResponse.blob();
        
        // Si le blob est vide, le fichier n'existe pas
        if (blob.size === 0) {
          console.debug(`[SCAN] Fichier vide: ${chemin}`);
          return false;
        }
        
        // Vérifier la signature PDF
        if (blob.size >= 4) {
          const arrayBuffer = await blob.slice(0, 4).arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const signature = String.fromCharCode(...bytes);
          
          // La signature PDF commence par "%PDF"
          const estPDF = signature.startsWith('%PDF');
          if (!estPDF) {
            console.debug(`[SCAN] Fichier n'est pas un PDF (signature: ${signature}): ${chemin}`);
          }
          return estPDF;
        }
        
        // Si moins de 4 bytes, ce n'est probablement pas un PDF valide
        console.debug(`[SCAN] Fichier trop petit (${blob.size} bytes): ${chemin}`);
        return false;
      }
      
      // Pour tout autre statut, considérer que le fichier n'existe pas
      console.debug(`[SCAN] Statut inattendu (${getResponse.status}): ${chemin}`);
      return false;
    } catch (getError) {
      // Si GET échoue, le fichier n'existe probablement pas
      console.debug(`[SCAN] Erreur GET pour ${chemin}:`, getError);
      return false;
    }
  } catch (error) {
    // En cas d'erreur réseau, considérer que le fichier n'existe pas
    console.debug(`[SCAN] Erreur générale pour ${chemin}:`, error);
    return false;
  }
}

/**
 * Détecte le fournisseur depuis le nom du fichier ou le chemin
 */
function detecterFournisseurDepuisChemin(nom: string, chemin: string): Fournisseur | null {
  const nomUpper = nom.toUpperCase();
  const cheminUpper = chemin.toUpperCase();
  
  // ITALESSE : priorité aux fichiers contenant "RELAIS DES COCHES" ou dans dossier ITALESSE
  if (cheminUpper.includes('ITALESSE') || nomUpper.includes('RELAIS DES COCHES') || 
      (nomUpper.startsWith('I') && nomUpper.endsWith('.PDF'))) {
    return 'ITALESSE';
  }
  
  if (cheminUpper.includes('RB DRINKS') || (nomUpper.includes('RB') && nomUpper.endsWith('.PDF'))) {
    return 'RB DRINKS';
  }
  
  if (cheminUpper.includes('LEHMANN') || (nomUpper.startsWith('F') && nomUpper.endsWith('.PDF'))) {
    return 'LEHMANN F';
  }
  
  return null;
}

/**
 * Génère une liste de chemins possibles pour scanner les fichiers
 */
function genererCheminsPossibles(): string[] {
  const chemins: string[] = [];
  
  // Chemins de base depuis fichiersFacturesBase
  fichiersFacturesBase.forEach(f => {
    if (!chemins.includes(f.chemin)) {
      chemins.push(f.chemin);
    }
  });
  
  // Chemins possibles pour ITALESSE
  // Seulement les fichiers qui existent vraiment
  const fichiersItalessePossibles = [
    'ITALESSE 2025/I1.pdf',
    'ITALESSE 2025/I2.pdf',
    'ITALESSE 2025/I3.pdf',
    'ITALESSE 2025/I4.pdf',
  ];
  
  fichiersItalessePossibles.forEach(chemin => {
    if (!chemins.includes(chemin)) {
      chemins.push(chemin);
    }
  });
  
  // Chemins possibles pour RB DRINKS
  const fichiersRBDrinksPossibles = [
    'RB DRINKS 2025/RB1.pdf',
    'RB DRINKS 2025/RB2.pdf',
    'RB DRINKS 2025/RB3.pdf',
    'RB DRINKS 2025/RB4.pdf',
    'RB DRINKS 2025/RB5.pdf',
  ];
  
  fichiersRBDrinksPossibles.forEach(chemin => {
    if (!chemins.includes(chemin)) {
      chemins.push(chemin);
    }
  });
  
  // Chemins possibles pour LEHMANN F
  for (let i = 1; i <= 20; i++) {
    const chemin = `LEHMANN F 2025/F${i}.pdf`;
    if (!chemins.includes(chemin)) {
      chemins.push(chemin);
    }
  }
  
  return chemins;
}

/**
 * Scanne les fichiers disponibles dans public/
 */
export async function scannerFichiersDisponibles(): Promise<FichierFacture[]> {
  console.log('[SCAN] Début du scan des fichiers...');
  const fichiersTrouves: FichierFacture[] = [];
  const cheminsPossibles = genererCheminsPossibles();
  
  // Ajouter aussi les fichiers actuellement dans la liste (ajoutés manuellement)
  const fichiersActuels = fichiersFactures.map(f => f.chemin);
  console.log('[SCAN] Fichiers actuels dans la liste:', fichiersActuels.length);
  fichiersActuels.forEach(chemin => {
    if (!cheminsPossibles.includes(chemin)) {
      cheminsPossibles.push(chemin);
    }
  });
  
  console.log('[SCAN] Total des chemins à vérifier:', cheminsPossibles.length);
  
  // Vérifier chaque chemin pour voir s'il existe vraiment
  // Limiter le nombre de requêtes en parallèle pour éviter de surcharger
  const verifications: (FichierFacture | null)[] = [];
  const batchSize = 10; // Vérifier 10 fichiers à la fois
  
  for (let i = 0; i < cheminsPossibles.length; i += batchSize) {
    const batch = cheminsPossibles.slice(i, i + batchSize);
    console.log(`[SCAN] Vérification du batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(cheminsPossibles.length / batchSize)}...`);
    
    const batchResults = await Promise.all(
      batch.map(async (chemin) => {
        try {
          const existe = await fichierExiste(chemin);
          if (existe) {
            const nom = chemin.split(/[/\\]/).pop() || chemin;
            
            // Utiliser le fournisseur du fichier existant s'il est dans la liste actuelle
            const fichierExistant = fichiersFactures.find(f => f.chemin === chemin);
            const fournisseur = fichierExistant?.fournisseur ||
                               detecterFournisseurDepuisChemin(nom, chemin) || 
                               fichiersFacturesBase.find(f => f.chemin === chemin)?.fournisseur ||
                               'ITALESSE'; // Par défaut
            
            console.log(`[SCAN] ✓ Fichier trouvé: ${chemin} (${fournisseur})`);
            return {
              nom,
              chemin,
              fournisseur,
            } as FichierFacture;
          } else {
            console.log(`[SCAN] ✗ Fichier non trouvé: ${chemin}`);
          }
          return null;
        } catch (error) {
          console.error(`[SCAN] Erreur lors de la vérification de ${chemin}:`, error);
          return null;
        }
      })
    );
    
    verifications.push(...batchResults);
  }
  
  // Filtrer les nulls et éviter les doublons par nom de fichier
  // Priorité aux fichiers dans les sous-dossiers (ex: ITALESSE 2025/I1.pdf plutôt que I1.pdf)
  const fichiersParNom = new Map<string, FichierFacture>();
  
  verifications.forEach(fichier => {
    if (!fichier) return;
    
    const nomFichier = fichier.nom.toLowerCase();
    const fichierExistant = fichiersParNom.get(nomFichier);
    
    // Si le fichier n'existe pas encore, ou si le nouveau est dans un sous-dossier et l'ancien non
    if (!fichierExistant) {
      fichiersParNom.set(nomFichier, fichier);
    } else {
      // Prioriser les fichiers dans les sous-dossiers
      const nouveauDansSousDossier = fichier.chemin.includes('/');
      const ancienDansSousDossier = fichierExistant.chemin.includes('/');
      
      if (nouveauDansSousDossier && !ancienDansSousDossier) {
        fichiersParNom.set(nomFichier, fichier);
      }
      // Sinon, garder l'ancien (déjà dans un sous-dossier ou même priorité)
    }
  });
  
  // Convertir la Map en tableau
  fichiersTrouves.push(...Array.from(fichiersParNom.values()));
  
  console.log(`[SCAN] Scan terminé: ${fichiersTrouves.length} fichier(s) trouvé(s)`);
  fichiersTrouves.forEach(f => {
    console.log(`[SCAN]   - ${f.nom} (${f.fournisseur})`);
  });
  
  // REMPLACER complètement la liste globale (pas d'ajout, suppression des fichiers qui n'existent plus)
  fichiersFactures = fichiersTrouves;
  
  return fichiersTrouves;
}

/**
 * Obtient tous les fichiers d'un fournisseur donné
 */
export function obtenirFichiersParFournisseur(fournisseur: Fournisseur): FichierFacture[] {
  return fichiersFactures.filter(f => f.fournisseur === fournisseur);
}

/**
 * Obtient tous les fichiers disponibles
 */
export function obtenirTousLesFichiers(): FichierFacture[] {
  return fichiersFactures;
}

/**
 * Ajoute manuellement un fichier à la liste
 */
export function ajouterFichierManuel(nom: string, chemin: string, fournisseur: Fournisseur): void {
  // Vérifier si le fichier n'existe pas déjà
  const existeDeja = fichiersFactures.some(f => f.chemin === chemin || f.nom === nom);
  if (!existeDeja) {
    fichiersFactures.push({ nom, chemin, fournisseur });
  }
}

/**
 * Obtient les statistiques des fichiers disponibles
 */
export function obtenirStatistiquesFichiers() {
  const stats = {
    total: fichiersFactures.length,
    parFournisseur: {
      'RB DRINKS': fichiersFactures.filter(f => f.fournisseur === 'RB DRINKS').length,
      'LEHMANN F': fichiersFactures.filter(f => f.fournisseur === 'LEHMANN F').length,
      'ITALESSE': fichiersFactures.filter(f => f.fournisseur === 'ITALESSE').length,
    },
  };
  return stats;
}


