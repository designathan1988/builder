// The style target (ARCHITECTURE.md, Command owners; spec shared-style-classes): what the Style tab's writes go to, the
// selected elements themselves (the Element chip) or one class every selected element lists (its chip).
// inspector.setStyleTarget chooses it; it is editor state: nothing in the document changes and nothing is recorded.
//  - A class target holds only while the project has the class and every selected element lists it
//    (core/design/classes.ts classTarget): a class detached or undone away makes the target Element again, and a new
//    selection returns it to Element (followSelection).
//  - The store hands the class to every handler (HandlerContext.styleClass); core/style/set.ts writes into it.
//  - What the Style tab's fields read (styleSource): the primary element, or, while a class is the target, the primary
//    element holding the class's styles; and, with the Element target, the class a value comes from when the element
//    holds none of its own (cascadeSource, in the stylesheet's order; inspector/origin.ts names it).
import { message, registerHandler } from '../../core/commands/registry.ts';
import { classTarget, classesOf, missingClassDefinitions } from '../../core/design/classes.ts';
import { locate, type DocNode, type DocumentJson } from '../../core/document/model.ts';
import type { ModelRules } from '../../core/document/validate.ts';
import type { StoreState } from '../../core/store/store.ts';
import { shownValue } from '../../core/style/set.ts';
import type { EditorUi } from '../state.ts';

type State = StoreState<EditorUi>;

// the class that is the style target now, or null for the Element target
export const styleClassOf = (state: State): string | null => classTarget(state.document, state.selection, state.ui.styleTarget ?? null)?.styleClass.name ?? null;

const ELEMENT = 'element';

export const setStyleTarget = registerHandler<'inspector.setStyleTarget', EditorUi>(
  'inspector.setStyleTarget',
  ({ state }, { target, className }) => {
    const { styleTarget: _dropped, ...rest } = state.ui;
    void _dropped;
    // A class imported before the project registry existed is still an applied class. Its first
    // target click registers one empty definition as an undoable repair, then selects that target.
    if (target !== ELEMENT && className !== undefined && !classesOf(state.document).some((styleClass) => styleClass.name === className)) {
      const selected = state.selection.map((id) => locate(state.document, id)?.node);
      if (selected.length > 0 && selected.every((node) => node !== undefined && node.classes.includes(className)))
        return { kind: 'change', patches: missingClassDefinitions(state.document, [className]), ui: { ...rest, styleTarget: className }, message: message('status.classes.registered', { name: className }) };
    }
    // a class every selected element lists, else the Element target
    const name = target === ELEMENT || className === undefined ? null : classTarget(state.document, state.selection, className)?.styleClass.name ?? null;
    if (name === (state.ui.styleTarget ?? null)) return { kind: 'change' };
    return { kind: 'change', ui: name === null ? rest : { ...rest, styleTarget: name } };
  },
  (state, args) => {
    const now = styleClassOf(state as State);
    return args.target === ELEMENT ? now === null : now !== null && now === args.className;
  },
);

// A new selection starts with the Element target.
export function targetOffSelection(state: State): EditorUi {
  if (state.ui.styleTarget === undefined) return state.ui;
  const { styleTarget: _dropped, ...rest } = state.ui;
  void _dropped;
  return rest;
}

// The node the Style tab's fields read: the primary selected element, or, while a class is the target, the primary
// element holding the class's styles; null with nothing selected.
export function styleSource(state: State): DocNode | null {
  const primary = state.selection[0];
  const node = primary === undefined ? null : (locate(state.document, primary)?.node ?? null);
  if (node === null) return null;
  const target = classTarget(state.document, state.selection, state.ui.styleTarget ?? null);
  return target === null ? node : { ...node, styles: target.styleClass.styles };
}

// Where a node's value of a property comes from on the page, as the stylesheet decides it (core/render/output.ts writes
// every class, in the project's order, before the elements): the node's own value at the edited layer or the nearest
// one up the cascade (className null), else the last class it lists that holds one there; with the layer it was found
// at. Null when neither sets it (the node inherits it or takes the default).
export function cascadeSource(doc: DocumentJson, node: DocNode, property: string, rules: ModelRules): { readonly breakpoint: string; readonly state: string; readonly className: string | null } | null {
  const own = shownValue(node, property, rules);
  if (own !== undefined) return { breakpoint: own.breakpoint, state: own.state, className: null };
  for (const c of [...classesOf(doc)].reverse()) {
    if (!node.classes.includes(c.name)) continue;
    const held = shownValue({ ...node, styles: c.styles }, property, rules);
    if (held !== undefined) return { breakpoint: held.breakpoint, state: held.state, className: c.name };
  }
  return null;
}
