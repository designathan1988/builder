import { describe, expect, it } from 'vitest';
import fixture from '../../../manifest/features/fixtures/aurora.json';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import { createEditorStore } from '../store.ts';
import { isExpanded } from './tree.ts';

const memory = (): PreferenceStorage => ({ read: () => null, write: () => {} });
const aurora = () => {
  const s = createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });
  s.dispatch('project.open', { file: JSON.stringify(fixture) });
  return s;
};

describe('Layers folding (src/editor/layers/tree.ts)', () => {
  it('folds, unfolds and toggles a branch without changing the document, the selection or the history', () => {
    const s = aurora();
    s.dispatch('selection.select', { target: 'n-title' });
    const { document, selection, history } = s.getState();
    s.dispatch('layers.setExpanded', { target: 'n-plans', expanded: 'collapse' });
    expect(isExpanded(s.getState().ui, 'n-plans')).toBe(false);
    s.dispatch('layers.setExpanded', { target: 'n-plans', expanded: 'toggle' });
    expect(isExpanded(s.getState().ui, 'n-plans')).toBe(true);
    s.dispatch('layers.setExpanded', { target: 'n-plans', expanded: 'toggle' });
    expect(isExpanded(s.getState().ui, 'n-plans')).toBe(false);
    s.dispatch('layers.setExpanded', { target: 'n-plans', expanded: 'expand' });
    expect(isExpanded(s.getState().ui, 'n-plans')).toBe(true);
    expect(s.getState().document).toBe(document);
    expect(s.getState().selection).toBe(selection);
    expect(s.getState().history).toBe(history);
  });

  it('leaves a node without children alone: it has no branch to fold', () => {
    const s = aurora();
    const before = s.getState().ui;
    expect(s.dispatch('layers.setExpanded', { target: 'n-title', expanded: 'collapse' })).toEqual({ status: 'done', changed: false });
    expect(s.getState().ui).toBe(before);
  });

  it('unfolds every folded branch that hides a node when it is selected, and no other', () => {
    const s = aurora();
    s.dispatch('layers.setExpanded', { target: 'n-plans', expanded: 'collapse' });
    s.dispatch('layers.setExpanded', { target: 'n-card-a', expanded: 'collapse' });
    s.dispatch('layers.setExpanded', { target: 'n-hero', expanded: 'collapse' });
    s.dispatch('selection.select', { target: 'n-card-a-title' });
    expect(['n-plans', 'n-card-a', 'n-hero'].map((id) => isExpanded(s.getState().ui, id))).toEqual([true, true, false]);
  });

  it('keeps a branch folded when the selected node is inside it and the selection does not change', () => {
    const s = aurora();
    s.dispatch('selection.select', { target: 'n-title' });
    s.dispatch('layers.setExpanded', { target: 'n-hero', expanded: 'collapse' });
    expect(isExpanded(s.getState().ui, 'n-hero')).toBe(false);
    s.dispatch('selection.select', { target: 'n-title' });
    expect(isExpanded(s.getState().ui, 'n-hero')).toBe(false);
  });
});
