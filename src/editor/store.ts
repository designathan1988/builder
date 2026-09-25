// The editor store binding (ARCHITECTURE.md): creates the one store with the command table, the manifest's commands
// and rules, the ports and the editor state, and exposes it to React. Components read state through
// useEditorState and change it only through dispatch; no document, selection or editor state lives in useState.
import { createContext, useContext, useSyncExternalStore } from 'react';
import { COMMANDS, PREDICATES } from '../app/commands.ts';
import { createEmptyDocument, type DocumentJson, type Selection } from '../core/document/model.ts';
import { rulesFromManifest } from '../core/document/validate.ts';
import { systemClock, type Clock } from '../core/ports/clock.ts';
import { randomIds, type IdGenerator } from '../core/ports/ids.ts';
import { createStore, type Store, type StoreState } from '../core/store/store.ts';
import type { CommandId, ConstantId } from '../generated/ids.ts';
import { translate } from '../i18n/index.ts';
import { manifest } from '../manifest/runtime.ts';
import { pageLayout } from './canvas/coordinates.ts';
import { browserDownloads } from './download.ts';
import { endOffSelection, endOnUndoable } from './canvas/text-edit.ts';
import { revealSelection } from './layers/tree.ts';
import { browserStorage, loadPreferences, persistPreferences, type PreferenceStorage } from './preferences/preferences.ts';
import { initialEditorUi, type EditorUi } from './state.ts';

export type EditorStore = Store<EditorUi>;
export type EditorState = StoreState<EditorUi>;

export interface EditorStoreOptions {
  readonly storage?: PreferenceStorage;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  // the work autosave restored (src/editor/persistence/autosave.ts), or none: the empty project
  readonly restored?: { readonly document: DocumentJson; readonly selection: Selection } | null;
}

// the model every document must satisfy, from the manifest
export const MODEL_RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);

export function createEditorStore(options: EditorStoreOptions = {}): EditorStore {
  const storage = options.storage ?? browserStorage;
  const ids = options.ids ?? randomIds;
  const preferences = loadPreferences(storage);
  const rules = MODEL_RULES;
  const rootLabel = manifest.elements.elements.find((e) => e.id === rules.root.type)?.labelKey ?? 'element.page.label';
  // the restored work, else the empty project, whose names are the words of the person who creates it
  const document =
    options.restored?.document ?? createEmptyDocument(ids, { page: translate(preferences.locale, 'pages.defaultHome'), root: translate(preferences.locale, rootLabel as 'element.page.label') }, rules.root);
  const store = createStore<EditorUi>({
    table: COMMANDS,
    predicates: PREDICATES,
    commands: new Map(manifest.commands.map((c) => [c.id as CommandId, c])),
    constants: new Map(manifest.interactions.constants.map((c) => [c.id as ConstantId, c.value])),
    rules,
    clock: options.clock ?? systemClock,
    ids,
    words: (ui, key) => translate(ui.preferences.locale, key),
    layout: pageLayout,
    downloads: browserDownloads,
    initial: { document, selection: options.restored?.selection ?? [], ui: initialEditorUi(preferences) },
    freeze: import.meta.env.DEV,
    // Layers unfolds what hides a selected node; a text edit ends once its node is not the selection alone
    followSelection: (state) => endOffSelection({ ...state, ui: revealSelection(state) }),
    followCommand: endOnUndoable,
  });
  persistPreferences(store, storage);
  return store;
}

export const StoreContext = createContext<EditorStore | null>(null);

export function useStore(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('the editor store is missing: render inside <StoreContext.Provider>');
  return store;
}

// Reads a part of the state and re-renders when it changes (select returns the same reference while unchanged).
export function useEditorState<T>(select: (state: EditorState) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
