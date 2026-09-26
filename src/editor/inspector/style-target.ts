// The style target (ARCHITECTURE.md, Command owners; spec shared-style-classes): what the Style tab's writes go to, the
// selected elements themselves (the Element chip) or one class every selected element lists (its chip).
// inspector.setStyleTarget chooses it; it is editor state: nothing in the document changes and nothing is recorded.
//  - A class target holds only while the project has the class and every selected element lists it
//    (core/design/classes.ts classTarget): a class detached or undone away makes the target Element again, and a new
//    selection returns it to Element (followSelection).
//  - The store hands the class to every handler (HandlerContext.styleClass); core/style/set.ts writes into it.
//  - What the Style tab's fields read (styleSource): the primary element, or, while a class is the target, the primary
//    element holding the class's styles; and, with the Element target, the class a value comes from when the element
//    holds none of its own (classOrigin).
import { registerHandler } from '../../core/commands/registry.ts';
import { classTarget, classesOf } from '../../core/design/classes.ts';
import { locate, type DocNode } from '../../core/document/model.ts';
import type { ModelRules } from '../../core/document/validate.ts';
import type { StoreState } from '../../core/store/store.ts';
import { storedValue } from '../../core/style/set.ts';
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

// With the Element target, the class a property's value comes from: the last class of the primary element (the one the
// stylesheet writes last among them) that holds a value of it, while the element holds none of its own; null otherwise.
export function classOrigin(state: State, property: string, rules: ModelRules): string | null {
  if (styleClassOf(state) !== null) return null;
  const primary = state.selection[0];
  const node = primary === undefined ? null : (locate(state.document, primary)?.node ?? null);
  if (node === null || storedValue(node, property, rules) !== undefined) return null;
  const classes = classesOf(state.document);
  // the stylesheet writes the classes in the project's order: of those the element lists, the last that holds a value wins
  const holding = classes.filter((c) => node.classes.includes(c.name) && storedValue({ ...node, styles: c.styles }, property, rules) !== undefined);
  return holding.at(-1)?.name ?? null;
}

