// Keyboard focus (ARCHITECTURE.md, Command owners): focus.next, focus.previous, focus.first, focus.last and
// focus.activate move the keyboard focus among the items of the region that holds it, or run the focused item. The
// region is the element that names the focused key context (data-key-context: a menu, a toolbar, a tab strip…) and
// its items are its own focusable controls, in document order, not those of a region nested in it (a submenu).
// A handler never touches the page: it records the request in the editor state, and the focus owner's installer
// carries it out on the DOM focus when the state changes.
import { registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';
import type { EditorStore } from '../store.ts';

export type FocusMove = 'next' | 'previous' | 'first' | 'last' | 'activate' | 'parent';

export interface FocusState {
  // the last request; its number tells a new request from one already carried out
  readonly request: { readonly move: FocusMove; readonly count: number } | null;
}

export const INITIAL_FOCUS: FocusState = { request: null };

export const asking = (ui: EditorUi, move: FocusMove): EditorUi => ({ ...ui, focus: { request: { move, count: (ui.focus.request?.count ?? 0) + 1 } } });

export const focusNext = registerHandler<'focus.next', EditorUi>('focus.next', ({ state }) => ({ kind: 'change', ui: asking(state.ui, 'next') }));
export const focusPrevious = registerHandler<'focus.previous', EditorUi>('focus.previous', ({ state }) => ({ kind: 'change', ui: asking(state.ui, 'previous') }));
export const focusFirst = registerHandler<'focus.first', EditorUi>('focus.first', ({ state }) => ({ kind: 'change', ui: asking(state.ui, 'first') }));
export const focusLast = registerHandler<'focus.last', EditorUi>('focus.last', ({ state }) => ({ kind: 'change', ui: asking(state.ui, 'last') }));
export const focusActivate = registerHandler<'focus.activate', EditorUi>('focus.activate', ({ state }) => ({ kind: 'change', ui: asking(state.ui, 'activate') }));

// the controls that take the focus (an icon's <use href> is none)
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"]), [role^="menuitem"], [role="treeitem"], [role="tab"]';

// The items of the region the focus is in: its own visible focusable controls, in document order.
function itemsAround(focused: Element): { readonly items: HTMLElement[]; readonly at: number } | null {
  const region = focused.closest('[data-key-context]');
  if (!region) return null;
  const own = [...region.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.closest('[data-key-context]') === region && el.getClientRects().length > 0);
  // in a tree the items are its rows, not the buttons inside them (a row's caret, eye or lock)
  const rows = own.filter((el) => el.getAttribute('role') === 'treeitem');
  const items = rows.length > 0 ? rows : own;
  return { items, at: items.findIndex((el) => el === focused || el.contains(focused)) };
}

export function carryOut(move: FocusMove, focused: Element | null): void {
  if (!focused) return;
  const around = itemsAround(focused);
  if (!around || around.items.length === 0) return;
  const { items, at } = around;
  if (move === 'activate') {
    items[at]?.click();
    return;
  }
  // a tree row's parent row: the nearest row before it one level up (aria-level)
  if (move === 'parent') {
    const level = Number(items[at]?.getAttribute('aria-level') ?? '0');
    for (let i = at - 1; i >= 0; i -= 1) {
      if (Number(items[i]?.getAttribute('aria-level') ?? '0') === level - 1) {
        items[i]?.focus();
        return;
      }
    }
    return;
  }
  const count = items.length;
  // from the region itself (no item has the focus yet) next is the first item and previous the last
  const index = move === 'first' ? 0 : move === 'last' ? count - 1 : move === 'next' ? (at + 1) % count : at < 0 ? count - 1 : (at - 1 + count) % count;
  items[index]?.focus();
}

// Carries out each new request on the document's focus; returns its removal.
export function installFocus(store: EditorStore): () => void {
  let done = store.getState().ui.focus.request?.count ?? 0;
  return store.subscribe(() => {
    const request = store.getState().ui.focus.request;
    if (request === null || request.count === done) return;
    done = request.count;
    carryOut(request.move, document.activeElement);
  });
}
