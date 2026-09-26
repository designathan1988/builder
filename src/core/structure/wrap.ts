// element.wrapRow and element.wrapColumn (ARCHITECTURE.md, Command owners): the one owner of the Row and Column
// wrappers (spec wrap-row-column, Problems 1 and 3). The selected roots, which must share one parent, are replaced at
// the first one's index by a new element of the wrapper's definition (elements.json wrappers, one for every door),
// named in the person's language and numbered when the name is taken, holding them in their order, with the
// wrapper's styles at the base breakpoint and state; the status names the styles it added. The page root cannot be
// wrapped, nor a locked element or one inside a locked element (spec lock-element), and a parent whose content model
// refuses the wrapper's element refuses it; nothing changes then. The
// wrapper becomes the selection. element.unwrap (feature unwrap, below) takes a wrapper away and lifts its children.
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, registerPredicate, type HandlerContext, type Outcome } from '../commands/registry.ts';
import { locate, walk, type DocNode, type Location, type Styles } from '../document/model.ts';
import type { WrapperId } from '../document/validate.ts';
import { applyPatches, type Patch } from '../history/transaction.ts';
import { firstLockRefusal, lockRefusal } from '../nodes/flags.ts';
import { childrenRefusal, placementRefusal } from '../elements/content-model.ts';
import { freshName, nodeMaker, paletteNode, uniqueName } from './insert.ts';
import { selectionRoots } from './remove.ts';

// the styles as the status names them: "display: flex; flex-direction: row"
export const stylesText = (styles: Readonly<Record<string, string>>): string =>
  Object.entries(styles)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ');

// the selected nodes no other selected node contains, in the order they sit in their parent
function roots(selection: readonly NodeId[], at: (id: NodeId) => Location): Location[] {
  const chosen = new Set(selection);
  const found = selection.map(at).filter((l) => {
    for (let up = l.parent; up !== null; up = at(up.id).parent) if (chosen.has(up.id)) return false;
    return true;
  });
  return found.sort((a, b) => a.index - b.index);
}

function wrap(id: WrapperId, { state, ids, rules, words }: HandlerContext<never>): Outcome<never> {
  const at = (node: NodeId): Location => {
    const found = locate(state.document, node);
    // the selection only names nodes of the document, so an unknown one is a defect of the store
    if (found === null) throw new Error(`element.wrap: the document has no node ${String(node)}`);
    return found;
  };
  const selected = roots(state.selection, at);
  const first = selected[0];
  // the availability predicate (hasSelection) keeps an empty selection from reaching here
  if (first === undefined) throw new Error('element.wrap: nothing is selected');
  if (selected.some((l) => l.parent === null)) return { kind: 'refused', message: message('status.wrap.root') };
  const parent = first.parent as DocNode;
  if (selected.some((l) => l.parent?.id !== parent.id)) return { kind: 'refused', message: message('status.wrap.needsSameParent') };
  // a locked root, or one inside a locked element, is not wrapped (spec lock-element)
  const locked = firstLockRefusal(state.document, selected.map((l) => l.node.id), 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };

  const wrapper = rules.wrappers.get(id);
  const element = wrapper === undefined ? undefined : rules.elements.get(wrapper.element);
  if (wrapper === undefined || element === undefined) throw new Error(`element.wrap: elements.json defines no ${id} wrapper`);
  const tag = element.tags[0] ?? null;

  const node: DocNode = {
    id: ids.next(),
    type: wrapper.element,
    name: uniqueName(state.document, words(wrapper.nameKey)),
    tag,
    attributes: {},
    classes: [],
    styles: { [rules.baseLayer.breakpoint]: { [rules.baseLayer.state]: wrapper.styles } } as Styles,
    text: null,
    children: selected.map((l) => l.node),
  };
  // the one rule of where elements may go (content-model.ts): the selection inside the wrapper, the wrapper in the parent
  const refused = placementRefusal(state.document, rules, parent.id, [node]) ?? (tag === null ? null : childrenRefusal(rules, tag, node.children));
  if (refused !== null) return { kind: 'refused', message: refused };
  const parentPath = at(parent.id).path;
  // the roots leave their parent from the last one up, so each index still names its node; the wrapper takes the first's place
  const patches: Patch[] = [...selected].reverse().map((l): Patch => ({ op: 'remove', path: [...parentPath, 'children', l.index] }));
  patches.push({ op: 'add', path: [...parentPath, 'children', first.index], value: node });
  const styles = stylesText(wrapper.styles);
  return {
    kind: 'change',
    patches,
    selection: [node.id],
    message: selected.length === 1 ? message('status.wrapped', { name: first.node.name, wrapper: node.name, styles }) : message('status.wrappedMany', { count: selected.length, wrapper: node.name, styles }),
  };
}

export const wrapRowCommand = registerHandler('element.wrapRow', (context): Outcome<never> => wrap('row', context));
export const wrapColumnCommand = registerHandler('element.wrapColumn', (context): Outcome<never> => wrap('column', context));

// element.unwrap (spec unwrap): the one selected element with children, below the page root, leaves its parent and
// its children take its place, in their order, the same nodes; the wrapper's own styles go with it. A locked wrapper
// or one inside a locked element (spec lock-element), and a parent whose content model refuses one of the children,
// refuse the whole unwrap, and nothing changes. The lifted children
// become the selection; one undo step restores the wrapper around them.
function unwrappable(state: { readonly document: Parameters<typeof locate>[0]; readonly selection: readonly NodeId[] }): Location | null {
  const [only, ...others] = state.selection;
  if (only === undefined || others.length > 0) return null;
  const found = locate(state.document, only);
  return found !== null && found.parent !== null && found.node.children.length > 0 ? found : null;
}

// canUnwrap: one element selected, below the page root, holding children. Refused, the status bar says which: an
// element with no children to lift names itself; anything else says what can lose its wrapper.
export const canUnwrap = registerPredicate(
  'canUnwrap',
  (state) => unwrappable(state) !== null,
  (state) => {
    const [only, ...others] = state.selection;
    const found = only === undefined || others.length > 0 ? null : locate(state.document, only);
    if (found !== null && found.parent !== null && found.node.children.length === 0) return message('status.unwrap.noChildren', { name: found.node.name });
    return message('status.unwrap.unavailable');
  },
);

export const unwrapCommand = registerHandler('element.unwrap', ({ state, rules }): Outcome<never> => {
  const wrapper = unwrappable(state);
  // the availability predicate (canUnwrap) keeps anything else from reaching here
  if (wrapper === null || wrapper.parent === null) throw new Error('element.unwrap: the selection is not one element with children below the page root');
  const parent = wrapper.parent;
  // a locked wrapper, or one inside a locked element, keeps its children (spec lock-element)
  const locked = lockRefusal(state.document, wrapper.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  // the one rule of where elements may go (content-model.ts): the children in the wrapper's parent
  const refused = placementRefusal(state.document, rules, parent.id, wrapper.node.children);
  if (refused !== null) return { kind: 'refused', message: refused };
  const siblings = [...wrapper.path.slice(0, -1)];
  const patches: Patch[] = [
    { op: 'remove', path: wrapper.path },
    ...wrapper.node.children.map((child, i): Patch => ({ op: 'add', path: [...siblings, wrapper.index + i], value: child })),
  ];
  return { kind: 'change', patches, selection: wrapper.node.children.map((c) => c.id), message: message('status.unwrapped', { name: wrapper.node.name }) };
});

// element.wrapBeside (feature drag-side-wrap; spec wrap-row-column, "Side drop during a drag" and Problems 2): a drop in
// a side band of an element, once confirmed, puts what the drag brings beside it in a new Row (a target laid out in a
// vertical flow) or Column (in a row flow), the wrapper's definition being the wrap commands' own. The wrapper takes
// the target's place and holds the target and what arrives, in the order of the side: before it or after it. What
// arrives is a new element of a palette entry (a tile's creation drag) or the selection's roots (an element drag),
// which leave their places. The wrapper becomes the selection, in one undo step. A target that is the page root, a
// moved node or inside one is refused; locked nodes stay (spec lock-element); the content model decides whether the
// wrapper may stand there and hold them (content-model.ts), and nothing changes when it refuses.
export const wrapBesideCommand = registerHandler('element.wrapBeside', ({ state, ids, rules, words }, { target, side, wrapper: kind, entry }): Outcome<never> => {
  const at = locate(state.document, target);
  if (at === null) throw new Error(`element.wrapBeside: the document has no node ${target}`);
  if (at.parent === null) return { kind: 'refused', message: message('status.wrap.root') };
  const make = nodeMaker(state.document, rules, ids, words);
  const arriving: DocNode[] = entry === undefined ? selectionRoots(state.document, state.selection).map((l) => l.node) : [paletteNode(make, entry)];
  if (arriving.length === 0) throw new Error('element.wrapBeside: nothing arrives');
  for (const node of arriving) for (const inner of walk(node)) if (inner.id === target) return { kind: 'refused', message: message('status.refused.intoItself') };
  const moving = entry === undefined ? arriving.map((n) => n.id) : [];
  const locked = firstLockRefusal(state.document, moving, 'status.locked.move') ?? lockRefusal(state.document, at.parent.id, 'status.locked.insert') ?? lockRefusal(state.document, target, 'status.locked.move');
  if (locked !== null) return { kind: 'refused', message: locked };

  const definition = rules.wrappers.get(kind as WrapperId);
  const element = definition === undefined ? undefined : rules.elements.get(definition.element);
  if (definition === undefined || element === undefined) throw new Error(`element.wrapBeside: elements.json defines no ${kind} wrapper`);
  const tag = element.tags[0] ?? null;
  // the target as it will be once the moved nodes left it (one of them may lie inside it)
  let document = state.document;
  const patches: Patch[] = [];
  for (const id of moving) {
    const now = locate(document, id);
    if (!now) continue;
    const patch: Patch = { op: 'remove', path: now.path };
    patches.push(patch);
    document = applyPatches(document, [patch]).document;
  }
  const place = locate(document, target);
  if (place === null) throw new Error(`element.wrapBeside: ${target} is gone once the moved nodes left`);
  const children = side === 'before' ? [...arriving, place.node] : [place.node, ...arriving];
  const node: DocNode = {
    id: ids.next(),
    type: definition.element,
    name: freshName(make, words(definition.nameKey)),
    tag,
    attributes: {},
    classes: [],
    styles: { [rules.baseLayer.breakpoint]: { [rules.baseLayer.state]: definition.styles } } as Styles,
    text: null,
    children,
  };
  // the wrapper in the target's parent (the target leaves it for the wrapper), what arrives inside the wrapper
  const refused = placementRefusal(state.document, rules, at.parent.id, [node], new Set([target])) ?? (tag === null ? null : childrenRefusal(rules, tag, children));
  if (refused !== null) return { kind: 'refused', message: refused };

  // the moved nodes have left their places (above); the wrapper replaces the target where it stands now
  patches.push({ op: 'replace', path: place.path, value: node });
  const first = arriving[0] as DocNode;
  return {
    kind: 'change',
    patches,
    selection: [node.id],
    message: message('status.wrappedBeside', { wrapper: node.name, name: first.name, target: at.node.name, styles: stylesText(definition.styles) }),
  };
});
