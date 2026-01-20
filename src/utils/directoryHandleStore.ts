const DB_NAME = 'factures-fournisseurs';
const DB_VERSION = 2;
const STORE_NAME = 'directory-handles';
const STORE_DEVIS = 'devis-fournisseurs';
const KEY_BACKUP_DIRECTORY = 'backup-directory-handle';

type DirectoryHandle = {
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
  queryPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<string>;
  requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<string>;
};

const ouvrirBase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STORE_DEVIS)) {
        db.createObjectStore(STORE_DEVIS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export async function sauvegarderHandleDossierSauvegarde(handle: DirectoryHandle): Promise<void> {
  const db = await ouvrirBase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, KEY_BACKUP_DIRECTORY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function chargerHandleDossierSauvegarde(): Promise<DirectoryHandle | null> {
  const db = await ouvrirBase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(KEY_BACKUP_DIRECTORY);
    request.onsuccess = () => resolve((request.result as DirectoryHandle) || null);
    request.onerror = () => reject(request.error);
  });
}

export async function demanderDossierSauvegarde(): Promise<DirectoryHandle | null> {
  const picker = (window as { showDirectoryPicker?: () => Promise<DirectoryHandle> }).showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker();
  await sauvegarderHandleDossierSauvegarde(handle);
  return handle;
}

export async function verifierPermissionDossier(handle: DirectoryHandle): Promise<boolean> {
  if (!handle.queryPermission || !handle.requestPermission) {
    return true;
  }
  const permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission === 'granted') {
    return true;
  }
  const demande = await handle.requestPermission({ mode: 'readwrite' });
  return demande === 'granted';
}
