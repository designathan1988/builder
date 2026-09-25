// The drag session (ARCHITECTURE.md, Command owners): drag.levelUp, drag.levelDown and drag.cancel, the keys of a drag
// in progress (spec drag-level-keys-escape). The pointer owner (pointer.ts) runs the drag inside its gesture and reads
// the keys in the drag key context (keymap.ts); this module keeps what the keys change:
// - The live drag: the drag the pointer owner runs now (an element's, or a palette tile's creation drag), numbered,
//   with the nodes it moves (none for a creation drag) and the proposal its pointer makes (drop.ts, with its escape
//   ladder). Pointer state, like the hovered node: only the pointer owner sets it, and the handlers read it.
// - In the editor state, changed only by the handlers: the level the level keys set, which belongs to the live drag it
//   was set in (a new drag starts at level 0), and how many drags have been cancelled.
// The ladder of a proposal climbs one receiver at a time: a drop before a sibling goes before the receiver, a drop
// after a sibling or inside a container goes after the receiver, in the receiver's own parent; the page root is the
// ceiling (Problems in Pager 1: an ArrowUp there is refused with status.drop.topLevel and the level stays). The level
// shown is never above the ladder's top, so one ArrowDown always goes one level down from what is drawn (Problems in
// Pager 1 and 3). A level key never touches the page: the pointer owner redraws the proposal of the new level as soon
// as the state changes, without a pointer move (Problems in Pager 2), and its release drops that one.
// drag.cancel records the cancellation and says so; the pointer owner, which holds the gesture, ends the drag when a
// cancellation newer than the gesture's opening arrives: nothing the drag proposed is dropped, and the release that
// follows drops nothing (specs drag-level-keys-escape, palette-drag-insert).
import { message, registerHandler, type Message } from '../../core/commands/registry.ts';
import { locate, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { EditorUi } from '../state.ts';
import type { DropProposal } from './drop.ts';

export interface DragSessionState {
  // how many times a drag has been cancelled
  readonly cancels: number;
  // the live drag the level was set in (0: none); the level of any other drag is 0
  readonly drag: number;
  // the receiver levels climbed above the pointer's own proposal
  readonly level: number;
}

export const INITIAL_DRAG_SESSION: DragSessionState = { cancels: 0, drag: 0, level: 0 };

export interface LiveDrag {
  readonly id: number;
  // the nodes the drag moves; none for a creation drag
  readonly dragged: readonly NodeId[];
  // the proposal the pointer makes, at level 0; null while it makes none (off the page)
  readonly base: DropProposal | null;
}

let live: LiveDrag | null = null;
let counter = 0;

// The pointer owner's side: a drag begins with what it moves, proposes as the pointer goes, and ends with its gesture.
export const liveDrag = {
  get: (): LiveDrag | null => live,
  begin(dragged: readonly NodeId[]): void {
    counter += 1;
    live = { id: counter, dragged, base: null };
  },
  propose(base: DropProposal | null): void {
    if (live !== null) live = { ...live, base };
  },
  end(): void {
    live = null;
  },
};

// One receiver level out: before the receiver for a drop before a sibling, after it otherwise, in the receiver's own
// parent (its index counted without the dragged nodes); null for a refused proposal and at the page root.
function climb(document: DocumentJson, dragged: readonly NodeId[], proposal: DropProposal): DropProposal | null {
  if (proposal.refused) return null;
  const receiver = locate(document, proposal.parent);
  if (!receiver?.parent) return null;
  const placement = proposal.placement === 'before' ? 'before' : 'after';
  const siblings = receiver.parent.children.filter((c) => !dragged.includes(c.id));
  const index = siblings.findIndex((c) => c.id === proposal.parent) + (placement === 'after' ? 1 : 0);
  return { parent: receiver.parent.id, index, placement, reference: proposal.parent, refused: false };
}

// The proposals of every level, from the pointer's own (level 0) up to one among the page root's children.
export function ladder(document: DocumentJson, dragged: readonly NodeId[], base: DropProposal | null): DropProposal[] {
  const levels: DropProposal[] = [];
  for (let at = base; at !== null; at = climb(document, dragged, at)) levels.push(at);
  return levels;
}

// The level shown for a live drag: the one set in it, never above its ladder's top.
function shownLevel(state: DragSessionState, drag: LiveDrag, levels: readonly DropProposal[]): number {
  if (state.drag !== drag.id) return 0;
  return Math.max(0, Math.min(state.level, levels.length - 1));
}

// The proposal a live drag draws, and its release drops: its ladder at the level shown, and that level.
export function drawnProposal(state: DragSessionState, drag: LiveDrag, document: DocumentJson): { readonly proposal: DropProposal | null; readonly level: number } {
  const levels = ladder(document, drag.dragged, drag.base);
  const level = shownLevel(state, drag, levels);
  return { proposal: levels[level] ?? null, level };
}

// What the status bar says of the proposal a level key draws: where the drop goes, by the node it is placed against.
function where(document: DocumentJson, proposal: DropProposal): Message {
  const name = locate(document, proposal.reference)?.node.name ?? '';
  return message(proposal.placement === 'before' ? 'status.drop.before' : proposal.placement === 'after' ? 'status.drop.after' : 'status.drop.inside', { name });
}

const atLevel = (ui: EditorUi, drag: number, level: number): EditorUi => ({ ...ui, drag: { ...ui.drag, drag, level } });

// ArrowUp: one receiver level out; refused at the top, where the level stays. With no live drag, or no proposal (off
// the page), there is nothing to climb.
export const levelUp = registerHandler<'drag.levelUp', EditorUi>('drag.levelUp', ({ state }) => {
  const drag = live;
  if (drag === null || drag.base === null) return { kind: 'change' };
  const levels = ladder(state.document, drag.dragged, drag.base);
  const shown = shownLevel(state.ui.drag, drag, levels);
  const next = levels[shown + 1];
  if (next === undefined) return { kind: 'refused', message: message('status.drop.topLevel') };
  return { kind: 'change', ui: atLevel(state.ui, drag.id, shown + 1), message: where(state.document, next) };
});

// ArrowDown: one level down from the one shown, never below the pointer's own proposal.
export const levelDown = registerHandler<'drag.levelDown', EditorUi>('drag.levelDown', ({ state }) => {
  const drag = live;
  if (drag === null || drag.base === null) return { kind: 'change' };
  const levels = ladder(state.document, drag.dragged, drag.base);
  const shown = shownLevel(state.ui.drag, drag, levels);
  const next = levels[shown - 1];
  if (next === undefined) return { kind: 'change' };
  return { kind: 'change', ui: atLevel(state.ui, drag.id, shown - 1), message: where(state.document, next) };
});

// Escape: the cancellation, which the pointer owner reads to end the drag of its gesture.
export const cancelDrag = registerHandler<'drag.cancel', EditorUi>('drag.cancel', ({ state }) => ({
  kind: 'change',
  ui: { ...state.ui, drag: { ...state.ui.drag, cancels: state.ui.drag.cancels + 1 } },
  message: message('status.drag.cancelled'),
}));
