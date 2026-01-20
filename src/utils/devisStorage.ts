import type { Devis } from '../types/devis';

const DB_NAME = 'factures-fournisseurs';
const DB_VERSION = 2;
const STORE_NAME = 'devis-fournisseurs';
const STORE_DIRECTORY_HANDLES = 'directory-handles';
const KEY_DEVIS = 'devis-fournisseurs';

const ouvrirBase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(STORE_DIRECTORY_HANDLES)) {
        db.createObjectStore(STORE_DIRECTORY_HANDLES);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export async function lireDevisDepuisIdb(): Promise<Devis[]> {
  const db = await ouvrirBase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(KEY_DEVIS);
    request.onsuccess = () => resolve((request.result as Devis[]) || []);
    request.onerror = () => reject(request.error);
  });
}

export async function ecrireDevisDansIdb(devis: Devis[]): Promise<void> {
  const db = await ouvrirBase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(devis, KEY_DEVIS);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
