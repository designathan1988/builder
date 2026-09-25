import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { HandlerContext } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { rulesFromManifest } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { wrapColumnCommand, wrapRowCommand } from './wrap.ts';
import { deepFreeze } from '../store/store.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const node = (id: string, type: string, tag: string, fields: Partial<DocNode> = {}): DocNode => ({ id: id as NodeId, type: type as DocNode['type'], name: id, tag, attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields });
const DOC: DocumentJson = {
  version: 1,
  pages: [
    {
      id: 'p',
      name: 'Home',
      file: 'index.html',
      tree: node('Page', 'page', 'body', {
        children: [
          node('Hero', 'section', 'section', { children: [node('Title', 'heading', 'h1', { text: 'Hi' }), node('Intro', 'paragraph', 'p', { text: 'Yo' }), node('Actions', 'div', 'div')] }),
          node('Perks', 'list', 'ul', { children: [node('One', 'listItem', 'li')] }),
          node('Row', 'div', 'div'),
        ],
      }),
    },
  ],
};

function run(command: typeof wrapRowCommand | typeof wrapColumnCommand, selection: string[], locale: 'en' | 'pt-BR' = 'en') {
  const context = {
    state: { document: DOC, selection: selection as NodeId[], history: EMPTY_HISTORY, message: null, ui: undefined as never },
    clock: manualClock(),
    ids: sequentialIds('new'),
    rules: RULES,
    words: (key: MessageId) => translate(locale, key),
    // wrapping measures nothing on the canvas
    layout: noLayout,
  } satisfies HandlerContext<never>;
  return command.run(context, {} as never);
}
const outline = (n: DocNode): string => (n.children.length === 0 ? n.name : `${n.name}(${n.children.map(outline).join(' ')})`);
const applied = (outcome: ReturnType<typeof run>) => {
  if (outcome.kind !== 'change') throw new Error(`not a change: ${JSON.stringify(outcome)}`);
  return applyPatches(DOC, outcome.patches ?? []).document;
};

// every handler runs on a frozen document, as the store commits it: a change in place throws
deepFreeze(DOC);

describe('element.wrapRow and element.wrapColumn (src/core/structure/wrap.ts)', () => {
  it('R puts the selection at its index inside a new Row with display:flex and flex-direction:row, numbered when the name is taken, and selects it', () => {
    const outcome = run(wrapRowCommand, ['Intro']);
    const doc = applied(outcome);
    expect(outline(doc.pages[0]?.tree as DocNode)).toBe('Page(Hero(Title Row 2(Intro) Actions) Perks(One) Row)');
    const row = doc.pages[0]?.tree.children[0]?.children[1];
    expect(row).toEqual({ ...node('new1', 'div', 'div'), name: 'Row 2', styles: { desktop: { base: { display: 'flex', 'flex-direction': 'row' } } }, children: [DOC.pages[0]?.tree.children[0]?.children[1]] });
    expect(outcome.kind === 'change' && outcome.selection).toEqual(['new1']);
    expect(outcome.kind === 'change' && outcome.message).toEqual({ key: 'status.wrapped', params: { name: 'Intro', wrapper: 'Row 2', styles: 'display: flex; flex-direction: row' } });
  });

  it('C does the same with a Column and flex-direction:column, named in the person’s language', () => {
    const outcome = run(wrapColumnCommand, ['Title'], 'pt-BR');
    const doc = applied(outcome);
    expect(outline(doc.pages[0]?.tree as DocNode)).toBe('Page(Hero(Coluna(Title) Intro Actions) Perks(One) Row)');
    expect(doc.pages[0]?.tree.children[0]?.children[0]?.styles).toEqual({ desktop: { base: { display: 'flex', 'flex-direction': 'column' } } });
  });

  it('wraps the selected roots of one parent in their document order, leaving out a node whose ancestor is selected', () => {
    const outcome = run(wrapRowCommand, ['Actions', 'Title', 'One', 'Perks']);
    expect(outcome).toEqual({ kind: 'refused', message: { key: 'status.wrap.needsSameParent', params: {} } });
    const many = run(wrapRowCommand, ['Actions', 'Title']);
    expect(outline(applied(many).pages[0]?.tree as DocNode)).toBe('Page(Hero(Row 2(Title Actions) Intro) Perks(One) Row)');
    expect(many.kind === 'change' && many.message).toEqual({ key: 'status.wrappedMany', params: { count: 2, wrapper: 'Row 2', styles: 'display: flex; flex-direction: row' } });
    // the wrapper holds the nodes themselves, with their ids
    expect(applied(many).pages[0]?.tree.children[0]?.children[0]?.children).toEqual([DOC.pages[0]?.tree.children[0]?.children[0], DOC.pages[0]?.tree.children[0]?.children[2]]);
    const nested = run(wrapColumnCommand, ['One', 'Perks']);
    expect(outline(applied(nested).pages[0]?.tree as DocNode)).toBe('Page(Hero(Title Intro Actions) Column(Perks(One)) Row)');
    expect(applied(nested).pages[0]?.tree.children[1]?.children).toEqual([DOC.pages[0]?.tree.children[1]]);
  });

  it('refuses the page root, and a parent that does not accept a <div>, changing nothing', () => {
    expect(run(wrapRowCommand, ['Page'])).toEqual({ kind: 'refused', message: { key: 'status.wrap.root', params: {} } });
    expect(run(wrapColumnCommand, ['Page', 'Hero'])).toEqual({ kind: 'refused', message: { key: 'status.wrap.root', params: {} } });
    expect(run(wrapRowCommand, ['One'])).toEqual({ kind: 'refused', message: { key: 'status.refused.onlyAccepts', params: { parent: '<ul>', children: '<li>' } } });
  });
});
