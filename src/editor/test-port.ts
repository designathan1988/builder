// The read-only test port (ARCHITECTURE.md): what the end-to-end tests read of the editor, the document, the
// selection, the history and the export, each as a copy taken now. It has no other member: it never writes, loads,
// creates or selects anything, so a test can change the editor only through its doors. It exists in development
// only (the dev server the tests run), frozen on window.
import type { EditorStore } from './store.ts';

export interface TestPort {
  readonly document: () => unknown;
  readonly selection: () => readonly string[];
  // how many steps Undo and Redo can take now
  readonly history: () => { readonly undoSteps: number; readonly redoSteps: number };
  // the exported files; null until the export is built (project-export)
  readonly export: () => null;
}

export const TEST_PORT_KEY = '__builderTestPort';

export function createTestPort(store: EditorStore): TestPort {
  const copy = <T>(value: T): T => structuredClone(value);
  return Object.freeze({
    document: () => copy(store.getState().document),
    selection: () => copy(store.getState().selection),
    history: () => ({ undoSteps: store.getState().history.past.length, redoSteps: store.getState().history.future.length }),
    export: () => null,
  });
}

export function installTestPort(store: EditorStore): void {
  if (!import.meta.env.DEV) return;
  Object.defineProperty(window, TEST_PORT_KEY, { value: createTestPort(store), writable: false, configurable: false, enumerable: false });
}
