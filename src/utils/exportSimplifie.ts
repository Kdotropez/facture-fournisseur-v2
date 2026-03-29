export interface ExportLigneSimple {
  ref?: string;
  nom: string;
  nomFR?: string;
  logo?: string;
  quantiteDevis?: number | string;
  quantiteFacture?: number | string;
  prixUnitaire?: number | string;
}

const escapeCSV = (valeur: unknown) => {
  if (valeur === null || valeur === undefined) return '';
  const texte = String(valeur);
  if (/[;"\n]/.test(texte)) {
    return `"${texte.replace(/"/g, '""')}"`;
  }
  return texte;
};

const formatNombreCSV = (valeur: unknown) => {
  if (valeur === null || valeur === undefined || valeur === '') return '';
  const n = typeof valeur === 'number' ? valeur : Number(String(valeur).replace(',', '.'));
  if (!Number.isFinite(n)) return String(valeur);
  return String(n).replace('.', ',');
};

export const telechargerCSVSimple = (nomFichier: string, lignes: ExportLigneSimple[]) => {
  const entetes = ['Ref', 'Nom', 'Nom FR', 'Logo', 'Qte devis', 'Qte facture', 'PU HT (€)'];
  const lignesCSV = [
    'sep=;',
    entetes.join(';'),
    ...lignes.map((ligne) =>
      [
        escapeCSV(ligne.ref || ''),
        escapeCSV(ligne.nom),
        escapeCSV(ligne.nomFR || ''),
        escapeCSV(ligne.logo || ''),
        escapeCSV(formatNombreCSV(ligne.quantiteDevis ?? '')),
        escapeCSV(formatNombreCSV(ligne.quantiteFacture ?? '')),
        escapeCSV(formatNombreCSV(ligne.prixUnitaire ?? '')),
      ].join(';')
    ),
  ];
  const contenu = lignesCSV.join('\r\n');

  // Excel Windows lit beaucoup plus fiablement le CSV en UTF-16LE avec BOM.
  const bytes = new Uint8Array(2 + contenu.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < contenu.length; i += 1) {
    const code = contenu.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[3 + i * 2] = code >> 8;
  }

  const blob = new Blob([bytes], { type: 'text/csv;charset=utf-16le;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier.endsWith('.csv') ? nomFichier : `${nomFichier}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const formaterNombre = (valeur: unknown) => {
  if (valeur === null || valeur === undefined || valeur === '') return '—';
  const n = typeof valeur === 'number' ? valeur : Number(String(valeur).replace(',', '.'));
  if (!Number.isFinite(n)) return String(valeur);
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(n);
};

export const imprimerPdfSimple = (
  titre: string,
  meta: string[],
  lignes: ExportLigneSimple[]
) => {
  const fenetre = window.open('', '_blank', 'width=900,height=700');
  if (!fenetre) return;

  const lignesHTML = lignes
    .map(
      (ligne) => `
        <tr>
          <td>${ligne.ref || ''}</td>
          <td>${ligne.nom}</td>
          <td>${ligne.nomFR || ''}</td>
          <td>${ligne.logo || ''}</td>
          <td class="num">${formaterNombre(ligne.quantiteDevis)}</td>
          <td class="num">${formaterNombre(ligne.quantiteFacture)}</td>
          <td class="num">${formaterNombre(ligne.prixUnitaire)}</td>
        </tr>
      `
    )
    .join('');

  const metaHTML = meta.map((m) => `<div class="meta">${m}</div>`).join('');

  fenetre.document.write(`
    <html>
      <head>
        <title>${titre}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
          h1 { font-size: 20px; margin: 0 0 8px; }
          .meta { font-size: 12px; color: #555; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; font-size: 12px; }
          th { background: #f3f4f6; text-align: left; }
          td.num { text-align: right; }
        </style>
      </head>
      <body>
        <h1>${titre}</h1>
        ${metaHTML}
        <table>
          <thead>
            <tr>
              <th>Ref</th>
              <th>Nom</th>
              <th>Nom FR</th>
              <th>Logo</th>
              <th>Qte devis</th>
              <th>Qte facture</th>
              <th>PU HT</th>
            </tr>
          </thead>
          <tbody>
            ${lignesHTML}
          </tbody>
        </table>
      </body>
    </html>
  `);
  fenetre.document.close();
  fenetre.focus();
  fenetre.print();
};
