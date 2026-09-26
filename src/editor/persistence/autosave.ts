// Autosave (ARCHITECTURE.md; spec autosave-restore): the work kept between sessions. After every committed change of
// the document or the selection, one record holding the project's format version, the document and the selection
// is written at once: first to a journal in localStorage, which a write finishes before the page can unload, then
// to IndexedDB, in one transaction; the journal is dropped once IndexedDB holds that revision. At start the newer of
// the two is read (`readSavedWork`; the journal's is a crash's work, restored with a notice: spec
// autosave-crash-recovery), restored through the project reader every open uses (`restoredWork`, which
// src/editor/store.ts asks while it creates the store: the history starts empty), and kept as it was when the model
// refuses it (nothing overwrites it in that session). The status bar's save state comes from here: Not saved (no
// record yet, or a write IndexedDB refused, with its reason), Saving… (a change not in IndexedDB yet), Saved, or
// Recovery required (the saved work the project reader refused at start: it is kept untouched, and nothing is written
// until another project replaces the document, a restored version or File › Open or New blank page; spec
// autosave-corruption-recovery). A refused write is written again after autosave.retryDelay, and
// with the next change. While a change is not in IndexedDB, or a write was refused, leaving or reloading the tab asks
// the browser's leave-page confirmation (spec unsaved-work-guard).
import { readProject } from '../../core/project/archive.ts';
import type { DocumentJson, Selection } from '../../core/document/model.ts';
import { validateDocument, type ModelRules } from '../../core/document/validate.ts';
import type { Store } from '../../core/store/store.ts';
import { numberConstant } from '../../manifest/runtime.ts';
import { systemClock } from '../../core/ports/clock.ts';

const RETRY_DELAY = numberConstant('autosave.retryDelay');

// What a record holds, in IndexedDB and in the journal alike. `format` is the format version of the saved project,
// the one project.json carries (the document's own version).
export interface SavedWork {
  readonly revision: number;
  readonly format: number;
  readonly document: unknown;
  readonly selection: unknown;
  // read from the journal of a session that ended before IndexedDB held it (a crash); never written
  readonly recovered?: boolean;
}

// A version: a write IndexedDB held, with the time it was saved (spec autosave-crash-recovery); the last
// autosave.versions are kept, the oldest dropped first.
export interface SavedVersion extends SavedWork {
  readonly time: number;
}

const DATABASE = 'work';
const STORE = 'projects';
const RECORD = 'current';
const VERSIONS = 'versions';
const KEPT_VERSIONS = numberConstant('autosave.versions');
const JOURNAL = 'work-journal';

export type SaveState = 'notSaved' | 'saving' | 'saved' | 'recoveryRequired';
let state: SaveState = 'notSaved';
// why the last write was refused (the browser's words), while it was; null otherwise
let refusal: string | null = null;
const listeners = new Set<() => void>();
// The save state, for the status bar. Autosave state, not editor state: no command changes it.
export const saveState = {
  get: (): SaveState => state,
  // why IndexedDB refused the last write, while the work is not saved because of it
  reason: (): string | null => refusal,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
function setState(next: SaveState, reason: string | null = null) {
  if (next === state && reason === refusal) return;
  state = next;
  refusal = reason;
  for (const listener of [...listeners]) listener();
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      if (!request.result.objectStoreNames.contains(VERSIONS)) request.result.createObjectStore(VERSIONS);
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

// writes a record: null once IndexedDB holds it, else why it did not (the browser's words)
function writeRecord(work: SavedWork): Promise<string | null> {
  const why = (error: unknown) => (error instanceof DOMException || error instanceof Error ? error.message || error.name : String(error));
  return db().then(
    (opened) =>
      new Promise((resolve) => {
        if (opened === null) return resolve('IndexedDB is not available');
        try {
          const transaction = opened.transaction([STORE, VERSIONS], 'readwrite');
          transaction.objectStore(STORE).put(work, RECORD);
          // the version of this write, and only the last KEPT_VERSIONS of them
          const versions = transaction.objectStore(VERSIONS);
          versions.put({ ...work, time: systemClock.now() } satisfies SavedVersion, work.revision);
          const keys = versions.getAllKeys();
          keys.onsuccess = () => {
            const all = (keys.result as number[]).sort((a, b) => a - b);
            for (const old of all.slice(0, Math.max(0, all.length - KEPT_VERSIONS))) versions.delete(old);
          };
          transaction.oncomplete = () => resolve(null);
          transaction.onerror = () => resolve(why(transaction.error));
          transaction.onabort = () => resolve(why(transaction.error ?? 'the write was aborted'));
        } catch (error) {
          resolve(why(error));
        }
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
  // a journal newer than the record: the session ended before IndexedDB held its last change
  if (journal !== null && (record === null || journal.revision > record.revision)) return record === null ? journal : { ...journal, recovered: true };
  return record;
}

// The versions IndexedDB keeps, the newest first; none when it cannot be read.
export function readVersions(): Promise<readonly SavedVersion[]> {
  return db().then(
    (opened) =>
      new Promise((resolve) => {
        if (opened === null) return resolve([]);
        const request = opened.transaction(VERSIONS).objectStore(VERSIONS).getAll();
        request.onsuccess = () => resolve(((request.result as SavedVersion[] | undefined) ?? []).sort((a, b) => b.revision - a.revision));
        request.onerror = () => resolve([]);
      }),
  );
}

// The document and the selection the saved work restores, read through the project reader every open uses; the
// selection only when it names nodes of that document. Null when there is none, or when the model refuses it.
export function restoredWork(saved: SavedWork | null | undefined, rules: ModelRules): { readonly document: DocumentJson; readonly selection: Selection; readonly recovered: boolean } | null {
  if (saved === null || saved === undefined) return null;
  const read = readProject(saved.document, rules);
  if ('refused' in read) return null;
  const selection = Array.isArray(saved.selection) ? (saved.selection as Selection) : [];
  return { document: read.document, selection: validateDocument(read.document, selection, rules).length === 0 ? selection : [], recovered: saved.recovered === true };
}

// Writes the store's document and selection after every change that commits one of them, from `saved` (the work the
// store was restored from, or null). A refused saved work is never overwritten in this session.
// `canWrite`: whether this tab may write (the tab that edits, spec multi-tab-guard); a read-only tab writes nothing
export function startAutosave<Ui>(store: Store<Ui>, saved: SavedWork | null | undefined, restored: boolean, canWrite: () => boolean = () => true): () => void {
  // a saved work the reader refused: nothing is written until another project replaces the document
  let blocked = saved !== null && saved !== undefined && !restored;
  let revision = typeof saved?.revision === 'number' ? saved.revision : 0;
  let last = store.getState();
  setState(blocked ? 'recoveryRequired' : saved !== null && saved !== undefined ? 'saved' : 'notSaved');
  let writing = false;
  let pending: SavedWork | null = null;
  let retry = 0;
  const flush = async () => {
    writing = true;
    let failed: string | null = null;
    while (pending !== null) {
      const work = pending;
      pending = null;
      failed = await writeRecord(work);
      // refused: the work waits for the next change or the retry, kept in memory and in the journal
      if (failed !== null) {
        pending ??= work;
        break;
      }
      if (pending === null) {
        // IndexedDB holds the newest revision: the journal of that revision is no longer needed
        try {
          if (readJournal()?.revision === work.revision) window.localStorage.removeItem(JOURNAL);
        } catch {
          // storage refused: the journal stays, and the next start reads the same revision from either
        }
      }
    }
    writing = false;
    if (failed === null) {
      setState('saved');
      return;
    }
    setState('notSaved', failed);
    window.clearTimeout(retry);
    retry = window.setTimeout(() => {
      if (!writing && pending !== null) void flush();
    }, RETRY_DELAY);
  };
  // leaving or reloading the tab while the work is not all in IndexedDB asks the browser's confirmation
  const guard = (event: BeforeUnloadEvent) => {
    if (state !== 'saving' && refusal === null) return;
    event.preventDefault();
    event.returnValue = '';
  };
  window.addEventListener('beforeunload', guard);
  // a hidden tab writes a refused work again at once, rather than after the delay
  const hidden = () => {
    if (document.visibilityState === 'hidden' && !writing && pending !== null) void flush();
  };
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', hidden);
  // the work a crash left in the journal alone goes to IndexedDB at once
  if (saved?.recovered === true && canWrite()) {
    const { recovered: _journal, ...work } = saved;
    void _journal;
    pending = work;
    setState('saving');
    void flush();
  }
  const unsubscribe = store.subscribe(() => {
    // a gesture's changes are kept once it commits (a drag, the colour picker's session); a cancelled one leaves the
    // document as it was, and nothing is written
    if (store.gestureOpen()) return;
    const now = store.getState();
    if (now.document === last.document && now.selection === last.selection) return;
    if (!canWrite()) {
      last = now;
      return;
    }
    // while recovery is required, only a replaced document (a load: its history starts empty) is written, and
    // from then on everything is
    const replaced = now.document !== last.document && now.history.past.length === 0 && now.history.future.length === 0;
    last = now;
    if (blocked && !replaced) return;
    blocked = false;
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
  return () => {
    unsubscribe();
    window.clearTimeout(retry);
    window.removeEventListener('beforeunload', guard);
    document.removeEventListener('visibilitychange', hidden);
    window.removeEventListener('pagehide', hidden);
  };
}
