import { describe, expect, it } from 'vitest';
import { COMMANDS } from '../../app/commands.ts';
import { isBuilt, type RegisteredHandler } from '../../core/commands/registry.ts';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { CommandId } from '../../generated/ids.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import type { EditorUi } from '../state.ts';
import { createEditorStore } from '../store.ts';
import { INSPECTOR_TABS, inspectorTab } from './layout.ts';

const memory = (): PreferenceStorage => ({ read: () => null, write: () => undefined });
const store = () => createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });
// whether a door with these arguments stands for the tab its group shows (the command's `current`)
function current(s: ReturnType<typeof store>, args: Readonly<Record<string, unknown>>): boolean {
  const handler = COMMANDS['workspace.setActiveTab'];
  if (!isBuilt(handler)) throw new Error('workspace.setActiveTab is not built');
  return (handler as RegisteredHandler<CommandId, EditorUi>).current?.(s.getState(), args) ?? false;
}

describe('the active tab of a tab group (workspace/layout.ts)', () => {
  it("shows the inspector's tabs in the header's order, Style first", () => {
    expect(INSPECTOR_TABS).toEqual(['style', 'settings', 'interactions']);
    expect(inspectorTab(store().getState().ui)).toBe('style');
  });

  it('shows the inspector tab its door names, keeps it when the selection changes, and records nothing', () => {
    const s = store();
    const before = s.getState();
    s.dispatch('workspace.setActiveTab', { group: 'inspector', panel: 'settings' });
    expect(inspectorTab(s.getState().ui)).toBe('settings');
    expect(current(s, { group: 'inspector', panel: 'settings' })).toBe(true);
    expect(current(s, { group: 'inspector', panel: 'style' })).toBe(false);
    const root = s.getState().document.pages[0]?.tree.id ?? '';
    s.dispatch('selection.select', { target: root });
    expect(inspectorTab(s.getState().ui)).toBe('settings');
    s.dispatch('workspace.setActiveTab', { group: 'inspector', panel: 'style' });
    expect(inspectorTab(s.getState().ui)).toBe('style');
    expect(s.getState().ui.layout).toEqual({ dock: 'collapsed', activeDockTab: 'timeline' });
    expect(s.getState().document).toBe(before.document);
    expect(s.getState().history).toBe(before.history);
  });

  it('shows a dock tab, opening a collapsed dock, and stands for it while the dock shows it', () => {
    const s = store();
    expect(current(s, { group: 'workbench', panel: 'timeline' })).toBe(false);
    s.dispatch('workspace.setActiveTab', { group: 'workbench', panel: 'checks' });
    expect(s.getState().ui.layout).toEqual({ dock: 'open', activeDockTab: 'checks' });
    expect(current(s, { group: 'workbench', panel: 'checks' })).toBe(true);
    expect(current(s, { group: 'workbench', panel: 'timeline' })).toBe(false);
  });

  it('takes only a tab its group has', () => {
    const s = store();
    expect(() => s.dispatch('workspace.setActiveTab', { group: 'inspector', panel: 'nope' })).toThrow(/the inspector has no tab nope/);
    expect(() => s.dispatch('workspace.setActiveTab', { group: 'workbench', panel: 'shortcuts' })).toThrow(/the dock has no tab shortcuts/);
    expect(() => s.dispatch('workspace.setActiveTab', { group: 'nope', panel: 'style' })).toThrow(/no tab group nope/);
    expect(inspectorTab(s.getState().ui)).toBe('style');
  });
});
