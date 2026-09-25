// The HTML content model (ARCHITECTURE.md): which element may sit inside which, read from the permitted content of
// manifest/generated/html-elements.json (keyed by tag). This slice holds the part palette-click-insert needs: a parent
// whose permitted content is a closed list of elements (<ul> and <ol> take <li>, <tr> takes <td> and <th>, <table>
// its rows and sections) accepts only those. A parent whose content is given by categories (flow, phrasing), a child
// that requires a parent, interactive content inside interactive content and the other rules arrive with
// nesting-grammar, which completes this module.
import type { GeneratedHtml } from '../../manifest/schema.ts';

export interface ContentModel {
  // null when a <parent> accepts a <child>; otherwise the tags the parent only accepts, in the order HTML lists them
  refusal(parent: string, child: string): readonly string[] | null;
  // whether a <tag> is phrasing content (text-level: it runs on in the line) and whether it is metadata (a script, a
  // style: never text of the page), as HTML's categories say, a conditional category counting as one; null for a tag
  // HTML does not define. Pasted markup reads as text by them (src/core/text/inline.ts).
  phrasing(tag: string): boolean | null;
  metadata(tag: string): boolean | null;
}

// "@script" (script-supporting elements) is a category no user inserts; an entry ending in "?" is optional
const SCRIPT_SUPPORTING = '@script';
const tagOf = (entry: string) => (entry.endsWith('?') ? entry.slice(0, -1) : entry);

export function contentModelFrom(html: GeneratedHtml): ContentModel {
  // tag → the elements it only accepts, for the parents whose permitted content lists elements and no category
  const closed = new Map<string, readonly string[]>();
  for (const [tag, element] of Object.entries(html.elements)) {
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
  };
}
