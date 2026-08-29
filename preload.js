'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getBooks: () => ipcRenderer.invoke('books:getAll'),
  getTags: () => ipcRenderer.invoke('tags:getAll'),

  addBook: (book) => ipcRenderer.invoke('books:add', book),
  updateBook: (id, changes) => ipcRenderer.invoke('books:update', id, changes),
  deleteBook: (id) => ipcRenderer.invoke('books:delete', id),

  borrowBook: (id, info) => ipcRenderer.invoke('books:borrow', id, info),
  returnBook: (id) => ipcRenderer.invoke('books:return', id),

  importCSV: () => ipcRenderer.invoke('books:importCSV'),
});
