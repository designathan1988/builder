// An element's ID, classes and attributes (ARCHITECTURE.md, Command owners; feature props-attributes, and every element
// feature whose Settings fields are attributes of elements.json): element.setId, element.setClasses and
// element.setAttribute, each acting on its door's node or the one selected element.
//  - The text is taken without the spaces around it; an empty one removes the ID or the attribute (the element then
//    has none, and nothing invents one); the same value records nothing.
//  - An ID starts with a letter and holds letters, digits, "-" and "_" (status.id.invalid); no two nodes share one
//    (status.id.duplicate names the node that has it).
//  - Classes are the words of the text, each a CSS class name (status.attribute.invalid names the first that is not),
//    kept once each in their order.
//  - An attribute's value follows its value type (elements.json): a text as typed; a URL through the one rule of a
//    resource address (isSafeSource, core/text/inline.ts: status.url.unsafe); a number as a number; a keyword one of
//    its keywords; a boolean true or absent (status.attribute.invalid for anything else).
//  - A locked element, or one inside a locked element, keeps its values (spec lock-element).
import type { NodeId } from '../../generated/commands.ts';
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import { allNodes, locate, type DocumentJson, type Location } from '../document/model.ts';
import { customAttributeRefusal, type ModelRules } from '../document/validate.ts';
import type { Patch } from '../history/transaction.ts';
import { lockRefusal } from '../nodes/flags.ts';
import { isSafeSource } from '../text/inline.ts';

const ID = /^[A-Za-z][A-Za-z0-9_-]*$/;
const CLASS = /^-?[_A-Za-z][_A-Za-z0-9-]*$/;

function nodeOf(state: { readonly document: DocumentJson; readonly selection: readonly NodeId[] }, target: NodeId | undefined): Location {
  const id = target ?? (state.selection.length === 1 ? state.selection[0] : undefined);
  if (id === undefined) throw new Error('attributes: no node given and not one element selected');
  const found = locate(state.document, id);
  if (found === null) throw new Error(`attributes: the document has no node ${id}`);
  return found;
}

// the patch that stores, replaces or removes an attribute of a node, or null when it already holds that value
function attributePatch(at: Location, name: string, value: string | number | true | undefined): Patch | null {
  const stored = at.node.attributes[name as keyof typeof at.node.attributes];
  if (stored === value) return null;
  const path = [...at.path, 'attributes', name];
  if (value === undefined) return stored === undefined ? null : { op: 'remove', path };
  return { op: stored === undefined ? 'add' : 'replace', path, value };
}

// the label of an attribute in the person's language
function labelOf(rules: ModelRules, words: (key: never) => string, attribute: string): string {
  const key = rules.attributeValues.get(attribute)?.labelKey;
  return key === undefined ? attribute : words(key as never);
}

export const setIdCommand = registerHandler('element.setId', ({ state, rules, words }, { id, target }): Outcome<never> => {
  const at = nodeOf(state, target as NodeId | undefined);
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const typed = String(id).trim();
  if (typed !== '' && !ID.test(typed)) return { kind: 'refused', message: message('status.id.invalid', { id: typed }) };
  if (typed !== '') {
    const other = [...allNodes(state.document)].find((n) => n.id !== at.node.id && n.attributes.id === typed);
    if (other !== undefined) return { kind: 'refused', message: message('status.id.duplicate', { id: typed, name: other.name }) };
  }
  const patch = attributePatch(at, 'id', typed === '' ? undefined : typed);
  const said = message(typed === '' ? 'status.attribute.removed' : 'status.attribute.set', { attribute: labelOf(rules, words as never, 'id'), name: at.node.name, value: typed });
  return patch === null ? { kind: 'change', message: said } : { kind: 'change', patches: [patch], message: said };
});

export const setClassesCommand = registerHandler('element.setClasses', ({ state, rules, words }, { classes, target }): Outcome<never> => {
  const at = nodeOf(state, target as NodeId | undefined);
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const list = (Array.isArray(classes) ? classes.map(String) : String(classes ?? '').split(/\s+/)).map((c) => c.trim()).filter((c) => c !== '');
  const label = labelOf(rules, words as never, 'classes');
  const wrong = list.find((c) => !CLASS.test(c));
  if (wrong !== undefined) return { kind: 'refused', message: message('status.attribute.invalid', { attribute: label, value: wrong }) };
  const kept = [...new Set(list)];
  const said = message(kept.length === 0 ? 'status.attribute.removed' : 'status.attribute.set', { attribute: label, name: at.node.name, value: kept.join(' ') });
  if (kept.join(' ') === at.node.classes.join(' ')) return { kind: 'change', message: said };
  return { kind: 'change', patches: [{ op: 'replace', path: [...at.path, 'classes'], value: kept }], message: said };
});

export const setAttributeCommand = registerHandler('element.setAttribute', ({ state, rules, words }, { attribute, value, target }): Outcome<never> => {
  const at = nodeOf(state, target as NodeId | undefined);
  const rule = rules.attributeValues.get(attribute);
  const appliesTo = rules.attributes.get(attribute);
  if (rule === undefined || appliesTo === undefined || (appliesTo !== 'all' && !appliesTo.includes(at.node.type))) throw new Error(`element.setAttribute: ${attribute} is not an attribute of ${at.node.type}`);
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const label = labelOf(rules, words as never, attribute);
  const invalid = (shown: string) => ({ kind: 'refused' as const, message: message('status.attribute.invalid', { attribute: label, value: shown }) });
  let stored: string | number | true | undefined;
  if (rule.valueType === 'boolean') {
    if (typeof value !== 'boolean') return invalid(String(value));
    stored = value ? true : undefined;
  } else {
    const typed = String(value ?? '').trim();
    if (typed === '') stored = undefined;
    else if (rule.valueType === 'number') {
      const n = Number(typed);
      if (!Number.isFinite(n)) return invalid(typed);
      stored = n;
    } else if (rule.valueType === 'keyword') {
      if (!rule.keywords.includes(typed)) return invalid(typed);
      stored = typed;
    } else if (rule.valueType === 'url') {
      if (!isSafeSource(typed)) return { kind: 'refused', message: message('status.url.unsafe', { url: typed }) };
      stored = typed;
    } else stored = typed;
  }
  const patch = attributePatch(at, attribute, stored);
  const shown = stored === undefined ? '' : stored === true ? '✓' : String(stored);
  const said = message(stored === undefined ? 'status.attribute.removed' : 'status.attribute.set', { attribute: label, name: at.node.name, value: shown });
  return patch === null ? { kind: 'change', message: said } : { kind: 'change', patches: [patch], message: said };
});

// element.setCustomAttribute / element.removeCustomAttribute (feature element-attributes-aria): the person's own
// attributes of the one selected element (aria-*, data-*, role…), stored as they are typed. A name must be an attribute
// name of HTML that is no event handler (status.attribute.eventHandler) nor one of the editor's own marks
// (status.attribute.invalidName); the same value records nothing; a locked element refuses. Removing one that is not
// there records nothing.
function oneSelected(state: { readonly document: DocumentJson; readonly selection: readonly NodeId[] }): Location | null {
  const [only, ...others] = state.selection;
  return only === undefined || others.length > 0 ? null : locate(state.document, only);
}

export const setCustomAttributeCommand = registerHandler('element.setCustomAttribute', ({ state }, { name, value }): Outcome<never> => {
  const at = oneSelected(state);
  if (at === null) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const typed = String(name).trim().toLowerCase();
  if (typed.startsWith('on')) return { kind: 'refused', message: message('status.attribute.eventHandler') };
  if (customAttributeRefusal(typed) !== null) return { kind: 'refused', message: message('status.attribute.invalidName', { name: typed }) };
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const custom = at.node.customAttributes ?? {};
  // a new attribute added with no value yet says it was added; any other says its value
  const said = custom[typed] === undefined && String(value) === '' ? message('status.attribute.added', { attribute: typed, name: at.node.name }) : message('status.attribute.set', { attribute: typed, name: at.node.name, value: String(value) });
  if (custom[typed] === String(value)) return { kind: 'change', message: said };
  const next = { ...custom, [typed]: String(value) };
  return { kind: 'change', patches: [{ op: at.node.customAttributes === undefined ? 'add' : 'replace', path: [...at.path, 'customAttributes'], value: next }], message: said };
});

export const removeCustomAttributeCommand = registerHandler('element.removeCustomAttribute', ({ state }, { name }): Outcome<never> => {
  const at = oneSelected(state);
  if (at === null) return { kind: 'refused', message: message('status.needsSingleSelection') };
  const locked = lockRefusal(state.document, at.node.id, 'status.locked.edit');
  if (locked !== null) return { kind: 'refused', message: locked };
  const said = message('status.attribute.removed', { attribute: name, name: at.node.name });
  if (!(name in (at.node.customAttributes ?? {}))) return { kind: 'change', message: said };
  const custom = Object.fromEntries(Object.entries(at.node.customAttributes ?? {}).filter(([n]) => n !== name));
  const path = [...at.path, 'customAttributes'];
  return { kind: 'change', patches: [Object.keys(custom).length === 0 ? { op: 'remove', path } : { op: 'replace', path, value: custom }], message: said };
});
