// The one store. State changes only through dispatch(command): the store looks up the command's entry in the
// command table, checks its availability predicate, runs its handler, applies the handler's patches as one
// transaction, validates the whole document and the selection, records the transaction in the history when the
// command is undoable and changed something, and notifies subscribers. A state that fails validation is never
// committed. In development and tests every committed state is deep-frozen.
// The editor state (Ui) is opaque here: the editor's handlers own it.
import type { CommandArgs } from '../../generated/commands.ts';
import type { CommandId, ConstantId, MessageId } from '../../generated/ids.ts';
import type { Command } from '../../manifest/schema.ts';
import { isBuilt, message, type CommandTable, type HandlerContext, type Message, type Outcome, type PredicateTable } from '../commands/registry.ts';
import type { DocumentJson, Selection } from '../document/model.ts';
import { validateDocument, type Invalid, type ModelRules } from '../document/validate.ts';
import { EMPTY_HISTORY, REDONE, UNDONE, record, redo, undo, type HistoryState, type Restorable } from '../history/history.ts';
import { applyPatches, deepEqual, type Patch, type Transaction } from '../history/transaction.ts';
import type { Clock } from '../ports/clock.ts';
import type { Downloads } from '../ports/download.ts';
import type { IdGenerator } from '../ports/ids.ts';
import { noLayout, type Layout } from '../ports/layout.ts';

export interface StoreState<Ui> {
  readonly document: DocumentJson;
  readonly selection: Selection;
  readonly history: HistoryState;
  // the last message, shown in the status bar (an aria-live region)
  readonly message: Message | null;
  readonly ui: Ui;
}

export type DispatchResult =
  | { readonly status: 'done'; readonly changed: boolean }
  | { readonly status: 'refused'; readonly message: Message }
  | { readonly status: 'not-available-yet' };

export class InvalidStateError extends Error {
  override name = 'InvalidStateError';
  constructor(
    // the command that produced the state, or "initial state"
    readonly source: string,
    readonly problems: readonly Invalid[],
  ) {
    super(`${source} produced an invalid state: ${problems.map((p) => `${p.path}: ${p.message}`).join('; ')}`);
  }
}

// A change of the document, for the renderer: the patches that turn `before` into `after`, in order (a
// transaction's patches, its inverses on undo, a cancelled gesture's inverses; a loaded project replaces the pages).
export interface DocumentChange {
  readonly before: DocumentJson;
  readonly after: DocumentJson;
  readonly patches: readonly Patch[];
}

// One pointer gesture: everything dispatched through it is applied at once (the canvas follows the pointer) and
// becomes one transaction and one history entry at commit; cancel restores the state from before the gesture.
export interface Gesture {
  dispatch<Id extends CommandId>(id: Id, args: CommandArgs[Id]): DispatchResult;
  commit(): void;
  cancel(): void;
}

export interface Store<Ui> {
  getState(): StoreState<Ui>;
  dispatch<Id extends CommandId>(id: Id, args: CommandArgs[Id]): DispatchResult;
  gesture(): Gesture;
  // Whether the command would run now with these arguments: it is built, its availability predicate holds and its
  // handler does not refuse. Nothing changes: the handler's outcome is read and dropped (handlers are pure). The
  // context menu shows only the commands that apply to the selection (DESIGN.md "Overlays").
  canRun<Id extends CommandId>(id: Id, args: CommandArgs[Id]): boolean;
  // Why the command would not run now with these arguments: "not available yet" while it is not built, else the
  // refusal of its availability predicate or of its handler; null when it would run. Nothing changes, as with canRun
  // (a palette tile's creation drag draws the refusal its drop would meet, spec palette-drag-insert).
  refusal<Id extends CommandId>(id: Id, args: CommandArgs[Id]): Message | null;
  subscribe(listener: () => void): () => void;
  // every change of the document, with its patches, before the state's subscribers hear of it
  subscribeDocument(listener: (change: DocumentChange) => void): () => void;
}

export interface StoreOptions<Ui> {
  readonly table: CommandTable<Ui>;
  readonly predicates: PredicateTable<Ui>;
  // the manifest's commands: availability and history of each
  readonly commands: ReadonlyMap<CommandId, Command>;
  // the manifest's interaction constants, for coalescing windows
  readonly constants: ReadonlyMap<ConstantId, number | readonly number[]>;
  readonly rules: ModelRules;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  // a catalogue text in the language the editor state holds (the core never reads the editor state itself)
  readonly words: (ui: Ui, key: MessageId) => string;
  // where the canvas draws the page's nodes (the editor's canvas); none drawn when absent
  readonly layout?: Layout;
  // where a file a command hands out goes (the browser's downloads in the editor); nowhere when absent
  readonly downloads?: Downloads;
  readonly initial: { readonly document: DocumentJson; readonly selection?: Selection; readonly ui: Ui };
  // deep-freeze every committed state (development and tests)
  readonly freeze: boolean;
  // the editor state that follows a new selection, whichever command or undo step changed it (the editor's owner of
  // that state knows it: Layers unfolds the branches that hide a selected node)
  readonly followSelection?: (state: StoreState<Ui>) => Ui;
  // the editor state that follows a command that ran, by the command's manifest data (a text edit ends when an
  // undoable command runs: the document may change under it); it returns the same editor state when nothing follows
  readonly followCommand?: (state: StoreState<Ui>, command: Command) => Ui;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

interface OpenGesture {
  readonly before: StoreState<unknown>;
  command: CommandId | null;
  patches: Patch[];
  inverses: Patch[];
}

export function createStore<Ui>(options: StoreOptions<Ui>): Store<Ui> {
  const { table, predicates, commands, rules, clock, ids } = options;
  const listeners = new Set<() => void>();
  const documentListeners = new Set<(change: DocumentChange) => void>();

  // every built command names a registered availability predicate
  for (const [id, command] of commands) {
    if (isBuilt(table[id]) && predicates[command.availability.predicate as keyof PredicateTable<Ui>] === undefined) {
      throw new Error(`${id} is built but its availability predicate "${command.availability.predicate}" is not registered`);
    }
  }

  const commit = (next: StoreState<Ui>, source: string): StoreState<Ui> => {
    const problems = validateDocument(next.document, next.selection, rules);
    if (problems.length > 0) throw new InvalidStateError(source, problems);
    return options.freeze ? deepFreeze(next) : next;
  };

  let state = commit(
    { document: options.initial.document, selection: options.initial.selection ?? [], history: EMPTY_HISTORY, message: null, ui: options.initial.ui },
    'the initial state',
  );
  let open: OpenGesture | null = null;
  // the coalescing key of the last dispatch when it recorded an entry that may merge; any other dispatch clears it,
  // so a burst merges only when no other command came in between (spec absolute-nudge)
  let lastMergeable: string | null = null;

  // a committed state whose selection changed, with the editor state that follows it
  const followSelection = (before: StoreState<Ui>, next: StoreState<Ui>): StoreState<Ui> => {
    if (options.followSelection === undefined || deepEqual(before.selection, next.selection)) return next;
    const ui = options.followSelection(next);
    if (ui === next.ui) return next;
    const followed = { ...next, ui };
    return options.freeze ? deepFreeze(followed) : followed;
  };

  const publish = (committed: StoreState<Ui>, patches: readonly Patch[] = []) => {
    const before = state;
    const next = followSelection(before, committed);
    state = next;
    if (next.document !== before.document) {
      const change: DocumentChange = { before: before.document, after: next.document, patches };
      for (const listener of [...documentListeners]) listener(change);
    }
    for (const listener of [...listeners]) listener();
  };

  // Commands that coalesce merge entries with the same target and property: the target is the node the arguments
  // name, or else the selection the command acts on.
  const coalescing = (command: Command, args: unknown, selection: Selection): { key: string | null; within: number | null } => {
    const h = command.history;
    if (!h.undoable || h.coalesce === 'none') return { key: null, within: null };
    const constant = options.constants.get(h.coalesce.within as ConstantId);
    const within = typeof constant === 'number' ? constant : null;
    const a = (args ?? {}) as Record<string, unknown>;
    return { key: `${command.id}|${JSON.stringify(a.target ?? a.targets ?? a.nodes ?? selection)}|${JSON.stringify(a.property ?? null)}`, within };
  };

  // what a handler reads: the state now, the ports and the words of the person's language
  const handlerContext = (): HandlerContext<Ui> => {
    const ui = state.ui;
    return { state, clock, ids, rules, words: (key) => options.words(ui, key), layout: options.layout ?? noLayout };
  };

  const run = <Id extends CommandId>(id: Id, args: CommandArgs[Id], gesture: OpenGesture | null): DispatchResult => {
    const entry = table[id];
    const command = commands.get(id);
    if (!command) throw new Error(`unknown command ${id}`);
    const previousMergeable = lastMergeable;
    lastMergeable = null;
    // the manifest's history.transaction: a command recorded once per dispatch never joins a gesture's transaction
    if (gesture && command.history.undoable && command.history.transaction === 'per-dispatch') throw new Error(`${id} records one transaction per dispatch: it cannot run inside a gesture`);
    if (!isBuilt(entry)) return { status: 'not-available-yet' };
    const predicate = predicates[command.availability.predicate as keyof PredicateTable<Ui>];
    if (predicate && !predicate.test(state)) {
      const declared = message((command.availability.refusalKey ?? 'common.notAvailableYet') as Message['key']);
      const refusal = predicate.refusal?.(state) ?? declared;
      if (refusal.key !== declared.key && !(command.refusals as readonly string[]).includes(refusal.key)) throw new Error(`${id}: its predicate refuses with ${refusal.key}, which the manifest does not declare for it`);
      publish(commit({ ...state, message: refusal }, id));
      return { status: 'refused', message: refusal };
    }
    const outcome: Outcome<Ui> = entry.run(handlerContext(), args);

    if (outcome.kind === 'refused') {
      publish(commit({ ...state, message: outcome.message }, id));
      return { status: 'refused', message: outcome.message };
    }
    if (outcome.kind === 'undo' || outcome.kind === 'redo') {
      if (gesture) throw new Error(`${id} cannot run inside a gesture`);
      const tx = outcome.kind === 'undo' ? state.history.past.at(-1) : state.history.future.at(-1);
      const restored: Restorable | null = (outcome.kind === 'undo' ? undo : redo)(state);
      if (restored === null || tx === undefined) return { status: 'done', changed: false };
      publish(commit({ ...state, ...restored, message: outcome.kind === 'undo' ? UNDONE : REDONE }, id), outcome.kind === 'undo' ? tx.inverses : tx.patches);
      return { status: 'done', changed: true };
    }
    if (outcome.kind === 'load') {
      if (gesture) throw new Error(`${id} cannot run inside a gesture`);
      const loaded = commit({ ...state, document: outcome.document, selection: [], history: EMPTY_HISTORY, message: outcome.message ?? state.message }, id);
      publish(loaded, [{ op: 'replace', path: ['pages'], value: outcome.document.pages }]);
      return { status: 'done', changed: true };
    }

    const before = state;
    const applied = applyPatches(before.document, outcome.patches ?? []);
    const documentChanged = applied.applied.length > 0 && !deepEqual(before.document, applied.document);
    if (documentChanged && !command.history.undoable) throw new Error(`${id} is not undoable in the manifest but changed the document`);
    const selection = outcome.selection ?? before.selection;
    let history = before.history;
    if (documentChanged && gesture) {
      gesture.command ??= id;
      gesture.patches.push(...applied.applied);
      gesture.inverses.unshift(...applied.inverses);
    } else if (documentChanged) {
      const { key, within } = coalescing(command, args, before.selection);
      const tx: Transaction = { command: id, patches: applied.applied, inverses: applied.inverses, selectionBefore: before.selection, selectionAfter: selection, at: clock.now(), coalesceKey: key };
      history = record(before.history, tx, key !== null && key === previousMergeable ? within : null);
      lastMergeable = key;
    }
    const ran: StoreState<Ui> = {
      document: documentChanged ? applied.document : before.document,
      selection,
      history,
      message: outcome.message ?? before.message,
      ui: outcome.ui ?? before.ui,
    };
    const next: StoreState<Ui> = options.followCommand === undefined ? ran : { ...ran, ui: options.followCommand(ran, command) };
    const changed = documentChanged || !deepEqual(before.selection, next.selection) || next.ui !== before.ui || next.message !== before.message;
    if (changed) publish(commit(next, id), documentChanged ? applied.applied : []);
    // the file the command hands out, once its state is committed
    if (outcome.download !== undefined) options.downloads?.deliver(outcome.download);
    return { status: 'done', changed };
  };

  // why a command would not run now (the predicate's refusal, as run() reads it, or the handler's): nothing changes,
  // the handler's outcome is read and dropped (handlers are pure)
  const refusal = <Id extends CommandId>(id: Id, args: CommandArgs[Id]): Message | null => {
    const entry = table[id];
    const command = commands.get(id);
    if (!command) throw new Error(`unknown command ${id}`);
    if (!isBuilt(entry)) return message('common.notAvailableYet');
    const predicate = predicates[command.availability.predicate as keyof PredicateTable<Ui>];
    if (predicate && !predicate.test(state)) return predicate.refusal?.(state) ?? message((command.availability.refusalKey ?? 'common.notAvailableYet') as Message['key']);
    const outcome = entry.run(handlerContext(), args);
    return outcome.kind === 'refused' ? outcome.message : null;
  };

  return {
    getState: () => state,
    canRun: (id, args) => refusal(id, args) === null,
    refusal,
    dispatch: (id, args) => {
      if (open) throw new Error('a gesture is open: dispatch through it');
      return run(id, args, null);
    },
    gesture: () => {
      if (open) throw new Error('a gesture is already open');
      const current: OpenGesture = { before: state as StoreState<unknown>, command: null, patches: [], inverses: [] };
      open = current;
      const close = () => {
        if (open !== current) throw new Error('this gesture is closed');
        open = null;
      };
      return {
        dispatch: (id, args) => {
          if (open !== current) throw new Error('this gesture is closed');
          return run(id, args, current);
        },
        commit: () => {
          close();
          const before = current.before as StoreState<Ui>;
          if (current.command === null || current.patches.length === 0 || deepEqual(before.document, state.document)) return;
          // one gesture is one entry: it never merges with another
          const tx: Transaction = { command: current.command, patches: current.patches, inverses: current.inverses, selectionBefore: before.selection, selectionAfter: state.selection, at: clock.now(), coalesceKey: null };
          publish(commit({ ...state, history: record(before.history, tx, null) }, current.command));
        },
        cancel: () => {
          close();
          const before = current.before as StoreState<Ui>;
          if (state !== before) publish(commit({ ...state, document: before.document, selection: before.selection, history: before.history }, 'a cancelled gesture'), current.inverses);
        },
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeDocument: (listener) => {
      documentListeners.add(listener);
      return () => documentListeners.delete(listener);
    },
  };
}
