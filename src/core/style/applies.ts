// Which elements a property applies to (ARCHITECTURE.md; spec props-element-specific). properties.json names, for every
// property, the predicate of the elements it applies to (appliesTo); the element predicates are this module's:
//  - the kinds, read from the tag the element is written with (a switched tag counts): table; tableOrCaption (a table or
//    its caption); list (ul, ol, menu and li); media (the replaced elements the object properties act on: img, video,
//    canvas and iframe); textarea; formControl (input, textarea, select, button, progress and meter); textInput (input
//    and textarea). A field of a kind is shown only while every selected element is of that kind (KIND_PREDICATES).
//  - what an element holds (elements.json): text (it holds text), svgShape (an SVG shape), hasBox (not one). The quick
//    panel, compact, leaves out the text fields of an element that holds no text and the box fields of an SVG shape;
//    the inspector keeps them (a text property set on a container is inherited by the text inside).
// Every other predicate (always, a flex container's) reads more than the element: elementPredicate answers null for it.
import type { DocNode } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';

// the tags each kind of element is written with
const KINDS: Readonly<Record<string, readonly string[]>> = {
  table: ['table'],
  tableOrCaption: ['table', 'caption'],
  list: ['ul', 'ol', 'menu', 'li'],
  media: ['img', 'video', 'canvas', 'iframe'],
  textarea: ['textarea'],
  formControl: ['input', 'textarea', 'select', 'button', 'progress', 'meter'],
  textInput: ['input', 'textarea'],
};
const SVG = 'svg';
// what an element of a type holds and its namespace
const HOLDS: Readonly<Record<string, (element: { readonly content: string; readonly namespace: string }) => boolean>> = {
  text: (element) => element.content === 'text',
  svgShape: (element) => element.namespace === SVG,
  hasBox: (element) => element.namespace !== SVG,
};

// the predicates that name a kind of element: a field of one is shown only on elements of that kind
export const KIND_PREDICATES: ReadonlySet<string> = new Set(Object.keys(KINDS));

// the tag a node is written with: its own, else its type's
const tagOf = (node: DocNode, rules: ModelRules): string | null => node.tag ?? rules.elements.get(node.type)?.tags[0] ?? null;

// Whether an element predicate holds for a node; null when the predicate is not an element predicate.
export function elementPredicate(predicate: string, node: DocNode, rules: ModelRules): boolean | null {
  const tags = KINDS[predicate];
  if (tags !== undefined) {
    const tag = tagOf(node, rules);
    return tag !== null && tags.includes(tag);
  }
  const holds = HOLDS[predicate];
  if (holds === undefined) return null;
  const element = rules.elements.get(node.type);
  return element !== undefined && holds(element);
}

// the predicate of the elements a property applies to (properties.json), or null for one that is not a property
export const appliesToOf = (property: string, rules: ModelRules): string | null => rules.propertyFacts.get(property)?.appliesTo ?? null;

// The kinds every node is of, in KINDS' order; none for no node.
export function kindsOf(nodes: readonly DocNode[], rules: ModelRules): readonly string[] {
  if (nodes.length === 0) return [];
  return [...KIND_PREDICATES].filter((kind) => nodes.every((node) => elementPredicate(kind, node, rules) === true));
}

// Whether a field of these properties shows for a selection of these kinds (kindsOf): each property of a kind is of
// one of them; a property of any other predicate shows.
export function shownForKinds(properties: readonly string[], kinds: readonly string[], rules: ModelRules): boolean {
  return properties.every((property) => {
    const predicate = appliesToOf(property, rules);
    return predicate === null || !KIND_PREDICATES.has(predicate) || kinds.includes(predicate);
  });
}

