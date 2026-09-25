// The drag session (ARCHITECTURE.md, Command owners): drag.levelUp, drag.levelDown and drag.cancel, the keys of a
// drag in progress (spec drag-level-keys-escape). The pointer owner (pointer.ts) runs the drag; this module keeps what
// the keys change:
// - The live drag: the press or drag the pointer owner holds now, numbered, with the nodes it moves and the proposal
//   its pointer makes at level 0 (the drop proposal, drop.ts, with its escape ladder). Pointer state, like the hovered
//   node: only the pointer owner sets it, and the handlers read it.
// - The level and the cancellation, editor state changed only by the handlers: the level belongs to one drag (a new
//   drag starts at level 0) and the cancellation names the drag Escape cancelled.
// The ladder of a proposal climbs one receiver at a time: a drop before a sibling goes before its parent, a drop after a
// sibling or inside a container goes after the receiver, in the receiver's own parent; the page root is the ceiling
// (Problems in Pager 1: the level stops there and an ArrowUp there is refused with status.drop.topLevel). The level
// shown is never above the ladder's top, so one ArrowDown always goes one level down from what is drawn (Problems in
// Pager 1 and 3). A handler never touches the page: the pointer owner redraws the proposal of the new level as soon as
// the state changes, without a pointer move (Problems in Pager 2), and leaves the drag on a cancellation.
import { message, registerHandler } from '../../core/commands/registry.ts';
import { locate, type DocumentJson, type NodeId } from '../../core/document/model.ts';
import type { EditorUi } from '../state.ts';
import type { DropProposal } from './drop.ts';

export interface DragSessionState {
  // the live drag the level was set in; the level of any other drag is 0
  readonly drag: number;
  // the receiver levels climbed above the pointer's own proposal
  readonly level: number;
  // the live drag Escape cancelled (0: none)
  readonly cancelled: number;
}

export const INITIAL_DRAG_SESSION: DragSessionState = { drag: 0, level: 0, cancelled: 0 };

export interface LiveDrag {
  readonly id: number;
  // the nodes the drag moves (none yet while the press has not become a drag)
  readonly dragged: readonly NodeId[];
  // the proposal the pointer makes at level 0; null while there is none
  readonly base: DropProposal | null;
}

let live: LiveDrag | null = null;
let counter = 0;

// The pointer owner's side: a press starts a live drag (its number), a drag names what it moves and proposes, and the
// end of the gesture (or a marquee, which is not a drag of elements) ends it.
export const liveDrag = {
  get: (): LiveDrag | null => live,
  begin(): number {
    counter += 1;
    live = { id: counter, dragged: [], base: null };
    return counter;
  },
  propose(dragged: readonly NodeId[], base: DropProposal | null): void {
    if (live !== null) live = { id: live.id, dragged, base };
  },
  end(): void {
    live = null;
  },
};

// One receiver level out: before the receiver for a drop before a sibling, after it otherwise, in the receiver's own
// parent (its index counted without the dragged nodes); null at the page root.
function climb(document: DocumentJson, dragged: readonly NodeId[], proposal: DropProposal): DropProposal | null {
  if (proposal.refused) return null;
  const receiver = locate(document, proposal.parent);
  if (!receiver?.parent) return null;
  const placement = proposal.placement === 'before' ? 'before' : 'after';
  const siblings = receiver.parent.children.filter((c) => !dragged.includes(c.id));
  const index = siblings.findIndex((c) => c.id === proposal.parent) + (placement === 'after' ? 1 : 0);
  return { parent: receiver.parent.id, index, placement, reference: proposal.parent, refused: false };
}

// The proposals of every level, from the pointer's own (level 0) up to the page root's children.
export function ladder(document: DocumentJson, dragged: readonly NodeId[], base: DropProposal | null): DropProposal[] {
  const levels: DropProposal[] = [];
  for (let at = base; at !== null; at = climb(document, dragged, at)) levels.push(at);
  return levels;
}

// The level drawn for a live drag: the one set in it, never above its ladder's top.
export function shownLevel(state: DragSessionState, drag: LiveDrag, document: DocumentJson): number {
  if (state.drag !== drag.id) return 0;
  return Math.max(0, Math.min(state.level, ladder(document, drag.dragged, drag.base).length - 1));
}

// The proposal a live drag draws and a release drops: its ladder at the level shown.
export function drawnProposal(state: DragSessionState, drag: LiveDrag, document: DocumentJson): { readonly proposal: DropProposal | null; readonly level: number } {
  const levels = ladder(document, drag.dragged, drag.base);
  const level = shownLevel(state, drag, document);
  return { proposal: levels[level] ?? null, level };
}

export const isCancelled = (state: DragSessionState, drag: number): boolean => state.cancelled === drag;

// the status of a proposal a level key draws: where the drop goes, named by its reference
const where = (document: DocumentJson, proposal: DropProposal) => {
  const name = locate(document, proposal.reference)?.node.name ?? '';
  return message(proposal.placement === 'before' ? 'status.drop.before' : proposal.placement === 'after' ? 'status.drop.after' : 'status.drop.inside', { name });
};

const atLevel = (ui: EditorUi, drag: number, level: number): EditorUi => ({ ...ui, drag: { ...ui.drag, drag, level } });

export const levelUp = registerHandler<'drag.levelUp', EditorUi>('drag.levelUp', ({ state }) => {
  const drag = live;
  if (drag === null || drag.base === null) return { kind: 'change' };
  const levels = ladder(state.document, drag.dragged, drag.base);
  const shown = shownLevel(state.ui.drag, drag, state.document);
  const next = levels[shown + 1];
  if (next === undefined) return { kind: 'refused', message: message('status.drop.topLevel') };
  return { kind: 'change', ui: atLevel(state.ui, drag.id, shown + 1), message: where(state.document, next) };
});

export const levelDown = registerHandler<'drag.levelDown', EditorUi>('drag.levelDown', ({ state }) => {
  const drag = live;
  if (drag === null || drag.base === null) return { kind: 'change' };
  const shown = shownLevel(state.ui.drag, drag, state.document);
  const next = ladder(state.document, drag.dragged, drag.base)[shown - 1];
  if (next === undefined) return { kind: 'change' };
  return { kind: 'change', ui: atLevel(state.ui, drag.id, shown - 1), message: where(state.document, next) };
});

export const cancel = registerHandler<'drag.cancel', EditorUi>('drag.cancel', ({ state }) => {
  const drag = live;
  if (drag === null || state.ui.drag.cancelled === drag.id) return { kind: 'change' };
  return { kind: 'change', ui: { ...state.ui, drag: { ...state.ui.drag, cancelled: drag.id } }, message: message('status.drag.cancelled') };
});
