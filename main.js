'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./src/dataStore');

let mainWindow;
let library = []; // état en mémoire, source de vérité pendant l'exécution

function persist() {
  store.saveLibrary(app, library);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#14110F',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  library = store.loadLibrary(app);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC : lecture ----------

ipcMain.handle('books:getAll', () => library);

ipcMain.handle('tags:getAll', () => {
  const set = new Set();
  for (const b of library) {
    for (const t of b.etiquettes || []) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
});

// ---------- IPC : écriture ----------

ipcMain.handle('books:add', (event, bookData) => {
  const book = store.makeEmptyBook({
    titre: (bookData.titre || '').trim(),
    auteur: (bookData.auteur || '').trim(),
    editeur: (bookData.editeur || '').trim(),
    annee: (bookData.annee || '').trim(),
    isbn: (bookData.isbn || '').trim(),
    meuble: (bookData.meuble || '').trim(),
    etagere: (bookData.etagere || '').trim(),
    dateAjout: (bookData.dateAjout || '').trim() || new Date().toLocaleDateString('fr-FR'),
    etiquettes: Array.isArray(bookData.etiquettes) ? bookData.etiquettes : [],
  });
  library.push(book);
  persist();
  return library;
});

ipcMain.handle('books:update', (event, id, changes) => {
  const idx = library.findIndex((b) => b.id === id);
  if (idx === -1) return library;
  library[idx] = { ...library[idx], ...changes, id: library[idx].id };
  persist();
  return library;
});

ipcMain.handle('books:delete', (event, id) => {
  library = library.filter((b) => b.id !== id);
  persist();
  return library;
});

ipcMain.handle('books:borrow', (event, id, { emprunteur, dateRetourPrevue }) => {
  const idx = library.findIndex((b) => b.id === id);
  if (idx === -1) return library;
  library[idx].emprunt = {
    emprunteur: (emprunteur || '').trim() || 'Emprunteur inconnu',
    dateEmprunt: new Date().toLocaleDateString('fr-FR'),
    dateRetourPrevue: (dateRetourPrevue || '').trim() || null,
  };
  persist();
  return library;
});

ipcMain.handle('books:return', (event, id) => {
  const idx = library.findIndex((b) => b.id === id);
  if (idx === -1) return library;
  library[idx].emprunt = null;
  persist();
  return library;
});

// ---------- IPC : import CSV ----------

ipcMain.handle('books:importCSV', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Importer un fichier CSV',
    properties: ['openFile'],
    filters: [{ name: 'Fichiers CSV', extensions: ['csv'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { canceled: false, error: `Impossible de lire le fichier : ${err.message}` };
  }

  let importedBooks;
  try {
    importedBooks = store.parseCSVFileContent(content);
  } catch (err) {
    return { canceled: false, error: `Erreur lors de l'analyse du CSV : ${err.message}` };
  }

  const { books, added, skipped } = store.mergeImportedBooks(library, importedBooks);
  library = books;
  persist();

  return {
    canceled: false,
    added,
    skipped,
    total: importedBooks.length,
    books: library,
    fileName: path.basename(filePath),
  };
});
