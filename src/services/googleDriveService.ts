/**
 * Service pour l'export automatique de la sauvegarde globale vers Google Drive
 *
 * Nécessite la configuration des variables d'environnement Vite :
 * - VITE_GOOGLE_DRIVE_CLIENT_ID
 * - VITE_GOOGLE_DRIVE_API_KEY
 *
 * Et l'activation de l'API Drive v3 dans le projet Google Cloud.
 */

import type { SauvegardeGlobale } from './sauvegardeGlobaleService';

declare global {
  interface Window {
    gapi?: any;
  }
}

const GOOGLE_API_SRC = 'https://apis.google.com/js/api.js';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'];

const CLIENT_ID = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID as string | undefined;
const API_KEY = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY as string | undefined;

let gapiCharge = false;
let initialisationEnCours: Promise<void> | null = null;

async function chargerGapi(): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Google Drive non disponible côté serveur.');
  }

  if (gapiCharge) return;

  if (!initialisationEnCours) {
    initialisationEnCours = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GOOGLE_API_SRC;
      script.async = true;
      script.onload = () => {
        if (!window.gapi) {
          reject(new Error('gapi non disponible après chargement du script.'));
          return;
        }
        window.gapi.load('client:auth2', async () => {
          try {
            await window.gapi.client.init({
              apiKey: API_KEY,
              clientId: CLIENT_ID,
              discoveryDocs: DRIVE_DISCOVERY_DOCS,
              scope: DRIVE_SCOPE,
            });
            gapiCharge = true;
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      };
      script.onerror = () => reject(new Error('Impossible de charger le script Google API.'));
      document.body.appendChild(script);
    });
  }

  return initialisationEnCours;
}

async function assurerConnexion(): Promise<void> {
  if (!window.gapi) {
    throw new Error('gapi non initialisé.');
  }
  const auth2 = window.gapi.auth2.getAuthInstance();
  if (!auth2) {
    throw new Error('Auth2 non disponible.');
  }
  const isSignedIn = auth2.isSignedIn.get();
  if (!isSignedIn) {
    await auth2.signIn();
  }
}

/**
 * Crée (ou récupère) un dossier dédié dans Google Drive.
 */
async function obtenirOuCreerDossier(nomDossier: string): Promise<string> {
  const gapi = window.gapi;

  // Chercher un dossier existant avec ce nom à la racine
  const res = await gapi.client.drive.files.list({
    q: `mimeType = 'application/vnd.google-apps.folder' and name = '${nomDossier.replace(
      /'/g,
      "\\'"
    )}' and 'root' in parents and trashed = false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  const files = res.result.files;
  if (files && files.length > 0) {
    return files[0].id;
  }

  // Créer le dossier sinon
  const createRes = await gapi.client.drive.files.create({
    resource: {
      name: nomDossier,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['root'],
    },
    fields: 'id',
  });

  return createRes.result.id as string;
}

/**
 * Envoie un fichier JSON dans un dossier Drive.
 */
async function uploaderJsonDansDossier(
  dossierId: string,
  nomFichier: string,
  contenu: string
): Promise<void> {
  const gapi = window.gapi;

  const boundary = '-------314159265358979323846';
  const delimiter = '\r\n--' + boundary + '\r\n';
  const closeDelimiter = '\r\n--' + boundary + '--';

  const metadata = {
    name: nomFichier,
    mimeType: 'application/json',
    parents: [dossierId],
  };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    contenu +
    closeDelimiter;

  await gapi.client.request({
    path: '/upload/drive/v3/files',
    method: 'POST',
    params: { uploadType: 'multipart' },
    headers: {
      'Content-Type': 'multipart/related; boundary=' + boundary,
    },
    body: multipartRequestBody,
  });
}

/**
 * Exporte une sauvegarde globale vers Google Drive dans le dossier spécifié.
 */
export async function exporterSauvegardeVersGoogleDrive(
  sauvegarde: SauvegardeGlobale,
  nomDossier: string = 'factures fournisseur'
): Promise<void> {
  if (!CLIENT_ID || !API_KEY) {
    throw new Error(
      'Google Drive n’est pas configuré (VITE_GOOGLE_DRIVE_CLIENT_ID ou VITE_GOOGLE_DRIVE_API_KEY manquant).'
    );
  }

  await chargerGapi();
  await assurerConnexion();

  const dossierId = await obtenirOuCreerDossier(nomDossier);
  const contenu = JSON.stringify(sauvegarde, null, 2);
  const nomFichier = `backup-complet-${new Date().toISOString().slice(0, 10)}.json`;

  await uploaderJsonDansDossier(dossierId, nomFichier, contenu);
}


