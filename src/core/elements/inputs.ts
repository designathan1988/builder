// The rules of form inputs (ARCHITECTURE.md, Command owners; spec elements-form-inputs-rules): which attributes each
// type of input takes (HTML's input types), element.setInputType and element.setLabelTarget.
//  - An input's type is its attribute inputType (written type). Switching it keeps the attributes the new type takes
//    and drops the others, one undo step (status.input.typeSet).
//  - A label points at one form control (element.setLabelTarget): the label's `for` is the control's id; a control
//    with no id is given one from its name (lower case, words joined by "-", numbered when taken), in the same undo
//    step (status.label.target).
//  - A locked element, or one inside a locked element, keeps its values (spec lock-element).
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { allNodes, locate, type DocNode, type DocumentJson, type Location } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { lockRefusal } from '../nodes/flags.ts';

const TEXTUAL = ['text', 'email', 'password', 'tel', 'url', 'search'];
const RANGED = ['number', 'range', 'date', 'datetime-local', 'month', 'week', 'time'];
// attribute (elements.json id) → the input types that take it (HTML, "input type=..." applicability); an attribute
// listed in neither table applies to every input type
const APPLIES: Readonly<Record<string, readonly string[]>> = {
  checked: ['checkbox', 'radio'],
  min: RANGED,
  max: RANGED,
  step: RANGED,
  pattern: TEXTUAL,
  placeholder: [...TEXTUAL, 'number'],
  readonly: [...TEXTUAL, 'number', 'date', 'time'],
  required: [...TEXTUAL, 'number', 'date', 'time', 'checkbox', 'radio', 'file'],
  accept: ['file'],
  multiple: ['file', 'email'],
  maxLength: TEXTUAL,
  minLength: TEXTUAL,
};
// attribute → the input types that do not take it (every other type does)
const EXCEPT: Readonly<Record<string, readonly string[]>> = {
  autocomplete: ['checkbox', 'radio', 'file'],
  value: ['file'],
};

// the type of an input node (text when none is stored)
export const inputTypeOf = (node: DocNode): string => String(node.attributes.inputType ?? 'text');

// Whether an attribute applies to a node: for an input, whether its type takes it; for any other element, true.
export function attributeApplies(node: DocNode, attribute: string): boolean {
  if (node.type === 'link') {
    if (attribute === 'href' || attribute === 'newTab') return node.tag === 'a';
    if (attribute === 'buttonType') return node.tag === 'button';
  }
  if (node.type !== 'input') return true;
  const type = inputTypeOf(node);
  const only = APPLIES[attribute];
  if (only !== undefined) return only.includes(type);
  return !(EXCEPT[attribute] ?? []).includes(type);
}

function oneSelected(state: { readonly document: DocumentJson; readonly selection: readonly NodeId[] }): Location | null {
  const [only, ...others] = state.selection;
  return only === undefined || others.length > 0 ? null : locate(state.document, only);
}

export const setInputTypeCommand = registerHandler('element.setInputType', ({ state, rules }, { type }): Outcome<never> => {
  const at = oneSelected(state);
  if (at === null || at.node.type !== 'input') return { kind: 'refused', message: message('status.needsSingleSelection') };
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const nextType = type.trim().toLowerCase();
  if (!rules.attributeValues.get('inputType')?.keywords.includes(nextType)) return { kind: 'refused', message: message('status.input.invalidType', { type }) };
  const said = message('status.input.typeSet', { name: at.node.name, type: nextType });
  if (inputTypeOf(at.node) === nextType) return { kind: 'change', message: said };
  const switched: DocNode = { ...at.node, attributes: { ...at.node.attributes, inputType: nextType } };
  const kept = Object.fromEntries(Object.entries(switched.attributes).filter(([name]) => attributeApplies(switched, name)));
  return { kind: 'change', patches: [{ op: 'replace', path: [...at.path, 'attributes'], value: kept }], message: said };
});

// an id no node has, from a name: lower case, words joined by "-", numbered from 2 when taken
function freshId(document: DocumentJson, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^(?![a-z])/, 'field-') || 'field';
  const taken = new Set([...allNodes(document)].map((n) => n.attributes.id).filter((id) => id !== undefined));
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}

export const setLabelTargetCommand = registerHandler('element.setLabelTarget', ({ state }, { control }): Outcome<never> => {
  const label = oneSelected(state);
  const target = locate(state.document, control);
  if (label === null || target === null) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const locked = lockRefusal(state.document, label.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const patches: Patch[] = [];
  let id = target.node.attributes.id === undefined ? null : String(target.node.attributes.id);
  if (id === null) {
    id = freshId(state.document, target.node.name);
    patches.push({ op: 'add', path: [...target.path, 'attributes', 'id'], value: id });
  }
  if (label.node.attributes.labelFor !== id) patches.push({ op: label.node.attributes.labelFor === undefined ? 'add' : 'replace', path: [...label.path, 'attributes', 'labelFor'], value: id });
  return { kind: 'change', patches, message: message('status.label.target', { name: label.node.name, control: target.node.name }) };
});

// The form controls a label may point at: the inputs, text areas, selects, buttons, meters, progress bars and outputs of
// the document, in document order.
const CONTROLS = new Set(['input', 'textarea', 'select', 'button', 'meter', 'progress', 'output']);
export function formControls(document: DocumentJson): DocNode[] {
  return [...allNodes(document)].filter((node) => CONTROLS.has(node.type));
}

// Whether a node is a form control whose value is edited in the inspector, never on the canvas: an input, a text area
// or a select (spec elements-form-inputs-rules, Problems in Pager 1).
const VALUE_CONTROLS = new Set(['input', 'textarea', 'select']);
export function isValueControl(document: DocumentJson, id: NodeId): boolean {
  const found = locate(document, id);
  return found !== null && VALUE_CONTROLS.has(found.node.type);
}
