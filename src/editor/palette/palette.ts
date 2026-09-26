// The Elements panel's own state (ARCHITECTURE.md, Command owners; features palette-search-groups and palette-density):
// palette.toggleGroup collapses or opens a group of the palette, palette.setDensity lays its tiles out (a list, two or
// three columns, an icon grid). Both are editor preferences (src/editor/preferences/preferences.ts), kept after a
// reload; neither changes the document nor records anything. What the search field filters is the panel's own view
// (paletteMatches).
import { registerHandler, type RegisteredHandler } from '../../core/commands/registry.ts';
import type { PaletteDensity } from '../preferences/preferences.ts';
import { commandOf } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import { chosen } from '../preferences/said.ts';

// the density while none is chosen (DESIGN.md: two columns is the default in this sidebar width)
export const DEFAULT_DENSITY: PaletteDensity = 'two-columns';

export const paletteDensity = (ui: EditorUi): PaletteDensity => ui.preferences.paletteDensity ?? DEFAULT_DENSITY;
export const isGroupCollapsed = (ui: EditorUi, group: string): boolean => (ui.preferences.collapsedGroups ?? []).includes(group);

export const toggleGroup = registerHandler<'palette.toggleGroup', EditorUi>(
  'palette.toggleGroup',
  ({ state }, { group }) => {
    const collapsed = state.ui.preferences.collapsedGroups ?? [];
    const next = collapsed.includes(group) ? collapsed.filter((g) => g !== group) : [...collapsed, group];
    // the list is absent while every group is open (preferences.ts)
    const kept = Object.fromEntries(Object.entries(state.ui.preferences).filter(([key]) => key !== 'collapsedGroups')) as typeof state.ui.preferences;
    return { kind: 'change', ui: { ...state.ui, preferences: next.length > 0 ? { ...kept, collapsedGroups: next } : kept } };
  },
  // a group header stands for its group being open
  (state, args) => !isGroupCollapsed(state.ui, String(args.group)),
);

export const setDensity: RegisteredHandler<'palette.setDensity', EditorUi> = registerHandler(
  'palette.setDensity',
  ({ state }, { density }) => {
    const said = chosen(setDensity.command, { density });
    if (paletteDensity(state.ui) === density) return { kind: 'change', message: said };
    return { kind: 'change', ui: { ...state.ui, preferences: { ...state.ui.preferences, paletteDensity: density } }, message: said };
  },
  (state, args) => paletteDensity(state.ui) === args.density,
);

// the densities the panel offers: the values of the density argument of palette.setDensity (the manifest's)
export const PALETTE_DENSITIES: readonly string[] = commandOf(setDensity.command).args.density?.values ?? [];

// Whether a palette entry matches what the search field holds: its label or its tag contains the text, ignoring case
// and the spaces around it; everything matches an empty search.
export function paletteMatches(query: string, label: string, tag: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return label.toLowerCase().includes(q) || (tag ?? '').toLowerCase().includes(q);
}
