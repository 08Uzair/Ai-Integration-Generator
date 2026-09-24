'use client';

/**
 * Browser-side session store (IndexedDB).
 *
 * On serverless hosts (Vercel) there is no shared server state: each API
 * request can run on a different instance, so the generation endpoint
 * returns the finished session (integration + job + project with embedded
 * ZIP bytes) in a single response. This module persists those sessions in
 * the browser, which is what the dashboard, the detail page and the
 * download step read afterwards.
 *
 * Falls back to an in-memory map when IndexedDB is unavailable (e.g. some
 * privacy modes) - downloads still work, only the dashboard forgets rows.
 */

const DB_NAME = 'aig-sessions';
const STORE = 'sessions';
const VERSION = 1;

let dbPromise = null;
let memoryFallback = null;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function database() {
  if (dbPromise === null) {
    const opened = openDatabase();
    dbPromise = opened ? opened.catch(() => null) : Promise.resolve(null);
  }
  return dbPromise;
}

function fallbackMap() {
  if (!memoryFallback) memoryFallback = new Map();
  return memoryFallback;
}

/** Persists (insert or replace) one finished generation session. */
export async function saveSession(session) {
  const db = await database();
  if (!db) {
    fallbackMap().set(session.id, session);
    return;
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** All sessions, newest first (same ordering the API used). */
export async function listSessions() {
  const db = await database();
  if (!db) {
    const rows = [...fallbackMap().values()];
    return rows.sort((a, b) => new Date(b.integration?.createdAt) - new Date(a.integration?.createdAt));
  }
  return new Promise((resolve) => {
    const rows = [];
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        rows.sort((a, b) => new Date(b.integration?.createdAt) - new Date(a.integration?.createdAt));
        resolve(rows);
      }
    };
    request.onerror = () => resolve(rows);
  });
}

/** One session by id, or null. */
export async function getSession(id) {
  const db = await database();
  if (!db) return fallbackMap().get(id) || null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => resolve(null);
  });
}

/** Removes a session. Returns true when a row was deleted. */
export async function deleteSession(id) {
  const db = await database();
  if (!db) return fallbackMap().delete(id);
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}
