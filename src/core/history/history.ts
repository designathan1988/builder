// The history: the undo and redo stacks of transactions. Undo applies a transaction's inverses and restores the
// selection from before its command; redo applies its patches again and restores the selection from after it.
// A new transaction empties the redo stack; a command that changes nothing records no entry (the store never
// calls record for it). Commands whose manifest history coalesces (same target and property within a constant)
// merge into the previous entry.
import { message, registerHandler, registerPredicate } from '../commands/registry.ts';
import type { DocumentJson, Selection } from '../document/model.ts';
import { applyPatches, type Transaction } from './transaction.ts';

export interface HistoryState {
  // oldest first
  readonly past: readonly Transaction[];
  // the next redo last
  readonly future: readonly Transaction[];
}

export const EMPTY_HISTORY: HistoryState = { past: [], future: [] };

// Records a transaction: it merges into the last entry when both carry the same coalescing key and the last one
// was recorded at most `within` ms before; otherwise it is a new entry. The redo stack is emptied either way.
export function record(history: HistoryState, tx: Transaction, within: number | null): HistoryState {
  const last = history.past[history.past.length - 1];
  if (last !== undefined && within !== null && tx.coalesceKey !== null && tx.coalesceKey === last.coalesceKey && tx.at - last.at <= within) {
    const merged: Transaction = {
      command: last.command,
      patches: [...last.patches, ...tx.patches],
      inverses: [...tx.inverses, ...last.inverses],
      selectionBefore: last.selectionBefore,
      selectionAfter: tx.selectionAfter,
      at: tx.at,
      coalesceKey: last.coalesceKey,
    };
    return { past: [...history.past.slice(0, -1), merged], future: [] };
  }
  return { past: [...history.past, tx], future: [] };
}

export interface Restorable {
  readonly document: DocumentJson;
  readonly selection: Selection;
  readonly history: HistoryState;
}

// The state one undo step back, or null when there is nothing to undo.
export function undo(state: Restorable): Restorable | null {
  const tx = state.history.past[state.history.past.length - 1];
  if (tx === undefined) return null;
  return {
    document: applyPatches(state.document, tx.inverses).document,
    selection: tx.selectionBefore,
    history: { past: state.history.past.slice(0, -1), future: [...state.history.future, tx] },
  };
}

// The state one redo step forward, or null when there is nothing to redo.
export function redo(state: Restorable): Restorable | null {
  const tx = state.history.future[state.history.future.length - 1];
  if (tx === undefined) return null;
  return {
    document: applyPatches(state.document, tx.patches).document,
    selection: tx.selectionAfter,
    history: { past: [...state.history.past, tx], future: state.history.future.slice(0, -1) },
  };
}

export const canUndo = registerPredicate('canUndo', (state) => state.history.past.length > 0);
export const canRedo = registerPredicate('canRedo', (state) => state.history.future.length > 0);

// The store walks the history for these outcomes and says "Undone" or "Redone" (spec undo-redo, Problems 2).
export const undoCommand = registerHandler('history.undo', () => ({ kind: 'undo' }));
export const redoCommand = registerHandler('history.redo', () => ({ kind: 'redo' }));
export const UNDONE = message('status.undone');
export const REDONE = message('status.redone');
