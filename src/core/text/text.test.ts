import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { HandlerContext } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { rulesFromManifest } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { setTextCommand } from './text.ts';
import { deepFreeze } from '../store/store.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const node = (id: string, type: string, tag: string, fields: Partial<DocNode> = {}): DocNode => ({ id: id as NodeId, type: type as DocNode['type'], name: id, tag, attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields });
const DOC: DocumentJson = {
  version: 1,
  pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('Page', 'page', 'body', { children: [node('Hero', 'section', 'section', { children: [node('Intro', 'paragraph', 'p', { text: 'Old' })] })] }) }],
};
const context: HandlerContext<never> = {
  state: { document: DOC, selection: [], history: EMPTY_HISTORY, message: null, ui: undefined as never },
  clock: manualClock(),
  ids: sequentialIds('x'),
  rules: RULES,
  words: (key) => key,
  layout: noLayout,
};

// every handler runs on a frozen document, as the store commits it: a change in place throws
deepFreeze(DOC);

describe('text.set', () => {
  it("writes a text element's text, a line break as \\n, and says the text is kept", () => {
    const outcome = setTextCommand.run(context, { target: 'Intro', content: 'New\nline' });
    if (outcome.kind !== 'change') throw new Error(outcome.kind);
    const after = applyPatches(DOC, outcome.patches ?? []).document;
    expect(after.pages[0]?.tree.children[0]?.children[0]?.text).toBe('New\nline');
    expect(outcome.message).toEqual({ key: 'status.textEdit.committed', params: { name: 'Intro' } });
  });

  it('changes nothing for the text the element already has', () => {
    expect(setTextCommand.run(context, { target: 'Intro', content: 'Old' })).toEqual({ kind: 'change', message: { key: 'status.textEdit.committed', params: { name: 'Intro' } } });
  });

  it('refuses what no door hands it: a missing node, an element without text, a content that is no string', () => {
    expect(() => setTextCommand.run(context, { target: 'Gone', content: 'x' })).toThrow(/no node/);
    expect(() => setTextCommand.run(context, { target: 'Hero', content: 'x' })).toThrow(/no text element/);
    expect(() => setTextCommand.run(context, { target: 'Intro', content: 3 })).toThrow(/not a string/);
  });
});
