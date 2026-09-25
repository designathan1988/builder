import { describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import { manualClock } from '../ports/clock.ts';
import { sequentialIds } from '../ports/ids.ts';
import { createEditorStore } from '../../editor/store.ts';
import type { PreferenceStorage } from '../../editor/preferences/preferences.ts';
import type { DocumentChange } from '../store/store.ts';

// the fixture as File › Open reads it: the file's text
const aurora = JSON.stringify(fixture);
const memory = (): PreferenceStorage => ({ read: () => null, write: () => {} });
const store = () => createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });

describe('File › Open (src/core/project/archive.ts)', () => {
  it('loads a project document: the document is the file, the selection and the history start empty', () => {
    const s = store();
    const changes: DocumentChange[] = [];
    s.subscribeDocument((c) => changes.push(c));
    expect(s.dispatch('project.open', { file: aurora })).toEqual({ status: 'done', changed: true });
    expect(s.getState().document).toEqual(JSON.parse(aurora));
    expect(s.getState().selection).toEqual([]);
    expect(s.getState().history.past).toEqual([]);
    // the renderer hears one change that replaces the pages
    expect(changes.map((c) => c.patches.map((p) => `${p.op} /${p.path.join('/')}`))).toEqual([['replace /pages']]);
  });

  it('refuses a file that is not JSON, a newer version and a document the model rejects, and keeps the document', () => {
    const s = store();
    const before = s.getState().document;
    const refused = (file: string) => {
      const result = s.dispatch('project.open', { file });
      expect(s.getState().document).toBe(before);
      return result.status === 'refused' ? result.message : null;
    };
    expect(refused('{not json')?.key).toBe('status.open.invalidArchive');
    expect(refused(JSON.stringify({ ...JSON.parse(aurora), version: 9 }))).toEqual({ key: 'status.open.newerVersion', params: { version: 9 } });
    const broken = JSON.parse(aurora) as { pages: { tree: { children: { type: string }[] } }[] };
    const first = broken.pages[0]?.tree.children[0];
    if (first) first.type = 'banner';
    expect(refused(JSON.stringify(broken))).toEqual({ key: 'status.open.invalidArchive', params: { reason: '/pages/0/tree/children/0/type: "banner" is not an element type of elements.json' } });
  });
});
