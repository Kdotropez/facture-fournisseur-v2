/**
 * Utilitaires liés à la lecture des fichiers côté client
 */

/**
 * Lit un fichier et renvoie un Data URL (base64) pour pouvoir l'afficher plus tard
 */
export function lireFichierEnDataURL(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();

    lecteur.onload = () => {
      const resultat = lecteur.result;
      if (typeof resultat === 'string') {
        resolve(resultat);
      } else {
        reject(new Error('Lecture du fichier impossible (format inattendu).'));
      }
    };

    lecteur.onerror = () => {
      reject(new Error('Erreur lors de la lecture du fichier PDF.'));
    };

    lecteur.readAsDataURL(fichier);
  });
}



