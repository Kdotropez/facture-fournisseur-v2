/**
 * Application principale de gestion des factures fournisseurs
 */

import { useRef, useState, useEffect } from 'react';
import { FileText, BarChart3, Upload, Download, RotateCcw, Edit, CreditCard } from 'lucide-react';
import { useFactures } from './hooks/useFactures';
import { useImportPDF } from './hooks/useImportPDF';
import { ListeFactures } from './components/ListeFactures';
import { DetailsFacture } from './components/DetailsFacture';
import { StatistiquesComponent } from './components/Statistiques';
import { ImportPDF } from './components/ImportPDF';
import { ListeFichiersDisponibles } from './components/ListeFichiersDisponibles';
import { EditeurParsing } from './components/EditeurParsing';
import { Reglements } from './components/Reglements';
import { VueFournisseur } from './components/VueFournisseur';
import type { Facture } from './types/facture';
import type { Fournisseur } from './types/facture';
import { parserFacture } from '@parsers/index';
import './App.css';
import { lireFichierEnDataURL } from './utils/fileUtils';
import { rechercherFacturesPerdues, afficherRapportDiagnostic, creerBackupFactures, nettoyerTousLesBackups } from './utils/diagnosticLocalStorage';
import { chargerFactures } from './services/factureService';

type Vue = 'factures' | 'statistiques' | 'import' | 'editeur' | 'reglements';

function App() {
  const [vueActive, setVueActive] = useState<Vue>('factures');
  const [factureSelectionnee, setFactureSelectionnee] = useState<Facture | null>(null);
  const [fichierEnChargement, setFichierEnChargement] = useState<string | null>(null);
  const [fichierPourEditeur, setFichierPourEditeur] = useState<File | null>(null);
  const inputRestaurationRef = useRef<HTMLInputElement>(null);

  const {
    factures,
    toutesLesFactures,
    termeRecherche,
    setTermeRecherche,
    fournisseurFiltre,
    setFournisseurFiltre,
    ajouterFacture,
    supprimerFacture,
    mettreAJourFacture,
    remplacerFactures,
  } = useFactures();

  // État pour gérer les fournisseurs sélectionnés dans la vue fournisseur
  // Par défaut, afficher tous les fournisseurs
  const [fournisseursSelectionnes, setFournisseursSelectionnes] = useState<Fournisseur[]>([]);

  // Synchroniser fournisseursSelectionnes avec fournisseurFiltre quand il change depuis l'extérieur
  useEffect(() => {
    if (fournisseurFiltre && !fournisseursSelectionnes.includes(fournisseurFiltre)) {
      setFournisseursSelectionnes([fournisseurFiltre]);
    } else if (!fournisseurFiltre && fournisseursSelectionnes.length > 0 && fournisseursSelectionnes.length === 1) {
      // Si le filtre est supprimé et qu'on avait un seul fournisseur sélectionné, on peut le garder ou le vider
      // On garde pour l'instant
    }
  }, [fournisseurFiltre]);
  
  // Fonction pour forcer le rechargement des factures
  const forcerRechargementFactures = () => {
    const facturesChargees = chargerFactures();
    remplacerFactures(facturesChargees);
    setTermeRecherche('');
    setFournisseurFiltre(null);
  };

  const { importerFichiers, importEnCours, erreur, setErreur } = useImportPDF();

  const handleImport = async (fichiers: File[], fournisseur?: import('./types/facture').Fournisseur) => {
    setErreur(null);
    const facturesImportees = await importerFichiers(fichiers, fournisseur);
    
    if (facturesImportees.length === 0) {
      return;
    }

    // Ajouter toutes les factures d'abord
    for (const facture of facturesImportees) {
      ajouterFacture(facture);
    }

    // Attendre un peu pour que toutes les sauvegardes soient terminées
    // Puis recharger toutes les factures en une seule fois
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Recharger toutes les factures depuis le localStorage
    // Créer un nouvel array pour forcer la mise à jour React
    let facturesChargees = [...chargerFactures()];
    console.log('[Import] Factures chargées après import:', facturesChargees.length, 'factures importées:', facturesImportees.length);
    
    // Vérifier que toutes les factures importées sont bien présentes
    const facturesImporteesIds = new Set(facturesImportees.map(f => f.id));
    const facturesPresentes = facturesChargees.filter(f => facturesImporteesIds.has(f.id));
    console.log('[Import] Factures importées présentes dans le chargement:', facturesPresentes.length, '/', facturesImportees.length);
    
    remplacerFactures(facturesChargees);
    
    // Si une facture est importée et qu'on est dans la vue fournisseur, 
    // appliquer le filtre du fournisseur de la facture importée si aucun filtre n'est actif
    const derniereFacture = facturesImportees[facturesImportees.length - 1];
    if (derniereFacture && vueActive === 'factures') {
      // Si le fournisseur de la facture importée n'est pas dans la sélection, l'ajouter
      if (fournisseursSelectionnes.length > 0 && !fournisseursSelectionnes.includes(derniereFacture.fournisseur)) {
        setFournisseursSelectionnes([...fournisseursSelectionnes, derniereFacture.fournisseur]);
      } else if (fournisseursSelectionnes.length === 0 && !fournisseurFiltre) {
        // Si aucun filtre n'est actif, sélectionner le fournisseur de la facture importée
        setFournisseursSelectionnes([derniereFacture.fournisseur]);
        setFournisseurFiltre(derniereFacture.fournisseur);
      }
    }
    
    // Basculer vers la vue factures après import
    setVueActive('factures');
    // Sélectionner la dernière facture importée
    setFactureSelectionnee(derniereFacture);
    
    // Forcer un nouveau rechargement après un court délai pour s'assurer que tout est synchronisé
    setTimeout(() => {
      facturesChargees = [...chargerFactures()];
      console.log('[Import] Rechargement final:', facturesChargees.length, 'factures');
      remplacerFactures(facturesChargees);
    }, 300);
  };

  const handleFactureSelect = (facture: Facture | null) => {
    setFactureSelectionnee(facture);
  };

  const handleVoirFacture = (facture: Facture) => {
    setFactureSelectionnee(facture);
    setVueActive('factures');
  };

  const handleImporterEditeur = async (facture: Facture) => {
    // Vérifier si la facture existe déjà
    const existeDeja = toutesLesFactures.some(
      f => f.numero === facture.numero && f.fournisseur === facture.fournisseur
    );

    if (existeDeja) {
      setErreur('Cette facture existe déjà');
      return;
    }

    // Ajouter la facture
    ajouterFacture(facture);
    
    // Basculer vers la vue factures et sélectionner la facture importée
    setVueActive('factures');
    setFactureSelectionnee(facture);
    setErreur(null);
  };

  // Charger un fichier avec contrôle (éditeur)
  const handleChargerAvecControle = async (chemin: string, _fournisseur: Fournisseur) => {
    setErreur(null);
    
    try {
      // Charger le fichier depuis le chemin public/
      const nomFichier = chemin.split(/[/\\]/).pop() || chemin;
      const cheminPublic = chemin.startsWith('/') ? chemin : `/${chemin}`;
      
      // Récupérer le fichier depuis le serveur
      const response = await fetch(cheminPublic);
      if (!response.ok) {
        throw new Error(`Impossible de charger le fichier: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const fichier = new File([blob], nomFichier, { type: 'application/pdf' });
      
      // Stocker le fichier et le fournisseur pour l'éditeur
      setFichierPourEditeur(fichier);
      
      // Basculer vers l'éditeur
      setVueActive('editeur');
    } catch (error) {
      setErreur(`Erreur lors du chargement du fichier: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  const handleCloseDetails = () => {
    setFactureSelectionnee(null);
  };

  // Obtenir la liste des chemins de factures déjà chargées
  const facturesChargees = toutesLesFactures
    .map(f => f.fichierPDF)
    .filter((chemin): chemin is string => chemin !== undefined);

  // Charger un fichier depuis les dossiers fournisseurs
  const handleChargerFichier = async (chemin: string, fournisseur: Fournisseur) => {
    setErreur(null);
    setFichierEnChargement(chemin);

    try {
      console.log('Début du chargement:', chemin, fournisseur);
      
      // Charger le fichier directement depuis le chemin public/
      const nomFichier = chemin.split(/[/\\]/).pop() || chemin;
      const cheminPublic = chemin.startsWith('/') ? chemin : `/${chemin}`;
      
      console.log('Chargement du fichier depuis:', cheminPublic);
      
      // Récupérer le fichier depuis le serveur
      const response = await fetch(cheminPublic);
      if (!response.ok) {
        throw new Error(`Impossible de charger le fichier: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const fichier = new File([blob], nomFichier, { type: 'application/pdf' });
      
      console.log('Fichier chargé, début du parsing...', fichier.name);

      // Parser le fichier sélectionné
      let resultat;
      try {
        resultat = await parserFacture(fichier, fournisseur);
        console.log('Parsing terminé:', resultat);
      } catch (parseError) {
        console.error('Erreur lors du parsing:', parseError);
        throw new Error(`Erreur lors du parsing du PDF: ${parseError instanceof Error ? parseError.message : 'Erreur inconnue'}`);
      }

      // Afficher les avertissements mais continuer
      if (resultat.avertissements && resultat.avertissements.length > 0) {
        console.warn('Avertissements lors du parsing:', resultat.avertissements);
      }

      // Les erreurs seront gérées après l'ajout de la facture

      // Vérifier si la facture existe déjà (par nom de fichier)
      const existeDeja = toutesLesFactures.some(
        f => {
          const factureNom = f.fichierPDF?.split(/[/\\]/).pop() || f.fichierPDF || '';
          return factureNom === nomFichier && f.fournisseur === fournisseur;
        }
      );

      if (!existeDeja) {
        // Mémoriser le PDF original pour pouvoir le visualiser plus tard
        const pdfOriginal = await lireFichierEnDataURL(fichier);
        const factureComplete = {
          ...resultat.facture,
          fichierPDF: nomFichier,
          pdfOriginal,
        };
        ajouterFacture(factureComplete);
        
        // Attendre un peu pour que la sauvegarde soit terminée
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Recharger toutes les factures depuis le localStorage pour synchroniser
        // Créer un nouvel array pour forcer la mise à jour React
        const facturesChargees = [...chargerFactures()];
        console.log('[ChargerFichier] Factures chargées après ajout:', facturesChargees.length);
        remplacerFactures(facturesChargees);
        
        // Si on est dans la vue fournisseur, s'assurer que le fournisseur est sélectionné
        if (vueActive === 'factures') {
          if (fournisseursSelectionnes.length > 0 && !fournisseursSelectionnes.includes(fournisseur)) {
            setFournisseursSelectionnes([...fournisseursSelectionnes, fournisseur]);
          } else if (fournisseursSelectionnes.length === 0 && !fournisseurFiltre) {
            setFournisseursSelectionnes([fournisseur]);
            setFournisseurFiltre(fournisseur);
          }
        }
        
        // Basculer vers la vue factures et sélectionner la facture
        setVueActive('factures');
        setFactureSelectionnee(factureComplete);
        
        // Forcer un nouveau rechargement après un court délai pour s'assurer que tout est synchronisé
        setTimeout(() => {
          const facturesChargees2 = [...chargerFactures()];
          console.log('[ChargerFichier] Rechargement final:', facturesChargees2.length, 'factures');
          remplacerFactures(facturesChargees2);
        }, 200);
        console.log('Facture ajoutée avec succès:', resultat.facture.numero, resultat.facture);
        
        // Afficher un message de succès ou d'avertissement
        if (resultat.erreurs && resultat.erreurs.length > 0) {
          setErreur(`⚠️ Facture créée avec des avertissements: ${resultat.erreurs.join(', ')}. Vérifiez les données.`);
        } else if (resultat.avertissements && resultat.avertissements.length > 0) {
          setErreur(`ℹ️ Facture créée: ${resultat.avertissements.join(', ')}`);
        } else {
          setErreur(null); // Pas d'erreur, tout est OK
        }
      } else {
        setErreur('Cette facture a déjà été chargée');
        console.log('Facture déjà existante:', nomFichier);
      }
    } catch (error) {
      const messageErreur = error instanceof Error 
        ? error.message 
        : 'Erreur lors du chargement du fichier';
      console.error('Erreur lors du chargement du fichier:', error);
      
      // Afficher l'erreur seulement si ce n'est pas une annulation
      if (messageErreur !== 'Sélection annulée' && 
          !messageErreur.includes('Timeout') &&
          !messageErreur.includes('annulée')) {
        setErreur(messageErreur);
      }
    } finally {
      setFichierEnChargement(null);
    }
  };

  const handleExporterFactures = () => {
    try {
      const donnees = JSON.stringify(toutesLesFactures, null, 2);
      const nomFichier = `factures-${new Date().toISOString().slice(0, 10)}.json`;
      const blob = new Blob([donnees], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomFichier;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors de l’export des factures:', error);
      setErreur('Impossible d’exporter les factures. Réessayez ou vérifiez la console.');
    }
  };

  const handleRestaurerClick = () => {
    inputRestaurationRef.current?.click();
  };


  const handleDiagnostic = () => {
    afficherRapportDiagnostic();
    const resultat = rechercherFacturesPerdues();
    
    // Afficher toutes les factures LEHMANN trouvées
    let message = `=== DIAGNOSTIC FACTURES ===\n\n`;
    message += `Total factures LEHMANN: ${resultat.facturesLehmann.length}\n`;
    message += `Factures F4/F5/F6 trouvées: ${resultat.facturesTrouvees.length}\n\n`;
    
    if (resultat.facturesLehmann.length > 0) {
      message += `📋 Toutes les factures LEHMANN:\n`;
      resultat.facturesLehmann.forEach(f => {
        message += `- ${f.fichierPDF || 'N/A'} → Numéro parsé: ${f.numero}\n`;
      });
      message += `\n`;
    }
    
    if (resultat.facturesTrouvees.length > 0) {
      message += `✅ Factures F4/F5/F6 trouvées (par nom de fichier):\n`;
      resultat.facturesTrouvees.forEach(f => {
        message += `- ${f.fichierPDF} → Numéro parsé: ${f.numero}\n`;
      });
      message += `\nVoulez-vous restaurer ces factures ?`;
      
      const confirmer = window.confirm(message);
      
      if (confirmer) {
        // Ajouter les factures trouvées
        let restaurees = 0;
        resultat.facturesTrouvees.forEach(facture => {
          // Vérifier si la facture n'existe pas déjà (par ID ou par fichier PDF)
          const existeDeja = toutesLesFactures.some(f => 
            f.id === facture.id || 
            f.fichierPDF === facture.fichierPDF
          );
          
          if (!existeDeja) {
            ajouterFacture(facture);
            restaurees++;
            console.log(`✅ Facture restaurée: ${facture.fichierPDF} (${facture.numero})`);
          } else {
            console.log(`⚠️ Facture déjà présente: ${facture.fichierPDF} (${facture.numero})`);
          }
        });
        
        if (restaurees > 0) {
          // Forcer le rechargement et réinitialiser les filtres
          forcerRechargementFactures();
          alert(`✅ ${restaurees} facture(s) restaurée(s) avec succès !`);
        } else {
          alert(`ℹ️ Toutes les factures trouvées sont déjà présentes dans la liste.`);
        }
      }
    } else {
      message += `❌ Aucune facture F4/F5/F6 trouvée par nom de fichier.\n\n`;
      message += `Vérifiez la console (F12) pour plus de détails.`;
      alert(message);
    }
    
    // Créer un backup maintenant
    creerBackupFactures();
  };

  const handleRestaurerChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = event.target.files?.[0];
    if (!fichier) return;

    try {
      const contenu = await fichier.text();
      const facturesJSON = JSON.parse(contenu);
      if (!Array.isArray(facturesJSON)) {
        throw new Error('Le fichier ne contient pas une liste de factures.');
      }

      const facturesParsees = facturesJSON.map((facture: Facture) => ({
        ...facture,
        date: new Date(facture.date),
        dateImport: new Date(facture.dateImport),
      }));

      remplacerFactures(facturesParsees);
      setFactureSelectionnee(null);
      setErreur(null);
    } catch (error) {
      console.error('Erreur lors de la restauration des factures:', error);
      setErreur('Impossible de restaurer les factures. Vérifiez le fichier JSON.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-content">
          <h1 className="app__title">
            <FileText size={32} />
            Gestion des Factures Fournisseurs
          </h1>
          <div className="app__header-actions">
            <nav className="app__nav">
              <button
                type="button"
                onClick={() => {
                  setVueActive('factures');
                  setFactureSelectionnee(null);
                }}
                className={`app__nav-btn ${vueActive === 'factures' ? 'app__nav-btn--active' : ''}`}
              >
                <FileText size={20} />
                Factures
              </button>
              <button
                type="button"
                onClick={() => {
                  setVueActive('statistiques');
                  setFactureSelectionnee(null);
                }}
                className={`app__nav-btn ${vueActive === 'statistiques' ? 'app__nav-btn--active' : ''}`}
              >
                <BarChart3 size={20} />
                Statistiques
              </button>
              <button
                type="button"
                onClick={() => {
                  setVueActive('import');
                  setFactureSelectionnee(null);
                }}
                className={`app__nav-btn ${vueActive === 'import' ? 'app__nav-btn--active' : ''}`}
              >
                <Upload size={20} />
                Importer
              </button>
              <button
                type="button"
                onClick={() => {
                  setVueActive('editeur');
                  setFactureSelectionnee(null);
                }}
                className={`app__nav-btn ${vueActive === 'editeur' ? 'app__nav-btn--active' : ''}`}
              >
                <Edit size={20} />
                Éditeur
              </button>
              <button
                type="button"
                onClick={() => {
                  setVueActive('reglements');
                  setFactureSelectionnee(null);
                }}
                className={`app__nav-btn ${vueActive === 'reglements' ? 'app__nav-btn--active' : ''}`}
              >
                <CreditCard size={20} />
                Règlements
              </button>
            </nav>
            <button
              type="button"
              className="app__export-btn"
              onClick={handleExporterFactures}
              disabled={toutesLesFactures.length === 0}
            >
              <Download size={18} />
              Exporter les données
            </button>
            <button
              type="button"
              className="app__restore-btn"
              onClick={handleRestaurerClick}
            >
              <RotateCcw size={18} />
              Restaurer
            </button>
            <button
              type="button"
              onClick={handleDiagnostic}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                background: 'white',
                color: '#f59e0b',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginLeft: '0.5rem',
              }}
              title="Diagnostiquer et récupérer les factures perdues"
            >
              🔍 Diagnostic
            </button>
            <input
              ref={inputRestaurationRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleRestaurerChange}
            />
          </div>
        </div>
      </header>

      <main className="app__main">
        {vueActive === 'factures' && (
          <div className="app__vue-fournisseur-layout">
            <div className="app__vue-fournisseur">
              <VueFournisseur
                key={`vue-fournisseur-${toutesLesFactures.length}`}
                fournisseursSelectionnes={fournisseursSelectionnes.length > 0 ? fournisseursSelectionnes : (fournisseurFiltre ? [fournisseurFiltre] : [])}
                toutesLesFactures={toutesLesFactures}
                onFournisseursChange={(fournisseurs) => {
                  setFournisseursSelectionnes(fournisseurs);
                  if (fournisseurs.length === 1) {
                    setFournisseurFiltre(fournisseurs[0]);
                  } else if (fournisseurs.length === 0) {
                    setFournisseurFiltre(null);
                  }
                }}
                onClose={() => {
                  // Ne pas fermer complètement, juste réinitialiser les sélections
                  setFournisseurFiltre(null);
                  setFournisseursSelectionnes([]);
                  setFactureSelectionnee(null);
                }}
                onFactureSelect={(facture) => {
                  handleFactureSelect(facture);
                }}
                onFactureUpdate={() => {
                  // Recharger les factures pour mettre à jour les états de règlement
                  const facturesChargees = chargerFactures();
                  remplacerFactures(facturesChargees);
                }}
              />
            </div>
            {factureSelectionnee && (
              <div className="app__vue-fournisseur-details">
                <DetailsFacture
                  facture={factureSelectionnee}
                  onClose={handleCloseDetails}
                  onUpdate={(factureModifiee) => {
                    mettreAJourFacture(factureModifiee);
                    setFactureSelectionnee(factureModifiee);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {vueActive === 'statistiques' && (
          <div className="app__statistiques">
            <StatistiquesComponent factures={toutesLesFactures} onVoirFacture={handleVoirFacture} />
          </div>
        )}

        {vueActive === 'import' && (
          <div className="app__import">
            <div className="app__import-section">
              <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: '#1a1a1a' }}>
                Fichiers disponibles dans les dossiers fournisseurs
              </h2>
              <p style={{ marginBottom: '2rem', color: '#6b7280', fontSize: '0.9rem' }}>
                Les fichiers suivants sont référencés dans les dossiers RB DRINKS 2025, LEHMANN F 2025 et ITALESSE 2025.
                Cliquez sur "Charger" pour créer une facture à partir de ces fichiers.
                <br />
                <strong>Note :</strong> Pour charger le contenu réel du PDF, vous devrez sélectionner le fichier manuellement via le formulaire d'import ci-dessous.
              </p>
              <ListeFichiersDisponibles
                onChargerFichier={handleChargerFichier}
                onChargerAvecControle={handleChargerAvecControle}
                facturesChargees={facturesChargees}
                chargementEnCours={fichierEnChargement}
              />
            </div>

            <div className="app__import-section" style={{ marginTop: '3rem', paddingTop: '3rem', borderTop: '2px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1a1a1a' }}>
                  Importer de nouveaux fichiers PDF
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setVueActive('editeur');
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    border: '1px solid #3b82f6',
                    borderRadius: '6px',
                    background: 'white',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                  title="Passer par l'éditeur pour contrôler et corriger avant l'import"
                >
                  <Edit size={16} />
                  Import avec contrôle
                </button>
              </div>
              <div style={{ 
                padding: '1rem', 
                background: '#eff6ff', 
                border: '1px solid #bfdbfe', 
                borderRadius: '6px', 
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                color: '#1e40af'
              }}>
                <strong>💡 Mode automatique :</strong> Les factures sont parsées automatiquement en utilisant les règles apprises lors de vos corrections précédentes. 
                Pour un contrôle manuel et des corrections avant l'import, cliquez sur "Import avec contrôle" ci-dessus.
              </div>
              <ImportPDF
                onImport={handleImport}
                importEnCours={importEnCours}
                onFichiersChange={(fichiers) => {
                  // Stocker le premier fichier pour l'éditeur
                  setFichierPourEditeur(fichiers.length > 0 ? fichiers[0] : null);
                }}
              />
            </div>

            {erreur && (
              <div className="app__error" style={{ marginTop: '1.5rem' }}>
                <p>{erreur}</p>
              </div>
            )}
          </div>
        )}

        {vueActive === 'editeur' && (
          <div className="app__editeur">
            <EditeurParsing 
              onImporter={handleImporterEditeur}
              fichierInitial={fichierPourEditeur || undefined}
            />
            {fichierPourEditeur && (
              <button
                type="button"
                onClick={() => {
                  setFichierPourEditeur(null);
                  setVueActive('import');
                }}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  border: '1px solid #6b7280',
                  borderRadius: '6px',
                  background: 'white',
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
              >
                Retour à l'import
              </button>
            )}
            {erreur && (
              <div className="app__error" style={{ marginTop: '1.5rem' }}>
                <p>{erreur}</p>
              </div>
            )}
          </div>
        )}

        {vueActive === 'reglements' && (
          <div className="app__reglements">
            <Reglements factures={toutesLesFactures} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

