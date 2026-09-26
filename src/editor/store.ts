// The editor store binding (ARCHITECTURE.md): creates the one store with the command table, the manifest's commands
// and rules, the ports and the editor state, and exposes it to React. Components read state through
// useEditorState and change it only through dispatch; no document, selection or editor state lives in useState.
import { createContext, useContext, useSyncExternalStore } from 'react';
import { COMMANDS, PREDICATES } from '../app/commands.ts';
import { message } from '../core/commands/registry.ts';
import { isEditing, takeOver } from './persistence/tab-guard.ts';
import { activeLayer } from './view/style-state.ts';
import { createEmptyDocument, type DocumentJson, type Selection } from '../core/document/model.ts';
import { rulesFromManifest, type ModelRules } from '../core/document/validate.ts';
import { systemClock, type Clock } from '../core/ports/clock.ts';
import { randomIds, type IdGenerator } from '../core/ports/ids.ts';
import { createStore, type Store, type StoreState } from '../core/store/store.ts';
import type { CommandId, ConstantId } from '../generated/ids.ts';
import { translate } from '../i18n/index.ts';
import { manifest } from '../manifest/runtime.ts';
import { pageLayout } from './canvas/coordinates.ts';
import { browserClipboard } from './clipboard.ts';
import { browserCss } from './css-support.ts';
import { browserDownloads } from './download.ts';
import { endOffSelection, endOnUndoable } from './canvas/text-edit.ts';
import { endRenameOffSelection, endRenameOnUndoable } from './layers/rename.ts';
import { revealSelection } from './layers/tree.ts';
import { targetOffSelection } from './inspector/style-target.ts';
import { browserStorage, loadPreferences, persistPreferences, type PreferenceStorage } from './preferences/preferences.ts';
import { initialEditorUi, type EditorUi } from './state.ts';

export type EditorStore = Store<EditorUi>;
export type EditorState = StoreState<EditorUi>;

export interface EditorStoreOptions {
  readonly storage?: PreferenceStorage;
  readonly clock?: Clock;
  readonly ids?: IdGenerator;
  // the work autosave restored (src/editor/persistence/autosave.ts), or none: the empty project; `recovered` when it
  // came back from the journal of a session that ended before IndexedDB held it (spec autosave-crash-recovery)
  readonly restored?: { readonly document: DocumentJson; readonly selection: Selection; readonly recovered?: boolean } | null;
  // the saved versions, when the saved work could not be read: the recovery dialog opens with them (spec
  // autosave-corruption-recovery), and project.restoreVersion reads their documents
  readonly recovery?: readonly { readonly revision: number; readonly time: number; readonly document: unknown }[] | null;
}

// the model every document must satisfy, from the manifest
export const MODEL_RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);

// the editor state that opens the recovery dialog with the saved versions, when there are some to offer or none
function recoveryUi(ui: EditorUi, recovery: EditorStoreOptions['recovery']): EditorUi {
  if (recovery === null || recovery === undefined) return ui;
  return { ...ui, dialog: 'recovery', recovery: recovery.map((v) => ({ revision: v.revision, time: v.time })) };
}

// The model rules whose layer (rules.base) is the one the editor edits: the active breakpoint and style state (spec
// breakpoint-overrides, state-styles), for the readers of the editor (the fields, the handles), as the store hands
// them to handlers. One object per layer, so a reader that compares what it read sees no change.
const layeredByKey = new Map<string, ModelRules>();
export function layeredRules(ui: EditorUi): ModelRules {
  const layer = activeLayer(ui);
  if (layer.breakpoint === MODEL_RULES.base.breakpoint && layer.state === MODEL_RULES.base.state) return MODEL_RULES;
  const key = `${layer.breakpoint}|${layer.state}`;
  let rules = layeredByKey.get(key);
  if (rules === undefined) {
    rules = { ...MODEL_RULES, base: layer };
    layeredByKey.set(key, rules);
  }
  return rules;
}

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
    clipboard: browserClipboard,
    css: browserCss,
    // the class the Style tab targets, whose styles the style writes go to (inspector/style-target.ts)
    styleClass: (ui) => ui.styleTarget ?? null,
    version: (revision) => options.recovery?.find((v) => String(v.revision) === revision)?.document,
    readOnly: () => !isEditing(),
    layer: activeLayer,
    editing: { takeOver },
    initial: { document, selection: options.restored?.selection ?? [], ui: recoveryUi(initialEditorUi(preferences), options.recovery ?? null), message: options.restored?.recovered === true ? message('status.save.recovered') : null },
    freeze: import.meta.env.DEV,
    // Layers unfolds what hides a selected node; a text edit and a rename end once their node is not the selection
    // alone, and when an undoable command runs
    followSelection: (state) => {
      const revealed = { ...state, ui: targetOffSelection({ ...state, ui: revealSelection(state) }) };
      return endRenameOffSelection({ ...revealed, ui: endOffSelection(revealed) });
    },
    followCommand: (state, command) => endRenameOnUndoable({ ...state, ui: endOnUndoable(state, command) }, command),
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
