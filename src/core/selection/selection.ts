// The selection (ARCHITECTURE.md, Command owners): which nodes are selected, the primary first. It lives in the
// store beside the document, never in it: selecting changes no document and records no history, and undo and redo
// restore the selection that belonged to the document state they go back to (history.ts).
import { message, registerHandler, registerPredicate, type Outcome } from '../commands/registry.ts';
import { locate, type DocNode, type Location } from '../document/model.ts';
import type { StoreState } from '../store/store.ts';
import type { Rect } from '../../generated/commands.ts';

// selection.clear's availability: something is selected (refused with "Select an element first." otherwise)
export const hasSelection = registerPredicate('hasSelection', (state) => state.selection.length > 0);

// selection.select: the node alone becomes the selection; the status bar names it. Every door gives a node of the
// document (a canvas click, a Layers row), so a node the document lacks is a defect of the door.
export const selectCommand = registerHandler('selection.select', ({ state }, { target }) => {
  const found = locate(state.document, target);
  if (!found) throw new Error(`selection.select: the document has no node ${target}`);
  return { kind: 'change', selection: [target], message: message('status.selected', { name: found.node.name }) };
});

// selection.clear: nothing is selected any more
export const clearSelectionCommand = registerHandler('selection.clear', () => ({ kind: 'change', selection: [], message: message('status.selection.cleared') }));

// selection.marquee (spec marquee-select): the band a drag draws from the empty area of the page or of a container
// selects what it covers, with the corrections of the spec's "Problems in Pager": the band starts at its press point
// (rect x, y; its width and height run from there to the pointer and are negative when the pointer went left or up),
// and only the descendants of the deepest node drawn under that point take part, so a band pressed in a container's
// empty area stays in that container and no node that contains the start point is ever taken. A leaf is taken when the
// band touches it (edges included, so a band as thin as a line takes what it crosses), a container when the band holds
// it entirely, and a taken node takes its descendants' place. The mode says what becomes of the selection the gesture
// started from: replaced, added to (the selection first, then what the band took in document order) or toggled. The
// boxes come from the layout port; the band is in page pixels too. No document changes and no history is recorded.
type Box = Rect;
const holdsPoint = (b: Box, p: { readonly x: number; readonly y: number }) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
const touches = (a: Box, b: Box) => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
const holds = (a: Box, b: Box) => b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;

export const marqueeCommand = registerHandler('selection.marquee', ({ state, layout, rules }, { rect, mode }) => {
  // the page the canvas shows: the one whose root it draws
  const page = state.document.pages.find((p) => layout.box(p.tree.id) !== null);
  if (!page) return { kind: 'change' };
  const start = { x: rect.x, y: rect.y };
  const band: Box = { x: Math.min(rect.x, rect.x + rect.width), y: Math.min(rect.y, rect.y + rect.height), width: Math.abs(rect.width), height: Math.abs(rect.height) };
  // the deepest node under the start point (a later sibling is drawn over an earlier one); the page root holds every point
  let scope: DocNode = page.tree;
  for (;;) {
    const inner: DocNode | undefined = [...scope.children].reverse().find((child) => {
      const box = layout.box(child.id);
      return box !== null && holdsPoint(box, start);
    });
    if (!inner) break;
    scope = inner;
  }
  const taken: DocNode[] = [];
  const visit = (node: DocNode) => {
    const box = layout.box(node.id);
    const container = rules.elements.get(node.type)?.content === 'children';
    if (box !== null && (container ? holds(band, box) : touches(band, box))) taken.push(node);
    else node.children.forEach(visit);
  };
  scope.children.forEach(visit);
  const took = taken.map((n) => n.id);
  const base = state.selection;
  const selection =
    mode === 'replace'
      ? took
      : mode === 'add'
        ? [...base, ...took.filter((id) => !base.includes(id))]
        : [...base.filter((id) => !took.includes(id)), ...took.filter((id) => !base.includes(id))];
  // the status bar names a single node, counts several and says when none is left, as for a click
  return several(state, selection);
});

// A selection of several nodes (spec multi-select-click): the nodes in the order they were selected, the primary
// first. The status bar names a single node, counts several, and says when none is left.
function several(state: StoreState<never>, selection: StoreState<never>['selection']): Outcome<never> {
  const only = selection.length === 1 && selection[0] !== undefined ? locate(state.document, selection[0]) : null;
  const said =
    selection.length === 0 ? message('status.selection.cleared') : only !== null ? message('status.selected', { name: only.node.name }) : message('status.selection.count', { count: selection.length });
  return { kind: 'change', selection, message: said };
}
function known(state: StoreState<never>, target: string) {
  // every door gives a node of the document (a canvas click, a Layers row), so a node the document lacks is a
  // defect of the door
  if (!locate(state.document, target)) throw new Error(`adding to the selection: the document has no node ${target}`);
}

// selection.add (Shift+click): the node joins the selection after the nodes already in it; a node already selected
// stays where it is (Shift+click adds and never removes, spec Problems in Pager 2)
export const addCommand = registerHandler('selection.add', ({ state }, { target }) => {
  known(state, target);
  return several(state, state.selection.includes(target) ? state.selection : [...state.selection, target]);
});

// selection.toggle (Ctrl+click): a selected node leaves the selection, any other joins it after the others (spec
// Problems in Pager 1)
export const toggleCommand = registerHandler('selection.toggle', ({ state }, { target }) => {
  known(state, target);
  return several(state, state.selection.includes(target) ? state.selection.filter((id) => id !== target) : [...state.selection, target]);
});

// The walk of the tree with the arrow keys (spec keyboard-tree-walk): one level per key from the primary node, the
// node reached alone becomes the selection and the status bar names it; at an end the selection stays and the status
// bar says why. Siblings are the parent's children, hidden or locked included; the page root is reached from its
// children and has no parent. Walking changes no document and records no history.
function walkFrom(state: StoreState<never>): Location {
  const primary = state.selection[0];
  const found = primary === undefined ? null : locate(state.document, primary);
  // the availability predicate (hasSelection) lets no door run without a selection; a selected node the document
  // lacks is a defect of the store
  if (!found) throw new Error('a walk of the tree: the selection names no node of the document');
  return found;
}
const reach = (node: DocNode): Outcome<never> => ({ kind: 'change', selection: [node.id], message: message('status.selected', { name: node.name }) });

// selection.walkNextSibling (ArrowRight): the next sibling; refused on the last child and on the page root
export const walkNextSiblingCommand = registerHandler('selection.walkNextSibling', ({ state }) => {
  const at = walkFrom(state);
  const next = at.parent?.children[at.index + 1];
  if (next) return reach(next);
  return { kind: 'refused', message: message('status.walk.noNext', { parent: at.parent?.name ?? state.document.pages[at.page]?.name ?? '' }) };
});

// selection.walkPreviousSibling (ArrowLeft): the previous sibling; refused on the first child and on the page root
export const walkPreviousSiblingCommand = registerHandler('selection.walkPreviousSibling', ({ state }) => {
  const at = walkFrom(state);
  const previous = at.index > 0 ? at.parent?.children[at.index - 1] : undefined;
  if (previous) return reach(previous);
  return { kind: 'refused', message: message('status.walk.noPrevious', { parent: at.parent?.name ?? state.document.pages[at.page]?.name ?? '' }) };
});

// selection.walkParent (ArrowUp): the parent, the page root included (unlike Pager); refused at the page root
export const walkParentCommand = registerHandler('selection.walkParent', ({ state }) => {
  const at = walkFrom(state);
  if (at.parent) return reach(at.parent);
  return { kind: 'refused', message: message('status.walk.atRoot') };
});

// selection.walkFirstChild (ArrowDown): the first child; refused on a node without children
export const walkFirstChildCommand = registerHandler('selection.walkFirstChild', ({ state }) => {
  const at = walkFrom(state);
  const first = at.node.children[0];
  if (first) return reach(first);
  return { kind: 'refused', message: message('status.walk.noChildren', { name: at.node.name }) };
});
