/**
 * Application principale de gestion des factures fournisseurs
 */

import { useRef, useState, useEffect } from 'react';
import { FileText, BarChart3, Upload, Download, RotateCcw, Edit, CreditCard, FileSignature, X, FolderOpen } from 'lucide-react';
import { useFactures } from './hooks/useFactures';
import { useDevis } from './hooks/useDevis';
import { useImportPDF, detecterFournisseurDepuisContenu } from './hooks/useImportPDF';
import { DetailsFacture } from './components/DetailsFacture';
import { DetailsDevis } from './components/DetailsDevis';
import { StatistiquesComponent } from './components/Statistiques';
import { ImportPDF } from './components/ImportPDF';
import { ListeFichiersDisponibles } from './components/ListeFichiersDisponibles';
import { EditeurParsing } from './components/EditeurParsing';
import { Reglements } from './components/Reglements';
import { VueFournisseur } from './components/VueFournisseur';
import { ListeDevis } from './components/ListeDevis';
import { EditeurDevis } from './components/EditeurDevis';
import type { Facture } from './types/facture';
import type { Devis } from './types/devis';
import type { Fournisseur } from './types/facture';
import { parserFacture, obtenirFournisseurs } from '@parsers/index';
import './App.css';
import { lireFichierEnDataURL } from './utils/fileUtils';
import { rechercherFacturesPerdues, afficherRapportDiagnostic, creerBackupFactures } from './utils/diagnosticLocalStorage';
import { chargerFactures } from './services/factureService';
import { creerSauvegardeGlobale, restaurerSauvegardeGlobale, SauvegardeGlobale } from './services/sauvegardeGlobaleService';
import { exporterSauvegardeVersGoogleDrive } from './services/googleDriveService';
import {
  chargerHandleDossierSauvegarde,
  demanderDossierSauvegarde,
  verifierPermissionDossier,
} from './utils/directoryHandleStore';
import { chargerDevis } from './services/devisService';
import { ajouterReglement } from './services/reglementService';

const CHEMIN_DOSSIER_SAUVEGARDE = 'C:\\Users\\lefev\\Projets\\FACTURES FOURNISSEURS\\sauvegarde';

async function essayerSauvegardeDansDossier(
  donnees: Blob,
  nomFichier: string
): Promise<boolean> {
  const handle = await chargerHandleDossierSauvegarde();
  if (!handle) return false;

  const ok = await verifierPermissionDossier(handle);
  if (!ok) return false;

  try {
    const fichier = await handle.getFileHandle(nomFichier, { create: true });
    const writable = await fichier.createWritable();
    await writable.write(donnees);
    await writable.close();
    return true;
  } catch (error) {
    console.warn('[Sauvegarde] Impossible d’écrire dans le dossier choisi:', error);
    return false;
  }
}

// Utilitaire pour télécharger une sauvegarde globale au format JSON
async function telechargerSauvegardeJSON(
  sauvegarde: SauvegardeGlobale,
  type: 'complet' | 'auto'
): Promise<void> {
  try {
    const donnees = JSON.stringify(sauvegarde, null, 2);
    const maintenant = new Date();
    const mois = String(maintenant.getMonth() + 1).padStart(2, '0'); // 01-12
    const anneeDeuxChiffres = String(maintenant.getFullYear()).slice(-2); // 25 pour 2025

    // Nom principal demandé : "facture-mm-aa" pour la sauvegarde générale
    const baseNom = `facture-${mois}-${anneeDeuxChiffres}`;
    const nomFichier =
      type === 'complet'
        ? `${baseNom}.json`
        : `${baseNom}-auto.json`;

    const blob = new Blob([donnees], { type: 'application/json' });
    let sauvegardeOk = false;
    try {
      sauvegardeOk = await essayerSauvegardeDansDossier(blob, nomFichier);
    } catch (error) {
      console.warn('[Sauvegarde] Dossier de sauvegarde indisponible:', error);
      sauvegardeOk = false;
    }

    if (!sauvegardeOk) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomFichier;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.warn('[Sauvegarde] Impossible de créer le fichier JSON de sauvegarde:', error);
  }
}

type Vue = 'factures' | 'devis' | 'statistiques' | 'import' | 'editeur' | 'reglements';

function App() {
  const [vueActive, setVueActive] = useState<Vue>('factures');
  const [factureSelectionnee, setFactureSelectionnee] = useState<Facture | null>(null);
  const [devisSelectionne, setDevisSelectionne] = useState<Devis | null>(null);
  const [fichierEnChargement, setFichierEnChargement] = useState<string | null>(null);
  const [fichierPourEditeur, setFichierPourEditeur] = useState<File | null>(null);
  const inputRestaurationRef = useRef<HTMLInputElement>(null);
  const inputImportDevisRef = useRef<HTMLInputElement>(null);
  const [editeurDevisOuvert, setEditeurDevisOuvert] = useState(false);
  const [fichierDevisEnAttente, setFichierDevisEnAttente] = useState<File | null>(null);
  const [fournisseurManuelDevis, setFournisseurManuelDevis] = useState<string>('');
  const [nouveauFournisseurDevis, setNouveauFournisseurDevis] = useState<string>('');
  const [messageSauvegarde, setMessageSauvegarde] = useState<string>('');

  const {
    toutesLesFactures,
    setTermeRecherche,
    fournisseurFiltre,
    setFournisseurFiltre,
    ajouterFacture,
    supprimerFacture,
    mettreAJourFacture,
    remplacerFactures,
  } = useFactures();

  const {
    devis: devisFiltres,
    tousLesDevis,
    termeRecherche: termeRechercheDevis,
    setTermeRecherche: setTermeRechercheDevis,
    fournisseurFiltre: fournisseurFiltreDevis,
    setFournisseurFiltre: setFournisseurFiltreDevis,
    ajouterDevis,
    supprimerDevis,
    mettreAJourDevis,
    remplacerDevis,
  } = useDevis();

  // État pour gérer les fournisseurs sélectionnés dans la vue fournisseur
  // Par défaut, afficher tous les fournisseurs
  const [fournisseursSelectionnes, setFournisseursSelectionnes] = useState<Fournisseur[]>([]);

  // Sauvegarde automatique quotidienne (localStorage + Google Drive si configuré)
  useEffect(() => {
    // Ne rien faire côté serveur ou si aucune donnée
    if (typeof window === 'undefined') return;
    if (toutesLesFactures.length === 0 && tousLesDevis.length === 0) return;

    (async () => {
      try {
        const cleDerniereSauvegarde = 'auto-backup-derniere-sauvegarde';
        const maintenant = Date.now();
        const derniereStr = localStorage.getItem(cleDerniereSauvegarde);

        if (derniereStr) {
          const derniere = parseInt(derniereStr, 10);
          const unJour = 24 * 60 * 60 * 1000;
          if (!isNaN(derniere) && maintenant - derniere < unJour) {
            // Une sauvegarde automatique a déjà été faite il y a moins de 24h
            return;
          }
        }

        // Créer une sauvegarde globale et l'enrichir avec les factures/devis en mémoire (incluant les PDF si présents)
        const sauvegardeDeBase = await creerSauvegardeGlobale();
        const sauvegardeComplete: SauvegardeGlobale = {
          ...sauvegardeDeBase,
          donnees: {
            ...sauvegardeDeBase.donnees,
            // Copies complètes, telles qu'affichées dans l'application (peuvent contenir pdfOriginal)
            'factures-fournisseurs-complet': toutesLesFactures,
            'devis-fournisseurs-complet': tousLesDevis,
          },
        };

        // Stocker aussi la sauvegarde complète dans le localStorage
        try {
          localStorage.setItem('auto-backup-dernier-contenu', JSON.stringify(sauvegardeComplete));
          localStorage.setItem(cleDerniereSauvegarde, String(maintenant));
        } catch (storageError) {
          console.warn('[Sauvegarde] Impossible de stocker la sauvegarde en localStorage:', storageError);
        }

        // Télécharger automatiquement un fichier JSON sur le disque (dossier Téléchargements)
        void telechargerSauvegardeJSON(sauvegardeComplete, 'auto');
        setMessageSauvegarde('Sauvegarde automatique effectuée.');
        setTimeout(() => setMessageSauvegarde(''), 4000);

        // Essayer d'envoyer la sauvegarde vers Google Drive, sans bloquer l'UI
        (async () => {
          try {
            await exporterSauvegardeVersGoogleDrive(sauvegardeComplete, 'factures fournisseur');
            console.log('[Sauvegarde] Sauvegarde automatique envoyée vers Google Drive');
          } catch (driveError) {
            // Ne pas gêner l'utilisateur si Drive n'est pas configuré
            console.warn('[Sauvegarde] Sauvegarde Google Drive automatique non effectuée:', driveError);
          }
        })();
      } catch (error) {
        console.warn('[Sauvegarde] Erreur lors de la sauvegarde automatique:', error);
      }
    })();
  }, [toutesLesFactures.length, tousLesDevis.length]);

  // Synchroniser fournisseursSelectionnes avec fournisseurFiltre quand il change depuis l'extérieur
  useEffect(() => {
    if (fournisseurFiltre && !fournisseursSelectionnes.includes(fournisseurFiltre)) {
      setFournisseursSelectionnes([fournisseurFiltre]);
    } else if (!fournisseurFiltre && fournisseursSelectionnes.length > 0 && fournisseursSelectionnes.length === 1) {
      // Si le filtre est supprimé et qu'on avait un seul fournisseur sélectionné, on peut le garder ou le vider
      // On garde pour l'instant
    }
  }, [fournisseurFiltre, fournisseursSelectionnes]);
  
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

  const handleDevisSelect = (devis: Devis | null) => {
    setDevisSelectionne(devis);
  };

  const handleNouveauDevis = () => {
    setEditeurDevisOuvert(true);
  };

  const handleDevisCree = (devis: Devis) => {
    void ajouterDevis(devis);
    setDevisSelectionne(devis);
    setEditeurDevisOuvert(false);
  };

  const genererNumeroFactureDepuisDevis = (devis: Devis) => {
    const base = devis.numero || `devis-${devis.id.slice(-6)}`;
    const existe = (num: string) =>
      toutesLesFactures.some(
        (f) => f.fournisseur === devis.fournisseur && f.numero === num
      );
    if (!existe(base)) return base;
    let i = 1;
    while (existe(`${base}-FACT-${i}`)) {
      i += 1;
    }
    return `${base}-FACT-${i}`;
  };

  const handleTransformerDevisEnFacture = async (devis: Devis) => {
    const numeroFacture = genererNumeroFactureDepuisDevis(devis);
    const acomptes = devis.acomptesDemandes || [];
    const totalAcomptes = acomptes.reduce((sum, a) => sum + (a.montantTTC || 0), 0);
    const reste = Math.max(0, devis.totalTTC - totalAcomptes);

    const facture: Facture = {
      id: `facture-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fournisseur: devis.fournisseur,
      numero: numeroFacture,
      date: new Date(),
      lignes: devis.lignes.map((l) => ({
        ...l,
        quantiteFactureeManuelle: l.quantiteFactureeManuelle,
        receptions: l.receptions,
      })),
      totalHT: devis.totalHT,
      totalTVA: devis.totalTVA,
      totalTTC: devis.totalTTC,
      dateImport: new Date(),
      donneesBrutes: devis.donneesBrutes,
      fichierPDF: devis.fichierPDF,
      pdfOriginal: devis.pdfOriginal,
    };

    try {
      await ajouterFacture(facture);
      // Enregistrer les acomptes comme règlements sur la facture
      acomptes.forEach((acompte) => {
        if (!acompte.montantTTC || acompte.montantTTC <= 0) return;
        ajouterReglement({
          factureId: facture.id,
          numeroFacture: facture.numero,
          fournisseur: facture.fournisseur,
          type: 'acompte',
          montant: acompte.montantTTC,
          dateReglement: acompte.date,
          statut: 'paye',
          notes: acompte.note,
        });
      });
      // Si le devis était intégralement payé, poser un solde si besoin
      if (reste > 0) {
        ajouterReglement({
          factureId: facture.id,
          numeroFacture: facture.numero,
          fournisseur: facture.fournisseur,
          type: 'solde',
          montant: reste,
          dateReglement: new Date(),
          statut: 'paye',
          notes: 'Solde',
        });
      }
      const devisMisAJour: Devis = {
        ...devis,
        statut: 'facture_soldee',
        facturesLieesIds: [facture.id],
      };
      await mettreAJourDevis(devisMisAJour);
      setDevisSelectionne(devisMisAJour);
      setVueActive('factures');
      setFactureSelectionnee(facture);
    } catch (error) {
      setErreur(
        `Impossible de transformer le devis en facture : ${
          error instanceof Error ? error.message : 'Erreur inconnue'
        }`
      );
    }
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

    try {
      // Ajouter la facture
      ajouterFacture(facture);

      // Recharger depuis le stockage pour s'assurer qu'elle est bien sauvegardée
      const facturesChargees = chargerFactures();
      const factureSauvegardee = facturesChargees.find(
        (f) => f.numero === facture.numero && f.fournisseur === facture.fournisseur
      );

      if (!factureSauvegardee) {
        setErreur(
          'La facture a été importée mais non retrouvée dans le stockage. ' +
            'Vérifiez l’espace disponible et exportez vos données si besoin.'
        );
        return;
      }

      // Basculer vers la vue factures et sélectionner la facture importée
      setVueActive('factures');
      setFournisseurFiltre(null);
      setFournisseursSelectionnes([]);
      setTermeRecherche(facture.numero);
      setFactureSelectionnee(factureSauvegardee);
      setErreur(null);
    } catch (error) {
      setErreur(
        `Impossible d’enregistrer la facture : ${
          error instanceof Error ? error.message : 'Erreur inconnue'
        }`
      );
    }
  };

  // Crée un devis à partir d'un PDF et d'un fournisseur choisi
  const creerDevisDepuisPDF = async (fichier: File, fournisseur: Fournisseur) => {
    const resultat = await parserFacture(fichier, fournisseur);

    if (resultat.erreurs && resultat.erreurs.length > 0) {
      throw new Error(resultat.erreurs.join(', '));
    }

    const pdfOriginal = await lireFichierEnDataURL(fichier);
    const facture = resultat.facture;

    const devis: Devis = {
      id: `devis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fournisseur: facture.fournisseur,
      numero: facture.numero,
      date: facture.date,
      lignes: facture.lignes,
      totalHT: facture.totalHT,
      totalTVA: facture.totalTVA,
      totalTTC: facture.totalTTC,
      acompteDemandeTTC: 0,
      acomptesDemandes: [],
      dateImport: new Date(),
      statut: 'en_attente',
      facturesLieesIds: [],
      fichierPDF: facture.fichierPDF ?? fichier.name,
      pdfOriginal: facture.pdfOriginal ?? pdfOriginal,
      donneesBrutes: facture.donneesBrutes,
    };

    await ajouterDevis(devis);
    setDevisSelectionne(devis);
    setVueActive('devis');
  };

  // Importer un devis depuis un PDF avec sélection manuelle du fournisseur si nécessaire
  const handleImporterDevisDepuisFichiers = async (fichiers: File[]) => {
    setErreur(null);
    const fichier = fichiers[0];
    if (!fichier) return;

    try {
      const fournisseurDetecte = await detecterFournisseurDepuisContenu(fichier);

      if (!fournisseurDetecte) {
        // Impossible de détecter automatiquement : demander à l'utilisateur
        setFichierDevisEnAttente(fichier);
        setFournisseurManuelDevis('');
        setNouveauFournisseurDevis('');
        return;
      }

      await creerDevisDepuisPDF(fichier, fournisseurDetecte);
    } catch (error) {
      const messageErreur = error instanceof Error
        ? error.message
        : 'Erreur lors de l’import du devis';
      setErreur(messageErreur);
    }
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

  const handleExporterSauvegardeGlobale = async () => {
    try {
      // Même logique que l’auto-sauvegarde : on enrichit avec les données complètes en mémoire
      const sauvegardeDeBase = await creerSauvegardeGlobale();
      const sauvegardeComplete: SauvegardeGlobale = {
        ...sauvegardeDeBase,
        donnees: {
          ...sauvegardeDeBase.donnees,
          'factures-fournisseurs-complet': toutesLesFactures,
          'devis-fournisseurs-complet': tousLesDevis,
        },
      };

      await telechargerSauvegardeJSON(sauvegardeComplete, 'complet');
      setMessageSauvegarde('Export global terminé.');
      setTimeout(() => setMessageSauvegarde(''), 5000);

      // Export automatique vers Google Drive si configuré
      try {
        await exporterSauvegardeVersGoogleDrive(sauvegardeComplete, 'factures fournisseur');
      } catch (driveError) {
        console.warn('Export Google Drive échoué ou non configuré:', driveError);
        // Ne pas bloquer l’utilisateur : le téléchargement local a déjà été fait
      }
    } catch (error) {
      console.error('Erreur lors de l’export global:', error);
      setErreur('Impossible d’exporter les données. Réessayez ou vérifiez la console.');
    }
  };

  const handleChoisirDossierSauvegarde = async () => {
    try {
      const handle = await demanderDossierSauvegarde();
      if (!handle) {
        alert('Votre navigateur ne permet pas de choisir un dossier.');
        return;
      }
      alert(
        `Dossier de sauvegarde défini.\nVeuillez choisir :\n${CHEMIN_DOSSIER_SAUVEGARDE}`
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.warn('[Sauvegarde] Choix du dossier annulé ou impossible:', error);
      alert('Impossible de définir le dossier de sauvegarde.');
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

  const handleRetrouverFacture = () => {
    const numero = window.prompt('Numéro de facture à retrouver ?');
    if (!numero) return;
    const fournisseur = window.prompt('Fournisseur (optionnel) ?') || '';

    const facturesChargees = chargerFactures();
    const factureTrouvee = facturesChargees.find((f) => {
      const numeroOk = f.numero === numero.trim();
      if (!numeroOk) return false;
      if (!fournisseur.trim()) return true;
      return f.fournisseur.toLowerCase() === fournisseur.trim().toLowerCase();
    });

    if (!factureTrouvee) {
      alert('Facture introuvable dans le stockage. Elle n’a pas été enregistrée.');
      return;
    }

    setVueActive('factures');
    setFournisseurFiltre(null);
    setFournisseursSelectionnes([]);
    setTermeRecherche(factureTrouvee.numero);
    setFactureSelectionnee(factureTrouvee);
  };

  const handleRestaurerChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = event.target.files?.[0];
    if (!fichier) return;

    try {
      const contenu = await fichier.text();
      const json = JSON.parse(contenu);

      // Compatibilité ancienne version : fichier = tableau de factures
      if (Array.isArray(json)) {
        const facturesParsees = json.map((facture: Facture) => ({
          ...facture,
          date: new Date(facture.date),
          dateImport: new Date(facture.dateImport),
        }));

        remplacerFactures(facturesParsees);
        setFactureSelectionnee(null);
        setErreur(null);
        return;
      }

      // Nouvelle version : sauvegarde globale
      const sauvegarde = json as SauvegardeGlobale;
      await restaurerSauvegardeGlobale(sauvegarde);

      // Recharger les factures et devis depuis le localStorage restauré
      const facturesRech = chargerFactures();
      remplacerFactures(facturesRech);
      const devisRech = await chargerDevis();
      await remplacerDevis(devisRech);

      setFactureSelectionnee(null);
      setDevisSelectionne(null);
      setErreur(null);
    } catch (error) {
      console.error('Erreur lors de la restauration des données:', error);
      setErreur('Impossible de restaurer les données. Vérifiez le fichier JSON.');
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
                  setDevisSelectionne(null);
                }}
                className={`app__nav-btn ${vueActive === 'factures' ? 'app__nav-btn--active' : ''}`}
              >
                <FileText size={20} />
                Factures
              </button>
              <button
                type="button"
                onClick={() => {
                  setVueActive('devis');
                  setFactureSelectionnee(null);
                  setDevisSelectionne(null);
                }}
                className={`app__nav-btn ${vueActive === 'devis' ? 'app__nav-btn--active' : ''}`}
              >
                <FileSignature size={20} />
                Devis
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
              onClick={handleExporterSauvegardeGlobale}
            >
              <Download size={18} />
              Export global + Google Drive
            </button>
            <button
              type="button"
              className="app__restore-btn"
              onClick={handleChoisirDossierSauvegarde}
              title={`Dossier cible : ${CHEMIN_DOSSIER_SAUVEGARDE}`}
            >
              <FolderOpen size={18} />
              Dossier sauvegarde
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
            <button
              type="button"
              onClick={handleRetrouverFacture}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #2563eb',
                borderRadius: '6px',
                background: 'white',
                color: '#2563eb',
                cursor: 'pointer',
                fontSize: '0.9rem',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginLeft: '0.5rem',
              }}
              title="Retrouver une facture par numéro"
            >
              🔎 Retrouver facture
            </button>
            <input
              ref={inputRestaurationRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={handleRestaurerChange}
            />
          </div>
          {messageSauvegarde && (
            <div style={{ color: '#059669', fontWeight: 600, fontSize: '0.9rem' }}>
              {messageSauvegarde}
            </div>
          )}
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
                onSupprimerFacture={(id) => {
                  const confirmer = window.confirm(
                    'Êtes-vous sûr de vouloir supprimer cette facture ?\n\n' +
                    'Cette action est définitive et tous les règlements associés à cette facture seront également supprimés.'
                  );
                  if (!confirmer) {
                    return;
                  }

                  supprimerFacture(id);
                  if (factureSelectionnee && factureSelectionnee.id === id) {
                    setFactureSelectionnee(null);
                  }
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
                  onDelete={(id) => {
                    const confirmer = window.confirm(
                      'Êtes-vous sûr de vouloir supprimer cette facture ?\n\n' +
                      'Cette action est définitive et tous les règlements associés à cette facture seront également supprimés.'
                    );
                    if (!confirmer) {
                      return;
                    }

                    supprimerFacture(id);
                    setFactureSelectionnee(null);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {vueActive === 'devis' && (
          <div className="app__vue-fournisseur-layout">
            <div className="app__vue-fournisseur">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1a1a1a' }}>Devis fournisseurs</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleNouveauDevis}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '1px solid #10b981',
                      borderRadius: '6px',
                      background: 'white',
                      color: '#10b981',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 500,
                    }}
                  >
                    + Nouveau devis
                  </button>
                  <button
                    type="button"
                    onClick={() => inputImportDevisRef.current?.click()}
                    style={{
                      padding: '0.5rem 1rem',
                      border: '1px solid #3b82f6',
                      borderRadius: '6px',
                      background: 'white',
                      color: '#3b82f6',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      fontWeight: 500,
                    }}
                    disabled={importEnCours}
                  >
                    Importer un devis (PDF)
                  </button>
                  <input
                    ref={inputImportDevisRef}
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      await handleImporterDevisDepuisFichiers(Array.from(files));
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              {!devisSelectionne && (
                <ListeDevis
                  devis={devisFiltres}
                  totalDevis={tousLesDevis.length}
                  factures={toutesLesFactures}
                  termeRecherche={termeRechercheDevis}
                  onTermeRechercheChange={setTermeRechercheDevis}
                  fournisseurFiltre={fournisseurFiltreDevis}
                  onFournisseurFiltreChange={setFournisseurFiltreDevis}
                  onDevisSelect={handleDevisSelect}
                  devisSelectionne={devisSelectionne}
                  onSupprimerDevis={(id) => {
                    void supprimerDevis(id);
                  }}
                />
              )}
              {erreur && (
                <div className="app__error" style={{ marginTop: '1rem' }}>
                  <p>{erreur}</p>
                </div>
              )}
            </div>
            {devisSelectionne && (
              <div className="app__vue-fournisseur-details">
                <div style={{ marginBottom: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={() => setDevisSelectionne(null)}
                    className="details-facture__modal-btn details-facture__modal-btn--secondary"
                  >
                    Retour à la liste des devis
                  </button>
                </div>
                <DetailsDevis
                  devis={devisSelectionne}
                  toutesLesFactures={toutesLesFactures}
                  onClose={() => setDevisSelectionne(null)}
                  onTransformerEnFacture={handleTransformerDevisEnFacture}
                  onUpdate={(devisModifie) => {
                    void mettreAJourDevis(devisModifie);
                    setDevisSelectionne(devisModifie);
                  }}
                />
              </div>
            )}
            {editeurDevisOuvert && (
              <EditeurDevis
                onSauvegarder={handleDevisCree}
                onFermer={() => setEditeurDevisOuvert(false)}
              />
            )}
            {fichierDevisEnAttente && (
              <div
                className="details-facture__modal-overlay"
                onClick={() => setFichierDevisEnAttente(null)}
              >
                <div
                  className="details-facture__modal"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="details-facture__modal-header">
                    <h2>Sélectionner le fournisseur du devis</h2>
                    <button
                      type="button"
                      onClick={() => setFichierDevisEnAttente(null)}
                      className="details-facture__modal-close"
                      aria-label="Fermer"
                    >
                      <X size={24} />
                    </button>
                  </div>
                  <div className="details-facture__modal-form" style={{ padding: '1.5rem' }}>
                    <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#4b5563' }}>
                      Le fournisseur n’a pas pu être détecté automatiquement dans le PDF du devis
                      <br />
                      <strong>{fichierDevisEnAttente.name}</strong>
                      <br />
                      Merci de choisir un fournisseur existant ou d’en saisir un nouveau.
                    </p>
                    <div className="details-facture__modal-section" style={{ borderBottom: 'none', padding: 0 }}>
                      <div className="details-facture__modal-grid">
                        <div className="details-facture__modal-field">
                          <label>Fournisseur existant</label>
                          <select
                            value={fournisseurManuelDevis}
                            onChange={(e) => {
                              setFournisseurManuelDevis(e.target.value);
                            }}
                          >
                            <option value="">— Choisir —</option>
                            {(() => {
                              try {
                                return obtenirFournisseurs();
                              } catch (e) {
                                console.error('Erreur lors de la récupération des fournisseurs:', e);
                                return [] as Fournisseur[];
                              }
                            })().map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="details-facture__modal-field">
                          <label>Nouveau fournisseur (si absent de la liste)</label>
                          <input
                            type="text"
                            placeholder="Nom du nouveau fournisseur"
                            value={nouveauFournisseurDevis}
                            onChange={(e) => {
                              setNouveauFournisseurDevis(e.target.value);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="details-facture__modal-footer">
                    <button
                      type="button"
                      onClick={() => setFichierDevisEnAttente(null)}
                      className="details-facture__modal-btn details-facture__modal-btn--secondary"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="details-facture__modal-btn details-facture__modal-btn--primary"
                      onClick={async () => {
                        if (!fichierDevisEnAttente) return;
                        let nom =
                          fournisseurManuelDevis ||
                          nouveauFournisseurDevis.trim();
                        if (!nom) {
                          setErreur('Veuillez choisir ou saisir un fournisseur pour le devis.');
                          return;
                        }
                        nom = nom.trim();

                        // Enregistrer éventuellement comme fournisseur personnalisé
                        try {
                          const cle = 'fournisseurs-personnalises';
                          const exist = localStorage.getItem(cle);
                          const liste: string[] = exist ? JSON.parse(exist) : [];
                          if (!liste.includes(nom)) {
                            liste.push(nom);
                            localStorage.setItem(cle, JSON.stringify(liste));
                          }
                        } catch {
                          // Ignorer les erreurs de stockage
                        }

                        try {
                          await creerDevisDepuisPDF(
                            fichierDevisEnAttente,
                            nom as Fournisseur
                          );
                          setFichierDevisEnAttente(null);
                          setFournisseurManuelDevis('');
                          setNouveauFournisseurDevis('');
                        } catch (error) {
                          const messageErreur = error instanceof Error
                            ? error.message
                            : 'Erreur lors de la création du devis';
                          setErreur(messageErreur);
                        }
                      }}
                    >
                      Valider le fournisseur
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {vueActive === 'statistiques' && (
          <div className="app__statistiques">
            <StatistiquesComponent
              factures={toutesLesFactures}
              devis={tousLesDevis}
              onVoirFacture={handleVoirFacture}
              onFournisseursMisAJour={async () => {
                // Recharger les factures et devis après renommage d'un fournisseur
                const facturesRech = chargerFactures();
                remplacerFactures(facturesRech);
                const devisRech = await chargerDevis();
                await remplacerDevis(devisRech);
              }}
            />
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
            <Reglements factures={toutesLesFactures} devis={tousLesDevis} />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;

