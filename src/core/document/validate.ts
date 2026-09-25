// Whole-tree validation: the store runs it on every commit and refuses a state that fails it. It checks a
// document and its selection against the model (model.ts) and the manifest: element types, tags and content
// (elements.json), attributes and where they apply, edited properties, breakpoints and states (properties.json).
// It never repairs or changes anything. The HTML content model (which element may sit in which) is owned by
// src/core/elements/content-model.ts; the rules carry it for the commands that place an element, and validation
// checks it once nesting-grammar completes it.
import type { ElementType, MessageId } from '../../generated/ids.ts';
import type { Attribute, ElementsFile, GeneratedHtml, PropertiesFile } from '../../manifest/schema.ts';
import { contentModelFrom, type ContentModel } from '../elements/content-model.ts';
import { deepEqual } from '../history/transaction.ts';
import { canonical, hasMarks, parseInline, plainText } from '../text/inline.ts';
import { DOCUMENT_VERSION, walk, type DocNode, type DocumentJson, type Selection } from './model.ts';

export interface ElementRules {
  // its tag first, then its alternative tags
  readonly tags: readonly (string | null)[];
  readonly content: 'children' | 'text' | 'markup' | 'none';
  // what a new element of the type is (element.insert): its name, its styles at the base breakpoint and state, its text
  readonly labelKey: MessageId;
  readonly defaultStyles: Readonly<Record<string, string>>;
  readonly defaultTextKey: MessageId | null;
}

// What an attribute's value is (elements.json): its value type, the keywords a keyword attribute takes one of, its
// HTML attribute (null when it is none) and its name in the catalogue.
export interface AttributeRules {
  readonly valueType: Attribute['valueType'];
  readonly keywords: readonly string[];
  readonly html: string | null;
  readonly labelKey: MessageId;
}

export interface ModelRules {
  readonly elements: ReadonlyMap<string, ElementRules>;
  // attribute id → the element types it applies to, or "all"
  readonly attributes: ReadonlyMap<string, readonly string[] | 'all'>;
  // attribute id → what its value is
  readonly attributeValues: ReadonlyMap<string, AttributeRules>;
  readonly properties: ReadonlySet<string>;
  readonly breakpoints: ReadonlySet<string>;
  readonly states: ReadonlySet<string>;
  // the breakpoint and the state a value belongs to when none is chosen (properties.json: base)
  readonly base: { readonly breakpoint: string; readonly state: string };
  // the element every page's root is: the element type whose tag is <body> in elements.json
  readonly root: { readonly type: ElementType; readonly tag: string };
  // palette entry id → the element type it inserts and the feature that brings it (elements.json palette)
  readonly palette: ReadonlyMap<string, { readonly element: ElementType; readonly feature: string }>;
  // the Row and Column wrappers (elements.json wrappers): the element type, the name's catalogue key, the styles
  readonly wrappers: ReadonlyMap<WrapperId, { readonly element: ElementType; readonly nameKey: MessageId; readonly styles: Readonly<Record<string, string>> }>;
  readonly contentModel: ContentModel;
}

export type WrapperId = ElementsFile['wrappers'][number]['id'];

export function rulesFromManifest(elements: ElementsFile, properties: PropertiesFile, html: GeneratedHtml): ModelRules {
  const body = elements.elements.find((e) => e.tag === 'body');
  if (!body) throw new Error('elements.json has no element whose tag is body: a page has no root element');
  const baseBreakpoint = properties.breakpoints.find((b) => b.base);
  const baseState = properties.states.find((s) => s.pseudo === null);
  if (!baseBreakpoint || !baseState) throw new Error('properties.json names no base breakpoint or no base state');
  return {
    elements: new Map(
      elements.elements.map((e) => [
        e.id,
        { tags: [e.tag, ...e.alternativeTags], content: e.content, labelKey: e.labelKey as MessageId, defaultStyles: e.defaultStyles, defaultTextKey: e.defaultTextKey as MessageId | null },
      ]),
    ),
    attributes: new Map(elements.attributes.map((a) => [a.id, a.elements])),
    attributeValues: new Map(elements.attributes.map((a) => [a.id, { valueType: a.valueType, keywords: a.keywords, html: a.html, labelKey: a.labelKey as MessageId }] as const)),
    properties: new Set(properties.properties.map((p) => p.id)),
    breakpoints: new Set(properties.breakpoints.map((b) => b.id)),
    states: new Set(properties.states.map((s) => s.id)),
    base: { breakpoint: baseBreakpoint.id, state: baseState.id },
    root: { type: body.id as ElementType, tag: 'body' },
    palette: new Map(elements.palette.flatMap((g) => g.entries.map((e) => [e.id, { element: e.element as ElementType, feature: e.feature }] as const))),
    wrappers: new Map(elements.wrappers.map((w) => [w.id, { element: w.element as ElementType, nameKey: w.nameKey as MessageId, styles: w.styles }] as const)),
    contentModel: contentModelFrom(html),
  };
}

export interface Invalid {
  // a JSON pointer into the document, or "/selection/<i>"
  readonly path: string;
  readonly message: string;
}

const CLASS_NAME = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;
const PAGE_FILE = /^([a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.html$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function validateDocument(doc: DocumentJson, selection: Selection, rules: ModelRules): Invalid[] {
  const problems: Invalid[] = [];
  const bad = (path: string, message: string) => problems.push({ path, message });
  const ids = new Map<string, string>();
  const claim = (id: unknown, path: string) => {
    if (typeof id !== 'string' || id === '') return bad(path, 'an id is a non-empty string');
    const first = ids.get(id);
    if (first !== undefined) bad(path, `id "${id}" is already used at ${first}`);
    else ids.set(id, path);
  };

  if (doc.version !== DOCUMENT_VERSION) bad('/version', `the document version is ${DOCUMENT_VERSION}`);
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) bad('/pages', 'a project has at least one page');
  const files = new Set<string>();
  (doc.pages ?? []).forEach((page, i) => {
    const at = `/pages/${i}`;
    claim(page.id, `${at}/id`);
    if (typeof page.name !== 'string' || page.name.trim() === '') bad(`${at}/name`, 'a page has a name');
    if (typeof page.file !== 'string' || !PAGE_FILE.test(page.file)) bad(`${at}/file`, `"${String(page.file)}" is not a page file path such as index.html`);
    else if (files.has(page.file)) bad(`${at}/file`, `two pages are ${page.file}`);
    else files.add(page.file);
    if (!isRecord(page.tree)) return bad(`${at}/tree`, 'a page has a tree');
    if (page.tree.type !== rules.root.type) bad(`${at}/tree/type`, `a page's root is a ${rules.root.type} element`);
    validateNode(page.tree, `${at}/tree`, rules, claim, bad, true);
  });

  const nodeIds = new Set<string>();
  for (const page of doc.pages ?? []) if (isRecord(page.tree)) for (const node of walk(page.tree)) nodeIds.add(node.id);
  const seen = new Set<string>();
  selection.forEach((id, i) => {
    if (!nodeIds.has(id)) bad(`/selection/${i}`, `the selection names "${id}", which is no node of the document`);
    if (seen.has(id)) bad(`/selection/${i}`, `"${id}" is selected twice`);
    seen.add(id);
  });
  return problems;
}

function validateNode(
  node: DocNode,
  at: string,
  rules: ModelRules,
  claim: (id: unknown, path: string) => void,
  bad: (path: string, message: string) => void,
  root: boolean,
): void {
  claim(node.id, `${at}/id`);
  const element = rules.elements.get(node.type);
  if (!element) {
    bad(`${at}/type`, `"${String(node.type)}" is not an element type of elements.json`);
    return;
  }
  if (!root && node.type === rules.root.type) bad(`${at}/type`, `only a page's root is a ${rules.root.type} element`);
  if (typeof node.name !== 'string' || node.name.trim() === '') bad(`${at}/name`, 'an element has a name');
  if (!element.tags.includes(node.tag)) bad(`${at}/tag`, `<${String(node.tag)}> is not a tag of ${node.type} (${element.tags.map(String).join(', ')})`);
  // the hidden flag (model.ts): true, or absent while the element shows; a page's root always shows
  if ('hidden' in node) {
    if (node.hidden !== true) bad(`${at}/hidden`, 'hidden is true, or absent while the element shows');
    else if (root) bad(`${at}/hidden`, 'a page’s root is never hidden');
  }
  // the lock flag (model.ts): true, or absent while the element is unlocked; a page's root is never locked
  if ('locked' in node) {
    if (node.locked !== true) bad(`${at}/locked`, 'locked is true, or absent while the element is unlocked');
    else if (root) bad(`${at}/locked`, 'a page’s root is never locked');
  }

  if (!isRecord(node.attributes)) bad(`${at}/attributes`, 'attributes is an object');
  else {
    for (const [name, value] of Object.entries(node.attributes)) {
      const appliesTo = rules.attributes.get(name);
      if (appliesTo === undefined) bad(`${at}/attributes/${name}`, `"${name}" is not an attribute of elements.json`);
      else if (appliesTo !== 'all' && !appliesTo.includes(node.type)) bad(`${at}/attributes/${name}`, `${name} does not apply to ${node.type}`);
      if (!['string', 'number', 'boolean'].includes(typeof value)) bad(`${at}/attributes/${name}`, 'an attribute value is a string, a number or a boolean');
    }
  }

  if (!Array.isArray(node.classes)) bad(`${at}/classes`, 'classes is a list');
  else {
    const names = new Set<string>();
    node.classes.forEach((name, i) => {
      if (typeof name !== 'string' || !CLASS_NAME.test(name)) bad(`${at}/classes/${i}`, `"${String(name)}" is not a class name`);
      else if (names.has(name)) bad(`${at}/classes/${i}`, `the class ${name} is listed twice`);
      names.add(name);
    });
  }

  if (!isRecord(node.styles)) bad(`${at}/styles`, 'styles is an object');
  else {
    for (const [breakpoint, byState] of Object.entries(node.styles)) {
      if (!rules.breakpoints.has(breakpoint)) bad(`${at}/styles/${breakpoint}`, `"${breakpoint}" is not a breakpoint`);
      if (!isRecord(byState)) {
        bad(`${at}/styles/${breakpoint}`, 'a breakpoint holds its states');
        continue;
      }
      for (const [state, declarations] of Object.entries(byState)) {
        if (!rules.states.has(state)) bad(`${at}/styles/${breakpoint}/${state}`, `"${state}" is not a style state`);
        if (!isRecord(declarations)) {
          bad(`${at}/styles/${breakpoint}/${state}`, 'a state holds its declarations');
          continue;
        }
        for (const [property, value] of Object.entries(declarations)) {
          if (!rules.properties.has(property)) bad(`${at}/styles/${breakpoint}/${state}/${property}`, `"${property}" is not an edited property of properties.json`);
          if (typeof value !== 'string' || value.trim() === '') bad(`${at}/styles/${breakpoint}/${state}/${property}`, 'a stored value is non-empty CSS text');
        }
      }
    }
  }

  const holdsText = element.content === 'text' || element.content === 'markup';
  if (holdsText && typeof node.text !== 'string') bad(`${at}/text`, `a ${node.type} holds its ${element.content}`);
  if (!holdsText && node.text !== null) bad(`${at}/text`, `a ${node.type} holds no text`);
  // the marks of a text element's text (model.ts, src/core/text/inline.ts): the canonical tree of its text, links with
  // allowed addresses only, and only while something is marked
  if ('inline' in node) {
    const runs = parseInline(node.inline);
    if (element.content !== 'text') bad(`${at}/inline`, `a ${node.type} holds no marked text`);
    else if (runs === null) bad(`${at}/inline`, 'inline is a tree of strings, strong, em and a runs');
    else if (runs === 'unsafe') bad(`${at}/inline`, 'a link’s address starts with http, https, mailto or tel');
    else if (!hasMarks(runs)) bad(`${at}/inline`, 'inline is absent while nothing in the text is marked');
    else if (plainText(runs) !== node.text) bad(`${at}/inline`, 'the text of inline is the element’s text');
    else if (!deepEqual(canonical(runs), runs)) bad(`${at}/inline`, 'inline is the canonical tree of the marked text');
  }
  if (!Array.isArray(node.children)) {
    bad(`${at}/children`, 'children is a list');
    return;
  }
  if (element.content !== 'children' && node.children.length > 0) bad(`${at}/children`, `a ${node.type} holds ${element.content}, not element children`);
  node.children.forEach((child, i) => {
    if (!isRecord(child)) bad(`${at}/children/${i}`, 'a child is an element');
    else validateNode(child as unknown as DocNode, `${at}/children/${i}`, rules, claim, bad, false);
  });
}
