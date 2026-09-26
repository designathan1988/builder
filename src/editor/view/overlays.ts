// The canvas's view switches (ARCHITECTURE.md, Command owners; spec canvas-outlines-zones): Outlines draws a dashed
// box around every element, Zones the padding of every container and the drop area of every empty one. Both are
// drawn by the canvas chrome over the page, never written into it, and both are preferences (ui.preferences.outlines,
// ui.preferences.zones), restored after a reload; neither changes the document nor records anything. Each toggle
// button stands for its switch being on.
import { registerHandler } from '../../core/commands/registry.ts';
import type { EditorUi } from '../state.ts';

type Switch = 'outlines' | 'zones' | 'rulersHidden' | 'guidesHidden' | 'smartGuidesOff' | 'equalSpacingOff';

function flipped(ui: EditorUi, which: Switch): EditorUi {
  const { [which]: on, ...rest } = ui.preferences;
  return { ...ui, preferences: on === true ? rest : { ...rest, [which]: true } };
}

export const toggleOutlines = registerHandler<'view.toggleOutlines', EditorUi>(
  'view.toggleOutlines',
  ({ state }) => ({ kind: 'change', ui: flipped(state.ui, 'outlines') }),
  (state) => state.ui.preferences.outlines === true,
);

export const toggleZones = registerHandler<'view.toggleZones', EditorUi>(
  'view.toggleZones',
  ({ state }) => ({ kind: 'change', ui: flipped(state.ui, 'zones') }),
  (state) => state.ui.preferences.zones === true,
);

// The rulers and the manual guides (spec workspace-settings-dialog): shown by default, hidden by their switches; each
// switch stands for what it shows being shown.
export const toggleRulers = registerHandler<'view.toggleRulers', EditorUi>(
  'view.toggleRulers',
  ({ state }) => ({ kind: 'change', ui: flipped(state.ui, 'rulersHidden') }),
  (state) => state.ui.preferences.rulersHidden !== true,
);
export const toggleGuidesVisible = registerHandler<'guides.toggleVisible', EditorUi>(
  'guides.toggleVisible',
  ({ state }) => ({ kind: 'change', ui: flipped(state.ui, 'guidesHidden') }),
  (state) => state.ui.preferences.guidesHidden !== true,
);

// The smart guides and equal spacing (spec smart-guides): on by default. Smart guides off, a free drag or a resize
// draws no alignment line and no equal-spacing marker, and snap stays as it is (Problems in Pager 1); equal spacing off,
// no gap is repeated nor marked. Each switch stands for its hints being on.
export const toggleSmartGuides = registerHandler<'view.toggleSmartGuides', EditorUi>(
  'view.toggleSmartGuides',
  ({ state }) => ({ kind: 'change', ui: flipped(state.ui, 'smartGuidesOff') }),
  (state) => state.ui.preferences.smartGuidesOff !== true,
);
export const toggleEqualSpacing = registerHandler<'view.toggleEqualSpacing', EditorUi>(
  'view.toggleEqualSpacing',
  ({ state }) => ({ kind: 'change', ui: flipped(state.ui, 'equalSpacingOff') }),
  (state) => state.ui.preferences.equalSpacingOff !== true,
);
