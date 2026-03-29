import type { Devis } from '../types/devis';
import type { DocumentFournisseur } from '../types/document';
import type { Facture } from '../types/facture';
import { documentDepuisDevis, documentDepuisFacture, documentVersDevis, documentVersFacture } from '../types/document';
import { DetailsDevis } from './DetailsDevis';
import { DetailsFacture } from './DetailsFacture';

interface DetailsDocumentProps {
  document: DocumentFournisseur | null;
  tousLesDocuments: DocumentFournisseur[];
  toutesLesFactures: Facture[];
  onClose: () => void;
  onUpdate?: (document: DocumentFournisseur) => void;
  onDeleteFacture?: (factureId: string) => void;
  onTransformerEnFacture?: (devis: Devis) => void;
}

export function DetailsDocument({
  document,
  tousLesDocuments,
  toutesLesFactures,
  onClose,
  onUpdate,
  onDeleteFacture,
  onTransformerEnFacture,
}: DetailsDocumentProps) {
  if (!document) {
    return null;
  }

  if (document.typeDocument === 'devis') {
    const documentsAcompte = tousLesDocuments.filter(
      (courant) =>
        courant.documentParentId === document.id && courant.natureDocument === 'demande_acompte'
    );
    const devisBase = documentVersDevis(document);
    const devis = {
      ...devisBase,
      facturesLieesIds:
        documentsAcompte.length > 0
          ? documentsAcompte.map((documentAcompte) => documentAcompte.id)
          : devisBase.facturesLieesIds,
      acomptesDemandes:
        documentsAcompte.length > 0
          ? documentsAcompte.map((documentAcompte) => ({
              id: documentAcompte.id,
              date: documentAcompte.date,
              montantTTC: documentAcompte.totalTTC || 0,
              note: `Facture enfant dependante n° ${documentAcompte.numero}`,
            }))
          : devisBase.acomptesDemandes,
    };
    return (
      <div>
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: '#eff6ff',
            color: '#1d4ed8',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          Cette facture est suivie comme une facture principale, avec ses acomptes rattachés et consolidés.
        </div>
        <DetailsDevis
          devis={devis}
          toutesLesFactures={toutesLesFactures}
          onClose={onClose}
          onTransformerEnFacture={onTransformerEnFacture}
          modeAffichage="facture_principale"
          onUpdate={
            onUpdate
              ? (devisModifie) => onUpdate(documentDepuisDevis(devisModifie))
              : undefined
          }
        />
      </div>
    );
  }

  const facture = documentVersFacture(document);
  return (
    <div>
      {(document.natureDocument === 'demande_acompte' || document.documentParentId) && (
        <div
          style={{
            marginBottom: '0.75rem',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            background: '#eff6ff',
            color: '#1d4ed8',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          {document.natureDocument === 'demande_acompte'
            ? 'Cette facture correspond à un acompte rattaché à une facture principale.'
            : 'Cette facture est rattachée à une facture principale.'}
        </div>
      )}
      <DetailsFacture
        facture={facture}
        onClose={onClose}
        onDelete={onDeleteFacture}
        onUpdate={
          onUpdate
            ? (factureModifiee) => onUpdate(documentDepuisFacture(factureModifiee))
            : undefined
        }
      />
    </div>
  );
}
