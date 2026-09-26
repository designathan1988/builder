// Whole-tree validation: the store runs it on every commit and refuses a state that fails it. It checks a
// document and its selection against the model (model.ts) and the manifest: element types, tags and content
// (elements.json), attributes and where they apply, edited properties, breakpoints and states (properties.json).
// It never repairs or changes anything. The HTML content model (which element may sit in which) is owned by
// src/core/elements/content-model.ts; the rules carry it for the commands that place an element, and validation
// checks it once nesting-grammar completes it.
import type { ElementType, MessageId } from '../../generated/ids.ts';
import { boxSizeOf, outputModelFromManifest, type OutputModel } from '../render/output.ts';
import type { Attribute, Coupling, ElementsFile, GeneratedHtml, PropertiesFile, TemplateNode } from '../../manifest/schema.ts';
import { contentModelFrom, type ContentModel } from '../elements/content-model.ts';
import { deepEqual } from '../history/transaction.ts';
import { settingOf } from '../page/grid-settings.ts';
import { canonical, hasMarks, parseInline, plainText } from '../text/inline.ts';
import { DOCUMENT_VERSION, walk, type DocNode, type DocumentJson, type Selection } from './model.ts';

export interface ElementRules {
  // its tag first, then its alternative tags
  readonly tags: readonly (string | null)[];
  readonly content: 'children' | 'text' | 'markup' | 'none';
  // its namespace: an HTML element, or an SVG shape drawn inside an SVG
  readonly namespace: 'html' | 'svg';
  // what a new element of the type is (element.insert): its name, its styles at the base breakpoint and state, its text
  readonly labelKey: MessageId;
  readonly defaultStyles: Readonly<Record<string, string>>;
  readonly defaultTextKey: MessageId | null;
  // the elements a new one is created holding, in order, so it is never empty (a blockquote's paragraph, a list's item,
  // a definition list's term and description); empty for none
  readonly naturalChildren: readonly string[];
}

// What an attribute's value is (elements.json): its value type, the keywords a keyword attribute takes one of, its
// HTML attribute (null when it is none) and its name in the catalogue.
export interface AttributeRules {
  readonly valueType: Attribute['valueType'];
  readonly keywords: readonly string[];
  readonly html: string | null;
  readonly labelKey: MessageId;
  // the command that sets it (elements.json)
  readonly command: string;
}

export interface ModelRules {
  readonly elements: ReadonlyMap<string, ElementRules>;
  // attribute id → the element types it applies to, or "all"
  readonly attributes: ReadonlyMap<string, readonly string[] | 'all'>;
  // attribute id → what its value is
  readonly attributeValues: ReadonlyMap<string, AttributeRules>;
  readonly autocompleteTokens: readonly string[];
  readonly properties: ReadonlySet<string>;
  // each edited property's codec, which reads and writes its values, its label and the predicate of the elements it
  // applies to (properties.json; src/core/style/applies.ts)
  readonly propertyFacts: ReadonlyMap<string, { readonly codec: string; readonly labelKey: MessageId; readonly appliesTo: string }>;
  // each composite control (a shorthand the model stores as its longhands, such as overflow): its codec, its label and
  // the longhands it writes (properties.json composites)
  // and, when its longhands name the keywords of their axis (the subset `keywords`: background-position), those
  readonly compositeFacts: ReadonlyMap<string, { readonly codec: string; readonly labelKey: MessageId; readonly longhands: readonly string[]; readonly axes: readonly (readonly string[])[] | null }>;
  // each compatibility recipe (properties.json recipes): its codec, its label and the declarations it writes (a value
  // null stands for the value typed; user-select: -webkit-user-select and user-select)
  readonly recipeFacts: ReadonlyMap<
    string,
    { readonly codec: string; readonly labelKey: MessageId; readonly declarations: readonly { readonly property: string; readonly value: string | null }[]; readonly shared: { readonly otherWrite: string } | null }
  >;
  // each property whose value is structured (properties.json structures, by the property's valueType): its fields in
  // order, each with its type and how it reaches CSS
  readonly structures: ReadonlyMap<string, readonly StructureField[]>;
  // the couplings a style write triggers, in the manifest's order (properties.json couplings; src/core/style/couplings.ts)
  readonly couplings: readonly Coupling[];
  // availability predicates that read one value of the primary selected element (properties.json valuePredicates)
  readonly valuePredicates: ReadonlyMap<string, { readonly property: string; readonly values: readonly string[] }>;
  readonly breakpoints: ReadonlySet<string>;
  readonly states: ReadonlySet<string>;
  // the breakpoint and the state a value belongs to when none is chosen (properties.json: base)
  readonly base: { readonly breakpoint: string; readonly state: string };
  // the base breakpoint and state themselves, never the layer a handler writes (the store hands handlers the layer the
  // editor edits as `base`): a new element's default styles and an SVG's own size belong here
  readonly baseLayer: { readonly breakpoint: string; readonly state: string };
  // the properties of a box's size, width then height: what the size section of properties.json summarises
  readonly boxSize: readonly string[];
  // the element every page's root is: the element type whose tag is <body> in elements.json
  readonly root: { readonly type: ElementType; readonly tag: string };
  // palette entry id → the element type it inserts and the feature that brings it (elements.json palette)
  readonly palette: ReadonlyMap<string, { readonly element: ElementType; readonly feature: string; readonly inputType: string | null; readonly labelKey: MessageId; readonly template: TemplateNode | null }>;
  // the Row and Column wrappers (elements.json wrappers): the element type, the name's catalogue key, the styles
  readonly wrappers: ReadonlyMap<WrapperId, { readonly element: ElementType; readonly nameKey: MessageId; readonly styles: Readonly<Record<string, string>> }>;
  readonly contentModel: ContentModel;
  // what the page's output needs (render.ts): the canvas and the export write elements and CSS from it
  readonly output: OutputModel;
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
        { tags: [e.tag, ...e.alternativeTags], content: e.content, namespace: e.namespace, labelKey: e.labelKey as MessageId, defaultStyles: e.defaultStyles, defaultTextKey: e.defaultTextKey as MessageId | null, naturalChildren: [e.naturalChild ?? []].flat() },
      ]),
    ),
    attributes: new Map(elements.attributes.map((a) => [a.id, a.elements])),
    attributeValues: new Map(elements.attributes.map((a) => [a.id, { valueType: a.valueType, keywords: a.keywords, html: a.html, labelKey: a.labelKey as MessageId, command: a.command }] as const)),
    autocompleteTokens: elements.autocompleteTokens,
    // what a node stores: the edited properties, and the recipes by their ids (the output writes their declarations)
    properties: new Set([...properties.properties.map((p) => p.id), ...properties.recipes.map((r) => r.id)]),
    propertyFacts: new Map(properties.properties.map((p) => [p.id, { codec: p.codec, labelKey: p.labelKey as MessageId, appliesTo: p.appliesTo }] as const)),
    compositeFacts: new Map(
      (properties.composites ?? []).map((c) => {
        const axes = c.longhands.map((l) => properties.properties.find((p) => p.id === l)?.subsets.find((s) => s.id === AXIS_KEYWORDS)?.values ?? []);
        return [c.id, { codec: c.codec, labelKey: c.labelKey as MessageId, longhands: c.longhands, axes: axes.some((a) => a.length > 0) ? axes : null }] as const;
      }),
    ),
    recipeFacts: new Map(properties.recipes.map((r) => [r.id, { codec: r.codec, labelKey: r.labelKey as MessageId, declarations: r.declarations, shared: r.shared === null ? null : { otherWrite: r.shared.otherWrite } }] as const)),
    structures: new Map(
      properties.properties.flatMap((p) => {
        const structure = properties.structures.find((s) => s.id === p.valueType);
        return structure === undefined ? [] : [[p.id, structure.fields.map((f) => ({ id: f.id, type: f.type, css: f.css, keyword: f.keyword }))] as const];
      }),
    ),
    couplings: properties.couplings,
    valuePredicates: new Map(properties.valuePredicates.map((p) => [p.id, { property: p.property, values: p.values }] as const)),
    breakpoints: new Set(properties.breakpoints.map((b) => b.id)),
    states: new Set(properties.states.map((s) => s.id)),
    base: { breakpoint: baseBreakpoint.id, state: baseState.id },
    baseLayer: { breakpoint: baseBreakpoint.id, state: baseState.id },
    boxSize: boxSizeOf(properties),
    root: { type: body.id as ElementType, tag: 'body' },
    palette: new Map(elements.palette.flatMap((g) => g.entries.map((e) => [e.id, { element: e.element as ElementType, feature: e.feature, inputType: e.inputType ?? null, labelKey: e.labelKey as MessageId, template: e.template ?? null }] as const))),
    wrappers: new Map(elements.wrappers.map((w) => [w.id, { element: w.element as ElementType, nameKey: w.nameKey as MessageId, styles: w.styles }] as const)),
    // a foreign element (<svg>) and the elements of its namespace: elements.json's elements whose namespace is its tag
    contentModel: contentModelFrom(html, new Map([...new Set(elements.elements.map((e) => e.namespace))].map((ns) => [ns, elements.elements.flatMap((e) => (e.namespace === ns && e.tag !== null ? [e.tag] : []))] as const))),
    output: outputModelFromManifest(elements, properties),
  };
}

export interface Invalid {
  // a JSON pointer into the document, or "/selection/<i>"
  readonly path: string;
  readonly message: string;
}

// A field of a structured value (properties.json structures): its id, its type, how it reaches CSS (value: written;
// keyword: its keyword when true; hides-layer: the layer out of the CSS when true) and the keyword it writes.
export interface StructureField {
  readonly id: string;
  readonly type: 'length' | 'color' | 'boolean';
  readonly css: 'value' | 'keyword' | 'hides-layer';
  readonly keyword: string | null;
}

// Why a stored structured value breaks the model, or null: a list of layers, each holding exactly its structure's
// fields, a length or a colour as non-empty text, a flag as a boolean.
function layersProblem(value: unknown, fields: readonly StructureField[]): string | null {
  if (!Array.isArray(value)) return 'a structured value is a list of layers';
  for (const [i, layer] of value.entries()) {
    if (!isRecord(layer)) return `layer ${i} is an object`;
    for (const key of Object.keys(layer)) if (!fields.some((f) => f.id === key)) return `layer ${i} holds "${key}", no field of its structure`;
    for (const f of fields) {
      const v = layer[f.id];
      if (f.type === 'boolean' ? typeof v !== 'boolean' : typeof v !== 'string' || v.trim() === '') return `layer ${i}: ${f.id} is ${f.type === 'boolean' ? 'a boolean' : 'non-empty CSS text'}`;
    }
  }
  return null;
}

// the subset of a longhand that lists the keywords of its axis (properties.json)
const AXIS_KEYWORDS = 'keywords';
const CLASS_NAME = /^-?[_a-zA-Z][_a-zA-Z0-9-]*$/;
const PAGE_FILE = /^([a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.html$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// An element's or a class's styles: breakpoints of properties.json holding its states, each holding declarations of its
// edited properties, a structured value as its structure, any other as non-empty CSS text.
function validateStyles(styles: unknown, at: string, rules: ModelRules, bad: (path: string, message: string) => void): void {
  if (!isRecord(styles)) bad(`${at}/styles`, 'styles is an object');
  else {
    for (const [breakpoint, byState] of Object.entries(styles)) {
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
          const fields = rules.structures.get(property);
          if (fields !== undefined) {
            const problem = layersProblem(value, fields);
            if (problem !== null) bad(`${at}/styles/${breakpoint}/${state}/${property}`, problem);
          } else if (typeof value !== 'string' || value.trim() === '') bad(`${at}/styles/${breakpoint}/${state}/${property}`, 'a stored value is non-empty CSS text');
        }
      }
    }
  }
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
  // the saved colours: CSS colour texts, at least one when the list is there
  // the design tokens: a name (a letter, then letters, digits and -), once each, a kind and a value
  if (doc.tokens !== undefined) {
    const names = new Set<string>();
    const tokenOk = (t: unknown) => {
      if (t === null || typeof t !== 'object') return false;
      const { name, kind, value } = t as Record<string, unknown>;
      if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/i.test(name) || names.has(name) || typeof kind !== 'string' || kind === '' || typeof value !== 'string' || value.trim() === '') return false;
      names.add(name);
      return true;
    };
    if (!Array.isArray(doc.tokens) || doc.tokens.length === 0 || !doc.tokens.every(tokenOk)) bad('/tokens', 'the design tokens are a list of named variables, each once, with a kind and a value');
  }
  // the components: a name, once each, and a definition tree whose elements are validated as a page's (their ids are
  // the document's too)
  const componentNames = new Set<string>();
  if (doc.components !== undefined) {
    if (!Array.isArray(doc.components) || doc.components.length === 0) bad('/components', 'the components are a list of named definitions, absent while there is none');
    else
      doc.components.forEach((c, i) => {
        if (!isRecord(c) || typeof c.name !== 'string' || c.name.trim() === '' || !isRecord(c.tree)) return bad(`/components/${i}`, 'a component has a name and a definition tree');
        if (componentNames.has(c.name)) bad(`/components/${i}/name`, `the component ${c.name} is made twice`);
        componentNames.add(c.name);
        if (c.tree.type === rules.root.type) bad(`/components/${i}/tree/type`, 'a page root is no component');
        validateNode(c.tree as unknown as DocNode, `/components/${i}/tree`, rules, claim, bad, false);
      });
  }
  // the style classes: a class name, once each, and its styles
  if (doc.classes !== undefined) {
    if (!Array.isArray(doc.classes) || doc.classes.length === 0) bad('/classes', 'the style classes are a list of named classes, absent while there is none');
    else {
      const names = new Set<string>();
      doc.classes.forEach((c, i) => {
        if (!isRecord(c) || typeof c.name !== 'string' || !CLASS_NAME.test(c.name)) return bad(`/classes/${i}`, 'a class has a class name and its styles');
        if (names.has(c.name)) bad(`/classes/${i}/name`, `the class ${c.name} is made twice`);
        names.add(c.name);
        validateStyles(c.styles, `/classes/${i}`, rules, bad);
      });
    }
  }
  if (doc.swatches !== undefined && (!Array.isArray(doc.swatches) || doc.swatches.length === 0 || doc.swatches.some((c) => typeof c !== 'string' || c.trim() === ''))) bad('/swatches', 'the saved colours are a list of colour texts');
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
    validateInstances(page.tree, `${at}/tree`, componentNames, false, bad);
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

// The marks of the instances of components (model.ts, spec reusable-components): an instance's root names a component
// the project has and its part is []; every element inside an instance carries its part, a list of child indexes, or
// none when it was added to that instance alone; no element outside an instance carries one; no instance lies inside
// another.
function validateInstances(node: DocNode, at: string, components: ReadonlySet<string>, inside: boolean, bad: (path: string, message: string) => void): void {
  const part: unknown = node.componentPart;
  const isPart = Array.isArray(part) && part.every((n) => Number.isInteger(n) && (n as number) >= 0);
  if ('component' in node) {
    if (typeof node.component !== 'string' || !components.has(node.component)) bad(`${at}/component`, `"${String(node.component)}" is no component of the project`);
    if (inside) bad(`${at}/component`, 'an instance lies inside another');
    if (!isPart || (part as unknown[]).length !== 0) bad(`${at}/componentPart`, 'an instance’s root is the definition’s root: its part is []');
  } else if ('componentPart' in node) {
    if (!inside) bad(`${at}/componentPart`, 'only an element of an instance has a part');
    else if (!isPart) bad(`${at}/componentPart`, 'a part is a list of child indexes');
  }
  const within = inside || 'component' in node;
  node.children.forEach((child, i) => validateInstances(child, `${at}/children/${i}`, components, within, bad));
}

// Why a name cannot be a custom attribute (feature element-attributes-aria), or null: an attribute name of HTML (a
// letter, then letters, digits, "-", "_", ".", ":"), never an event handler (on…), never one of the editor's own marks
// (data-node, data-container, data-hidden, data-key-context, contenteditable), which the page never carries.
export const EDITOR_ATTRIBUTES: ReadonlySet<string> = new Set(['data-node', 'data-container', 'data-hidden', 'data-key-context', 'data-editor-style', 'data-node-style']);
// A dedicated field owns these names even when its element type is not selected. The rule also
// catches every HTML attribute declared in elements.json, through ModelRules.attributeValues.
const RESERVED_OWNER: Readonly<Record<string, string>> = {
  style: 'inspector.tab.style', class: 'attribute.classes.label', id: 'attribute.id.label',
  srcdoc: 'attribute.embedMarkup.label', hidden: 'command.hide', tabindex: 'settings.section.accessibility',
  contenteditable: 'attribute.text.label',
};
export function reservedAttributeOwner(name: string, rules: ModelRules): string | null {
  const special = RESERVED_OWNER[name];
  if (special !== undefined) return special;
  const declared = [...rules.attributeValues.values()].find((attribute) => attribute.html === name);
  return declared?.labelKey ?? null;
}
export function customAttributeRefusal(name: string, rules: ModelRules): string | null {
  if (!/^[a-z][a-z0-9_.:-]*$/.test(name)) return 'not an attribute name';
  if (name.startsWith('on')) return 'an event handler attribute';
  if (EDITOR_ATTRIBUTES.has(name)) return 'an attribute of the editor';
  if (reservedAttributeOwner(name, rules) !== null) return 'a reserved attribute with a dedicated field';
  return null;
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

  // the page's guides (model.ts): on a page's root only, each once, on an axis, at a place from 0 on
  if ('guides' in node) {
    const list: unknown = node.guides;
    const ids = new Set<string>();
    const guideOk = (g: unknown) => {
      if (!isRecord(g) || typeof g.id !== 'string' || g.id === '' || ids.has(g.id) || (g.axis !== 'horizontal' && g.axis !== 'vertical') || typeof g.at !== 'number' || !Number.isFinite(g.at) || g.at < 0) return false;
      if ('locked' in g && g.locked !== true) return false;
      ids.add(g.id);
      return true;
    };
    if (!root) bad(`${at}/guides`, 'only a page’s root holds the page’s guides');
    else if (!Array.isArray(list) || list.length === 0 || !list.every(guideOk)) bad(`${at}/guides`, 'guides is a list of guides, each once, on an axis, at a place from 0, absent while there is none');
  }
  // the page's grid settings (model.ts): on a page's root only, each grid's settings a number from 0 on
  if ('grid' in node) {
    const grid: unknown = node.grid;
    const settingsOk = (name: string, held: unknown) =>
      isRecord(held) && Object.keys(held).length > 0 && Object.entries(held).every(([s, v]) => settingOf(name, s) !== undefined && typeof v === 'number' && Number.isFinite(v) && v >= 0);
    if (!root) bad(`${at}/grid`, 'only a page’s root holds the page’s grid settings');
    else if (!isRecord(grid) || Object.keys(grid).length === 0 || !Object.entries(grid).every(([name, held]) => settingsOk(name, held)))
      bad(`${at}/grid`, 'grid holds the settings of the columns, rows and dots grids, each a number from 0, absent while none is set');
  }
  if ('customAttributes' in node) {
    const custom: unknown = node.customAttributes;
    if (!isRecord(custom) || Object.keys(custom).length === 0) bad(`${at}/customAttributes`, 'customAttributes is an object with at least one attribute, or absent');
    else
      for (const [name, value] of Object.entries(custom)) {
        const why = customAttributeRefusal(name, rules);
        if (why !== null) bad(`${at}/customAttributes/${name}`, why);
        if (typeof value !== 'string') bad(`${at}/customAttributes/${name}`, 'a custom attribute value is a string');
      }
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

  validateStyles(node.styles, at, rules, bad);

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
