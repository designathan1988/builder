// The HTML content model (ARCHITECTURE.md): which element may sit inside which, read from the permitted content of
// manifest/generated/html-elements.json (keyed by tag). This slice holds:
//  - palette-click-insert: a parent whose permitted content is a closed list of elements (<ul> and <ol> take <li>,
//    <tr> takes <td> and <th>, <table> its rows and sections) accepts only those;
//  - elements-structure: interactive content (a link, a Link Block, a button, a form control) never sits inside an
//    element whose permitted descendants exclude it (<a>, so a Link Block, and <button>), nor inside an element inside
//    one (spec elements-structure, Problems in Pager 5); every command that places an element asks it
//    (interactiveInsideRefusal);
//  - text-inline-formatting: whether a tag is phrasing content or metadata, by HTML's categories, for pasted markup.
// A parent whose content is given by categories (flow, phrasing), a child that requires a parent, the other excluded
// descendants and the other rules arrive with nesting-grammar, which completes this module.
import type { GeneratedHtml } from '../../manifest/schema.ts';
import { message, type Message } from '../commands/registry.ts';
import { locate, walk, type DocNode, type DocumentJson, type NodeId } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';

export interface ContentModel {
  // null when a <parent> accepts a <child>; otherwise the tags the parent only accepts, in the order HTML lists them
  refusal(parent: string, child: string): readonly string[] | null;
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
  for (const [tag, element] of Object.entries(html.elements)) {
    if ((element.permittedDescendants ?? []).some((rule) => rule.exclude.includes(INTERACTIVE))) noInteractive.add(tag);
    const permitted = element.permittedContent;
    if (permitted === null || permitted.length === 0) continue;
    const listed = permitted.filter((entry) => entry !== SCRIPT_SUPPORTING);
    if (listed.length === 0 || listed.some((entry) => entry.startsWith('@'))) continue;
    closed.set(tag, listed.map(tagOf));
  }
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
  for (const node of arriving) for (const inner of walk(node)) if (inner.tag !== null && rules.contentModel.isInteractive(inner.tag, htmlAttributes(inner, rules))) return message('status.refused.interactiveInside', { parent: refusing.name });
  return null;
}
