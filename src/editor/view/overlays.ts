// The canvas's view switches (ARCHITECTURE.md, Command owners; spec canvas-outlines-zones): Outlines draws a dashed
// box around every element, Zones the padding of every container and the drop area of every empty one. Both are
// drawn by the canvas chrome over the page, never written into it, and both are preferences (ui.preferences.outlines,
// ui.preferences.zones), restored after a reload; neither changes the document nor records anything. Each toggle
// button stands for its switch being on.
import { registerHandler, type RegisteredHandler } from '../../core/commands/registry.ts';
import type { CommandId } from '../../generated/ids.ts';
import { switched } from '../preferences/said.ts';
import type { EditorUi } from '../state.ts';

type Switch = 'outlines' | 'zones' | 'rulersHidden' | 'guidesHidden' | 'smartGuidesOff' | 'equalSpacingOff';

function flipped(ui: EditorUi, which: Switch): EditorUi {
  const { [which]: on, ...rest } = ui.preferences;
  return { ...ui, preferences: on === true ? rest : { ...rest, [which]: true } };
}
// a switch flipped, saying what it now shows (the audit's A3.41): the switches named ...Hidden or ...Off are on while
// their preference is absent
const NEGATIVE: readonly Switch[] = ['rulersHidden', 'guidesHidden', 'smartGuidesOff', 'equalSpacingOff'];
function flip(ui: EditorUi, which: Switch, command: CommandId) {
  const next = flipped(ui, which);
  const set = next.preferences[which] === true;
  return { kind: 'change' as const, ui: next, message: switched(command, NEGATIVE.includes(which) ? !set : set) };
}

export const toggleOutlines: RegisteredHandler<'view.toggleOutlines', EditorUi> = registerHandler(
  'view.toggleOutlines',
  ({ state }) => flip(state.ui, 'outlines', toggleOutlines.command),
  (state) => state.ui.preferences.outlines === true,
);

export const toggleZones: RegisteredHandler<'view.toggleZones', EditorUi> = registerHandler(
  'view.toggleZones',
  ({ state }) => flip(state.ui, 'zones', toggleZones.command),
  (state) => state.ui.preferences.zones === true,
);

// The rulers and the manual guides (spec workspace-settings-dialog): shown by default, hidden by their switches; each
// switch stands for what it shows being shown.
export const toggleRulers: RegisteredHandler<'view.toggleRulers', EditorUi> = registerHandler(
  'view.toggleRulers',
  ({ state }) => flip(state.ui, 'rulersHidden', toggleRulers.command),
  (state) => state.ui.preferences.rulersHidden !== true,
);
export const toggleGuidesVisible: RegisteredHandler<'guides.toggleVisible', EditorUi> = registerHandler(
  'guides.toggleVisible',
  ({ state }) => flip(state.ui, 'guidesHidden', toggleGuidesVisible.command),
  (state) => state.ui.preferences.guidesHidden !== true,
);

// The smart guides and equal spacing (spec smart-guides): on by default. Smart guides off, a free drag or a resize
// draws no alignment line and no equal-spacing marker, and snap stays as it is (Problems in Pager 1); equal spacing off,
// no gap is repeated nor marked. Each switch stands for its hints being on.
export const toggleSmartGuides: RegisteredHandler<'view.toggleSmartGuides', EditorUi> = registerHandler(
  'view.toggleSmartGuides',
  ({ state }) => flip(state.ui, 'smartGuidesOff', toggleSmartGuides.command),
  (state) => state.ui.preferences.smartGuidesOff !== true,
);
export const toggleEqualSpacing: RegisteredHandler<'view.toggleEqualSpacing', EditorUi> = registerHandler(
  'view.toggleEqualSpacing',
  ({ state }) => flip(state.ui, 'equalSpacingOff', toggleEqualSpacing.command),
  (state) => state.ui.preferences.equalSpacingOff !== true,
);
