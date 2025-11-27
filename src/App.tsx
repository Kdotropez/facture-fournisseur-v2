/**
 * Application principale de gestion des factures fournisseurs
 */

import { useRef, useState } from 'react';
import { FileText, BarChart3, Upload, Download, RotateCcw } from 'lucide-react';
import { useFactures } from './hooks/useFactures';
import { useImportPDF } from './hooks/useImportPDF';
import { ListeFactures } from './components/ListeFactures';
import { DetailsFacture } from './components/DetailsFacture';
import { StatistiquesComponent } from './components/Statistiques';
import { ImportPDF } from './components/ImportPDF';
import { ListeFichiersDisponibles } from './components/ListeFichiersDisponibles';
import type { Facture } from './types/facture';
import type { Fournisseur } from './types/facture';
import { parserFacture } from '@parsers/index';
import './App.css';
import { lireFichierEnDataURL } from './utils/fileUtils';

type Vue = 'factures' | 'statistiques' | 'import';

function App() {
  const [vueActive, setVueActive] = useState<Vue>('factures');
  const [factureSelectionnee, setFactureSelectionnee] = useState<Facture | null>(null);
  const [fichierEnChargement, setFichierEnChargement] = useState<string | null>(null);
  const inputRestaurationRef = useRef<HTMLInputElement>(null);

  const {
    factures,
    toutesLesFactures,
    statistiques,
    termeRecherche,
    setTermeRecherche,
    fournisseurFiltre,
    setFournisseurFiltre,
    ajouterFacture,
    supprimerFacture,
    remplacerFactures,
  } = useFactures();

  const { importerFichiers, importEnCours, erreur, setErreur } = useImportPDF();

  const handleImport = async (fichiers: File[], fournisseur?: import('./types/facture').Fournisseur) => {
    setErreur(null);
    const facturesImportees = await importerFichiers(fichiers, fournisseur);
    
    for (const facture of facturesImportees) {
      ajouterFacture(facture);
    }

    if (facturesImportees.length > 0) {
      // Basculer vers la vue factures après import
      setVueActive('factures');
      // Sélectionner la dernière facture importée
      if (facturesImportees.length > 0) {
        setFactureSelectionnee(facturesImportees[facturesImportees.length - 1]);
      }
    }
  };

  const handleFactureSelect = (facture: Facture | null) => {
    setFactureSelectionnee(facture);
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
      
      // Dans une application web, on ne peut pas directement charger un fichier
      // depuis le système de fichiers. On doit demander à l'utilisateur de le sélectionner.
      // Créer un input file temporaire pour permettre la sélection
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.style.display = 'none';
      
      // Attendre que l'utilisateur sélectionne le fichier
      const fichier = await new Promise<File>((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        
        const cleanup = () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        };
        
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Timeout: sélection de fichier annulée'));
        }, 300000); // 5 minutes timeout
        
        input.onchange = (e) => {
          cleanup();
          const target = e.target as HTMLInputElement;
          const file = target.files?.[0];
          console.log('Fichier sélectionné:', file?.name);
          if (file) {
            resolve(file);
          } else {
            reject(new Error('Aucun fichier sélectionné'));
          }
        };
        
        // Ajouter l'input au DOM et déclencher le clic
        document.body.appendChild(input);
        console.log('Ouverture du dialogue de sélection de fichier...');
        // Utiliser setTimeout pour s'assurer que l'input est bien dans le DOM
        setTimeout(() => {
          input.click();
        }, 0);
      });

      console.log('Fichier sélectionné, début du parsing...', fichier.name);

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
      const nomFichier = fichier.name;
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
          <div className="app__factures-layout">
            <div className="app__factures-list">
              <ListeFactures
                factures={factures}
                termeRecherche={termeRecherche}
                onTermeRechercheChange={setTermeRecherche}
                fournisseurFiltre={fournisseurFiltre}
                onFournisseurFiltreChange={setFournisseurFiltre}
                onFactureSelect={handleFactureSelect}
                factureSelectionnee={factureSelectionnee || undefined}
                onSupprimerFacture={supprimerFacture}
              />
            </div>
            <div className="app__factures-details">
              <DetailsFacture
                facture={factureSelectionnee}
                onClose={handleCloseDetails}
              />
            </div>
          </div>
        )}

        {vueActive === 'statistiques' && (
          <div className="app__statistiques">
            <StatistiquesComponent statistiques={statistiques} />
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
                facturesChargees={facturesChargees}
                chargementEnCours={fichierEnChargement}
              />
            </div>

            <div className="app__import-section" style={{ marginTop: '3rem', paddingTop: '3rem', borderTop: '2px solid #e5e7eb' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: '#1a1a1a' }}>
                Importer de nouveaux fichiers PDF
              </h2>
              <ImportPDF
                onImport={handleImport}
                importEnCours={importEnCours}
              />
            </div>

            {erreur && (
              <div className="app__error" style={{ marginTop: '1.5rem' }}>
                <p>{erreur}</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

