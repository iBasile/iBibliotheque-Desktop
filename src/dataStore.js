'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseCSV, toRecords } = require('./csvParser');

const DATA_FILE_NAME = 'bibliotheque.json';
const BUNDLED_CSV_PATH = path.join(__dirname, '..', 'data', 'bibliotheque-initiale.csv');

function normalizeHeader(h) {
  return h
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire les accents
    .replace(/[^a-zA-Z0-9]/g, '')    // retire espaces, apostrophes, etc.
    .toLowerCase();
}

// Table de correspondance des en-têtes possibles vers nos clés internes
const HEADER_MAP = {
  titre: 'titre',
  auteur: 'auteur',
  editeur: 'editeur',
  annee: 'annee',
  isbn: 'isbn',
  meuble: 'meuble',
  etagere: 'etagere',
  dateajout: 'dateAjout',
  datedajout: 'dateAjout', // "Date d'ajout" -> l'apostrophe supprimée laisse un "d" collé
};

function getDataFilePath(app) {
  return path.join(app.getPath('userData'), DATA_FILE_NAME);
}

function makeEmptyBook(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    titre: '',
    auteur: '',
    editeur: '',
    annee: '',
    isbn: '',
    meuble: '',
    etagere: '',
    dateAjout: new Date().toLocaleDateString('fr-FR'),
    etiquettes: [],
    emprunt: null, // { emprunteur, dateEmprunt, dateRetourPrevue }
    ...overrides,
  };
}

/**
 * Transforme des lignes CSV brutes en objets "livre".
 */
function rowsToBooks(headers, records) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const keyIndexes = {};
  normalizedHeaders.forEach((nh, idx) => {
    const key = HEADER_MAP[nh];
    if (key) keyIndexes[key] = idx;
  });

  const books = [];
  for (const record of records) {
    // Ignore les lignes complètement vides
    if (record.every((f) => !f || !f.trim())) continue;

    const get = (key) => {
      const idx = keyIndexes[key];
      return idx !== undefined && record[idx] !== undefined ? record[idx].trim() : '';
    };

    const titre = get('titre');
    if (!titre) continue; // une ligne sans titre n'est pas un livre exploitable

    books.push(
      makeEmptyBook({
        titre,
        auteur: get('auteur'),
        editeur: get('editeur'),
        annee: get('annee'),
        isbn: get('isbn'),
        meuble: get('meuble'),
        etagere: get('etagere'),
        dateAjout: get('dateAjout') || new Date().toLocaleDateString('fr-FR'),
      })
    );
  }
  return books;
}

function parseCSVFileContent(content) {
  const rows = parseCSV(content, ';');
  const { headers, records } = toRecords(rows);
  return rowsToBooks(headers, records);
}

/**
 * Fusionne une liste de nouveaux livres importés avec la bibliothèque existante.
 * Déduplication par ISBN (si renseigné), sinon par couple titre+auteur.
 */
function mergeImportedBooks(existingBooks, importedBooks) {
  const byIsbn = new Map();
  const byTitleAuthor = new Map();

  for (const b of existingBooks) {
    if (b.isbn) byIsbn.set(b.isbn, b);
    byTitleAuthor.set(`${b.titre.toLowerCase()}|${b.auteur.toLowerCase()}`, b);
  }

  let added = 0;
  let skipped = 0;
  const merged = [...existingBooks];

  for (const nb of importedBooks) {
    const isDupIsbn = nb.isbn && byIsbn.has(nb.isbn);
    const isDupTitleAuthor = !nb.isbn && byTitleAuthor.has(`${nb.titre.toLowerCase()}|${nb.auteur.toLowerCase()}`);

    if (isDupIsbn || isDupTitleAuthor) {
      skipped += 1;
      continue;
    }

    merged.push(nb);
    if (nb.isbn) byIsbn.set(nb.isbn, nb);
    byTitleAuthor.set(`${nb.titre.toLowerCase()}|${nb.auteur.toLowerCase()}`, nb);
    added += 1;
  }

  return { books: merged, added, skipped };
}

function loadLibrary(app) {
  const filePath = getDataFilePath(app);

  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) return data;
    } catch (err) {
      console.error('Erreur de lecture de la bibliothèque, réinitialisation :', err);
    }
  }

  // Premier lancement : on amorce la bibliothèque à partir du CSV fourni, si présent
  let initialBooks = [];
  if (fs.existsSync(BUNDLED_CSV_PATH)) {
    try {
      const content = fs.readFileSync(BUNDLED_CSV_PATH, 'utf-8');
      initialBooks = parseCSVFileContent(content);
    } catch (err) {
      console.error("Impossible d'importer le CSV initial :", err);
    }
  }

  saveLibrary(app, initialBooks);
  return initialBooks;
}

function saveLibrary(app, books) {
  const filePath = getDataFilePath(app);
  fs.writeFileSync(filePath, JSON.stringify(books, null, 2), 'utf-8');
}

module.exports = {
  getDataFilePath,
  makeEmptyBook,
  rowsToBooks,
  parseCSVFileContent,
  mergeImportedBooks,
  loadLibrary,
  saveLibrary,
};
