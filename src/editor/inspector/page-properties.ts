// page.openProperties (ARCHITECTURE.md, Command owners; spec page-properties): Page properties in the inspector's
// header. The root of the page the canvas shows (the first page, until explorer-pages) becomes the selection, and the
// inspector, opened if it was hidden, shows the tab whose region holds the fields of the page's settings (the Settings
// tab: Page title, Page language, Text direction…, spec Problems in Pager 1). Nothing is recorded and the document
// does not change; the status bar names the page root, as selecting it does.
import { message, registerHandler } from '../../core/commands/registry.ts';
import type { ModelRules } from '../../core/document/validate.ts';
import { isPageSetting } from '../../core/page/settings.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import { inspectorTabDrawing, withInspectorTab } from '../workspace/layout.ts';
import { withInspector } from '../workspace/panels.ts';

// The inspector tab that shows the page's settings: the one that draws the region where the manifest places the field
// of a setting of the page (settings.ts isPageSetting).
function settingsTab(rules: ModelRules): string {
  const field = manifest.doors.find((d) => d.door.kind === 'inspector-field' && d.door.attribute !== null && isPageSetting(rules.attributes.get(d.door.attribute), rules.root.type));
  const tab = field !== undefined && typeof field.door.placement === 'object' ? inspectorTabDrawing(field.door.placement.region) : null;
  if (tab === null) throw new Error('page.openProperties: no inspector tab draws the fields of the page settings');
  return tab;
}

export const openPageProperties = registerHandler<'page.openProperties', EditorUi>('page.openProperties', ({ state, rules }) => {
  const root = state.document.pages[0]?.tree;
  if (root === undefined) throw new Error('page.openProperties: the document has no page');
  return { kind: 'change', selection: [root.id], ui: withInspectorTab(withInspector(state.ui, true), settingsTab(rules)), message: message('status.selected', { name: root.name }) };
});
