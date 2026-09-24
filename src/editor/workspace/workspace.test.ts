import { describe, expect, it } from 'vitest';
import { sequentialIds } from '../../core/ports/ids.ts';
import { manualClock } from '../../core/ports/clock.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import { createEditorStore } from '../store.ts';
import { PANELS, isPanelOpen, type Panel } from './panels.ts';

function memory(text: string | null = null): PreferenceStorage & { text: string | null } {
  const box = {
    text,
    read: () => box.text,
    write: (t: string) => {
      box.text = t;
    },
  };
  return box;
}

const store = () => createEditorStore({ storage: memory(), ids: sequentialIds('n'), clock: manualClock() });
const openPanels = (s: ReturnType<typeof store>): Panel[] => (Object.keys(PANELS) as Panel[]).filter((panel) => isPanelOpen(s.getState().ui, panel));

describe('panel visibility (workspace/panels.ts)', () => {
  it('starts with every panel as layout.json says: open at the first start or not', () => {
    const s = store();
    for (const panel of Object.keys(PANELS) as Panel[]) expect([panel, isPanelOpen(s.getState().ui, panel)]).toEqual([panel, PANELS[panel].open]);
  });

  it('starts with the Explorer, Layers and the inspector open and the dock collapsed with Timeline and Checks', () => {
    const s = store();
    expect(openPanels(s)).toEqual(['explorer', 'layers', 'inspector', 'canvas-tools', 'timeline', 'checks']);
    expect(s.getState().ui.panels.dockTabs).toEqual(['timeline', 'checks']);
    expect(s.getState().ui.layout).toEqual({ dock: 'collapsed', activeDockTab: 'timeline' });
  });

  it('switches the sidebar view, and closes the sidebar when the shown view is toggled again', () => {
    const s = store();
    s.dispatch('workspace.setPanelOpen', { panel: 'elements', open: 'toggle' });
    expect(openPanels(s).filter((p) => PANELS[p].place === 'sidebar')).toEqual(['elements']);
    s.dispatch('workspace.setPanelOpen', { panel: 'elements', open: 'toggle' });
    expect(s.getState().ui.panels.sidebar).toBe(false);
    expect(openPanels(s).filter((p) => PANELS[p].place === 'sidebar' || PANELS[p].place === 'section')).toEqual([]);
    s.dispatch('workspace.setPanelOpen', { panel: 'explorer', open: 'open' });
    expect(openPanels(s).filter((p) => PANELS[p].place === 'sidebar' || PANELS[p].place === 'section')).toEqual(['explorer', 'layers']);
  });

  it('reports each change in the status bar (spec dock-toggles, Problems 1)', () => {
    const s = store();
    s.dispatch('workspace.setPanelOpen', { panel: 'layers', open: 'toggle' });
    expect(s.getState().message).toEqual({ key: 'status.panel.closed', params: { panel: { key: 'panel.layers' } } });
    s.dispatch('workspace.setPanelOpen', { panel: 'layers', open: 'toggle' });
    expect(s.getState().message).toEqual({ key: 'status.panel.opened', params: { panel: { key: 'panel.layers' } } });
  });

  it('opens a dock tab in the workbench, and collapses the workbench when its last tab closes (spec workbench-panel)', () => {
    const s = store();
    s.dispatch('workspace.setPanelOpen', { panel: 'shortcuts', open: 'open' });
    expect(s.getState().ui.panels.dockTabs).toEqual(['timeline', 'checks', 'shortcuts']);
    expect(s.getState().ui.layout).toEqual({ dock: 'open', activeDockTab: 'shortcuts' });
    for (const panel of ['shortcuts', 'timeline', 'checks'] as const) s.dispatch('workspace.setPanelOpen', { panel, open: 'close' });
    expect(s.getState().ui.panels.dockTabs).toEqual([]);
    expect(s.getState().ui.layout).toEqual({ dock: 'collapsed', activeDockTab: null });
  });

  it('hides and shows the sidebar and the inspector (Ctrl+B, Ctrl+Alt+B)', () => {
    const s = store();
    s.dispatch('workspace.toggleLeftDock', {});
    expect(s.getState().ui.panels.sidebar).toBe(false);
    expect(s.getState().message?.key).toBe('status.sidebar.hidden');
    s.dispatch('workspace.toggleInspector', {});
    expect(isPanelOpen(s.getState().ui, 'inspector')).toBe(false);
    expect(s.getState().message?.key).toBe('status.inspector.hidden');
    s.dispatch('workspace.toggleLeftDock', {});
    s.dispatch('workspace.toggleInspector', {});
    expect(s.getState().ui.panels.sidebar).toBe(true);
    expect(isPanelOpen(s.getState().ui, 'inspector')).toBe(true);
  });

  it('collapses every dock and puts back exactly what was open on the second Ctrl+\\ (spec dock-toggles)', () => {
    const s = store();
    s.dispatch('workspace.toggleInspector', {});
    s.dispatch('workspace.setWorkbenchState', { state: 'max' });
    s.dispatch('workspace.collapseDocks', {});
    expect(s.getState().ui.panels.sidebar).toBe(false);
    expect(isPanelOpen(s.getState().ui, 'inspector')).toBe(false);
    expect(s.getState().ui.layout.dock).toBe('collapsed');
    expect(s.getState().message?.key).toBe('status.docks.collapsed');
    s.dispatch('workspace.collapseDocks', {});
    expect(s.getState().ui.panels).toMatchObject({ sidebar: true, collapsed: null });
    expect(isPanelOpen(s.getState().ui, 'inspector')).toBe(false);
    expect(s.getState().ui.layout.dock).toBe('max');
    expect(s.getState().message?.key).toBe('status.docks.restored');
  });

  it('shows, hides, maximises and restores the workbench (workspace/layout.ts)', () => {
    const s = store();
    s.dispatch('workspace.setWorkbenchState', { state: 'toggle' });
    expect(s.getState().ui.layout.dock).toBe('open');
    s.dispatch('workspace.setWorkbenchState', { state: 'toggle-max' });
    expect(s.getState().ui.layout.dock).toBe('max');
    s.dispatch('workspace.setWorkbenchState', { state: 'toggle-max' });
    expect(s.getState().ui.layout.dock).toBe('open');
    s.dispatch('workspace.setWorkbenchState', { state: 'toggle' });
    expect(s.getState().ui.layout.dock).toBe('collapsed');
    expect(isPanelOpen(s.getState().ui, 'workbench')).toBe(false);
  });

  it('never touches the document or the history', () => {
    const s = store();
    const before = s.getState();
    s.dispatch('workspace.toggleLeftDock', {});
    s.dispatch('workspace.setPanelOpen', { panel: 'timeline', open: 'close' });
    s.dispatch('workspace.collapseDocks', {});
    expect(s.getState().document).toBe(before.document);
    expect(s.getState().history).toBe(before.history);
  });
});

describe('preferences (preferences/preferences.ts)', () => {
  it('starts in English with the system theme, stores every change and restores it in the next session', () => {
    const storage = memory();
    const first = createEditorStore({ storage, ids: sequentialIds('n'), clock: manualClock() });
    expect(first.getState().ui.preferences).toEqual({ locale: 'en', theme: 'system' });
    first.dispatch('preferences.setLanguage', { locale: 'pt-BR' });
    first.dispatch('preferences.setTheme', { theme: 'dark' });
    expect(JSON.parse(storage.text ?? '')).toEqual({ locale: 'pt-BR', theme: 'dark' });
    const second = createEditorStore({ storage, ids: sequentialIds('m'), clock: manualClock() });
    expect(second.getState().ui.preferences).toEqual({ locale: 'pt-BR', theme: 'dark' });
    // the empty project of a Portuguese session is named in Portuguese
    expect(second.getState().document.pages[0]?.name).toBe('Início');
  });

  it('ignores a stored value that is not a language or a theme of the manifest', () => {
    const s = createEditorStore({ storage: memory('{"locale":"fr","theme":"sepia"}'), ids: sequentialIds('n'), clock: manualClock() });
    expect(s.getState().ui.preferences).toEqual({ locale: 'en', theme: 'system' });
    const broken = createEditorStore({ storage: memory('{not json'), ids: sequentialIds('n'), clock: manualClock() });
    expect(broken.getState().ui.preferences).toEqual({ locale: 'en', theme: 'system' });
  });

  it('changes nothing when the chosen language is already the language', () => {
    const s = store();
    const before = s.getState();
    expect(s.dispatch('preferences.setLanguage', { locale: 'en' })).toEqual({ status: 'done', changed: false });
    expect(s.getState()).toBe(before);
  });
});
