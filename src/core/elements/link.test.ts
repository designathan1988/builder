import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { HandlerContext } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { rulesFromManifest, validateDocument } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { anyCss } from '../ports/css.ts';
import { setLinkCommand } from './link.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const node = (id: string, type: string, tag: string, fields: Partial<DocNode> = {}): DocNode => ({ id: id as NodeId, type: type as DocNode['type'], name: id, tag, attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields });
// a page with a Link Block (its link given), a locked section holding another, and a paragraph
const docWith = (href: string | undefined, locked = false): DocumentJson => ({
  version: 1,
  pages: [
    {
      id: 'p',
      name: 'Home',
      file: 'index.html',
      tree: node('Page', 'page', 'body', {
        children: [
          node('Card', 'linkBlock', 'a', { attributes: (href === undefined ? {} : { href }) as DocNode['attributes'], ...(locked ? { locked: true as const } : {}) }),
          node('Box', 'section', 'section', { locked: true, children: [node('Inner', 'linkBlock', 'a')] }),
          node('Intro', 'paragraph', 'p', { text: 'Hi' }),
        ],
      }),
    },
  ],
});
const contextOf = (document: DocumentJson, selection: string[]): HandlerContext<never> => ({
  state: { document, selection: selection as NodeId[], history: EMPTY_HISTORY, message: null, ui: undefined as never },
  clock: manualClock(),
  ids: sequentialIds('x'),
  rules: RULES,
  words: (key) => key,
  layout: noLayout,
  css: anyCss,
});
// the Link Block's attributes after the command, the patches and what the status bar says
function run(document: DocumentJson, args: Record<string, unknown>, selection: string[] = []) {
  const outcome = setLinkCommand.run(contextOf(document, selection), args as never);
  if (outcome.kind === 'refused') return { refused: outcome.message };
  if (outcome.kind !== 'change') throw new Error(outcome.kind);
  const after = applyPatches(document, outcome.patches ?? []).document;
  expect(validateDocument(after, [], RULES)).toEqual([]);
  return { attributes: after.pages[0]?.tree.children[0]?.attributes, patches: outcome.patches ?? [], message: outcome.message };
}

describe('element.setLink (src/core/elements/link.ts)', () => {
  it('sets the link of the node it is given, trimmed, one patch, and names the element and the link', () => {
    const done = run(docWith(undefined), { target: 'Card', href: '  https://example.com  ' });
    expect(done.attributes).toEqual({ href: 'https://example.com' });
    expect(done.patches).toHaveLength(1);
    expect(done.message).toEqual({ key: 'status.link.set', params: { name: 'Card', href: 'https://example.com' } });
  });

  it('without a node, acts on the one selected element', () => {
    expect(run(docWith(undefined), { href: 'mailto:a@b.co' }, ['Card']).attributes).toEqual({ href: 'mailto:a@b.co' });
    expect(() => run(docWith(undefined), { href: 'https://x.co' }, ['Card', 'Intro'])).toThrow();
  });

  it('replaces a link, and records nothing for the link it already has', () => {
    expect(run(docWith('https://a.co'), { target: 'Card', href: 'tel:+5511999999999' }).attributes).toEqual({ href: 'tel:+5511999999999' });
    const same = run(docWith('https://a.co'), { target: 'Card', href: 'https://a.co' });
    expect(same.patches).toEqual([]);
    expect(same.message).toEqual({ key: 'status.link.set', params: { name: 'Card', href: 'https://a.co' } });
  });

  it('an empty text removes the link: no href at all, never one invented', () => {
    const done = run(docWith('https://a.co'), { target: 'Card', href: '   ' });
    expect(done.attributes).toEqual({});
    expect(done.message).toEqual({ key: 'status.link.removed', params: { name: 'Card' } });
    const none = run(docWith(undefined), { target: 'Card', href: '' });
    expect(none.patches).toEqual([]);
  });

  it('refuses an address the rule of a link does not allow (isSafeHref), naming it, and the document keeps its link', () => {
    expect(run(docWith('https://a.co'), { target: 'Card', href: '/about' })).toEqual({ refused: { key: 'status.url.unsafe', params: { url: '/about' } } });
    expect(run(docWith('https://a.co'), { target: 'Card', href: ' javascript:alert(1) ' })).toEqual({ refused: { key: 'status.url.unsafe', params: { url: 'javascript:alert(1)' } } });
    expect(run(docWith(undefined), { target: 'Card', href: 'data:text/html,x' })).toEqual({ refused: { key: 'status.url.unsafe', params: { url: 'data:text/html,x' } } });
  });

  it('refuses a locked element and one inside a locked element', () => {
    expect(run(docWith(undefined, true), { target: 'Card', href: 'https://a.co' })).toEqual({ refused: { key: 'status.locked.edit', params: { name: 'Card' } } });
    expect(run(docWith(undefined), { target: 'Inner', href: 'https://a.co' })).toEqual({ refused: { key: 'status.locked.byAncestor', params: { name: 'Inner', ancestor: 'Box' } } });
  });

  it('a node that takes no link is a defect of the door', () => {
    expect(() => run(docWith(undefined), { target: 'Intro', href: 'https://a.co' })).toThrow();
  });
});
