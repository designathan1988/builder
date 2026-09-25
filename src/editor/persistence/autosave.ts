// Autosave (ARCHITECTURE.md; spec autosave-restore): the work kept between sessions. After every committed change of
// the document or the selection, one record holding the project's format version, the document and the selection
// is written at once: first to a journal in localStorage, which a write finishes before the page can unload, then
// to IndexedDB, in one transaction; the journal is dropped once IndexedDB holds that revision. At start the newer of
// the two is read (`readSavedWork`), restored through the project reader every open uses (`restoredWork`, which
// src/editor/store.ts asks while it creates the store: the history starts empty), and kept as it was when the model
// refuses it (nothing overwrites it in that session). The status bar's save state comes from here: Not saved (no
// record yet), Saving… (a change not in IndexedDB yet), Saved, or Save failed.
import { readProject } from '../../core/project/archive.ts';
import type { DocumentJson, Selection } from '../../core/document/model.ts';
import { validateDocument, type ModelRules } from '../../core/document/validate.ts';
import type { Store } from '../../core/store/store.ts';

// What a record holds, in IndexedDB and in the journal alike. `format` is the format version of the saved project,
// the one project.json carries (the document's own version).
export interface SavedWork {
  readonly revision: number;
  readonly format: number;
  readonly document: unknown;
  readonly selection: unknown;
}

const DATABASE = 'work';
const STORE = 'projects';
const RECORD = 'current';
const JOURNAL = 'work-journal';

export type SaveState = 'notSaved' | 'saving' | 'saved' | 'failed';
let state: SaveState = 'notSaved';
const listeners = new Set<() => void>();
// The save state, for the status bar. Autosave state, not editor state: no command changes it.
export const saveState = {
  get: (): SaveState => state,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
function setState(next: SaveState) {
  if (next === state) return;
  state = next;
  for (const listener of [...listeners]) listener();
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}
let database: Promise<IDBDatabase | null> | null = null;
const db = () => (database ??= openDatabase());

function readRecord(): Promise<SavedWork | null> {
  return db().then(
    (opened) =>
      new Promise((resolve) => {
        if (opened === null) return resolve(null);
        const request = opened.transaction(STORE).objectStore(STORE).get(RECORD);
        request.onsuccess = () => resolve((request.result as SavedWork | undefined) ?? null);
        request.onerror = () => resolve(null);
      }),
  );
}

function writeRecord(work: SavedWork): Promise<boolean> {
  return db().then(
    (opened) =>
      new Promise((resolve) => {
        if (opened === null) return resolve(false);
        const transaction = opened.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put(work, RECORD);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      }),
  );
}

function readJournal(): SavedWork | null {
  try {
    const text = window.localStorage.getItem(JOURNAL);
    return text === null ? null : (JSON.parse(text) as SavedWork);
  } catch {
    return null;
  }
}

// The saved work, the newer of IndexedDB's record and the journal a write left; null on a fresh profile.
export async function readSavedWork(): Promise<SavedWork | null> {
  const record = await readRecord();
  const journal = readJournal();
  if (journal !== null && (record === null || journal.revision > record.revision)) return journal;
  return record;
}

// The document and the selection the saved work restores, read through the project reader every open uses; the
// selection only when it names nodes of that document. Null when there is none, or when the model refuses it.
export function restoredWork(saved: SavedWork | null | undefined, rules: ModelRules): { readonly document: DocumentJson; readonly selection: Selection } | null {
  if (saved === null || saved === undefined) return null;
  const read = readProject(saved.document, rules);
  if ('refused' in read) return null;
  const selection = Array.isArray(saved.selection) ? (saved.selection as Selection) : [];
  return { document: read.document, selection: validateDocument(read.document, selection, rules).length === 0 ? selection : [] };
}

// Writes the store's document and selection after every change that commits one of them, from `saved` (the work the
// store was restored from, or null). A refused saved work is never overwritten in this session.
export function startAutosave<Ui>(store: Store<Ui>, saved: SavedWork | null | undefined, restored: boolean): () => void {
  if (saved !== null && saved !== undefined && !restored) {
    setState('failed');
    return () => undefined;
  }
  let revision = saved?.revision ?? 0;
  let last = store.getState();
  setState(saved !== null && saved !== undefined ? 'saved' : 'notSaved');
  let writing = false;
  let pending: SavedWork | null = null;
  const flush = async () => {
    writing = true;
    let ok = true;
    while (pending !== null) {
      const work = pending;
      pending = null;
      ok = await writeRecord(work);
      if (ok && pending === null) {
        // IndexedDB holds the newest revision: the journal of that revision is no longer needed
        try {
          if (readJournal()?.revision === work.revision) window.localStorage.removeItem(JOURNAL);
        } catch {
          // storage refused: the journal stays, and the next start reads the same revision from either
        }
      }
    }
    writing = false;
    setState(ok ? 'saved' : 'failed');
  };
  return store.subscribe(() => {
    const now = store.getState();
    if (now.document === last.document && now.selection === last.selection) return;
    last = now;
    revision += 1;
    const work: SavedWork = { revision, format: now.document.version, document: now.document, selection: now.selection };
    try {
      window.localStorage.setItem(JOURNAL, JSON.stringify(work));
    } catch {
      // storage refused (quota, private window): IndexedDB alone keeps the work
    }
    pending = work;
    setState('saving');
    if (!writing) void flush();
  });
}
