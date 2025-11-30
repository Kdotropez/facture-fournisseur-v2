/**
 * Utilitaires de diagnostic pour le localStorage
 * Permet de vérifier et récupérer les données perdues
 */

const STORAGE_KEY_FACTURES = 'factures-fournisseurs';

/**
 * Affiche toutes les clés du localStorage
 */
export function listerToutesLesCles(): string[] {
  const cles: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const cle = localStorage.key(i);
    if (cle) {
      cles.push(cle);
    }
  }
  return cles;
}

/**
 * Affiche toutes les données du localStorage
 */
export function afficherToutesLesDonnees(): Record<string, any> {
  const donnees: Record<string, any> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const cle = localStorage.key(i);
    if (cle) {
      try {
        const valeur = localStorage.getItem(cle);
        if (valeur) {
          donnees[cle] = JSON.parse(valeur);
        }
      } catch (error) {
        donnees[cle] = localStorage.getItem(cle);
      }
    }
  }
  return donnees;
}

/**
 * Recherche des factures LEHMANN F4 et F5 dans le localStorage
 * Cherche par numéro ET par nom de fichier
 */
export function rechercherFacturesPerdues(): {
  facturesTrouvees: any[];
  toutesLesFactures: any[];
  facturesLehmann: any[];
} {
  const toutesLesFactures: any[] = [];
  const facturesLehmann: any[] = [];
  const facturesTrouvees: any[] = [];

  // Chercher dans la clé principale
  try {
    const donnees = localStorage.getItem(STORAGE_KEY_FACTURES);
    if (donnees) {
      const factures = JSON.parse(donnees);
      toutesLesFactures.push(...factures);
      
      // Filtrer les factures LEHMANN
      const lehmann = factures.filter((f: any) => 
        f.fournisseur === 'LEHMANN F' || 
        f.fournisseur === 'LEHMANN FRERES' ||
        f.fournisseur === 'LEHMANN'
      );
      facturesLehmann.push(...lehmann);
      
      // Chercher F4 et F5 par nom de fichier (plus fiable que le numéro parsé)
      // Patterns pour F4 : F4.pdf, F4.PDF, FA4.pdf, etc.
      // Patterns pour F5 : F5.pdf, F5.PDF, FA5.pdf, etc.
      const f4 = factures.find((f: any) => {
        const nomFichier = f.fichierPDF?.toUpperCase() || '';
        const numero = f.numero?.toUpperCase() || '';
        return (
          // Par nom de fichier
          nomFichier.includes('F4') && !nomFichier.includes('F40') && !nomFichier.includes('F41') ||
          // Par numéro (si le parsing a gardé F4)
          numero === 'F4' || numero === 'FA4' ||
          // Par numéro avec préfixe (FA2504057 pourrait venir de F4)
          (numero.includes('4') && lehmann.includes(f))
        );
      });
      
      const f5 = factures.find((f: any) => {
        const nomFichier = f.fichierPDF?.toUpperCase() || '';
        const numero = f.numero?.toUpperCase() || '';
        return (
          // Par nom de fichier
          nomFichier.includes('F5') && !nomFichier.includes('F50') && !nomFichier.includes('F51') ||
          // Par numéro (si le parsing a gardé F5)
          numero === 'F5' || numero === 'FA5' ||
          // Par numéro avec préfixe (FA2504056 pourrait venir de F5)
          (numero.includes('5') && lehmann.includes(f))
        );
      });
      
      // Chercher aussi F6 si mentionné
      const f6 = factures.find((f: any) => {
        const nomFichier = f.fichierPDF?.toUpperCase() || '';
        return nomFichier.includes('F6') && !nomFichier.includes('F60') && !nomFichier.includes('F61');
      });
      
      if (f4) facturesTrouvees.push(f4);
      if (f5) facturesTrouvees.push(f5);
      if (f6) facturesTrouvees.push(f6);
    }
  } catch (error) {
    console.error('Erreur lors de la recherche:', error);
  }

  // Chercher dans d'autres clés possibles (backups, etc.)
  for (let i = 0; i < localStorage.length; i++) {
    const cle = localStorage.key(i);
    if (cle && cle.includes('facture')) {
      try {
        const donnees = localStorage.getItem(cle);
        if (donnees) {
          const factures = JSON.parse(donnees);
          if (Array.isArray(factures)) {
            // Filtrer les factures LEHMANN
            const lehmannBackup = factures.filter((f: any) => 
              f.fournisseur === 'LEHMANN F' || 
              f.fournisseur === 'LEHMANN FRERES' ||
              f.fournisseur === 'LEHMANN'
            );
            
            // Chercher par nom de fichier dans les backups
            const f4 = lehmannBackup.find((f: any) => {
              const nomFichier = f.fichierPDF?.toUpperCase() || '';
              return nomFichier.includes('F4') && !nomFichier.includes('F40') && !nomFichier.includes('F41');
            });
            
            const f5 = lehmannBackup.find((f: any) => {
              const nomFichier = f.fichierPDF?.toUpperCase() || '';
              return nomFichier.includes('F5') && !nomFichier.includes('F50') && !nomFichier.includes('F51');
            });
            
            const f6 = lehmannBackup.find((f: any) => {
              const nomFichier = f.fichierPDF?.toUpperCase() || '';
              return nomFichier.includes('F6') && !nomFichier.includes('F60') && !nomFichier.includes('F61');
            });
            
            if (f4 && !facturesTrouvees.find(f => f.id === f4.id)) {
              facturesTrouvees.push(f4);
            }
            if (f5 && !facturesTrouvees.find(f => f.id === f5.id)) {
              facturesTrouvees.push(f5);
            }
            if (f6 && !facturesTrouvees.find(f => f.id === f6.id)) {
              facturesTrouvees.push(f6);
            }
          }
        }
      } catch (error) {
        // Ignorer les erreurs de parsing
      }
    }
  }

  return {
    facturesTrouvees,
    toutesLesFactures,
    facturesLehmann,
  };
}

/**
 * Nettoie les anciens backups pour libérer de l'espace
 */
export function nettoyerTousLesBackups(): number {
  let supprimes = 0;
  try {
    const backups: Array<{ cle: string; timestamp: number }> = [];
    
    // Collecter tous les backups
    for (let i = 0; i < localStorage.length; i++) {
      const cle = localStorage.key(i);
      if (cle && (cle.includes('backup') || cle.includes('BACKUP'))) {
        try {
          // Essayer d'extraire un timestamp
          const donnees = localStorage.getItem(cle);
          if (donnees) {
            backups.push({ cle, timestamp: Date.now() }); // Utiliser maintenant comme timestamp
          }
        } catch {
          // Ignorer les erreurs
        }
      }
    }
    
    // Garder seulement les 2 plus récents et supprimer les autres
    if (backups.length > 2) {
      // Trier par ordre alphabétique (les plus récents sont généralement en fin)
      backups.sort((a, b) => b.cle.localeCompare(a.cle));
      
      for (let i = 2; i < backups.length; i++) {
        localStorage.removeItem(backups[i].cle);
        supprimes++;
      }
    }
    
    console.log(`🗑️ ${supprimes} backup(s) supprimé(s)`);
  } catch (error) {
    console.error('Erreur lors du nettoyage des backups:', error);
  }
  
  return supprimes;
}

/**
 * Crée un backup des factures dans le localStorage
 * Nettoie d'abord les anciens backups si nécessaire
 */
export function creerBackupFactures(): string {
  try {
    // Nettoyer les anciens backups d'abord
    nettoyerTousLesBackups();
    
    const donnees = localStorage.getItem(STORAGE_KEY_FACTURES);
    if (donnees) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cleBackup = `factures-backup-${timestamp}`;
      
      // Vérifier l'espace disponible
      try {
        localStorage.setItem(cleBackup, donnees);
        console.log(`✅ Backup créé: ${cleBackup}`);
        return cleBackup;
      } catch (quotaError) {
        // Si le quota est dépassé, nettoyer plus agressivement
        console.warn('⚠️ Quota dépassé, nettoyage agressif...');
        nettoyerTousLesBackups();
        
        // Réessayer
        try {
          localStorage.setItem(cleBackup, donnees);
          console.log(`✅ Backup créé après nettoyage: ${cleBackup}`);
          return cleBackup;
        } catch {
          console.warn('⚠️ Impossible de créer un backup, espace insuffisant');
          return '';
        }
      }
    }
    return '';
  } catch (error) {
    console.error('Erreur lors de la création du backup:', error);
    return '';
  }
}

/**
 * Restaure un backup de factures
 */
export function restaurerBackupFactures(cleBackup: string): boolean {
  try {
    const donnees = localStorage.getItem(cleBackup);
    if (donnees) {
      localStorage.setItem(STORAGE_KEY_FACTURES, donnees);
      console.log(`✅ Backup restauré depuis: ${cleBackup}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erreur lors de la restauration du backup:', error);
    return false;
  }
}

/**
 * Affiche un rapport complet dans la console
 */
export function afficherRapportDiagnostic(): void {
  console.log('=== DIAGNOSTIC LOCALSTORAGE ===');
  console.log('Clés trouvées:', listerToutesLesCles());
  console.log('\n=== RECHERCHE FACTURES PERDUES ===');
  const resultat = rechercherFacturesPerdues();
  console.log(`Total factures: ${resultat.toutesLesFactures.length}`);
  console.log(`Factures LEHMANN: ${resultat.facturesLehmann.length}`);
  console.log(`Factures F4/F5/F6 trouvées: ${resultat.facturesTrouvees.length}`);
  
  if (resultat.facturesTrouvees.length > 0) {
    console.log('\n✅ Factures F4/F5/F6 trouvées (par nom de fichier):');
    resultat.facturesTrouvees.forEach(f => {
      console.log(`- Fichier: ${f.fichierPDF}`);
      console.log(`  Numéro parsé: ${f.numero}`);
      console.log(`  Fournisseur: ${f.fournisseur}`);
      console.log(`  ID: ${f.id}`);
      console.log('');
    });
  } else {
    console.log('\n❌ Aucune facture F4/F5/F6 trouvée par nom de fichier');
  }
  
  console.log('\n=== TOUTES LES FACTURES LEHMANN ===');
  if (resultat.facturesLehmann.length > 0) {
    resultat.facturesLehmann.forEach(f => {
      console.log(`- Fichier: ${f.fichierPDF || 'N/A'}`);
      console.log(`  Numéro parsé: ${f.numero}`);
      console.log(`  Date: ${f.date}`);
      console.log(`  Total TTC: ${f.totalTTC}€`);
      console.log('');
    });
  } else {
    console.log('Aucune facture LEHMANN trouvée');
  }
  
  console.log('\n=== FIN DU RAPPORT ===');
}

