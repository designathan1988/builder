import { describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import { locate } from '../../core/document/model.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import { createEditorStore } from '../store.ts';
import { isPanelOpen } from '../workspace/panels.ts';
import { renamedNode } from './rename.ts';
import { isExpanded } from './tree.ts';

const memory = (): PreferenceStorage => ({ read: () => null, write: () => {} });
// the store as the editor builds it (src/editor/store.ts), with the scenarios' fixture open
const aurora = () => {
  const s = createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });
  s.dispatch('project.open', { file: JSON.stringify(fixture) });
  return s;
};
const nameOf = (s: ReturnType<typeof aurora>, id: string) => locate(s.getState().document, id)?.node.name;

describe('renaming in Layers (src/editor/layers/rename.ts)', () => {
  it('starts on the one selected node without changing the document, the selection or the history', () => {
    const s = aurora();
    s.dispatch('selection.select', { target: 'n-intro' });
    const { document, selection, history } = s.getState();
    expect(s.dispatch('layers.startRename', {})).toEqual({ status: 'done', changed: true });
    expect(renamedNode(s.getState().ui)).toBe('n-intro');
    expect(s.getState().document).toBe(document);
    expect(s.getState().selection).toBe(selection);
    expect(s.getState().history).toBe(history);
  });

  it('is refused with none or several selected, and for a locked element or one inside it', () => {
    const s = aurora();
    expect(s.dispatch('layers.startRename', {})).toEqual({ status: 'refused', message: { key: 'status.needsSingleSelection', params: {} } });
    s.dispatch('selection.select', { target: 'n-intro' });
    s.dispatch('selection.add', { target: 'n-title' });
    expect(s.dispatch('layers.startRename', {})).toEqual({ status: 'refused', message: { key: 'status.needsSingleSelection', params: {} } });
    s.dispatch('element.toggleLock', { target: 'n-hero' });
    s.dispatch('selection.select', { target: 'n-hero' });
    expect(s.dispatch('layers.startRename', {})).toEqual({ status: 'refused', message: { key: 'status.locked.rename', params: { name: 'Hero' } } });
    s.dispatch('selection.select', { target: 'n-intro' });
    expect(s.dispatch('layers.startRename', {})).toEqual({ status: 'refused', message: { key: 'status.locked.byAncestor', params: { name: 'Intro', ancestor: 'Hero' } } });
    expect(renamedNode(s.getState().ui)).toBeNull();
  });

  it('shows the Layers section when it is hidden, and unfolds the branch that hides the row', () => {
    const s = aurora();
    s.dispatch('selection.select', { target: 'n-card-a-title' });
    s.dispatch('layers.setExpanded', { target: 'n-grid', expanded: 'collapse' });
    s.dispatch('workspace.toggleLeftDock', {});
    expect(isPanelOpen(s.getState().ui, 'layers')).toBe(false);
    s.dispatch('layers.startRename', {});
    expect(isPanelOpen(s.getState().ui, 'layers')).toBe(true);
    expect(isExpanded(s.getState().ui, 'n-grid')).toBe(true);
    expect(renamedNode(s.getState().ui)).toBe('n-card-a-title');
  });

  it('ends when element.rename keeps the name, which is one undo step', () => {
    const s = aurora();
    s.dispatch('selection.select', { target: 'n-intro' });
    s.dispatch('layers.startRename', {});
    s.dispatch('element.rename', { target: 'n-intro', name: 'Lead' });
    expect(nameOf(s, 'n-intro')).toBe('Lead');
    expect(renamedNode(s.getState().ui)).toBeNull();
    expect(s.getState().history.past).toHaveLength(1);
    expect(s.getState().message).toEqual({ key: 'status.renamed', params: { old: 'Intro', name: 'Lead' } });
    s.dispatch('history.undo', {});
    expect(nameOf(s, 'n-intro')).toBe('Intro');
    expect(s.getState().selection).toEqual(['n-intro']);
  });

  it('ends on an empty name, which keeps the previous name and records nothing', () => {
    const s = aurora();
    s.dispatch('selection.select', { target: 'n-intro' });
    s.dispatch('layers.startRename', {});
    const { document } = s.getState();
    s.dispatch('element.rename', { target: 'n-intro', name: '' });
    expect(s.getState().document).toBe(document);
    expect(s.getState().history.past).toHaveLength(0);
    expect(s.getState().message).toEqual({ key: 'status.rename.empty', params: { name: 'Intro' } });
    expect(renamedNode(s.getState().ui)).toBeNull();
  });

  it('ends when the selection is no longer its node alone', () => {
    const s = aurora();
    s.dispatch('selection.select', { target: 'n-intro' });
    s.dispatch('layers.startRename', {});
    s.dispatch('selection.select', { target: 'n-intro' });
    expect(renamedNode(s.getState().ui)).toBe('n-intro');
    s.dispatch('selection.add', { target: 'n-title' });
    expect(renamedNode(s.getState().ui)).toBeNull();
    s.dispatch('selection.select', { target: 'n-intro' });
    s.dispatch('layers.startRename', {});
    s.dispatch('selection.clear', {});
    expect(renamedNode(s.getState().ui)).toBeNull();
  });
});
