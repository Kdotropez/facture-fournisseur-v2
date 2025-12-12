import type { Fournisseur } from '../types/facture';

// Dictionnaire simple de traductions pour les produits, indexé par
// "FOURNISSEUR|REF|DESCRIPTION" en majuscules
const traductions: Record<string, string> = {
  // STEM – produits du devis 2026 SOUV
  'STEM|3690|BATH ROBE MAN': 'Peignoir homme',
  'STEM|3690|BATH ROBE WOMAN': 'Peignoir femme',
  'STEM|3691|MONSTER': 'Peignoir enfant MONSTER',

  'STEM|SOUV 1|PONCHO CHILD BLEU': 'Poncho enfant bleu',
  'STEM|SOUV 2-5|LIGHT TOWEL SAINT-TROPEZ': 'Drap de plage léger SAINT-TROPEZ',
  'STEM|SOUV 6-10|LIGHT TOWEL VILLAGES': 'Drap de plage léger VILLAGES',
  'STEM|SOUV 11-14|TOWEL POCHETTES SAINT-TROPEZ': 'Pochette serviette SAINT-TROPEZ',
  'STEM|SOUV 15-19|TOWEL POCHETTES VILLAGES': 'Pochette serviette VILLAGES',
  'STEM|SOUV 20-23|TOWEL BEACH BAG SAINT-TROPEZ': 'Sac de plage serviette SAINT-TROPEZ',
  'STEM|SOUV 24-28|TOWEL BEACH BAG VILLAGES': 'Sac de plage serviette VILLAGES',
  'STEM|SOUV 29-32|INFLATABLE CUSHION SAINT- TROPEZ':
    'Coussin gonflable SAINT-TROPEZ',
  'STEM|SOUV 33-37|INFLATABLE CUSHION VILLAGES': 'Coussin gonflable VILLAGES',
  'STEM|SOUV 38-39|ENSEMBLE CHEMISE + SHORT': 'Ensemble chemise + short',
  'STEM|SOUV 40-41|SHORT HOMME': 'Short homme',
  'STEM|SOUV 42-43|TOWEL MICROFIBRE': 'Serviette microfibre',
  'STEM|SOUV 44-46|BIG FOLDING': 'Serviette grande pliante',
  'STEM|SOUV 47-48|BEACH TOWEL LOGO': 'Serviette de plage avec logo',
  'STEM|SOUV 49-50|BEACH TOWEL NO LOGO': 'Serviette de plage sans logo',
  'STEM|SOUV 51|PAN DEI BAG LETTERS': 'Sac PAN DEI lettres',
  'STEM|SOUV 52|POCHETTE LETTERS': 'Pochette lettres',
  'STEM|SOUV 53|LETTERS CAP': 'Casquette lettres',
  'STEM|SOUV 54 - 55|CAP RAYÉE': 'Casquette rayée',
  'STEM|SOUV 56-59|LINEN CAP': 'Casquette en lin',
  'STEM|SOUV 60-66|INDIE CAP COTTON': 'Casquette INDIE coton',
  'STEM|SOUV 67-68|TOWEL CAP': 'Casquette serviette',
  'STEM|SOUV 69|INDIE LOGO NIKE': 'Casquette INDIE logo Nike',
  'STEM|SOUV 70 - 71|FROUFROU CAP': 'Casquette froufrou',
  'STEM|SOUV 72|INDIE LOGO BOAT': 'Casquette INDIE logo bateau',
  'STEM|SOUV 73-74|CHILD CAP': 'Casquette enfant',
  'STEM|SOUV 75-77|FROU FROU BOB': 'Bob froufrou',
  'STEM|SOUV 78-79|T SHIRT UNISEX': 'T-shirt unisexe',
  'STEM|SOUV 80-81|T SHIRT WOMAN': 'T-shirt femme',
  'STEM|SOUV 82-84|SWEAT UNISEX': 'Sweat unisexe',
  'STEM|SOUV 85-86|T SHIRT TOWEL': 'T-shirt serviette',
  'STEM|SOUV 87-91|CANDLE': 'Bougie',
  'STEM|SOUV 92-93|BIG GOURDE HANDLE': 'Grande gourde avec anse',
  'STEM|SOUV 94-95|SMALL GOURDE HANDLE': 'Petite gourde avec anse',
  'STEM|SOUV 96|COCHONNET': 'Cochonnet (pétanque)',
  'STEM|SOUV 97|ICE CUBE SET': 'Set de glaçons réutilisables',
};

export function traduireDescriptionFR(
  fournisseur: Fournisseur,
  refFournisseur: string | undefined,
  description: string
): string {
  const cle = `${fournisseur.toUpperCase()}|${(refFournisseur || '').toUpperCase()}|${description
    .toUpperCase()
    .trim()}`;

  if (traductions[cle]) {
    return traductions[cle];
  }

  // Fallback : renvoyer la description originale (tu peux ensuite la corriger à la main)
  return description;
}





