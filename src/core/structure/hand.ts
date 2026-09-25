// The hand (ARCHITECTURE.md, Command owners; spec hand-keyboard-move): the keyboard's drag and drop. hand.take puts
// the one selected element into the hand, aimed at the slot it stands in; while it is held the canvas's keys are the
// hand's (the keymap reads heldHand): hand.aimNext and hand.aimPrevious walk the insertion slots in reading order
// (aimPrevious is the binding Pager lacks, spec Problems in Pager 1), hand.climb aims right after the current receiver
// inside its parent (the place "one level out" lands during a mouse drag, Problems in Pager 2) and hand.descend goes
// back down the levels the climbs left, the same ladder only; Enter places the element at the aim through
// element.moveTo (move.ts), one dispatch and so one undo step; hand.drop lets go and changes nothing.
//
// - A slot is a container and an index among its children without the held element, in reading order: before each
//   child, that child's own slots, and after the last one. The held element's own subtree has none (spec, "Hit
//   zones"); the first aim is the element's own place. aimNext and aimPrevious stop at the last and the first slot.
// - Each aim is checked by the move element.moveTo makes (moveSelectionTo, the one move rule): a refused aim is
//   announced with that refusal, and Enter there is refused the same way and changes nothing.
// - The status bar says, after each key, the receiver, the position the element would take among its children and the
//   level of the ladder (the receiver the climbs started from and its ancestors).
// - The hand holds only while the document it was taken on is the document and the held element is the selection
//   alone: placing it (Enter), an undo, any edit or another selection ends it, so a stale aim is never used.
// - The page root and a hidden element (element.toggleHidden, flags.ts) are refused. Locked elements and locked
//   containers are not refused or skipped yet: the model has no lock flag.
// - The state is the editor's part of the store state (`hand`); this module owns it and the editor state holds it.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type HandlerContext, type Message, type Outcome } from '../commands/registry.ts';
import { locate, type DocNode, type DocumentJson } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import type { StoreState } from '../store/store.ts';
import { moveSelectionTo } from './move.ts';

// Where the hand aims: the receiver and the index the held element would take among its children (without it).
export interface Aim {
  readonly parent: NodeId;
  readonly index: number;
}

export interface HandState {
  readonly held: NodeId;
  // the document the hand was taken on: the hand holds only while it is the store's document
  readonly on: DocumentJson;
  readonly aim: Aim;
  // the aims the climbs left, the first climb's first: a descent goes back to the last one
  readonly below: readonly Aim[];
  // the move's refusal of the aim, which the canvas draws on the indicator; null where the element may land
  readonly refusal: Message | null;
}

// the editor state's part that the hand owns
export interface WithHand {
  readonly hand: HandState | null;
}

export const NO_HAND: HandState | null = null;

// The hand held now, or null: none was taken, it was dropped, or the document or the selection changed since.
export function heldHand<Ui extends WithHand>(state: StoreState<Ui>): HandState | null {
  const hand = state.ui.hand;
  if (hand === null || hand.on !== state.document) return null;
  return state.selection.length === 1 && state.selection[0] === hand.held ? hand : null;
}

// What a key of the hand acts on (the keymap asks): the hand's aim, as the arguments of the key's command that name
// it (Enter: element.moveTo's parent and index); nothing for a command that takes neither (the aim keys, Escape).
export function aimArgs(hand: HandState, argNames: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(hand.aim).filter(([name]) => argNames.includes(name)));
}

const isContainer = (rules: ModelRules, node: DocNode) => rules.elements.get(node.type)?.content === 'children';

// Every slot of the held element's page, in reading order, without the held element and its subtree.
export function slotsFor(document: DocumentJson, rules: ModelRules, held: NodeId): Aim[] {
  const at = locate(document, held);
  const tree = at === null ? undefined : document.pages[at.page]?.tree;
  const slots: Aim[] = [];
  const visit = (node: DocNode) => {
    if (!isContainer(rules, node)) return;
    const children = node.children.filter((c) => c.id !== held);
    for (const [index, child] of children.entries()) {
      slots.push({ parent: node.id, index });
      visit(child);
    }
    slots.push({ parent: node.id, index: children.length });
  };
  if (tree !== undefined) visit(tree);
  return slots;
}

const sameAim = (a: Aim, b: Aim) => a.parent === b.parent && a.index === b.index;

// The receiver and its ancestors, the receiver first.
function ladderOf(document: DocumentJson, parent: NodeId): NodeId[] {
  const ladder: NodeId[] = [];
  for (let at = locate(document, parent); at !== null; at = at.parent === null ? null : locate(document, at.parent.id)) ladder.push(at.node.id);
  return ladder;
}

// The move's refusal of an aim for the held element (the drop validator), or null.
function refusalOf(document: DocumentJson, rules: ModelRules, held: NodeId, aim: Aim): Message | null {
  const outcome = moveSelectionTo({ document, selection: [held] }, rules, aim.parent, aim.index);
  return outcome.kind === 'refused' ? outcome.message : null;
}

// What the status bar says of an aim: its refusal, else the receiver, the position among its children and the level
// of the ladder.
function aimMessage(document: DocumentJson, hand: HandState): Message {
  if (hand.refusal !== null) return hand.refusal;
  const receiver = locate(document, hand.aim.parent);
  const count = (receiver?.node.children.filter((c) => c.id !== hand.held).length ?? 0) + 1;
  const levels = ladderOf(document, (hand.below[0] ?? hand.aim).parent).length;
  return message('status.hand.aim', { receiver: receiver?.node.name ?? '', position: hand.aim.index + 1, count, level: hand.below.length + 1, levels });
}

// The hand's commands for an editor state that holds the hand (the editor's EditorUi).
export function handCommands<Ui extends WithHand>() {
  const aimed = (context: HandlerContext<Ui>, aiming: Omit<HandState, 'refusal'>): Outcome<Ui> => {
    const { document } = context.state;
    const hand: HandState = { ...aiming, refusal: refusalOf(document, context.rules, aiming.held, aiming.aim) };
    return { kind: 'change', ui: { ...context.state.ui, hand }, message: aimMessage(document, hand) };
  };
  // an aim key with nothing in the hand does nothing (its doors wait in the hand's key context, which only a held
  // element opens)
  const nothing: Outcome<Ui> = { kind: 'change' };
  const step = (context: HandlerContext<Ui>, by: 1 | -1): Outcome<Ui> => {
    const hand = heldHand(context.state);
    if (hand === null) return nothing;
    const slots = slotsFor(context.state.document, context.rules, hand.held);
    const at = slots.findIndex((s) => sameAim(s, hand.aim));
    const next = slots[Math.max(0, Math.min(slots.length - 1, at + by))] ?? hand.aim;
    return aimed(context, { ...hand, aim: next, below: [] });
  };

  return {
    // spec, "Trigger": M with exactly one element selected (the predicate singleSelection); never the page root or a
    // hidden element
    take: registerHandler<'hand.take', Ui>('hand.take', ({ state }) => {
      const id = state.selection[0];
      const at = id === undefined ? null : locate(state.document, id);
      // the availability predicate (singleSelection) lets no door run without one selected node of the document
      if (id === undefined || at === null) throw new Error('hand.take: the selection names no node of the document');
      if (at.parent === null) return { kind: 'refused', message: message('status.hand.root') };
      if (at.node.hidden === true) return { kind: 'refused', message: message('status.hand.hidden', { name: at.node.name }) };
      // its own place: where it stands, which the move never refuses
      const hand: HandState = { held: id, on: state.document, aim: { parent: at.parent.id, index: at.index }, below: [], refusal: null };
      return { kind: 'change', ui: { ...state.ui, hand }, message: message('status.hand.holding', { name: at.node.name }) };
    }),
    aimNext: registerHandler<'hand.aimNext', Ui>('hand.aimNext', (context) => step(context, 1)),
    aimPrevious: registerHandler<'hand.aimPrevious', Ui>('hand.aimPrevious', (context) => step(context, -1)),
    // one level out: right after the receiver inside its parent; the page root has no level above it
    climb: registerHandler<'hand.climb', Ui>('hand.climb', (context) => {
      const hand = heldHand(context.state);
      if (hand === null) return nothing;
      const receiver = locate(context.state.document, hand.aim.parent);
      if (receiver?.parent == null) return aimed(context, hand);
      const index = receiver.parent.children.filter((c) => c.id !== hand.held).findIndex((c) => c.id === receiver.node.id) + 1;
      return aimed(context, { ...hand, aim: { parent: receiver.parent.id, index }, below: [...hand.below, hand.aim] });
    }),
    // back down the ladder a climb left; with no climb there is no level below
    descend: registerHandler<'hand.descend', Ui>('hand.descend', (context) => {
      const hand = heldHand(context.state);
      if (hand === null) return nothing;
      const back = hand.below.at(-1);
      return aimed(context, back === undefined ? hand : { ...hand, aim: back, below: hand.below.slice(0, -1) });
    }),
    // spec, "Visual feedback": Escape drops the hand; the document is unchanged
    drop: registerHandler<'hand.drop', Ui>('hand.drop', ({ state }) => ({ kind: 'change', ui: { ...state.ui, hand: NO_HAND }, message: message('status.hand.dropped') })),
  };
}
