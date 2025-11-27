/**
 * Composant d'import de fichiers PDF avec drag & drop
 */

import { useRef, useState, useCallback } from 'react';
import { Upload, X, FileText, AlertCircle } from 'lucide-react';
import type { Fournisseur } from '../types/facture';
import { obtenirFournisseurs } from '@parsers/index';
import './ImportPDF.css';

interface ImportPDFProps {
  onImport: (fichiers: File[], fournisseur?: Fournisseur) => Promise<void>;
  importEnCours?: boolean;
}

export function ImportPDF({ onImport, importEnCours = false }: ImportPDFProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fichiersSelectionnes, setFichiersSelectionnes] = useState<File[]>([]);
  const [fournisseurSelectionne, setFournisseurSelectionne] = useState<Fournisseur | ''>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const fichiers = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' || f.name.endsWith('.pdf')
    );

    if (fichiers.length > 0) {
      setFichiersSelectionnes(prev => [...prev, ...fichiers]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fichiers = Array.from(e.target.files || []).filter(f =>
      f.type === 'application/pdf' || f.name.endsWith('.pdf')
    );

    if (fichiers.length > 0) {
      setFichiersSelectionnes(prev => [...prev, ...fichiers]);
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFichiersSelectionnes(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleImport = useCallback(async () => {
    if (fichiersSelectionnes.length === 0) return;

    const fournisseur = fournisseurSelectionne || undefined;
    await onImport(fichiersSelectionnes, fournisseur);
    setFichiersSelectionnes([]);
    setFournisseurSelectionne('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, [fichiersSelectionnes, fournisseurSelectionne, onImport]);

  const handleClear = useCallback(() => {
    setFichiersSelectionnes([]);
    setFournisseurSelectionne('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  }, []);

  return (
    <div className="import-pdf">
      <div className="import-pdf__header">
        <h2>Importer des factures PDF</h2>
        <p>Glissez-déposez vos fichiers PDF ou cliquez pour sélectionner</p>
      </div>

      <div
        className={`import-pdf__dropzone ${isDragging ? 'import-pdf__dropzone--dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={48} className="import-pdf__icon" />
        <p className="import-pdf__text">
          {isDragging ? 'Déposez les fichiers ici' : 'Cliquez ou glissez-déposez vos fichiers PDF'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleFileSelect}
          className="import-pdf__input"
        />
      </div>

      {fichiersSelectionnes.length > 0 && (
        <div className="import-pdf__files">
          <div className="import-pdf__files-header">
            <h3>Fichiers sélectionnés ({fichiersSelectionnes.length})</h3>
            <button
              type="button"
              onClick={handleClear}
              className="import-pdf__clear-btn"
              disabled={importEnCours}
            >
              <X size={16} />
              Tout effacer
            </button>
          </div>

          <div className="import-pdf__fournisseur-select">
            <label htmlFor="fournisseur-select">
              Fournisseur (optionnel - sera détecté automatiquement si non spécifié)
            </label>
            <select
              id="fournisseur-select"
              value={fournisseurSelectionne}
              onChange={(e) => setFournisseurSelectionne(e.target.value as Fournisseur | '')}
              disabled={importEnCours}
            >
              <option value="">Auto-détection</option>
              {obtenirFournisseurs().map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          <ul className="import-pdf__file-list">
            {fichiersSelectionnes.map((fichier, index) => (
              <li key={`${fichier.name}-${index}`} className="import-pdf__file-item">
                <FileText size={20} />
                <span className="import-pdf__file-name">{fichier.name}</span>
                <span className="import-pdf__file-size">
                  {(fichier.size / 1024).toFixed(2)} KB
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(index);
                  }}
                  className="import-pdf__remove-btn"
                  disabled={importEnCours}
                  aria-label="Supprimer"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>

          <div className="import-pdf__actions">
            <button
              type="button"
              onClick={handleImport}
              className="import-pdf__import-btn"
              disabled={importEnCours || fichiersSelectionnes.length === 0}
            >
              {importEnCours ? 'Import en cours...' : `Importer ${fichiersSelectionnes.length} fichier(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}



