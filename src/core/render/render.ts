// The renderer (ARCHITECTURE.md): the one writer of a page's HTML and CSS from the document JSON. It builds one page
// into the document it is given (the canvas iframe's; it never reads a global document) and then applies each
// change's patches to that DOM without rebuilding the page: a style patch rewrites that node's rules, a patch of an
// attribute, a class, the text or the tag updates that node's element, a patch of a node's children reconciles
// them by node id (a node added whole is built anew, unless it is the very node the page shows, moved), and only a
// patch that replaces or shifts the rendered page itself builds the page again. A patch of another page, or of a
// field of the page that is not rendered (its name, its file), leaves the page as it is.
//
// The page root's element is the page's <body>. The settings of the page it stores (the attributes elements.json gives
// a page root alone, src/core/page/settings.ts) are the page's own: their HTML attributes (lang, dir) are written on
// the page's <html>, never on <body>, so the canvas lays the page out in its language and direction as the export does.
//
// Every element carries data-node="<id>" so the canvas and the tests find the element of a node; the export writes
// its own markup (BEM classes, no data attributes). The node's styles are one style element per node in the head,
// marked data-node-style="<id>", with rules keyed by data-node: the base breakpoint without a media query, the
// others as max-width queries in the cascade order of properties.json, the states as their pseudo-classes. A
// recipe's stored value is written as the recipe's declarations. A markup element (embed) renders empty until its
// feature sanitizes the markup. The project's design tokens are one style element of their own (data-tokens-style),
// the :root rule of their variables, written again when they change. An SVG's markup (core/elements/svg.ts, kept sanitized) is drawn in a group after its
// shapes, marked data-svg-markup (editor-only: the export writes the markup itself). The renderer adds no event
// handler to the page and writes no event attribute: the page only renders, and every pointer input arrives on the
// canvas overlay.
//
// Editor-only, never in the document nor in an export: every element of a container below the page root carries
// data-container, and one style element of the editor (data-editor-style), first in the head, gives an empty one the
// minimum height of the manifest's constant canvas.emptyContainerMinHeight, so it can be seen and pointed at. Its
// selector weighs nothing (:where), so any min-height the node's own styles set wins. The element of a hidden node
// (its hidden flag, spec hide-element) carries data-hidden, which the same style element draws with display: none,
// important so that no display of the node's own rules shows it; showing it again removes the mark, and the element
// takes back the layout its own rules give it.
//
// A text element's text is drawn with its inline marks (src/core/text/inline.ts): <strong>, <em> and <a href> around
// its runs, a <br> for each line break.
//
// Editor-only too, while a text is edited in place (src/editor/canvas/text-edit.ts): the edited element carries
// contenteditable="plaintext-only" and data-key-context naming the key context of the edit, is focused with the caret
// at the end of its text, and takes a line break at the caret when asked; its content is read back from the element
// as runs (a <br> is "\n", <strong> or <b> bold, <em> or <i> italic, <a href> a link), with the text selection as a
// range of its characters, and is drawn again with the runs and the range a change of its marks produced (spec
// text-inline-formatting). The marks go when the edit ends, and the element shows again the text the document holds.
// They are the renderer's state, never the document's, and the page still gets no event handler.
import type { NodeId } from '../../generated/commands.ts';
import { classesCss, elementAttributes, nodeCss, outputModelFromManifest, type OutputModel } from './output.ts';
export { elementAttributes, nodeCss, outputModelFromManifest, type OutputModel } from './output.ts';
import type { ElementsFile, InteractionsFile, PropertiesFile } from '../../manifest/schema.ts';
import { locate, walk, type DocNode, type DocumentJson } from '../document/model.ts';
import { applyPatches, deepEqual, type Patch } from '../history/transaction.ts';
import { canonical, runsOf, type InlineRun, type Segment, type TextRange } from '../text/inline.ts';
import { svgMarkupOf } from '../elements/svg.ts';
import { rootCss } from '../design/tokens.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
export const NODE_ATTRIBUTE = 'data-node';
// a node's style element in the head: its own attribute, so [data-node] finds only elements of the page
export const NODE_STYLE_ATTRIBUTE = 'data-node-style';
// the editor-only marks: an element of a container, a hidden node's element, and the editor's own style element
export const CONTAINER_ATTRIBUTE = 'data-container';
export const HIDDEN_ATTRIBUTE = 'data-hidden';
export const EDITOR_STYLE_ATTRIBUTE = 'data-editor-style';
// the marks of the text edited in place: editable as plain text, in the key context the editor names
export const EDITABLE_ATTRIBUTE = 'contenteditable';
// editor-only: the sandboxed frame that shows an embed's markup on the canvas
const EMBED_FRAME_ATTRIBUTE = 'data-embed-frame';
// the style element of the project's design tokens (core/design/tokens.ts): the :root rule of its variables, after the
// editor's, before every node's (the export writes the same rule first in its stylesheet)
export const TOKENS_STYLE_ATTRIBUTE = 'data-tokens-style';
const TOKENS_FIELD = 'tokens';
// the style element of the project's style classes (core/design/classes.ts): their rules, after the tokens', before
// every node's, so an element's own values override its classes (spec shared-style-classes)
export const CLASSES_STYLE_ATTRIBUTE = 'data-classes-style';
// the stylesheet of the state the editor previews on the selection (previewState)
export const PREVIEW_STYLE_ATTRIBUTE = 'data-preview-style';
const CLASSES_FIELD = 'classes';
// editor-only: the group that draws an SVG's markup after its shapes (the export writes the markup itself there)
const SVG_MARKUP_ATTRIBUTE = 'data-svg-markup';
const SVG_TAG = 'svg';
// editor-only: what an image with no source shows on the canvas, a grey box of the default image size naming it
const IMAGE_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300"><rect width="800" height="300" fill="#e2e8f0"/><text x="400" y="160" font-family="sans-serif" font-size="32" fill="#64748b" text-anchor="middle">800 × 300</text></svg>',
)}`;
export const EDITABLE_VALUE = 'plaintext-only';
export const KEY_CONTEXT_ATTRIBUTE = 'data-key-context';

// The canvas's model: the output's, and the editor-only minimum height of an empty container, in CSS px
// (canvas.emptyContainerMinHeight)
export interface RenderModel extends OutputModel {
  readonly emptyContainerMinHeight: number;
}

export function renderModelFromManifest(elements: ElementsFile, properties: PropertiesFile, interactions: InteractionsFile): RenderModel {
  const minHeight = interactions.constants.find((c) => c.id === 'canvas.emptyContainerMinHeight')?.value;
  if (typeof minHeight !== 'number') throw new Error('the manifest has no number canvas.emptyContainerMinHeight');
  return { ...outputModelFromManifest(elements, properties), emptyContainerMinHeight: minHeight };
}

// The editor's own CSS in the page: an empty container keeps a visible minimum height; a hidden node's element is
// not drawn, whatever its own rules say.
export function editorCss(model: RenderModel): string {
  return `:where([${CONTAINER_ATTRIBUTE}]:empty) { min-height: ${model.emptyContainerMinHeight}px; }\n[${HIDDEN_ATTRIBUTE}] { display: none !important; }\n[${EMBED_FRAME_ATTRIBUTE}] { display: block; width: 100%; min-height: ${model.emptyContainerMinHeight}px; border: 0; pointer-events: none; }`;
}

// The selector of a node's element: its id quoted as a CSS string.
export function nodeSelector(id: NodeId): string {
  return `[${NODE_ATTRIBUTE}="${id.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"]`;
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

// The pieces of a text element's text on the page, in order: its text nodes and its <br>s ("\n"), each with the marks
// of the elements around it inside the element (<strong> and <b> bold, <em> and <i> italic, <a href> a link; any other
// element only holds its text).
interface Leaf {
  readonly node: Node;
  readonly text: string;
  readonly marks: Omit<Segment, 'text'>;
}
const MARK_ELEMENTS: Readonly<Record<string, 'strong' | 'em'>> = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em' };
function leavesOf(element: Element): Leaf[] {
  const out: Leaf[] = [];
  const visit = (parent: Node, marks: Omit<Segment, 'text'>) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === TEXT_NODE) out.push({ node: child, text: child.nodeValue ?? '', marks });
      else if (child.nodeType !== ELEMENT_NODE) continue;
      else if (child.nodeName.toUpperCase() === 'BR') out.push({ node: child, text: '\n', marks });
      else {
        const name = child.nodeName.toUpperCase();
        const mark = MARK_ELEMENTS[name];
        const href = name === 'A' ? (child as Element).getAttribute('href') : null;
        visit(child, mark !== undefined ? { ...marks, [mark]: true } : href !== null ? { ...marks, href } : marks);
      }
    }
  };
  visit(element, { strong: false, em: false, href: null });
  return out;
}
const runsOfLeaves = (leaves: readonly Leaf[]): InlineRun[] => runsOf(leaves.map((l) => ({ text: l.text, ...l.marks })));

// The last <br> of an edited text when nothing but empty text follows it: the one a browser needs to show a line
// break at the very end, which the text read back leaves out.
function browserBreak(leaves: readonly Leaf[]): Leaf | null {
  const last = leaves.findLast((l) => l.text !== '');
  return last !== undefined && last.node.nodeName.toUpperCase() === 'BR' ? last : null;
}

// Whether a leaf of a text (a text node or a <br>, never the point's own container) lies before a boundary point: the
// point is inside no leaf but its container, so a leaf is wholly before it or wholly after it.
const DOCUMENT_POSITION_PRECEDING = 2;
function precedes(leaf: Node, container: Node, offset: number): boolean {
  if (container.nodeType === TEXT_NODE) return (container.compareDocumentPosition(leaf) & DOCUMENT_POSITION_PRECEDING) !== 0;
  const next = container.childNodes[offset] ?? null;
  if (next === null) return container.contains(leaf) || (container.compareDocumentPosition(leaf) & DOCUMENT_POSITION_PRECEDING) !== 0;
  return next !== leaf && !next.contains(leaf) && (next.compareDocumentPosition(leaf) & DOCUMENT_POSITION_PRECEDING) !== 0;
}

// Whether nothing but empty text follows a node of an element's text inside the element (a mark around it included).
function lastContent(element: Element, node: Node): boolean {
  const leaves = leavesOf(element);
  const at = leaves.findIndex((l) => l.node === node);
  return at >= 0 && leaves.slice(at + 1).every((l) => l.text === '');
}

// Gives an element exactly the attributes wanted, writing only what differs.
function writeAttributes(element: Element, wanted: ReadonlyMap<string, string>): void {
  for (const attribute of [...element.attributes]) if (!wanted.has(attribute.name)) element.removeAttribute(attribute.name);
  for (const [name, value] of wanted) if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

// An SVG's markup group stays after its shapes, whatever order the shapes arrived in.
function markupLast(element: Element): void {
  const group = [...element.children].find((child) => child.hasAttribute(SVG_MARKUP_ATTRIBUTE));
  if (group !== undefined && element.lastElementChild !== group) element.append(group);
}

export class PageRenderer {
  private readonly elements = new Map<NodeId, Element>();
  private readonly sheets = new Map<NodeId, HTMLStyleElement>();
  // the markup each SVG markup group draws
  private readonly markups = new WeakMap<Element, string>();
  // the text being edited in place: its node and the key context its element names
  private edit: { readonly node: NodeId; readonly context: string } | null = null;
  // the closed details and dialogs drawn open because of the selection (reveal)
  private revealed = new Set<NodeId>();

  constructor(
    private readonly target: Document,
    private readonly model: RenderModel,
    private readonly page = 0,
  ) {}

  // The element that renders a node, or null.
  element(id: NodeId): Element | null {
    return this.elements.get(id) ?? null;
  }

  // Editor-only (spec elements-interactive): a closed <details> or <dialog> is drawn open while it, or a node inside it,
  // is selected, so its content can be seen and edited; the document and the export keep its own open state.
  reveal(doc: DocumentJson, selection: readonly NodeId[]): void {
    const wanted = new Set<NodeId>();
    for (const id of selection) {
      for (let at = locate(doc, id); at !== null; at = at.parent === null ? null : locate(doc, at.parent.id)) {
        if (at.node.tag === 'details' || at.node.tag === 'dialog') wanted.add(at.node.id);
      }
    }
    const changed = [...wanted].filter((id) => !this.revealed.has(id)).concat([...this.revealed].filter((id) => !wanted.has(id)));
    this.revealed = wanted;
    const tree = doc.pages[this.page]?.tree ?? null;
    for (const id of changed) {
      const node = tree === null ? null : findNode(tree, id);
      const element = this.elements.get(id);
      if (node && element) this.dress(element, node);
    }
  }

  // Editor-only (spec state-styles): the selected elements drawn as if a state held, while a state other than Base is
  // edited: one stylesheet, after every node's, holding each selected node's values of that state as plain rules (with
  // their breakpoints' media queries); none otherwise. The export never has it.
  previewState(doc: DocumentJson, selection: readonly NodeId[], state: string | null): void {
    const tree = doc.pages[this.page]?.tree ?? null;
    const css =
      state === null || tree === null
        ? ''
        : selection
            .map((id) => findNode(tree, id))
            .flatMap((node) => {
              if (!node) return [];
              const held: Record<string, Record<string, unknown>> = {};
              for (const [breakpoint, byState] of Object.entries(node.styles as Record<string, Record<string, unknown>>)) {
                const values = byState[state];
                if (values !== undefined) held[breakpoint] = { [this.model.base.state]: values };
              }
              return [nodeCss({ styles: held as DocNode['styles'] }, nodeSelector(node.id), this.model)];
            })
            .filter((c) => c !== '')
            .join('\n');
    let sheet = this.target.head.querySelector(`style[${PREVIEW_STYLE_ATTRIBUTE}]`);
    if (css === '') {
      sheet?.remove();
      return;
    }
    if (!sheet) {
      sheet = this.target.createElement('style');
      sheet.setAttribute(PREVIEW_STYLE_ATTRIBUTE, '');
    }
    // always last, after every node's rules, so the state's values win as a state would
    if (sheet !== this.target.head.lastElementChild) this.target.head.append(sheet);
    if (sheet.textContent !== css) sheet.textContent = css;
  }

  // Starts editing a text element in place (the marks, the focus without scrolling, the caret at the end of its
  // text), or, with null, ends the edit: the element loses the marks and shows the text the document holds.
  editText(doc: DocumentJson, id: NodeId | null, context: string): void {
    const tree = doc.pages[this.page]?.tree ?? null;
    const previous = this.edit;
    if (previous?.node === id && previous.context === context) return;
    this.edit = null;
    const left = previous && tree ? findNode(tree, previous.node) : null;
    const leftElement = previous ? this.elements.get(previous.node) : undefined;
    if (left && leftElement) this.dress(leftElement, left, true);
    if (id === null || !tree) return;
    const node = findNode(tree, id);
    const element = this.elements.get(id);
    if (!node || !element || this.model.elements.get(node.type)?.content !== 'text') return;
    this.edit = { node: id, context };
    this.dress(element, node);
    (element as HTMLElement).focus({ preventScroll: true });
    const selection = this.target.getSelection();
    selection?.selectAllChildren(element);
    selection?.collapseToEnd();
  }

  // A line break at the caret of the edited text. One at the very end is followed by the <br> a browser needs to
  // show the new line, which the text read back leaves out.
  insertLineBreak(): void {
    const element = this.edit ? this.elements.get(this.edit.node) : undefined;
    const selection = this.target.getSelection();
    if (!element || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const lineBreak = this.target.createElement('br');
    range.insertNode(lineBreak);
    if (lastContent(element, lineBreak)) lineBreak.after(this.target.createElement('br'));
    range.setStartAfter(lineBreak);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Every character of the edited text as the text selection, so what is typed next replaces it.
  selectEditedText(): void {
    const element = this.edit ? this.elements.get(this.edit.node) : undefined;
    const selection = this.target.getSelection();
    if (!element || !selection) return;
    selection.selectAllChildren(element);
  }

  // What the edited element holds now, or null when no text is edited: its canonical runs ("\n" for each line break,
  // the browser's last <br> left out) and the text selection as a range of their characters, null when the selection
  // is not inside the element.
  editedContent(): { readonly runs: InlineRun[]; readonly range: TextRange | null } | null {
    const element = this.edit ? this.elements.get(this.edit.node) : undefined;
    if (!element) return null;
    const all = leavesOf(element);
    const dropped = browserBreak(all);
    const leaves = all.filter((l) => l !== dropped);
    const length = leaves.reduce((n, l) => n + l.text.length, 0);
    const selection = this.target.getSelection();
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range === null || !element.contains(range.startContainer) || !element.contains(range.endContainer)) return { runs: runsOfLeaves(leaves), range: null };
    const start = Math.min(this.offsetIn(leaves, range.startContainer, range.startOffset), length);
    const end = Math.min(this.offsetIn(leaves, range.endContainer, range.endOffset), length);
    return { runs: runsOfLeaves(leaves), range: { start, end } };
  }

  // Draws the edited element again with the runs a change of its marks produced (the <br> a browser needs after a line
  // break at the very end included), selects the range given in it, and gives it the focus back without scrolling.
  showEdited(runs: readonly InlineRun[], range: TextRange): void {
    const element = this.edit ? this.elements.get(this.edit.node) : undefined;
    if (!element) return;
    element.replaceChildren(...this.runNodes(runs));
    const leaves = leavesOf(element);
    if (leaves.findLast((l) => l.text !== '')?.node.nodeName.toUpperCase() === 'BR') element.append(this.target.createElement('br'));
    this.focusEdited(range);
  }

  // Gives the edited element the focus back without scrolling, with the range given selected in it (or, with none, the
  // selection it kept): after a control outside the page held the focus (the link prompt).
  focusEdited(range: TextRange | null): void {
    const element = this.edit ? this.elements.get(this.edit.node) : undefined;
    if (!element) return;
    (element as HTMLElement).focus({ preventScroll: true });
    const selection = this.target.getSelection();
    if (range === null || !selection) return;
    const all = leavesOf(element);
    const dropped = browserBreak(all);
    const leaves = all.filter((l) => l !== dropped);
    const [endNode, endOffset] = this.pointAt(element, leaves, Math.max(range.start, range.end), false);
    if (range.start === range.end) {
      selection.collapse(endNode, endOffset);
      return;
    }
    const [startNode, startOffset] = this.pointAt(element, leaves, Math.min(range.start, range.end), true);
    selection.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
  }

  // The number of characters of an edited text before a boundary point inside its element.
  private offsetIn(leaves: readonly Leaf[], container: Node, offset: number): number {
    let count = 0;
    for (const leaf of leaves) {
      if (leaf.node === container) return count + (leaf.node.nodeType === TEXT_NODE ? offset : 0);
      if (!precedes(leaf.node, container, offset)) break;
      count += leaf.text.length;
    }
    return count;
  }

  // The boundary point at a number of characters into an edited text: inside a text node, or before a <br>; at a
  // boundary between two texts, the start of the next one (`next`, a range's start) or the end of the previous one
  // (a range's end and a caret, so what is typed next takes the marks of what it follows).
  private pointAt(element: Element, leaves: readonly Leaf[], offset: number, next: boolean): [Node, number] {
    let count = 0;
    for (const leaf of leaves) {
      const length = leaf.text.length;
      if (leaf.node.nodeType === TEXT_NODE) {
        if (offset < count + length || (offset === count + length && !next)) return [leaf.node, offset - count];
      } else if (offset <= count && leaf.node.parentNode !== null) return [leaf.node.parentNode, [...leaf.node.parentNode.childNodes].indexOf(leaf.node as ChildNode)];
      count += length;
    }
    return [element, element.childNodes.length];
  }

  // The page's nodes of runs: a text node for each line of a string with a <br> between lines, an element for each mark.
  private runNodes(runs: readonly InlineRun[]): Node[] {
    return runs.flatMap((run): Node[] => {
      if (typeof run === 'string') return run.split('\n').flatMap((line, i) => (i === 0 ? [this.target.createTextNode(line)] : [this.target.createElement('br'), this.target.createTextNode(line)]));
      const element = this.target.createElement(run.tag);
      if (run.tag === 'a') element.setAttribute('href', run.href);
      element.append(...this.runNodes(run.children));
      return [element];
    });
  }

  // Builds the whole page: once, and when the rendered page itself is replaced.
  mount(doc: DocumentJson): void {
    // the style elements of every node, also those a previous renderer of this document left
    for (const sheet of [...this.target.head.querySelectorAll(`style[${NODE_STYLE_ATTRIBUTE}], style[${EDITOR_STYLE_ATTRIBUTE}], style[${TOKENS_STYLE_ATTRIBUTE}], style[${CLASSES_STYLE_ATTRIBUTE}]`)]) sheet.remove();
    this.sheets.clear();
    this.elements.clear();
    // the editor's style element, first, so every node's rules come after it
    const editor = this.target.createElement('style');
    editor.setAttribute(EDITOR_STYLE_ATTRIBUTE, '');
    editor.textContent = editorCss(this.model);
    this.target.head.prepend(editor);
    const tokens = this.target.createElement('style');
    tokens.setAttribute(TOKENS_STYLE_ATTRIBUTE, '');
    editor.after(tokens);
    this.writeTokens(doc);
    const classes = this.target.createElement('style');
    classes.setAttribute(CLASSES_STYLE_ATTRIBUTE, '');
    tokens.after(classes);
    this.writeClasses(doc);
    const body = this.target.body;
    body.replaceChildren();
    const tree = doc.pages[this.page]?.tree ?? null;
    if (!tree) {
      writeAttributes(body, new Map());
      writeAttributes(this.target.documentElement, new Map());
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
    if (patches.some((patch) => patch.path[0] === TOKENS_FIELD)) this.writeTokens(after);
    if (patches.some((patch) => patch.path[0] === CLASSES_FIELD)) this.writeClasses(after);
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
      // an SVG's viewBox is its size (core/elements/svg.ts): a new size writes it again
      if (node && node.tag === SVG_TAG && !elements.has(id)) this.redress(node);
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
    markupLast(element);
    return element;
  }

  // The node's own attributes (elementAttributes, the output's) and text on its element, with the editor's own marks,
  // writing only what differs. The text of the element
  // being edited is the edit's until it ends (`rewrite` then writes the document's text whatever the element shows).
  private dress(element: Element, node: DocNode, rewrite = false): void {
    // the page root's element is the page's <body>; the settings of the page it stores are the page's <html>'s
    const root = element === this.target.body;
    const wanted = new Map<string, string>([[NODE_ATTRIBUTE, node.id]]);
    const page = new Map<string, string>();
    // a container below the page root (editor-only: see the top of this file); an SVG is no box of the layout, its
    // declared size is its drawing's (core/elements/svg.ts)
    if (!root && this.model.elements.get(node.type)?.content === 'children' && element.localName !== SVG_TAG) wanted.set(CONTAINER_ATTRIBUTE, '');
    // a hidden node (editor-only: see the top of this file)
    if (node.hidden === true) wanted.set(HIDDEN_ATTRIBUTE, '');
    const edited = this.edit?.node === node.id ? this.edit : null;
    if (edited) {
      wanted.set(EDITABLE_ATTRIBUTE, EDITABLE_VALUE);
      wanted.set(KEY_CONTEXT_ATTRIBUTE, edited.context);
    }
    const tag = element.localName;
    const output = elementAttributes(node, tag, root, this.model);
    for (const [name, value] of output.element) if (!wanted.has(name)) wanted.set(name, value);
    for (const [name, value] of output.page) page.set(name, value);
    // editor-only: media never play by themselves on the canvas
    wanted.delete('autoplay');
    // editor-only: an embedded frame is sandboxed, so what it shows can run nothing against the editor; an image with
    // no source shows a placeholder of its default size (spec elements-media-images)
    if (tag === 'iframe') wanted.set('sandbox', '');
    if (this.revealed.has(node.id)) wanted.set('open', '');
    if (tag === 'img' && !wanted.has('src')) wanted.set('src', IMAGE_PLACEHOLDER);
    writeAttributes(element, wanted);
    if (root) writeAttributes(this.target.documentElement, page);
    if (tag === SVG_TAG) this.drawSvgMarkup(element, node);
    // editor-only (feature embed-html): an embed's markup is shown inside a sandboxed frame, where its scripts never
    // run; the document and the export keep the markup as it is
    if (this.model.elements.get(node.type)?.content === 'markup') {
      const frame = element.firstElementChild?.localName === 'iframe' ? element.firstElementChild : null;
      const markup = node.text ?? '';
      if (frame !== null && frame.getAttribute('srcdoc') === markup) return;
      const shown = frame ?? this.target.createElement('iframe');
      shown.setAttribute('sandbox', '');
      shown.setAttribute('srcdoc', markup);
      shown.setAttribute(EMBED_FRAME_ATTRIBUTE, '');
      if (frame === null) element.replaceChildren(shown);
      return;
    }
    if (node.type === 'summary' || node.type === 'legend') {
      const prefix = node.text ?? '';
      const first = element.firstChild;
      if (first?.nodeType === 3) {
        if (prefix === '') first.remove();
        else if (first.textContent !== prefix) first.textContent = prefix;
      } else if (prefix !== '') element.insertBefore(this.target.createTextNode(prefix), first);
      return;
    }
    if (this.model.elements.get(node.type)?.content !== 'text' || edited) return;
    // the text with its marks (src/core/text/inline.ts), or the plain text when nothing is marked
    const runs = node.inline ?? [node.text ?? ''];
    if (!rewrite && deepEqual(runsOfLeaves(leavesOf(element)), canonical(runs))) return;
    element.replaceChildren(...this.runNodes(runs));
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
    markupLast(element);
  }

  // The :root rule of the project's design tokens, in their style element.
  private writeTokens(doc: DocumentJson): void {
    const sheet = this.target.head.querySelector(`style[${TOKENS_STYLE_ATTRIBUTE}]`);
    const css = rootCss(doc.tokens ?? []);
    if (sheet !== null && sheet.textContent !== css) sheet.textContent = css;
  }

  // The rules of the project's style classes, in their style element.
  private writeClasses(doc: DocumentJson): void {
    const sheet = this.target.head.querySelector(`style[${CLASSES_STYLE_ATTRIBUTE}]`);
    const css = classesCss(doc.classes ?? [], this.model);
    if (sheet !== null && sheet.textContent !== css) sheet.textContent = css;
  }

  // An SVG's markup (core/elements/svg.ts, sanitized when it was kept): its group, drawn anew only when the markup
  // changed, and gone when there is none.
  private drawSvgMarkup(element: Element, node: DocNode): void {
    const markup = svgMarkupOf(node);
    const held = [...element.children].find((child) => child.hasAttribute(SVG_MARKUP_ATTRIBUTE)) ?? null;
    if (markup === '') {
      held?.remove();
      return;
    }
    const group = held ?? this.target.createElementNS(SVG_NS, 'g');
    if (held === null) group.setAttribute(SVG_MARKUP_ATTRIBUTE, '');
    if (this.markups.get(group) !== markup) {
      group.innerHTML = markup;
      this.markups.set(group, markup);
    }
    element.append(group);
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
