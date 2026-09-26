// The project's style classes (ARCHITECTURE.md, Command owners; spec shared-style-classes): a class is a name an element
// lists in its classes and the styles every element with it takes, kept with the project (the document's `classes`, in
// the order they were made). The one owner of:
//  - classes.create: the one selected element's own styles become a new class of the typed name, which the element then
//    lists last; the element holds no style of its own after it (the page looks the same).
//  - classes.apply: the class is listed last by every selected element that does not list it; a name the project has no
//    class of becomes a class with no styles, so it can be styled as a target.
//  - classes.detach: every selected element that lists the class stops listing it; the class stays in the project.
//    A name is a CSS class name (status.classes.badName); a class made twice is refused (status.classes.nameTaken); a
//    locked element, or one inside one, is refused (status.locked.edit). One undo step each.
//  - targetClass: the class a style write goes to (core/style/set.ts styleHolders): the class the editor names as the
//    style target (HandlerContext.styleClass), while the project has it and every selected element lists it.
import { message, registerHandler, type HandlerContext, type Outcome } from '../commands/registry.ts';
import { locate, walk, type DocumentJson, type NodeId, type Selection, type StyleClass } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { firstLockRefusal } from '../nodes/flags.ts';

const NONE: readonly StyleClass[] = [];
export const classesOf = (document: DocumentJson): readonly StyleClass[] => document.classes ?? NONE;
// a CSS class name, as an element's classes take it (validate.ts)
const CLASS_NAME = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;

// how many elements of the project list a class
export function usesOfClass(document: DocumentJson, name: string): number {
  let count = 0;
  for (const page of document.pages) for (const node of walk(page.tree)) if (node.classes.includes(name)) count += 1;
  return count;
}

// the selected elements, found in the document
const selectedNodes = <Ui>({ state }: HandlerContext<Ui>) => state.selection.map((id) => locate(state.document, id)).filter((found) => found !== null);

// The class a style write goes to, and its place in the project's list: the editor's style target, while the project
// has that class and every selected element lists it; null otherwise (the elements themselves).
export function targetClass<Ui>(context: HandlerContext<Ui>): { readonly index: number; readonly styleClass: StyleClass } | null {
  return classTarget(context.state.document, context.state.selection, context.styleClass ?? null);
}
// the same, for a document, a selection and the class named as the target
export function classTarget(document: DocumentJson, selection: Selection, name: string | null): { readonly index: number; readonly styleClass: StyleClass } | null {
  if (name === null) return null;
  const index = classesOf(document).findIndex((c) => c.name === name);
  const nodes = selection.map((id) => locate(document, id)?.node);
  if (index < 0 || nodes.length === 0 || !nodes.every((node) => node !== undefined && node.classes.includes(name))) return null;
  return { index, styleClass: classesOf(document)[index] as StyleClass };
}

// the patch that adds a class to the project's list
function classAdded(document: DocumentJson, styleClass: StyleClass): Patch {
  return document.classes === undefined ? { op: 'add', path: ['classes'], value: [styleClass] } : { op: 'add', path: ['classes', classesOf(document).length], value: styleClass };
}

export const createClassCommand = registerHandler('classes.create', (context, { name }): Outcome<never> => {
  const { state } = context;
  const typed = name.trim();
  const found = selectedNodes(context)[0];
  if (found === undefined) return { kind: 'change' };
  if (!CLASS_NAME.test(typed)) return { kind: 'refused', message: message('status.classes.badName', { name: typed }) };
  if (classesOf(state.document).some((c) => c.name === typed)) return { kind: 'refused', message: message('status.classes.nameTaken', { name: typed }) };
  const locked = firstLockRefusal(state.document, [found.node.id as NodeId], 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const patches: Patch[] = [classAdded(state.document, { name: typed, styles: found.node.styles })];
  if (Object.keys(found.node.styles).length > 0) patches.push({ op: 'replace', path: [...found.path, 'styles'], value: {} });
  if (!found.node.classes.includes(typed)) patches.push({ op: 'replace', path: [...found.path, 'classes'], value: [...found.node.classes, typed] });
  return { kind: 'change', patches, message: message('status.classes.created', { name: typed, element: found.node.name }) };
});

export const applyClassCommand = registerHandler('classes.apply', (context, { className }): Outcome<never> => {
  const { state } = context;
  const typed = className.trim();
  const nodes = selectedNodes(context);
  if (nodes.length === 0) return { kind: 'change' };
  if (!CLASS_NAME.test(typed)) return { kind: 'refused', message: message('status.classes.badName', { name: typed }) };
  const without = nodes.filter((found) => !found.node.classes.includes(typed));
  const locked = firstLockRefusal(state.document, without.map((found) => found.node.id as NodeId), 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const said = message('status.classes.applied', { name: typed });
  if (without.length === 0) return { kind: 'change', message: said };
  const defined = classesOf(state.document).some((c) => c.name === typed);
  const patches: Patch[] = [
    ...(defined ? [] : [classAdded(state.document, { name: typed, styles: {} })]),
    ...without.map((found): Patch => ({ op: 'replace', path: [...found.path, 'classes'], value: [...found.node.classes, typed] })),
  ];
  return { kind: 'change', patches, message: said };
});

export const detachClassCommand = registerHandler('classes.detach', (context, { className }): Outcome<never> => {
  const { state } = context;
  const holding = selectedNodes(context).filter((found) => found.node.classes.includes(className));
  if (holding.length === 0) return { kind: 'change' };
  const locked = firstLockRefusal(state.document, holding.map((found) => found.node.id as NodeId), 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const patches: Patch[] = holding.map((found) => ({ op: 'replace', path: [...found.path, 'classes'], value: found.node.classes.filter((c) => c !== className) }));
  return { kind: 'change', patches, message: message('status.classes.detached', { name: className }) };
});
