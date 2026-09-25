// The HTML content model (ARCHITECTURE.md): which element may sit inside which, read from the permitted content and
// the permitted descendants of manifest/generated/html-elements.json (keyed by tag). This slice holds:
//  - palette-click-insert: a parent whose permitted content is a closed list of elements (<ul> and <ol> take <li>,
//    <tr> takes <td> and <th>, <table> its rows and sections) accepts only those;
//  - elements-structure: interactive content (a link, a Link Block, a button, a form control) never sits inside an
//    element whose permitted descendants exclude it (<a>, so a Link Block, and <button>), nor inside an element inside
//    one (spec elements-structure, Problems in Pager 5); every command that places an element asks it
//    (interactiveInsideRefusal);
//  - semantic-tag-switch: the other excluded descendants, by tag or by category (no <header> or <footer> inside a
//    <header> or a <footer>, no <main> inside an <article>, an <aside>, a <nav>, a <header> or a <footer>, no heading
//    inside a <th>): an element takes none of them at any depth (`excludes`, status.refused.notInside). Interactive
//    content is the rule above alone, which knows when a conditional element is interactive. `retagRefusal` asks every
//    rule of this module for a node that would take another tag where it is (element.setTag);
//  - text-inline-formatting: whether a tag is phrasing content or metadata, by HTML's categories, for pasted markup.
// A parent whose content is given by categories (flow, phrasing), a child that requires a parent and the other rules
// arrive with nesting-grammar, which completes this module and has insert, move and paste ask `excludes` too.
import type { GeneratedHtml } from '../../manifest/schema.ts';
import { message, type Message } from '../commands/registry.ts';
import { lineage, locate, walk, type DocNode, type DocumentJson, type NodeId } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';

export interface ContentModel {
  // null when a <parent> accepts a <child>; otherwise the tags the parent only accepts, in the order HTML lists them
  refusal(parent: string, child: string): readonly string[] | null;
  // whether an <ancestor> excludes a <descendant> from everything inside it, at any depth, by a rule other than
  // interactive content (which isInteractive and excludesInteractive answer)
  excludes(ancestor: string, descendant: string): boolean;
  // whether a <tag> is phrasing content (text-level: it runs on in the line) and whether it is metadata (a script, a
  // style: never text of the page), as HTML's categories say, a conditional category counting as one; null for a tag
  // HTML does not define. Pasted markup reads as text by them (src/core/text/inline.ts).
  phrasing(tag: string): boolean | null;
  metadata(tag: string): boolean | null;
  // whether an element of <tag> with these HTML attributes is interactive content
  isInteractive(tag: string, attributes: ReadonlyMap<string, string | number | true>): boolean;
  // whether no descendant of an element of <tag> may be interactive content
  excludesInteractive(tag: string): boolean;
}

// "@script" (script-supporting elements) is a category no user inserts; an entry ending in "?" is optional
const SCRIPT_SUPPORTING = '@script';
const INTERACTIVE = '@interactive';
const tagOf = (entry: string) => (entry.endsWith('?') ? entry.slice(0, -1) : entry);
const CATEGORY = '@';

type Categories = GeneratedHtml['elements'][string]['categories'];

// When an element that HTML makes interactive only under a condition is interactive (HTML, "interactive content"):
// <audio> and <video> with controls, <img> and <object> with usemap, <input> unless its type is hidden. The editor's
// <a> is always a link: a Link Block or a link without its address yet is still made to be one (spec
// elements-structure, Problems in Pager 5). A conditional element not listed here counts as interactive.
const CONDITIONS: Readonly<Record<string, (attributes: ReadonlyMap<string, string | number | true>) => boolean>> = {
  a: () => true,
  audio: (a) => a.has('controls'),
  video: (a) => a.has('controls'),
  img: (a) => a.has('usemap'),
  object: (a) => a.has('usemap'),
  input: (a) => String(a.get('type') ?? '').toLowerCase() !== 'hidden',
};

export function contentModelFrom(html: GeneratedHtml): ContentModel {
  // tag → the elements it only accepts, for the parents whose permitted content lists elements and no category
  const closed = new Map<string, readonly string[]>();
  // the tags whose permitted descendants exclude interactive content
  const noInteractive = new Set<string>();
  // tag → the other tags and categories it excludes from its descendants
  const excluded = new Map<string, readonly string[]>();
  for (const [tag, element] of Object.entries(html.elements)) {
    const exclusions = (element.permittedDescendants ?? []).flatMap((rule) => rule.exclude);
    if (exclusions.includes(INTERACTIVE)) noInteractive.add(tag);
    const others = exclusions.filter((entry) => entry !== INTERACTIVE);
    if (others.length > 0) excluded.set(tag, others);
    const permitted = element.permittedContent;
    if (permitted === null || permitted.length === 0) continue;
    const listed = permitted.filter((entry) => entry !== SCRIPT_SUPPORTING);
    if (listed.length === 0 || listed.some((entry) => entry.startsWith(CATEGORY))) continue;
    closed.set(tag, listed.map(tagOf));
  }
  // whether a tag is always in a category: the excluded descendants count only an element that is always excluded
  const inCategory = (tag: string, name: string): boolean => html.elements[tag]?.categories[name as keyof Categories] === true;
  // whether a tag is in a category, a conditional membership counting as one; null for a tag HTML does not define
  const category = (tag: string, name: 'phrasing' | 'metadata'): boolean | null => {
    if (!Object.hasOwn(html.elements, tag)) return null;
    const flag = html.elements[tag]?.categories[name];
    return flag === undefined ? null : flag !== false;
  };
  return {
    refusal(parent, child) {
      const only = closed.get(parent);
      return only === undefined || only.includes(child) ? null : only;
    },
    excludes(ancestor, descendant) {
      return (excluded.get(ancestor) ?? []).some((entry) => (entry.startsWith(CATEGORY) ? inCategory(descendant, entry.slice(CATEGORY.length)) : entry === descendant));
    },
    phrasing: (tag) => category(tag, 'phrasing'),
    metadata: (tag) => category(tag, 'metadata'),
    isInteractive(tag, attributes) {
      const flag = html.elements[tag]?.categories.interactive;
      if (flag === true) return true;
      if (flag !== 'conditional') return false;
      return CONDITIONS[tag]?.(attributes) ?? true;
    },
    excludesInteractive(tag) {
      return noInteractive.has(tag);
    },
  };
}

// A node's HTML attributes, by their HTML names (elements.json gives each attribute's), without those set to false
// (an absent boolean attribute).
function htmlAttributes(node: DocNode, rules: ModelRules): ReadonlyMap<string, string | number | true> {
  const found = new Map<string, string | number | true>();
  for (const [id, value] of Object.entries(node.attributes)) {
    const name = rules.attributeValues.get(id)?.html;
    if (name === null || name === undefined || value === undefined || value === false) continue;
    found.set(name, value);
  }
  return found;
}

// whether any of these nodes, or anything inside them, is interactive content
function holdsInteractive(rules: ModelRules, nodes: readonly DocNode[]): boolean {
  return nodes.some((node) => [...walk(node)].some((inner) => inner.tag !== null && rules.contentModel.isInteractive(inner.tag, htmlAttributes(inner, rules))));
}

// Why the arriving elements (with everything inside them) may not go into the receiver: the element that refuses
// interactive content inside it, the receiver itself or the nearest of its ancestors that does, named by
// status.refused.interactiveInside; or null when nothing refuses them. Commands that place elements ask it after their
// other refusals (spec elements-structure, Problems in Pager 5: every door that inserts or drops one).
export function interactiveInsideRefusal(document: DocumentJson, rules: ModelRules, receiver: NodeId, arriving: readonly DocNode[]): Message | null {
  let refusing: DocNode | null = null;
  for (let at = locate(document, receiver); at !== null; at = at.parent === null ? null : locate(document, at.parent.id)) {
    if (at.node.tag !== null && rules.contentModel.excludesInteractive(at.node.tag)) {
      refusing = at.node;
      break;
    }
  }
  if (refusing === null) return null;
  return holdsInteractive(rules, arriving) ? message('status.refused.interactiveInside', { parent: refusing.name }) : null;
}

const shown = (tag: string | null) => `<${tag ?? ''}>`;

// Why a node of the document may not take another tag where it is (element.setTag, spec semantic-tag-switch, Problems
// in Pager 3), or null: its parent's closed list, then the tag's own closed list over its children
// (status.refused.onlyAccepts); the nearest ancestor that excludes the tag, then the first descendant in document order
// the tag excludes (status.refused.notInside, naming both tags); interactive content, the node with its new tag
// arriving where it is, or held inside it when the new tag excludes it (status.refused.interactiveInside).
export function retagRefusal(document: DocumentJson, rules: ModelRules, id: NodeId, tag: string): Message | null {
  const model = rules.contentModel;
  const chain = lineage(document, id);
  const node = chain.at(-1);
  if (node === undefined) throw new Error(`retagRefusal: the document has no node ${id}`);
  const ancestors = chain.slice(0, -1);
  const parent = ancestors.at(-1);
  const only = parent === undefined || parent.tag === null ? null : model.refusal(parent.tag, tag);
  if (only !== null && parent !== undefined) return message('status.refused.onlyAccepts', { parent: shown(parent.tag), children: only.map(shown).join(', ') });
  for (const child of node.children) {
    const childOnly = child.tag === null ? null : model.refusal(tag, child.tag);
    if (childOnly !== null) return message('status.refused.onlyAccepts', { parent: shown(tag), children: childOnly.map(shown).join(', ') });
  }
  const excluding = [...ancestors].reverse().find((a) => a.tag !== null && model.excludes(a.tag, tag));
  if (excluding !== undefined) return message('status.refused.notInside', { child: shown(tag), ancestor: shown(excluding.tag) });
  for (const inner of walk(node)) {
    if (inner !== node && inner.tag !== null && model.excludes(tag, inner.tag)) return message('status.refused.notInside', { child: shown(inner.tag), ancestor: shown(tag) });
  }
  const retagged: DocNode = { ...node, tag };
  const inside = parent === undefined ? null : interactiveInsideRefusal(document, rules, parent.id, [retagged]);
  if (inside !== null) return inside;
  if (model.excludesInteractive(tag) && holdsInteractive(rules, node.children)) return message('status.refused.interactiveInside', { parent: node.name });
  return null;
}
