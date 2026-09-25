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
import { locate, type DocNode, type Location, type Styles } from '../document/model.ts';
import type { WrapperId } from '../document/validate.ts';
import type { Patch } from '../history/transaction.ts';
import { firstLockRefusal, lockRefusal } from '../nodes/flags.ts';
import { uniqueName } from './insert.ts';

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
  const only = parent.tag !== null && tag !== null ? rules.contentModel.refusal(parent.tag, tag) : null;
  if (only !== null) return { kind: 'refused', message: message('status.refused.onlyAccepts', { parent: `<${parent.tag ?? ''}>`, children: only.map((t) => `<${t}>`).join(', ') }) };

  const node: DocNode = {
    id: ids.next(),
    type: wrapper.element,
    name: uniqueName(state.document, words(wrapper.nameKey)),
    tag,
    attributes: {},
    classes: [],
    styles: { [rules.base.breakpoint]: { [rules.base.state]: wrapper.styles } } as Styles,
    text: null,
    children: selected.map((l) => l.node),
  };
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
  for (const child of wrapper.node.children) {
    const only = parent.tag !== null && child.tag !== null ? rules.contentModel.refusal(parent.tag, child.tag) : null;
    if (only !== null) return { kind: 'refused', message: message('status.refused.onlyAccepts', { parent: `<${parent.tag ?? ''}>`, children: only.map((t) => `<${t}>`).join(', ') }) };
  }
  const siblings = [...wrapper.path.slice(0, -1)];
  const patches: Patch[] = [
    { op: 'remove', path: wrapper.path },
    ...wrapper.node.children.map((child, i): Patch => ({ op: 'add', path: [...siblings, wrapper.index + i], value: child })),
  ];
  return { kind: 'change', patches, selection: wrapper.node.children.map((c) => c.id), message: message('status.unwrapped', { name: wrapper.node.name }) };
});
