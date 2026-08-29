'use strict';

(() => {
  // ---------------------------------------------------------------
  // État global
  // ---------------------------------------------------------------
  let allBooks = [];
  let allTags = [];

  let selectedSearchTags = new Set();
  let explorerSort = { field: 'titre', dir: 'asc' };

  let currentDetailBookId = null;
  let currentBorrowBookId = null;

  // ---------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------

  function normalizeText(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function emplacement(book) {
    const parts = [book.meuble, book.etagere ? `étagère ${book.etagere}` : ''].filter(Boolean);
    return parts.join(' — ');
  }

  function isEmprunte(book) {
    return !!book.emprunt;
  }

  let toastTimer = null;
  function showToast(message, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------------------------------------------------------------
  // Chargement des données
  // ---------------------------------------------------------------

  async function refreshData() {
    const [books, tags] = await Promise.all([window.api.getBooks(), window.api.getTags()]);
    allBooks = books;
    allTags = tags;
    renderSidebarStats();
    renderTagSuggestions();
    renderActivePage();
  }

  function renderSidebarStats() {
    document.getElementById('stat-total').textContent = allBooks.length;
    const nbEmprunts = allBooks.filter(isEmprunte).length;
    const badge = document.getElementById('badge-emprunts');
    if (nbEmprunts > 0) {
      badge.hidden = false;
      badge.textContent = nbEmprunts;
    } else {
      badge.hidden = true;
    }
  }

  function renderTagSuggestions() {
    const datalist = document.getElementById('tag-suggestions');
    datalist.innerHTML = allTags.map((t) => `<option value="${escapeHtml(t)}"></option>`).join('');
  }

  function renderActivePage() {
    const active = document.querySelector('.page.is-active');
    if (!active) return;
    const page = active.dataset.page;
    if (page === 'recherche') renderSearchPage();
    else if (page === 'explorer') renderExplorerPage();
    else if (page === 'emprunts') renderEmpruntsPage();
  }

  // ---------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------

  function switchPage(pageName) {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.page === pageName);
    });
    document.querySelectorAll('.page').forEach((section) => {
      section.classList.toggle('is-active', section.dataset.page === pageName);
    });
    renderActivePage();
  }

  function setupNav() {
    document.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => switchPage(btn.dataset.page));
    });
  }

  // ---------------------------------------------------------------
  // PAGE 1 : Recherche
  // ---------------------------------------------------------------

  function matchesQuery(book, query, champ) {
    if (!query) return true;
    const q = normalizeText(query);

    const fieldsMap = {
      titre: [book.titre],
      auteur: [book.auteur],
      editeur: [book.editeur],
      isbn: [book.isbn],
      emplacement: [book.meuble, book.etagere],
      tous: [book.titre, book.auteur, book.editeur, book.isbn, book.meuble, book.etagere, ...(book.etiquettes || [])],
    };

    const fields = fieldsMap[champ] || fieldsMap.tous;
    return fields.some((f) => normalizeText(f).includes(q));
  }

  function matchesTags(book, tagSet) {
    if (tagSet.size === 0) return true;
    const bookTags = new Set((book.etiquettes || []).map((t) => t.toLowerCase()));
    return Array.from(tagSet).every((t) => bookTags.has(t.toLowerCase()));
  }

  function renderSearchTagChips() {
    const container = document.getElementById('search-tag-chips');
    if (allTags.length === 0) {
      container.innerHTML = '<span class="hint" style="color:var(--text-muted)">Aucune étiquette pour le moment</span>';
      return;
    }
    container.innerHTML = '';
    for (const tag of allTags) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (selectedSearchTags.has(tag) ? ' is-selected' : '');
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        if (selectedSearchTags.has(tag)) selectedSearchTags.delete(tag);
        else selectedSearchTags.add(tag);
        renderSearchPage();
      });
      container.appendChild(chip);
    }
    document.getElementById('clear-tag-filter').hidden = selectedSearchTags.size === 0;
  }

  function createBookCard(book) {
    const card = document.createElement('article');
    card.className = 'book-card';

    const tagsHtml = (book.etiquettes || []).map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`).join('');
    const emprunte = isEmprunte(book);

    card.innerHTML = `
      <span class="bc-tab">${escapeHtml(book.etagere || '—')}</span>
      <h4>${escapeHtml(book.titre)}</h4>
      <p class="bc-auteur">${escapeHtml(book.auteur || 'Auteur inconnu')}</p>
      <p class="bc-meta">
        <span>${escapeHtml(book.editeur || '—')}</span>
        <span>${escapeHtml(book.annee || '')}</span>
      </p>
      <div class="bc-tags">${tagsHtml}</div>
      <div class="bc-footer">
        <span class="status-pill ${emprunte ? 'emprunte' : 'dispo'}">${emprunte ? 'Emprunté' : 'Disponible'}</span>
        <button class="bc-action-btn" data-action="${emprunte ? 'return' : 'borrow'}">${emprunte ? 'Retourner' : 'Emprunter'}</button>
      </div>
    `;

    card.addEventListener('click', () => openDetailModal(book.id));

    const actionBtn = card.querySelector('.bc-action-btn');
    actionBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (emprunte) {
        await window.api.returnBook(book.id);
        showToast(`« ${book.titre} » marqué comme retourné.`);
        await refreshData();
      } else {
        openBorrowModal(book.id);
      }
    });

    return card;
  }

  function renderSearchPage() {
    renderSearchTagChips();

    const query = document.getElementById('search-input').value.trim();
    const champ = document.getElementById('search-champ').value;

    const filtered = allBooks.filter((b) => matchesQuery(b, query, champ) && matchesTags(b, selectedSearchTags));

    const container = document.getElementById('search-results');
    container.innerHTML = '';

    document.getElementById('results-count').textContent =
      filtered.length === 0 ? 'Aucun résultat' : `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Aucun livre ne correspond à votre recherche.';
      container.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const book of filtered) fragment.appendChild(createBookCard(book));
    container.appendChild(fragment);
  }

  function setupSearchPage() {
    document.getElementById('search-input').addEventListener('input', renderSearchPage);
    document.getElementById('search-champ').addEventListener('change', renderSearchPage);
    document.getElementById('clear-tag-filter').addEventListener('click', () => {
      selectedSearchTags.clear();
      renderSearchPage();
    });
  }

  // ---------------------------------------------------------------
  // PAGE 2 : Explorer
  // ---------------------------------------------------------------

  function sortBooks(books, field, dir) {
    const factor = dir === 'asc' ? 1 : -1;
    return [...books].sort((a, b) => {
      let va, vb;
      if (field === 'emplacement') { va = emplacement(a); vb = emplacement(b); }
      else if (field === 'etiquettes') { va = (a.etiquettes || []).join(', '); vb = (b.etiquettes || []).join(', '); }
      else if (field === 'statut') { va = isEmprunte(a) ? 1 : 0; vb = isEmprunte(b) ? 1 : 0; }
      else { va = a[field] || ''; vb = b[field] || ''; }

      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return normalizeText(va).localeCompare(normalizeText(vb)) * factor;
    });
  }

  function renderExplorerPage() {
    const filterText = document.getElementById('explorer-filter').value.trim();
    let books = allBooks.filter((b) => matchesQuery(b, filterText, 'tous'));
    books = sortBooks(books, explorerSort.field, explorerSort.dir);

    document.getElementById('explorer-count').textContent = `${books.length} livre${books.length > 1 ? 's' : ''}`;

    document.querySelectorAll('#explorer-table thead th').forEach((th) => {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.sort === explorerSort.field) {
        th.classList.add(explorerSort.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
      }
    });

    const tbody = document.getElementById('explorer-tbody');
    tbody.innerHTML = '';

    if (books.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align:center; color:var(--text-muted); padding:26px;">Aucun livre ne correspond à ce filtre.</td>`;
      tbody.appendChild(tr);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const book of books) {
      const tr = document.createElement('tr');
      const tagsHtml = (book.etiquettes || []).map((t) => `<span class="table-tag">${escapeHtml(t)}</span>`).join('') || '—';
      const emprunte = isEmprunte(book);

      tr.innerHTML = `
        <td title="${escapeHtml(book.titre)}">${escapeHtml(book.titre)}</td>
        <td class="td-auteur" title="${escapeHtml(book.auteur)}">${escapeHtml(book.auteur || '—')}</td>
        <td class="td-editeur" title="${escapeHtml(book.editeur)}">${escapeHtml(book.editeur || '—')}</td>
        <td>${escapeHtml(book.annee || '—')}</td>
        <td title="${escapeHtml(emplacement(book))}">${escapeHtml(emplacement(book) || '—')}</td>
        <td>${tagsHtml}</td>
        <td class="status-text ${emprunte ? 'emprunte' : 'dispo'}">${emprunte ? 'Emprunté' : 'Disponible'}</td>
      `;
      tr.addEventListener('click', () => openDetailModal(book.id));
      fragment.appendChild(tr);
    }
    tbody.appendChild(fragment);
  }

  function setupExplorerPage() {
    document.getElementById('explorer-filter').addEventListener('input', renderExplorerPage);
    document.querySelectorAll('#explorer-table thead th').forEach((th) => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (explorerSort.field === field) {
          explorerSort.dir = explorerSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          explorerSort = { field, dir: 'asc' };
        }
        renderExplorerPage();
      });
    });
  }

  // ---------------------------------------------------------------
  // PAGE 3 : Ajouter
  // ---------------------------------------------------------------

  function setupAddPage() {
    const form = document.getElementById('add-form');
    const feedback = document.getElementById('add-feedback');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titre = document.getElementById('f-titre').value.trim();
      if (!titre) {
        feedback.textContent = 'Le titre est obligatoire.';
        feedback.className = 'form-feedback error';
        return;
      }

      const etiquettes = document.getElementById('f-etiquettes').value
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const book = {
        titre,
        auteur: document.getElementById('f-auteur').value.trim(),
        editeur: document.getElementById('f-editeur').value.trim(),
        annee: document.getElementById('f-annee').value.trim(),
        isbn: document.getElementById('f-isbn').value.trim(),
        meuble: document.getElementById('f-meuble').value.trim(),
        etagere: document.getElementById('f-etagere').value.trim(),
        etiquettes,
      };

      await window.api.addBook(book);
      form.reset();
      feedback.textContent = `« ${titre} » a été ajouté à la bibliothèque.`;
      feedback.className = 'form-feedback success';
      await refreshData();
      setTimeout(() => { feedback.textContent = ''; }, 4000);
    });

    document.getElementById('import-csv-btn').addEventListener('click', async () => {
      const importFeedback = document.getElementById('import-feedback');
      importFeedback.textContent = 'Import en cours…';
      importFeedback.className = 'form-feedback';

      const result = await window.api.importCSV();

      if (result.canceled) {
        importFeedback.textContent = '';
        return;
      }
      if (result.error) {
        importFeedback.textContent = result.error;
        importFeedback.className = 'form-feedback error';
        return;
      }

      importFeedback.textContent =
        `« ${result.fileName} » : ${result.added} livre${result.added > 1 ? 's' : ''} ajouté${result.added > 1 ? 's' : ''}, ` +
        `${result.skipped} doublon${result.skipped > 1 ? 's' : ''} ignoré${result.skipped > 1 ? 's' : ''} (sur ${result.total}).`;
      importFeedback.className = 'form-feedback success';

      await refreshData();
    });
  }

  // ---------------------------------------------------------------
  // PAGE 4 : Emprunts
  // ---------------------------------------------------------------

  function renderEmpruntsPage() {
    const borrowed = allBooks.filter(isEmprunte);
    const list = document.getElementById('emprunts-list');
    const emptyState = document.getElementById('emprunts-empty');

    list.innerHTML = '';
    emptyState.hidden = borrowed.length > 0;

    for (const book of borrowed) {
      const row = document.createElement('div');
      row.className = 'borrow-row';
      row.innerHTML = `
        <div class="br-info">
          <h4>${escapeHtml(book.titre)}</h4>
          <p class="br-auteur">${escapeHtml(book.auteur || 'Auteur inconnu')}</p>
        </div>
        <div class="br-meta">
          <div><strong>${escapeHtml(book.emprunt.emprunteur)}</strong>Emprunteur</div>
          <div><strong>${escapeHtml(book.emprunt.dateEmprunt)}</strong>Emprunté le</div>
          <div><strong>${escapeHtml(book.emprunt.dateRetourPrevue || '—')}</strong>Retour prévu</div>
        </div>
        <button class="btn btn-outline btn-sm" data-id="${book.id}">Marquer comme retourné</button>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        await window.api.returnBook(book.id);
        showToast(`« ${book.titre} » marqué comme retourné.`);
        await refreshData();
      });
      list.appendChild(row);
    }
  }

  // ---------------------------------------------------------------
  // MODALE : Détail du livre
  // ---------------------------------------------------------------

  function openDetailModal(bookId) {
    currentDetailBookId = bookId;
    renderDetailModal();
    document.getElementById('detail-modal').classList.remove('hidden');
  }

  function closeDetailModal() {
    document.getElementById('detail-modal').classList.add('hidden');
    currentDetailBookId = null;
  }

  function renderDetailModal() {
    const book = allBooks.find((b) => b.id === currentDetailBookId);
    if (!book) return closeDetailModal();

    document.getElementById('detail-titre').textContent = book.titre;
    document.getElementById('detail-auteur').textContent = book.auteur || 'Auteur inconnu';
    document.getElementById('detail-editeur').textContent = book.editeur || '—';
    document.getElementById('detail-annee').textContent = book.annee || '—';
    document.getElementById('detail-isbn').textContent = book.isbn || '—';
    document.getElementById('detail-emplacement').textContent = emplacement(book) || '—';
    document.getElementById('detail-date').textContent = book.dateAjout || '—';

    const emprunte = isEmprunte(book);
    document.getElementById('detail-stamp').hidden = !emprunte;

    const infoBox = document.getElementById('detail-emprunt-info');
    if (emprunte) {
      infoBox.hidden = false;
      infoBox.innerHTML = `Emprunté par <strong>${escapeHtml(book.emprunt.emprunteur)}</strong> le ${escapeHtml(book.emprunt.dateEmprunt)}` +
        (book.emprunt.dateRetourPrevue ? ` &middot; retour prévu le ${escapeHtml(book.emprunt.dateRetourPrevue)}` : '');
    } else {
      infoBox.hidden = true;
      infoBox.innerHTML = '';
    }

    document.getElementById('detail-borrow-btn').hidden = emprunte;
    document.getElementById('detail-return-btn').hidden = !emprunte;

    renderDetailTags(book);
  }

  function renderDetailTags(book) {
    const container = document.getElementById('detail-tags');
    container.innerHTML = '';
    if (!book.etiquettes || book.etiquettes.length === 0) {
      container.innerHTML = '<span class="hint" style="color:var(--ink-soft)">Aucune étiquette</span>';
      return;
    }
    for (const tag of book.etiquettes) {
      const chip = document.createElement('span');
      chip.className = 'chip is-selected';
      chip.innerHTML = `${escapeHtml(tag)} <span class="chip-x">&times;</span>`;
      chip.querySelector('.chip-x').addEventListener('click', async () => {
        const newTags = book.etiquettes.filter((t) => t !== tag);
        await window.api.updateBook(book.id, { etiquettes: newTags });
        await refreshData();
        renderDetailModal();
      });
      container.appendChild(chip);
    }
  }

  function setupDetailModal() {
    document.getElementById('detail-close').addEventListener('click', closeDetailModal);
    document.getElementById('detail-modal').addEventListener('click', (e) => {
      if (e.target.id === 'detail-modal') closeDetailModal();
    });

    document.getElementById('detail-tag-add').addEventListener('click', async () => {
      const input = document.getElementById('detail-tag-input');
      const value = input.value.trim();
      if (!value) return;
      const book = allBooks.find((b) => b.id === currentDetailBookId);
      if (!book) return;
      const current = book.etiquettes || [];
      if (current.some((t) => t.toLowerCase() === value.toLowerCase())) {
        input.value = '';
        return;
      }
      await window.api.updateBook(book.id, { etiquettes: [...current, value] });
      input.value = '';
      await refreshData();
      renderDetailModal();
    });

    document.getElementById('detail-tag-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('detail-tag-add').click();
      }
    });

    document.getElementById('detail-borrow-btn').addEventListener('click', () => {
      openBorrowModal(currentDetailBookId);
    });

    document.getElementById('detail-return-btn').addEventListener('click', async () => {
      await window.api.returnBook(currentDetailBookId);
      showToast('Livre marqué comme retourné.');
      await refreshData();
      renderDetailModal();
    });

    document.getElementById('detail-delete-btn').addEventListener('click', async () => {
      const book = allBooks.find((b) => b.id === currentDetailBookId);
      if (!book) return;
      const confirmed = window.confirm(`Supprimer « ${book.titre} » de la bibliothèque ?`);
      if (!confirmed) return;
      await window.api.deleteBook(book.id);
      showToast(`« ${book.titre} » a été supprimé.`);
      closeDetailModal();
      await refreshData();
    });
  }

  // ---------------------------------------------------------------
  // MODALE : Emprunt
  // ---------------------------------------------------------------

  function openBorrowModal(bookId) {
    const book = allBooks.find((b) => b.id === bookId);
    if (!book) return;
    currentBorrowBookId = bookId;
    document.getElementById('borrow-book-title').textContent = `« ${book.titre} »`;
    document.getElementById('borrow-name').value = '';
    document.getElementById('borrow-due-date').value = '';
    document.getElementById('borrow-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('borrow-name').focus(), 50);
  }

  function closeBorrowModal() {
    document.getElementById('borrow-modal').classList.add('hidden');
    currentBorrowBookId = null;
  }

  function setupBorrowModal() {
    document.getElementById('borrow-close').addEventListener('click', closeBorrowModal);
    document.getElementById('borrow-modal').addEventListener('click', (e) => {
      if (e.target.id === 'borrow-modal') closeBorrowModal();
    });

    document.getElementById('borrow-confirm').addEventListener('click', async () => {
      if (!currentBorrowBookId) return;
      const emprunteur = document.getElementById('borrow-name').value.trim();
      const dateRetourPrevue = document.getElementById('borrow-due-date').value;

      const book = allBooks.find((b) => b.id === currentBorrowBookId);
      await window.api.borrowBook(currentBorrowBookId, { emprunteur, dateRetourPrevue });
      showToast(`« ${book ? book.titre : 'Livre'} » marqué comme emprunté.`);
      closeBorrowModal();
      await refreshData();
      if (currentDetailBookId) renderDetailModal();
    });
  }

  // ---------------------------------------------------------------
  // Raccourcis clavier globaux
  // ---------------------------------------------------------------

  function setupGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!document.getElementById('borrow-modal').classList.contains('hidden')) closeBorrowModal();
      else if (!document.getElementById('detail-modal').classList.contains('hidden')) closeDetailModal();
    });
  }

  // ---------------------------------------------------------------
  // Initialisation
  // ---------------------------------------------------------------

  async function init() {
    setupNav();
    setupSearchPage();
    setupExplorerPage();
    setupAddPage();
    setupDetailModal();
    setupBorrowModal();
    setupGlobalKeys();
    await refreshData();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
