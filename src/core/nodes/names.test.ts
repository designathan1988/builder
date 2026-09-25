import { describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import type { NodeId } from '../../generated/commands.ts';
import type { MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';
import { message, type HandlerContext } from '../commands/registry.ts';
import { locate, type DocumentJson } from '../document/model.ts';
import { rulesFromManifest, validateDocument } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { applyPatches } from '../history/transaction.ts';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { toggleLockCommand } from './flags.ts';
import { renameCommand } from './names.ts';
import { deepFreeze } from '../store/store.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
// a frozen document, as the store commits it: a change in place throws
const AURORA = deepFreeze(structuredClone(fixture) as DocumentJson);

const context = (document: DocumentJson) =>
  ({
    // every document a handler reads is frozen, as the store commits it: a change in place throws
    state: { document: deepFreeze(document), selection: [], history: EMPTY_HISTORY, message: null, ui: undefined as never },
    clock: manualClock(),
    ids: sequentialIds('new'),
    rules: RULES,
    words: (key: MessageId) => translate('en', key),
    layout: noLayout,
  }) satisfies HandlerContext<never>;
const rename = (document: DocumentJson, target: string, name: string) => renameCommand.run(context(document), { target: target as NodeId, name });
const nameOf = (document: DocumentJson, id: string) => locate(document, id as NodeId)?.node.name;
// the document with a node locked through element.toggleLock's row door
function locking(document: DocumentJson, id: string): DocumentJson {
  const outcome = toggleLockCommand.run(context(document), { target: id as NodeId });
  if (outcome.kind !== 'change') throw new Error(`not locked: ${JSON.stringify(outcome)}`);
  return applyPatches(document, outcome.patches ?? []).document;
}

describe('element.rename (src/core/nodes/names.ts)', () => {
  it('writes the new name in one patch, says the old and the new name, and its inverse gives the old name back', () => {
    const outcome = rename(AURORA, 'n-intro', 'Lead');
    if (outcome.kind !== 'change') throw new Error(`not a change: ${JSON.stringify(outcome)}`);
    expect(outcome.patches).toHaveLength(1);
    expect(outcome.message).toEqual(message('status.renamed', { old: 'Intro', name: 'Lead' }));
    expect(outcome.selection).toBeUndefined();
    const applied = applyPatches(AURORA, outcome.patches ?? []);
    expect(nameOf(applied.document, 'n-intro')).toBe('Lead');
    expect(validateDocument(applied.document, [], RULES)).toEqual([]);
    expect(applyPatches(applied.document, applied.inverses).document).toEqual(AURORA);
  });

  it('keeps the name without the spaces around it', () => {
    const outcome = rename(AURORA, 'n-title', '  Headline  ');
    if (outcome.kind !== 'change') throw new Error(`not a change: ${JSON.stringify(outcome)}`);
    expect(nameOf(applyPatches(AURORA, outcome.patches ?? []).document, 'n-title')).toBe('Headline');
    expect(outcome.message).toEqual(message('status.renamed', { old: 'Title', name: 'Headline' }));
  });

  it('keeps the previous name when the new one is empty or only spaces, and says so, writing nothing', () => {
    for (const empty of ['', '   ']) {
      expect(rename(AURORA, 'n-intro', empty)).toEqual({ kind: 'change', message: message('status.rename.empty', { name: 'Intro' }) });
    }
  });

  it('writes nothing and says nothing for the same name', () => {
    expect(rename(AURORA, 'n-intro', 'Intro')).toEqual({ kind: 'change' });
    expect(rename(AURORA, 'n-intro', ' Intro ')).toEqual({ kind: 'change' });
  });

  it('refuses the page root: it carries no element name to change', () => {
    expect(rename(AURORA, 'n-page', 'Body')).toEqual({ kind: 'refused', message: message('status.rename.root') });
    expect(nameOf(AURORA, 'n-page')).toBe('Page');
  });

  it('refuses a locked element and one inside a locked element, naming the lock', () => {
    const locked = locking(AURORA, 'n-hero');
    expect(rename(locked, 'n-hero', 'Top')).toEqual({ kind: 'refused', message: message('status.locked.rename', { name: 'Hero' }) });
    expect(rename(locked, 'n-intro', 'Lead')).toEqual({ kind: 'refused', message: message('status.locked.byAncestor', { name: 'Intro', ancestor: 'Hero' }) });
    expect(rename(locked, 'n-plans', 'Pricing').kind).toBe('change');
  });
});
