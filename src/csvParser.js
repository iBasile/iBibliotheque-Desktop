'use strict';

/**
 * Parseur CSV minimaliste mais robuste, sans dépendance externe.
 * Gère : délimiteur configurable, champs entre guillemets, guillemets échappés (""),
 * retours à la ligne à l'intérieur des champs, CRLF/LF, BOM UTF-8, lignes vides.
 *
 * @param {string} text - contenu brut du fichier CSV
 * @param {string} delimiter - séparateur de colonnes (par défaut ';')
 * @returns {string[][]} tableau de lignes, chaque ligne étant un tableau de champs
 */
function parseCSV(text, delimiter = ';') {
  // Retire le BOM UTF-8 éventuel
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // On ignore les lignes totalement vides (un seul champ vide)
    const isEmptyRow = row.length === 1 && row[0].trim() === '';
    if (!isEmptyRow) rows.push(row);
    row = [];
  };

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === delimiter) {
      pushField();
      i += 1;
      continue;
    }

    if (char === '\r') {
      // Gère \r\n et \r seul
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }

    if (char === '\n') {
      pushRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  // Dernière ligne si le fichier ne se termine pas par un saut de ligne
  if (field.length > 0 || row.length > 0) {
    pushRow();
  }

  return rows;
}

/**
 * Convertit un tableau de lignes CSV (avec en-tête) en tableau d'objets.
 * @param {string[][]} rows
 * @returns {{headers: string[], records: string[][]}}
 */
function toRecords(rows) {
  if (rows.length === 0) return { headers: [], records: [] };
  const [headers, ...records] = rows;
  return { headers, records };
}

module.exports = { parseCSV, toRecords };
