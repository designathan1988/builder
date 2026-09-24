// The document JSON: the source of truth of a project. Plain data, never the DOM. Its vocabulary comes from the
// manifest through the generated ids: element types (elements.json), attributes, edited properties, breakpoints
// and states (properties.json). src/core/document/validate.ts checks a whole document against it on every commit.
import type { NodeId } from '../../generated/commands.ts';
import type { AttributeId, BreakpointId, ElementType, PropertyId, StateId } from '../../generated/ids.ts';
import type { IdGenerator } from '../ports/ids.ts';

export type { NodeId };

// The version of the saved format; it is carried from the first save (autosave-restore).
export const DOCUMENT_VERSION = 1;

// property → its stored CSS text
export type Declarations = { readonly [P in PropertyId]?: string };
// breakpoint → state → declarations: a value belongs to one breakpoint and one state
export type Styles = { readonly [B in BreakpointId]?: { readonly [S in StateId]?: Declarations } };
export type AttributeValue = string | number | boolean;

export interface DocNode {
  readonly id: NodeId;
  readonly type: ElementType;
  // the name the user sees in Layers and the export derives BEM classes from
  readonly name: string;
  // the element's tag, or one of its alternative tags; null only for an element that writes verbatim markup
  readonly tag: string | null;
  readonly attributes: { readonly [A in AttributeId]?: AttributeValue };
  readonly classes: readonly string[];
  readonly styles: Styles;
  // the text of a text element or the markup of a markup element; null for the others
  readonly text: string | null;
  readonly children: readonly DocNode[];
}

export interface Page {
  readonly id: string;
  readonly name: string;
  // the page's file in the project tree ("index.html", "about/index.html")
  readonly file: string;
  readonly tree: DocNode;
}

export interface DocumentJson {
  readonly version: typeof DOCUMENT_VERSION;
  readonly pages: readonly Page[];
}

// The selected nodes, the primary first. Empty when nothing is selected.
export type Selection = readonly NodeId[];

export interface EmptyProjectNames {
  // the home page's name and its root element's name, in the UI language of the person who creates it
  readonly page: string;
  readonly root: string;
}

// A project with one empty home page, index.html, whose root is the page element (<body>).
export function createEmptyDocument(ids: IdGenerator, names: EmptyProjectNames): DocumentJson {
  return {
    version: DOCUMENT_VERSION,
    pages: [
      {
        id: ids.next(),
        name: names.page,
        file: 'index.html',
        tree: { id: ids.next(), type: 'page', name: names.root, tag: 'body', attributes: {}, classes: [], styles: {}, text: null, children: [] },
      },
    ],
  };
}

// Every node of a tree, the root first, in document order.
export function* walk(node: DocNode): Generator<DocNode> {
  yield node;
  for (const child of node.children) yield* walk(child);
}

// Every node of every page.
export function* allNodes(doc: DocumentJson): Generator<DocNode> {
  for (const page of doc.pages) yield* walk(page.tree);
}

// Where a node sits: its page, its parent (null for a page root), its index among the parent's children, and
// the JSON path of the node inside the document (for patches).
export interface Location {
  readonly node: DocNode;
  readonly page: number;
  readonly parent: DocNode | null;
  readonly index: number;
  readonly path: readonly (string | number)[];
}

export function locate(doc: DocumentJson, id: NodeId): Location | null {
  for (const [page, p] of doc.pages.entries()) {
    const found = locateIn(p.tree, id, null, 0, ['pages', page, 'tree'], page);
    if (found) return found;
  }
  return null;
}

function locateIn(node: DocNode, id: NodeId, parent: DocNode | null, index: number, path: readonly (string | number)[], page: number): Location | null {
  if (node.id === id) return { node, page, parent, index, path };
  for (const [i, child] of node.children.entries()) {
    const found = locateIn(child, id, node, i, [...path, 'children', i], page);
    if (found) return found;
  }
  return null;
}
