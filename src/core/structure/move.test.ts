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
import { moveDownCommand, moveUpCommand } from './move.ts';

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
          node('Hero', 'section', 'section', { children: [node('Title', 'heading', 'h1', { text: 'Hi' }), node('Intro', 'paragraph', 'p', { text: 'x' }), node('Actions', 'div', 'div'), node('Note', 'paragraph', 'p', { text: 'y' })] }),
          node('Perks', 'list', 'ul', { children: [node('One', 'listItem', 'li')] }),
        ],
      }),
    },
  ],
};

function run(direction: 'up' | 'down', selection: string[]) {
  const context = {
    state: { document: DOC, selection: selection as NodeId[], history: EMPTY_HISTORY, message: null, ui: undefined as never },
    clock: manualClock(),
    ids: sequentialIds('new'),
    rules: RULES,
    words: (key: MessageId) => translate('en', key),
    // moving among siblings measures nothing on the canvas
    layout: noLayout,
  } satisfies HandlerContext<never>;
  return direction === 'up' ? moveUpCommand.run(context, {} as never) : moveDownCommand.run(context, {} as never);
}
const outline = (n: DocNode): string => (n.children.length === 0 ? n.name : `${n.name}(${n.children.map(outline).join(' ')})`);
const after = (direction: 'up' | 'down', selection: string[]) => {
  const outcome = run(direction, selection);
  if (outcome.kind !== 'change') throw new Error(`not a change: ${JSON.stringify(outcome)}`);
  const applied = applyPatches(DOC, outcome.patches ?? []);
  return { tree: outline(applied.document.pages[0]?.tree as DocNode), selection: outcome.selection, message: outcome.message, restored: applyPatches(applied.document, applied.inverses).document };
};

describe('element.moveUp and element.moveDown (src/core/structure/move.ts)', () => {
  it('swaps one node with its previous or next sibling, keeps the selection and names its new position', () => {
    expect(after('up', ['Actions'])).toMatchObject({ tree: 'Page(Hero(Title Actions Intro Note) Perks(One))', selection: undefined, message: { key: 'status.moved', params: { name: 'Actions', position: 2, count: 4, parent: 'Hero' } } });
    expect(after('down', ['Title'])).toMatchObject({ tree: 'Page(Hero(Intro Title Actions Note) Perks(One))', message: { key: 'status.moved', params: { name: 'Title', position: 2, count: 4, parent: 'Hero' } } });
    expect(after('down', ['Hero'])).toMatchObject({ tree: 'Page(Perks(One) Hero(Title Intro Actions Note))', message: { key: 'status.moved', params: { name: 'Hero', position: 2, count: 2, parent: 'Page' } } });
    expect(after('up', ['Actions']).restored).toEqual(DOC);
  });

  it('moves several roots of one parent together, keeping their order, and a block at the edge stays', () => {
    // Intro and Actions pass Title together
    expect(after('up', ['Actions', 'Intro'])).toMatchObject({ tree: 'Page(Hero(Intro Actions Title Note) Perks(One))', message: { key: 'status.movedMany', params: { count: 2, parent: 'Hero' } } });
    // Title stays at the start, Actions passes Intro
    expect(after('up', ['Title', 'Actions'])).toMatchObject({ tree: 'Page(Hero(Title Actions Intro Note) Perks(One))', message: { key: 'status.movedMany', params: { count: 2, parent: 'Hero' } } });
    // Note stays at the end, Intro passes Actions
    const down = after('down', ['Intro', 'Note']);
    expect(down).toMatchObject({ tree: 'Page(Hero(Title Actions Intro Note) Perks(One))' });
    expect(down.restored).toEqual(DOC);
    // a node inside another selected node goes with it
    expect(after('up', ['Perks', 'One'])).toMatchObject({ tree: 'Page(Perks(One) Hero(Title Intro Actions Note))', message: { key: 'status.moved', params: { name: 'Perks' } } });
  });

  it('refuses a press that moves nothing, at either edge and for the page root, naming the parent', () => {
    expect(run('up', ['Title'])).toEqual({ kind: 'refused', message: { key: 'status.move.alreadyFirst', params: { parent: 'Hero' } } });
    expect(run('down', ['Note'])).toEqual({ kind: 'refused', message: { key: 'status.move.alreadyLast', params: { parent: 'Hero' } } });
    expect(run('up', ['Title', 'Intro'])).toEqual({ kind: 'refused', message: { key: 'status.move.alreadyFirst', params: { parent: 'Hero' } } });
    expect(run('down', ['One'])).toEqual({ kind: 'refused', message: { key: 'status.move.alreadyLast', params: { parent: 'Perks' } } });
    expect(run('up', ['Page'])).toEqual({ kind: 'refused', message: { key: 'status.move.alreadyFirst', params: { parent: 'Home' } } });
  });

  it('refuses roots that do not share one parent', () => {
    expect(run('up', ['Intro', 'One'])).toEqual({ kind: 'refused', message: { key: 'status.wrap.needsSameParent', params: {} } });
    expect(run('down', ['Perks', 'Title'])).toEqual({ kind: 'refused', message: { key: 'status.wrap.needsSameParent', params: {} } });
  });
});
