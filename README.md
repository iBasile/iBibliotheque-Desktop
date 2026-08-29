# Ma Bibliothèque

Application de bureau (Electron) pour gérer et rechercher les livres de votre
bibliothèque personnelle, à partir de votre export CSV.

## Installation

Il faut avoir [Node.js](https://nodejs.org/) installé (version 18 ou plus récente).

Ouvrez un terminal dans ce dossier, puis lancez :

```bash
npm install
npm start
```

La première fois, l'application charge automatiquement le fichier
`data/bibliotheque-initiale.csv` (votre export) pour créer votre bibliothèque.
Ensuite, toutes vos données (livres ajoutés, étiquettes, emprunts) sont
sauvegardées automatiquement sur votre ordinateur, dans le dossier de
données de l'application — vous n'avez rien à faire de plus.

## Fonctionnalités

### 1. Rechercher
Recherche instantanée par titre, auteur, éditeur, ISBN ou emplacement
(meuble/étagère), avec un sélecteur pour cibler un champ précis. Un système
de filtre par étiquettes (cliquables) permet d'affiner encore la recherche.

### 2. Explorer
Vue en tableau de tous les livres, triable en cliquant sur chaque colonne
(titre, auteur, éditeur, année, emplacement, étiquettes, statut). Cliquer sur
une ligne ouvre la fiche détaillée du livre.

### 3. Ajouter
- Formulaire pour ajouter un livre manuellement (titre, auteur, éditeur,
  année, ISBN, meuble, étagère, étiquettes).
- Bouton pour importer un fichier CSV supplémentaire (même format que
  l'export d'origine : `Titre;Auteur;Éditeur;Année;ISBN;Meuble;Étagère;Date
  d'ajout`). Les doublons (même ISBN, ou même titre + auteur) sont
  automatiquement ignorés pour éviter les livres en double.

### 4. Emprunts
Liste des livres actuellement empruntés (nom de l'emprunteur, date
d'emprunt, date de retour prévue si renseignée), avec un bouton pour marquer
un retour. On peut emprunter un livre depuis n'importe quelle fiche détail,
ou directement depuis une fiche dans "Rechercher"/"Explorer".

### Étiquettes
Les étiquettes se gèrent depuis la fiche détail d'un livre (page Explorer ou
Rechercher : cliquez sur un livre). Vous pouvez en ajouter autant que vous
voulez, elles servent ensuite à filtrer dans la page Rechercher.

## Où sont stockées mes données ?

Un fichier `bibliotheque.json` est créé automatiquement dans le dossier de
configuration de l'application (dossier standard d'Electron,
`app.getPath('userData')` — par exemple
`~/.config/ma-bibliotheque/bibliotheque.json` sous Linux,
`%APPDATA%\ma-bibliotheque\bibliotheque.json` sous Windows). C'est ce
fichier qu'il faut sauvegarder si vous voulez conserver une copie de
sauvegarde de votre bibliothèque.

## Structure du projet

```
bibliotheque-app/
├── main.js              # Processus principal Electron (fenêtre, IPC, données)
├── preload.js            # Pont sécurisé entre l'app et la fenêtre
├── package.json
├── src/
│   ├── csvParser.js       # Parseur CSV (gère guillemets, ; et retours ligne)
│   └── dataStore.js       # Chargement/sauvegarde/import/fusion des livres
├── renderer/
│   ├── index.html          # Structure des 4 pages + fenêtres modales
│   ├── style.css           # Habillage visuel
│   └── app.js               # Logique de l'interface
└── data/
    └── bibliotheque-initiale.csv   # Votre export, utilisé au 1er lancement
```

## Créer un exécutable installable (optionnel)

Pour distribuer l'application sans passer par `npm start`, vous pouvez
ajouter [electron-builder](https://www.electron.build/) :

```bash
npm install --save-dev electron-builder
```

puis ajouter dans `package.json` un script `"dist": "electron-builder"` et
lancer `npm run dist`. Cela n'est pas nécessaire pour un usage personnel :
`npm start` suffit.
