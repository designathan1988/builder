// The renderer (ARCHITECTURE.md): the one writer of a page's HTML and CSS from the document JSON. It builds one page
// into the document it is given (the canvas iframe's; it never reads a global document) and then applies each
// change's patches to that DOM without rebuilding the page: a style patch rewrites that node's rules, a patch of an
// attribute, a class, the text or the tag updates that node's element, a patch of a node's children reconciles
// them by node id (a node added whole is built anew, unless it is the very node the page shows, moved), and only a
// patch that replaces or shifts the rendered page itself builds the page again. A patch of another page, or of a
// field of the page that is not rendered (its name, its file), leaves the page as it is.
//
// Every element carries data-node="<id>" so the canvas and the tests find the element of a node; the export writes
// its own markup (BEM classes, no data attributes). The node's styles are one style element per node in the head,
// marked data-node-style="<id>", with rules keyed by data-node: the base breakpoint without a media query, the
// others as max-width queries in the cascade order of properties.json, the states as their pseudo-classes. A
// recipe's stored value is written as the recipe's declarations. A markup element (embed) renders empty until its
// feature sanitizes the markup. The renderer adds no event handler to the page and writes no event attribute: the
// page only renders, and every pointer input arrives on the canvas overlay.
import type { NodeId } from '../../generated/commands.ts';
import type { ElementsFile, PropertiesFile } from '../../manifest/schema.ts';
import { walk, type DocNode, type DocumentJson } from '../document/model.ts';
import { applyPatches, deepEqual, type Patch } from '../history/transaction.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
export const NODE_ATTRIBUTE = 'data-node';
// a node's style element in the head: its own attribute, so [data-node] finds only elements of the page
export const NODE_STYLE_ATTRIBUTE = 'data-node-style';

export interface RenderModel {
  readonly elements: ReadonlyMap<string, { readonly namespace: 'html' | 'svg'; readonly content: 'children' | 'text' | 'markup' | 'none' }>;
  // attribute id → its HTML attribute name, or null when it is not one (the text, the tag)
  readonly attributes: ReadonlyMap<string, string | null>;
  // the breakpoints in cascade order: the base first, with no media query
  readonly breakpoints: readonly { readonly id: string; readonly width: number; readonly base: boolean }[];
  // state id → its pseudo-class, or null for the base state
  readonly states: ReadonlyMap<string, string | null>;
  // recipe id → its declarations; a null value is the stored value
  readonly recipes: ReadonlyMap<string, readonly { readonly property: string; readonly value: string | null }[]>;
}

export function renderModelFromManifest(elements: ElementsFile, properties: PropertiesFile): RenderModel {
  return {
    elements: new Map(elements.elements.map((e) => [e.id, { namespace: e.namespace, content: e.content }])),
    attributes: new Map(elements.attributes.map((a) => [a.id, a.html])),
    breakpoints: properties.breakpoints.map((b) => ({ id: b.id, width: b.width, base: b.base })),
    states: new Map(properties.states.map((s) => [s.id, s.pseudo])),
    recipes: new Map(properties.recipes.map((r) => [r.id, r.declarations])),
  };
}

// The selector of a node's element: its id quoted as a CSS string.
export function nodeSelector(id: NodeId): string {
  return `[${NODE_ATTRIBUTE}="${id.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
}

// The CSS of one node: every declaration of every breakpoint and state it stores, for the selector given.
export function nodeCss(node: DocNode, selector: string, model: RenderModel): string {
  const blocks: string[] = [];
  for (const breakpoint of model.breakpoints) {
    const byState = node.styles[breakpoint.id as keyof DocNode['styles']];
    if (!byState) continue;
    const rules: string[] = [];
    for (const [state, pseudo] of model.states) {
      const declarations = byState[state as keyof typeof byState];
      if (!declarations) continue;
      const lines = Object.entries(declarations).flatMap(([property, value]) => {
        const recipe = model.recipes.get(property);
        if (recipe) return recipe.map((d) => `${d.property}: ${d.value ?? String(value)};`);
        return [`${property}: ${String(value)};`];
      });
      if (lines.length > 0) rules.push(`${selector}${pseudo ?? ''} { ${lines.join(' ')} }`);
    }
    if (rules.length === 0) continue;
    blocks.push(breakpoint.base ? rules.join('\n') : `@media (max-width: ${breakpoint.width}px) {\n${rules.join('\n')}\n}`);
  }
  return blocks.join('\n');
}

// What a patch changes, found in the document as it was just before the patch: the rendered page as a whole
// (replaced, or shifted to another index), nothing the page shows, or one node's children, styles or the rest of
// the node.
type Touch = { readonly kind: 'page' } | { readonly kind: 'none' } | { readonly kind: 'children' | 'styles' | 'element'; readonly node: NodeId };

function touchOf(doc: DocumentJson, page: number, patch: Patch): Touch {
  const { path } = patch;
  if (path[0] !== 'pages') return { kind: 'none' };
  if (path.length === 1) return { kind: 'page' };
  const index = path[1];
  if (typeof index !== 'number') return { kind: 'page' };
  if (path.length === 2) {
    // a page added or removed before the rendered one moves it to another index
    if (patch.op === 'replace') return { kind: index === page ? 'page' : 'none' };
    return { kind: index <= page ? 'page' : 'none' };
  }
  if (index !== page) return { kind: 'none' };
  if (path[2] !== 'tree') return { kind: 'none' };
  if (path.length === 3) return { kind: 'page' };
  let node: DocNode | undefined = doc.pages[page]?.tree;
  let at = 3;
  while (node && path[at] === 'children' && typeof path[at + 1] === 'number' && at + 2 < path.length) {
    node = node.children[path[at + 1] as number];
    at += 2;
  }
  if (!node) return { kind: 'page' };
  const field = path[at];
  if (field === 'children') return { kind: 'children', node: node.id };
  if (field === 'styles') return { kind: 'styles', node: node.id };
  // a node's id or type is never changed in place; if it were, the page is built again
  if (field === 'id' || field === 'type') return { kind: 'page' };
  return { kind: 'element', node: node.id };
}

function isNode(value: unknown): value is DocNode {
  return value !== null && typeof value === 'object' && 'id' in value && 'children' in value && Array.isArray((value as DocNode).children);
}

// The nodes a children patch writes: one node (an index of the list) or a whole list.
function writtenNodes(patch: Patch): readonly DocNode[] {
  if (patch.op === 'remove') return [];
  if (isNode(patch.value)) return [patch.value];
  return Array.isArray(patch.value) ? patch.value.filter(isNode) : [];
}

function findNode(root: DocNode, id: NodeId): DocNode | null {
  for (const node of walk(root)) if (node.id === id) return node;
  return null;
}

// The text an element of a text element shows: its text nodes, a <br> for each line break.
function shownText(element: Element): string {
  return [...element.childNodes].map((n) => (n.nodeType === TEXT_NODE ? (n.nodeValue ?? '') : n.nodeName === 'BR' ? '\n' : '')).join('');
}

export class PageRenderer {
  private readonly elements = new Map<NodeId, Element>();
  private readonly sheets = new Map<NodeId, HTMLStyleElement>();

  constructor(
    private readonly target: Document,
    private readonly model: RenderModel,
    private readonly page = 0,
  ) {}

  // The element that renders a node, or null.
  element(id: NodeId): Element | null {
    return this.elements.get(id) ?? null;
  }

  // Builds the whole page: once, and when the rendered page itself is replaced.
  mount(doc: DocumentJson): void {
    // the style elements of every node, also those a previous renderer of this document left
    for (const sheet of [...this.target.head.querySelectorAll(`style[${NODE_STYLE_ATTRIBUTE}]`)]) sheet.remove();
    this.sheets.clear();
    this.elements.clear();
    const body = this.target.body;
    body.replaceChildren();
    const tree = doc.pages[this.page]?.tree ?? null;
    if (!tree) {
      for (const attribute of [...body.attributes]) body.removeAttribute(attribute.name);
      return;
    }
    this.elements.set(tree.id, body);
    this.dress(body, tree);
    this.writeStyle(tree);
    body.append(...tree.children.map((child) => this.build(child)));
  }

  // Applies a change's patches to the page: `before` is the document the page shows, `after` the one the patches
  // make of it.
  apply(before: DocumentJson, after: DocumentJson, patches: readonly Patch[]): void {
    const children = new Set<NodeId>();
    const styles = new Set<NodeId>();
    const elements = new Set<NodeId>();
    // the nodes added or replaced whole with a content other than the one the page shows: built anew
    const rebuilt = new Set<NodeId>();
    const shown = before.pages[this.page]?.tree ?? null;
    let state = before;
    for (const patch of patches) {
      const touch = touchOf(state, this.page, patch);
      if (touch.kind === 'page') return this.mount(after);
      state = applyPatches(state, [patch]).document;
      if (touch.kind === 'none') continue;
      if (touch.kind === 'styles') styles.add(touch.node);
      else if (touch.kind === 'element') elements.add(touch.node);
      else {
        children.add(touch.node);
        for (const written of writtenNodes(patch)) {
          // a node the page shows exactly as written is moved, keeping its element
          const current = shown ? findNode(shown, written.id) : null;
          if (current && deepEqual(current, written)) continue;
          for (const node of walk(written)) rebuilt.add(node.id);
        }
      }
    }
    const tree = after.pages[this.page]?.tree ?? null;
    if (!tree) return this.mount(after);
    for (const id of rebuilt) this.forget(id);
    for (const id of elements) {
      const node = findNode(tree, id);
      if (node) this.redress(node);
    }
    for (const id of children) {
      const node = findNode(tree, id);
      if (node) this.reconcile(node);
    }
    if (children.size > 0) this.dropMissing(tree);
    for (const id of styles) {
      const node = findNode(tree, id);
      if (node) this.writeStyle(node);
    }
  }

  private create(node: DocNode): Element {
    const kind = this.model.elements.get(node.type);
    const tag = node.tag ?? 'div';
    return kind?.namespace === 'svg' || tag === 'svg' ? this.target.createElementNS(SVG_NS, tag) : this.target.createElement(tag);
  }

  // A node's element and its whole subtree, with the styles of every node in it.
  private build(node: DocNode): Element {
    const element = this.create(node);
    this.dress(element, node);
    this.elements.set(node.id, element);
    this.writeStyle(node);
    element.append(...node.children.map((child) => this.build(child)));
    return element;
  }

  // The node's own attributes, classes and text on its element, writing only what differs.
  private dress(element: Element, node: DocNode): void {
    const wanted = new Map<string, string>([[NODE_ATTRIBUTE, node.id]]);
    if (node.classes.length > 0) wanted.set('class', node.classes.join(' '));
    for (const [id, value] of Object.entries(node.attributes)) {
      const name = this.model.attributes.get(id);
      // never an event attribute: the page has no handler of its own
      if (name === null || name === undefined || name.startsWith('on') || value === false) continue;
      wanted.set(name, value === true ? '' : String(value));
    }
    for (const attribute of [...element.attributes]) if (!wanted.has(attribute.name)) element.removeAttribute(attribute.name);
    for (const [name, value] of wanted) if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    if (this.model.elements.get(node.type)?.content !== 'text') return;
    const text = node.text ?? '';
    if (shownText(element) === text) return;
    const lines = text.split('\n');
    element.replaceChildren(...lines.flatMap((line, i) => (i === 0 ? [this.target.createTextNode(line)] : [this.target.createElement('br'), this.target.createTextNode(line)])));
  }

  // After a change of the node itself: a new tag builds a new element around the same children elements.
  private redress(node: DocNode): void {
    const element = this.elements.get(node.id);
    if (!element) return;
    if (node.tag !== null && element.localName !== node.tag && element !== this.target.body) {
      const replacement = this.create(node);
      this.dress(replacement, node);
      // the elements of child nodes only (never the <br> of a text), compared by node type: the page's elements
      // belong to the iframe's realm, where `instanceof Element` of the editor's realm is false
      replacement.append(...[...element.children].filter((child) => child.nodeType === ELEMENT_NODE && child.hasAttribute(NODE_ATTRIBUTE)));
      element.replaceWith(replacement);
      this.elements.set(node.id, replacement);
      return;
    }
    this.dress(element, node);
  }

  // Drops one node's element, so the next reconcile builds it anew. Its style element stays: build rewrites it.
  private forget(id: NodeId): void {
    this.elements.get(id)?.remove();
    this.elements.delete(id);
  }

  // Puts the node's children elements in the document's order, moving the ones that exist and building the rest;
  // an element already in its place is not touched.
  private reconcile(node: DocNode): void {
    const element = this.elements.get(node.id);
    if (!element) return;
    const wanted = node.children.map((child) => this.elements.get(child.id) ?? this.build(child));
    wanted.forEach((child, i) => {
      if (element.children[i] !== child) element.insertBefore(child, element.children[i] ?? null);
    });
    for (const extra of [...element.children].slice(wanted.length)) {
      if (extra.hasAttribute(NODE_ATTRIBUTE)) extra.remove();
    }
  }

  // Forgets the elements and style elements of nodes the document no longer has.
  private dropMissing(tree: DocNode): void {
    const alive = new Set<NodeId>();
    for (const node of walk(tree)) alive.add(node.id);
    for (const [id, element] of this.elements) {
      if (alive.has(id)) continue;
      element.remove();
      this.elements.delete(id);
    }
    for (const [id, sheet] of this.sheets) {
      if (alive.has(id)) continue;
      sheet.remove();
      this.sheets.delete(id);
    }
  }

  private writeStyle(node: DocNode): void {
    const css = nodeCss(node, nodeSelector(node.id), this.model);
    let sheet = this.sheets.get(node.id);
    if (css === '') {
      sheet?.remove();
      this.sheets.delete(node.id);
      return;
    }
    if (!sheet) {
      sheet = this.target.createElement('style');
      sheet.setAttribute(NODE_STYLE_ATTRIBUTE, node.id);
      this.target.head.append(sheet);
      this.sheets.set(node.id, sheet);
    }
    if (sheet.textContent !== css) sheet.textContent = css;
  }
}
