import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';
import { message, type HandlerContext } from '../commands/registry.ts';
import { locate, type DocNode, type DocumentJson } from '../document/model.ts';
import { rulesFromManifest, validateDocument } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { toggleHiddenCommand } from './flags.ts';

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
        children: [node('Hero', 'section', 'section', { children: [node('Title', 'heading', 'h1', { text: 'Hi' }), node('Intro', 'paragraph', 'p', { text: 'x' })] })],
      }),
    },
  ],
};

const state = (document: DocumentJson, selection: string[]) => ({ document, selection: selection as NodeId[], history: EMPTY_HISTORY, message: null, ui: undefined as never });
function run(document: DocumentJson, selection: string[], target?: string) {
  const context = {
    state: state(document, selection),
    clock: manualClock(),
    ids: sequentialIds('new'),
    rules: RULES,
    words: (key: MessageId) => translate('en', key),
    // hiding measures nothing on the canvas
    layout: noLayout,
  } satisfies HandlerContext<never>;
  return toggleHiddenCommand.run(context, target === undefined ? {} : { target: target as NodeId });
}
const toggled = (document: DocumentJson, selection: string[], target?: string) => {
  const outcome = run(document, selection, target);
  if (outcome.kind !== 'change') throw new Error(`not a change: ${JSON.stringify(outcome)}`);
  const applied = applyPatches(document, outcome.patches ?? []);
  return { outcome, document: applied.document, restored: applyPatches(applied.document, applied.inverses).document };
};
const flag = (document: DocumentJson, id: string) => {
  const found = locate(document, id as NodeId)?.node;
  return found === undefined ? 'missing' : 'hidden' in found ? found.hidden : 'absent';
};

describe('element.toggleHidden (src/core/nodes/flags.ts)', () => {
  it('hides the node a door names, leaves the selection as it is and says so; undo takes the flag away', () => {
    const { outcome, document, restored } = toggled(DOC, ['Title'], 'Intro');
    expect(flag(document, 'Intro')).toBe(true);
    expect(flag(document, 'Title')).toBe('absent');
    expect(outcome.selection).toBeUndefined();
    expect(outcome.message).toEqual(message('status.hidden', { name: 'Intro' }));
    expect(validateDocument(document, ['Title'], RULES)).toEqual([]);
    expect(restored).toEqual(DOC);
  });

  it('acts on the primary selected node when the door names none', () => {
    const { document } = toggled(DOC, ['Hero', 'Title']);
    expect([flag(document, 'Hero'), flag(document, 'Title')]).toEqual([true, 'absent']);
  });

  it('shows a hidden node again by removing its flag, so the document is the one before the hide', () => {
    const hidden = toggled(DOC, ['Intro'], 'Intro').document;
    const { outcome, document, restored } = toggled(hidden, ['Intro'], 'Intro');
    expect(document).toEqual(DOC);
    expect(flag(document, 'Intro')).toBe('absent');
    expect(outcome.message).toEqual(message('status.visible', { name: 'Intro' }));
    expect(restored).toEqual(hidden);
  });

  it('refuses the page root and changes nothing', () => {
    expect(run(DOC, ['Page'], 'Page')).toEqual({ kind: 'refused', message: message('status.hide.root') });
    expect(run(DOC, ['Page'])).toEqual({ kind: 'refused', message: message('status.hide.root') });
  });

  it('says a door stands for a hidden node: the one it names, else the primary', () => {
    const hidden = toggled(DOC, ['Intro'], 'Intro').document;
    const current = toggleHiddenCommand.current;
    if (current === undefined) throw new Error('element.toggleHidden registers no current');
    expect(current(state(hidden, ['Title']), { target: 'Intro' })).toBe(true);
    expect(current(state(hidden, ['Intro']), { target: 'Title' })).toBe(false);
    expect(current(state(hidden, ['Intro']), {})).toBe(true);
    expect(current(state(DOC, ['Intro']), {})).toBe(false);
  });
});
