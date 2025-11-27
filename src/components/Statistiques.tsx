/**
 * Composant d'affichage des statistiques (fournisseurs / produits)
 */

import { useEffect, useMemo, useState } from 'react';
import { TrendingUp, FileText, Building2, Euro, List, Layers, Eye } from 'lucide-react';
import type { Facture, Fournisseur, Statistiques } from '../types/facture';
import './Statistiques.css';

interface StatistiquesProps {
  factures: Facture[];
  onVoirFacture?: (facture: Facture) => void;
}

interface FactureFiltrée {
  facture: Facture;
  lignes: Facture['lignes'];
  totalHTLignes: number;
  totalTVALignes: number;
  totalTTCLignes: number;
}

interface LigneProduitDetail {
  id: string;
  numero: string;
  date: Date;
  quantite: number;
  montantHT: number;
  description: string;
}

interface ProduitStatsDetail {
  ref: string;
  description: string;
  logo?: string;
  quantiteTotale: number;
  montantHTTotal: number;
  lignes: LigneProduitDetail[];
}

type FournisseurProduits = Record<string, ProduitStatsDetail>;

type SensTri = 'asc' | 'desc';
type ColonneFournisseur = 'nom' | 'factures' | 'ht' | 'tva' | 'ttc';
type ColonneProduit = 'ref' | 'description' | 'logo' | 'quantite' | 'montant' | 'dernier';
type ColonneDetail = 'facture' | 'date' | 'quantite' | 'montant';

const fournisseursInitial: Record<
  Fournisseur,
  { nombre: number; totalHT: number; totalTVA: number; totalTTC: number }
> = {
  'RB DRINKS': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
  'LEHMANN F': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
  'ITALESSE': { nombre: 0, totalHT: 0, totalTVA: 0, totalTTC: 0 },
};

export function StatistiquesComponent({ factures, onVoirFacture }: StatistiquesProps) {
  const formaterMontant = (montant: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(montant);

  const formaterDate = (date: Date) =>
    new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);

  const [filtreDateDebut, setFiltreDateDebut] = useState('');
  const [filtreDateFin, setFiltreDateFin] = useState('');
  const [filtreRecherche, setFiltreRecherche] = useState('');

  const [triFournisseur, setTriFournisseur] = useState<{ colonne: ColonneFournisseur; sens: SensTri }>({
    colonne: 'ht',
    sens: 'desc',
  });
  const [triProduit, setTriProduit] = useState<{ colonne: ColonneProduit; sens: SensTri }>({
    colonne: 'montant',
    sens: 'desc',
  });
  const [triDetail, setTriDetail] = useState<{ colonne: ColonneDetail; sens: SensTri }>({
    colonne: 'date',
    sens: 'desc',
  });

  const [fournisseurSelectionne, setFournisseurSelectionne] = useState<string | null>(null);
  const [produitSelectionne, setProduitSelectionne] = useState<string | null>(null);

  const [traductions, setTraductions] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = window.localStorage.getItem('factures-traductions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('factures-traductions', JSON.stringify(traductions));
    } catch {
      // ignore
    }
  }, [traductions]);

  const facturesFiltrees = useMemo<FactureFiltrée[]>(() => {
    const debut = filtreDateDebut ? new Date(`${filtreDateDebut}T00:00:00`) : null;
    const fin = filtreDateFin ? new Date(`${filtreDateFin}T23:59:59`) : null;
    const recherche = filtreRecherche.trim().toLowerCase();

    return factures.reduce<FactureFiltrée[]>((acc, facture) => {
      const dateFacture = facture.date instanceof Date ? facture.date : new Date(facture.date);
      if (debut && dateFacture < debut) return acc;
      if (fin && dateFacture > fin) return acc;

      const lignesFiltrees = facture.lignes.filter((ligne) => {
        if (!recherche) return true;
        const ref = ligne.refFournisseur?.toLowerCase() || '';
        const desc = ligne.description.toLowerCase();
        return ref.includes(recherche) || desc.includes(recherche);
      });

      if (lignesFiltrees.length === 0) return acc;

      const totalHTLignes = lignesFiltrees.reduce((sum, ligne) => sum + ligne.montantHT, 0);
      const ratio = facture.totalHT > 0 ? Math.min(1, totalHTLignes / facture.totalHT) : 0;
      const totalTVALignes = facture.totalTVA * ratio;
      const totalTTCLignes = totalHTLignes + totalTVALignes;

      acc.push({
        facture,
        lignes: lignesFiltrees,
        totalHTLignes,
        totalTVALignes,
        totalTTCLignes,
      });
      return acc;
    }, []);
  }, [factures, filtreDateDebut, filtreDateFin, filtreRecherche]);

  const statistiquesFiltrees = useMemo<Statistiques>(() => {
    const base: Statistiques = {
      nombreFactures: 0,
      totalHT: 0,
      totalTVA: 0,
      totalTTC: 0,
      parFournisseur: JSON.parse(JSON.stringify(fournisseursInitial)) as typeof fournisseursInitial,
    };

    facturesFiltrees.forEach(({ facture, totalHTLignes, totalTVALignes, totalTTCLignes }) => {
      base.nombreFactures += 1;
      base.totalHT += totalHTLignes;
      base.totalTVA += totalTVALignes;
      base.totalTTC += totalTTCLignes;

      const statsFournisseur = base.parFournisseur[facture.fournisseur];
      statsFournisseur.nombre += 1;
      statsFournisseur.totalHT += totalHTLignes;
      statsFournisseur.totalTVA += totalTVALignes;
      statsFournisseur.totalTTC += totalTTCLignes;
    });

    return base;
  }, [facturesFiltrees]);

  const detailsParFournisseur = useMemo<Record<string, FournisseurProduits>>(() => {
    const result: Record<string, FournisseurProduits> = {};

    facturesFiltrees.forEach(({ facture, lignes }) => {
      if (!result[facture.fournisseur]) {
        result[facture.fournisseur] = {};
      }
      const produits = result[facture.fournisseur];

      lignes.forEach((ligne) => {
        if (!ligne.refFournisseur) return;
        const ref = ligne.refFournisseur;
        if (!produits[ref]) {
          produits[ref] = {
            ref,
            description: ligne.description,
            logo: ligne.logo,
            quantiteTotale: 0,
            montantHTTotal: 0,
            lignes: [],
          };
        }

        const detail = produits[ref];
        if (!detail.description && ligne.description) {
          detail.description = ligne.description;
        }
        if (!detail.logo && ligne.logo) {
          detail.logo = ligne.logo;
        }

        detail.quantiteTotale += ligne.quantite;
        detail.montantHTTotal += ligne.montantHT;
        detail.lignes.push({
          id: facture.id,
          numero: facture.numero,
          date: facture.date instanceof Date ? facture.date : new Date(facture.date),
          quantite: ligne.quantite,
          montantHT: ligne.montantHT,
          description: ligne.description,
        });
      });
    });

    return result;
  }, [facturesFiltrees]);

  const fournisseursStats = useMemo(() => {
    return (Object.entries(statistiquesFiltrees.parFournisseur) as Array<
      [string, (typeof statistiquesFiltrees.parFournisseur)[keyof typeof statistiquesFiltrees.parFournisseur]]
    >).filter(([, stats]) => stats.nombre > 0);
  }, [statistiquesFiltrees]);

  const fournisseursTries = useMemo(() => {
    const copie = [...fournisseursStats];
    copie.sort((a, b) => {
      const [nomA, statsA] = a;
      const [nomB, statsB] = b;
      const sens = triFournisseur.sens === 'asc' ? 1 : -1;

      const valeur = (nom: string, stats: typeof statsA): number | string => {
        switch (triFournisseur.colonne) {
          case 'nom':
            return nom;
          case 'factures':
            return stats.nombre;
          case 'ht':
            return stats.totalHT;
          case 'tva':
            return stats.totalTVA;
          case 'ttc':
            return stats.totalTTC;
          default:
            return nom;
        }
      };

      const valeurA = valeur(nomA, statsA);
      const valeurB = valeur(nomB, statsB);

      if (typeof valeurA === 'string' && typeof valeurB === 'string') {
        return valeurA.localeCompare(valeurB) * sens;
      }

      return ((valeurA as number) - (valeurB as number)) * sens;
    });
    return copie;
  }, [fournisseursStats, triFournisseur]);

  useEffect(() => {
    if (!fournisseurSelectionne || !fournisseursTries.some(([nom]) => nom === fournisseurSelectionne)) {
      const premier = fournisseursTries[0]?.[0] ?? null;
      if (premier !== fournisseurSelectionne) {
        setFournisseurSelectionne(premier);
        setProduitSelectionne(null);
      }
    }
  }, [fournisseurSelectionne, fournisseursTries]);

  const produitsDuFournisseur =
    fournisseurSelectionne && detailsParFournisseur[fournisseurSelectionne]
      ? Object.values(detailsParFournisseur[fournisseurSelectionne])
      : [];

  const produitsTries = useMemo(() => {
    const copie = [...produitsDuFournisseur];
    copie.sort((a, b) => {
      const sens = triProduit.sens === 'asc' ? 1 : -1;
      const valeur = (produit: ProduitStatsDetail): number | string => {
        switch (triProduit.colonne) {
          case 'ref':
            return produit.ref;
          case 'description':
            return produit.description;
          case 'logo':
            return produit.logo || '';
          case 'quantite':
            return produit.quantiteTotale;
          case 'montant':
            return produit.montantHTTotal;
          case 'dernier': {
            const derniere = [...produit.lignes].sort((x, y) => y.date.getTime() - x.date.getTime())[0];
            return derniere ? derniere.date.getTime() : 0;
          }
          default:
            return produit.montantHTTotal;
        }
      };

      const valeurA = valeur(a);
      const valeurB = valeur(b);

      if (typeof valeurA === 'string' && typeof valeurB === 'string') {
        return valeurA.localeCompare(valeurB) * sens;
      }

      return ((valeurA as number) - (valeurB as number)) * sens;
    });
    return copie;
  }, [produitsDuFournisseur, triProduit]);

  useEffect(() => {
    if (produitSelectionne && !produitsTries.some((p) => p.ref === produitSelectionne)) {
      setProduitSelectionne(null);
    }
  }, [produitSelectionne, produitsTries]);

  const produitDetail =
    fournisseurSelectionne && produitSelectionne
      ? detailsParFournisseur[fournisseurSelectionne]?.[produitSelectionne]
      : undefined;

  const lignesDetailTriees = useMemo(() => {
    if (!produitDetail) return [];
    const copie = [...produitDetail.lignes];
    copie.sort((a, b) => {
      const sens = triDetail.sens === 'asc' ? 1 : -1;
      const valeur = (ligne: LigneProduitDetail): number | string => {
        switch (triDetail.colonne) {
          case 'facture':
            return ligne.numero;
          case 'date':
            return ligne.date.getTime();
          case 'quantite':
            return ligne.quantite;
          case 'montant':
            return ligne.montantHT;
          default:
            return ligne.date.getTime();
        }
      };

      const valeurA = valeur(a);
      const valeurB = valeur(b);

      if (typeof valeurA === 'string' && typeof valeurB === 'string') {
        return valeurA.localeCompare(valeurB) * sens;
      }

      return ((valeurA as number) - (valeurB as number)) * sens;
    });
    return copie;
  }, [produitDetail, triDetail]);

  const totalQuantiteProduits = produitsTries.reduce((sum, produit) => sum + produit.quantiteTotale, 0);
  const totalMontantProduits = produitsTries.reduce((sum, produit) => sum + produit.montantHTTotal, 0);

  const changerTri = <T extends ColonneFournisseur | ColonneProduit | ColonneDetail>(
    courant: { colonne: T; sens: SensTri },
    colonne: T,
    setter: (tri: { colonne: T; sens: SensTri }) => void
  ) => {
    setter({
      colonne,
      sens: courant.colonne === colonne && courant.sens === 'desc' ? 'asc' : 'desc',
    });
  };

  const renderTri = (courant: { colonne: string; sens: SensTri }, colonne: string) => {
    if (courant.colonne !== colonne) return null;
    return courant.sens === 'asc' ? '▲' : '▼';
  };

  const handleTraductionChange = (ref: string, valeur: string) => {
    setTraductions((prev) => ({
      ...prev,
      [ref]: valeur,
    }));
  };

  return (
    <div className="statistiques">
      <div className="statistiques__header">
        <h2>Statistiques</h2>
      </div>

      <div className="statistiques__cards">
        <div className="statistiques__card statistiques__card--primary">
          <div className="statistiques__card-icon">
            <FileText size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Factures (filtrées)</span>
            <span className="statistiques__card-value">{statistiquesFiltrees.nombreFactures}</span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <Euro size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total HT</span>
            <span className="statistiques__card-value">{formaterMontant(statistiquesFiltrees.totalHT)}</span>
          </div>
        </div>
        <div className="statistiques__card">
          <div className="statistiques__card-icon">
            <TrendingUp size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total TVA</span>
            <span className="statistiques__card-value">{formaterMontant(statistiquesFiltrees.totalTVA)}</span>
          </div>
        </div>
        <div className="statistiques__card statistiques__card--highlight">
          <div className="statistiques__card-icon">
            <Euro size={24} />
          </div>
          <div className="statistiques__card-content">
            <span className="statistiques__card-label">Total TTC</span>
            <span className="statistiques__card-value statistiques__card-value--large">
              {formaterMontant(statistiquesFiltrees.totalTTC)}
            </span>
          </div>
        </div>
      </div>

      <div className="statistiques__filters">
        <div className="statistiques__filters-group">
          <label>
            Date début
            <input type="date" value={filtreDateDebut} onChange={(e) => setFiltreDateDebut(e.target.value)} />
          </label>
          <label>
            Date fin
            <input type="date" value={filtreDateFin} onChange={(e) => setFiltreDateFin(e.target.value)} />
          </label>
        </div>
        <div className="statistiques__filters-group">
          <label>
            Recherche article ou réf.
            <input
              type="text"
              placeholder="Ex : SAINT TROPEZ, VELA..."
              value={filtreRecherche}
              onChange={(e) => setFiltreRecherche(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="statistiques__section">
        <h3 className="statistiques__section-title">
          <Building2 size={20} />
          Fournisseurs & produits
        </h3>

        <div className="statistiques__panels">
          <div className="statistiques__panel">
            <div className="statistiques__panel-header">
              <List size={18} />
              <span>Fournisseurs</span>
            </div>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th onClick={() => changerTri(triFournisseur, 'nom', setTriFournisseur)}>
                    Fournisseur {renderTri(triFournisseur, 'nom')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'factures', setTriFournisseur)}>
                    Factures {renderTri(triFournisseur, 'factures')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'ht', setTriFournisseur)}>
                    Total HT {renderTri(triFournisseur, 'ht')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'tva', setTriFournisseur)}>
                    TVA {renderTri(triFournisseur, 'tva')}
                  </th>
                  <th onClick={() => changerTri(triFournisseur, 'ttc', setTriFournisseur)}>
                    TTC {renderTri(triFournisseur, 'ttc')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {fournisseursTries.map(([fournisseur, stats]) => (
                  <tr
                    key={fournisseur}
                    className={
                      fournisseurSelectionne === fournisseur ? 'statistiques__table-row--active' : undefined
                    }
                    onClick={() => {
                      setFournisseurSelectionne(fournisseur);
                      setProduitSelectionne(null);
                    }}
                  >
                    <td>{fournisseur}</td>
                    <td>{stats.nombre}</td>
                    <td>{formaterMontant(stats.totalHT)}</td>
                    <td>{formaterMontant(stats.totalTVA)}</td>
                    <td>{formaterMontant(stats.totalTTC)}</td>
                  </tr>
                ))}
                {fournisseursTries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="statistiques__empty">
                      Aucune facture ne correspond aux critères.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {fournisseurSelectionne && (
            <div className="statistiques__panel">
              <div className="statistiques__panel-header">
                <Layers size={18} />
                <span>Produits – {fournisseurSelectionne}</span>
              </div>
              <table className="statistiques__table">
                <thead>
                  <tr>
                    <th onClick={() => changerTri(triProduit, 'ref', setTriProduit)}>
                      Réf. {renderTri(triProduit, 'ref')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'description', setTriProduit)}>
                      Description {renderTri(triProduit, 'description')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'logo', setTriProduit)}>
                      Logo {renderTri(triProduit, 'logo')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'quantite', setTriProduit)}>
                      Quantité {renderTri(triProduit, 'quantite')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'montant', setTriProduit)}>
                      Montant HT {renderTri(triProduit, 'montant')}
                    </th>
                    <th onClick={() => changerTri(triProduit, 'dernier', setTriProduit)}>
                      Dernier achat {renderTri(triProduit, 'dernier')}
                    </th>
                    {fournisseurSelectionne === 'ITALESSE' && <th>Traduction</th>}
                  </tr>
                </thead>
                <tbody>
                  {produitsTries.map((produit) => {
                    const derniereLigne = [...produit.lignes].sort(
                      (a, b) => b.date.getTime() - a.date.getTime()
                    )[0];
                    return (
                      <tr
                        key={produit.ref}
                        className={
                          produitSelectionne === produit.ref ? 'statistiques__table-row--active' : undefined
                        }
                        onClick={() => setProduitSelectionne(produit.ref)}
                      >
                        <td>{produit.ref}</td>
                        <td>{produit.description}</td>
                        <td>{produit.logo || '-'}</td>
                        <td>{produit.quantiteTotale}</td>
                        <td>{formaterMontant(produit.montantHTTotal)}</td>
                        <td>
                          {derniereLigne
                            ? `${derniereLigne.numero} – ${formaterDate(derniereLigne.date)}`
                            : '—'}
                        </td>
                        {fournisseurSelectionne === 'ITALESSE' && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              placeholder="Traduction"
                              value={traductions[produit.ref] || ''}
                              onChange={(event) => handleTraductionChange(produit.ref, event.target.value)}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {produitsTries.length === 0 && (
                    <tr>
                      <td colSpan={fournisseurSelectionne === 'ITALESSE' ? 7 : 6} className="statistiques__empty">
                        Aucun produit ne correspond aux critères.
                      </td>
                    </tr>
                  )}
                </tbody>
                {produitsTries.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td>{totalQuantiteProduits}</td>
                      <td>{formaterMontant(totalMontantProduits)}</td>
                      <td colSpan={fournisseurSelectionne === 'ITALESSE' ? 2 : 1}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

        {fournisseurSelectionne && produitDetail && (
          <div className="statistiques__panel statistiques__panel--full">
            <div className="statistiques__panel-header">
              <Eye size={18} />
              <span>
                Détail produit – {produitDetail.ref} ({produitDetail.description})
              </span>
            </div>
            <div className="statistiques__panel-summary">
              <div>
                <span>Quantité totale</span>
                <strong>{produitDetail.quantiteTotale}</strong>
              </div>
              <div>
                <span>Montant total HT</span>
                <strong>{formaterMontant(produitDetail.montantHTTotal)}</strong>
              </div>
              <div>
                <span>Logo</span>
                <strong>{produitDetail.logo || '-'}</strong>
              </div>
              {fournisseurSelectionne === 'ITALESSE' && (
                <div>
                  <span>Traduction</span>
                  <strong>{traductions[produitDetail.ref] || 'Aucune'}</strong>
                </div>
              )}
            </div>
            <table className="statistiques__table">
              <thead>
                <tr>
                  <th onClick={() => changerTri(triDetail, 'facture', setTriDetail)}>
                    Facture {renderTri(triDetail, 'facture')}
                  </th>
                  <th onClick={() => changerTri(triDetail, 'date', setTriDetail)}>
                    Date {renderTri(triDetail, 'date')}
                  </th>
                  <th onClick={() => changerTri(triDetail, 'quantite', setTriDetail)}>
                    Quantité {renderTri(triDetail, 'quantite')}
                  </th>
                  <th onClick={() => changerTri(triDetail, 'montant', setTriDetail)}>
                    Montant HT {renderTri(triDetail, 'montant')}
                  </th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lignesDetailTriees.map((ligne) => {
                  const facture = factures.find((f) => f.id === ligne.id);
                  return (
                    <tr key={`${ligne.id}-${ligne.numero}-${ligne.date.getTime()}`}>
                      <td>{ligne.numero}</td>
                      <td>{formaterDate(ligne.date)}</td>
                      <td>{ligne.quantite}</td>
                      <td>{formaterMontant(ligne.montantHT)}</td>
                      <td>
                        <button
                          type="button"
                          className="statistiques__action-btn"
                          onClick={() => facture && onVoirFacture?.(facture)}
                        >
                          Voir
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {lignesDetailTriees.length === 0 && (
                  <tr>
                    <td colSpan={5} className="statistiques__empty">
                      Aucune facture correspondante.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

