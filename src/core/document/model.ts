// The document JSON: the source of truth of a project. Plain data, never the DOM. Its vocabulary comes from the
// manifest through the generated ids: element types (elements.json), attributes, edited properties, breakpoints
// and states (properties.json). src/core/document/validate.ts checks a whole document against it on every commit.
import type { NodeId } from '../../generated/commands.ts';
import type { AttributeId, BreakpointId, ElementType, PropertyId, StateId } from '../../generated/ids.ts';
import type { IdGenerator } from '../ports/ids.ts';
import type { InlineRun } from '../text/inline.ts';

export type { NodeId };

// The version of the saved format; it is carried from the first save (autosave-restore).
export const DOCUMENT_VERSION = 1;

// One layer of a structured value (a shadow): its typed fields, by the ids of its structure (properties.json
// structures: a length or a colour as CSS text, a flag as a boolean).
export type StructuredLayer = { readonly [field: string]: string | boolean };
// What a node stores for a property: its CSS text, or the layers of a structured value (first painted on top), which
// only the output turns into CSS (a hidden layer stays in the document, out of the CSS).
export type StoredValue = string | readonly StructuredLayer[];
// property → what it stores
export type Declarations = { readonly [P in PropertyId]?: StoredValue };
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
  // the marks of a text element's text (bold, italic, links; src/core/text/inline.ts): its canonical tree of runs, whose
  // plain text is `text`; absent while nothing in the text is marked (spec text-inline-formatting)
  readonly inline?: readonly InlineRun[];
  readonly children: readonly DocNode[];
  // hidden on the canvas with its whole subtree, still in the document and in Layers (element.toggleHidden, spec
  // hide-element): true, absent while the element shows. A page's root is never hidden.
  readonly hidden?: true;
  // locked with its whole subtree (element.toggleLock, spec lock-element): no command moves, deletes or edits it or
  // anything inside it, adds to it, or toggles a flag inside it; it can still be selected. True, absent while it is
  // unlocked. A page's root is never locked.
  readonly locked?: true;
  // the person's own attributes (feature element-attributes-aria: aria-*, data-*, role…), name → value, written as
  // they are; absent while there are none. Never an event handler (on…) nor an attribute of the editor's own.
  readonly customAttributes?: { readonly [name: string]: string };
  // the root of an instance of a component names its component (core/design/components.ts, spec reusable-components);
  // absent on any other element
  readonly component?: string;
  // every element of an instance: the place of the definition element it comes from, the child indexes from the
  // definition's root ([] for the root); absent on any other element
  readonly componentPart?: readonly number[];
  // a page's root only: the page's manual guides (core/page/guides.ts, spec guides-manual), each named by its axis and a
  // number, at a page px position, locked or not; absent while the page has none. Never exported.
  readonly guides?: readonly Guide[];
  // a page's root only: the settings of its layout grids set in Guides & Grids (core/page/grid.ts, spec
  // workspace-settings-dialog), each grid's settings a person set; a setting absent takes its default of
  // interactions.json; absent while none is set. Never exported.
  readonly grid?: GridSettings;
}

export interface GridSettings {
  readonly columns?: { readonly count?: number; readonly width?: number; readonly gutter?: number; readonly margin?: number };
  readonly rows?: { readonly height?: number; readonly gutter?: number };
  readonly dots?: { readonly spacing?: number };
}

export interface Guide {
  readonly id: string;
  readonly axis: 'horizontal' | 'vertical';
  readonly at: number;
  readonly locked?: true;
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
  // the colours saved with the project, in the order they were saved (core/design/colors.ts); absent while none is
  readonly swatches?: readonly string[];
  // the project's design tokens, CSS variables named var(--name) in styles (core/design/tokens.ts); absent while none is
  readonly tokens?: readonly { readonly name: string; readonly kind: string; readonly value: string }[];
  // the project's style classes, in the order they were made: a name an element lists in its classes and the styles
  // every element with it takes (core/design/classes.ts); absent while none is
  readonly classes?: readonly StyleClass[];
  // the project's components, in the order they were made: a unique name and its definition, a tree of elements whose
  // instances are placed in pages (core/design/components.ts); absent while none is
  readonly components?: readonly ComponentDefinition[];
}

export interface ComponentDefinition {
  readonly name: string;
  readonly tree: DocNode;
}

export interface StyleClass {
  readonly name: string;
  readonly styles: Styles;
}

// The selected nodes, the primary first. Empty when nothing is selected.
export type Selection = readonly NodeId[];

export interface EmptyProjectNames {
  // the home page's name and its root element's name, in the UI language of the person who creates it
  readonly page: string;
  readonly root: string;
}

// A project with one empty home page, index.html, whose root is the root element the manifest gives (validate.ts
// ModelRules.root: the element whose tag is <body>).
export function createEmptyDocument(ids: IdGenerator, names: EmptyProjectNames, root: { readonly type: ElementType; readonly tag: string }): DocumentJson {
  return {
    version: DOCUMENT_VERSION,
    pages: [
      {
        id: ids.next(),
        name: names.page,
        file: 'index.html',
        tree: { id: ids.next(), type: root.type, name: names.root, tag: root.tag, attributes: {}, classes: [], styles: {}, text: null, children: [] },
      },
    ],
  };
}

// Whether a document is the empty project, whatever its names and ids: one page whose root holds no element and
// carries no attribute, class or style. Replacing it loses nothing (File › Open asks no confirmation over it).
export function isEmptyProject(doc: DocumentJson): boolean {
  const [page, ...others] = doc.pages;
  if (page === undefined || others.length > 0) return false;
  const root = page.tree;
  return root.children.length === 0 && Object.keys(root.attributes).length === 0 && root.classes.length === 0 && Object.keys(root.styles).length === 0;
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

// The node and every ancestor of it, the page root first; empty when the document has no such node.
export function lineage(doc: DocumentJson, id: NodeId): DocNode[] {
  const chain: DocNode[] = [];
  for (let at = locate(doc, id); at !== null; at = at.parent === null ? null : locate(doc, at.parent.id)) chain.unshift(at.node);
  return chain;
}

function locateIn(node: DocNode, id: NodeId, parent: DocNode | null, index: number, path: readonly (string | number)[], page: number): Location | null {
  if (node.id === id) return { node, page, parent, index, path };
  for (const [i, child] of node.children.entries()) {
    const found = locateIn(child, id, node, i, [...path, 'children', i], page);
    if (found) return found;
  }
  return null;
}
