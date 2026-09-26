// Preferences (ARCHITECTURE.md): the UI language and the theme, chosen with preferences.setLanguage and
// preferences.setTheme, and the inspector's collapsed sections (inspector.toggleSection, whose owner,
// src/editor/inspector/sections.ts, says what they mean), stored and restored after a reload (features ui-language,
// theme-switch and inspector-panel).
import { DEFAULT_LOCALE, LOCALES, SECTION_IDS, type Locale, type SectionId } from '../../generated/ids.ts';
import type { CommandArgs } from '../../generated/commands.ts';
import { registerHandler, type RegisteredHandler } from '../../core/commands/registry.ts';
import { commandOf, manifest } from '../../manifest/runtime.ts';
import type { Store } from '../../core/store/store.ts';
import type { EditorUi } from '../state.ts';
import { PALETTE_DENSITIES } from '../palette/palette.ts';
import { ROW_DETAILS } from '../layers/tree.ts';
import { ZOOM_MAX, ZOOM_MIN } from '../view/camera.ts';
import { readOffsets, type Offset } from '../quick-panel/quick-panel.ts';
import { readSnapSettings, type SnapSettings } from '../view/snap.ts';
import { readBreakpoint } from '../view/breakpoints.ts';
import { chosen } from './said.ts';

export type Theme = CommandArgs['preferences.setTheme']['theme'];

// a language item or a theme item stands for the language or the theme the editor shows
export const setLanguage: RegisteredHandler<'preferences.setLanguage', EditorUi> = registerHandler(
  'preferences.setLanguage',
  ({ state }, args) => {
    if (state.ui.preferences.locale === args.locale) return { kind: 'change' };
    return { kind: 'change', ui: { ...state.ui, preferences: { ...state.ui.preferences, locale: args.locale } }, message: chosen(setLanguage.command, args) };
  },
  (state, args) => args.locale === state.ui.preferences.locale,
);

export const setTheme: RegisteredHandler<'preferences.setTheme', EditorUi> = registerHandler(
  'preferences.setTheme',
  ({ state }, args) => {
    if (state.ui.preferences.theme === args.theme) return { kind: 'change' };
    return { kind: 'change', ui: { ...state.ui, preferences: { ...state.ui.preferences, theme: args.theme } }, message: chosen(setTheme.command, args) };
  },
  (state, args) => args.theme === state.ui.preferences.theme,
);

// the themes preferences.setTheme offers, read from the manifest
const THEMES: readonly string[] = commandOf(setTheme.command).args.theme?.values ?? [];
const isTheme = (value: unknown): value is Theme => typeof value === 'string' && THEMES.includes(value);

export interface Preferences {
  readonly locale: Locale;
  readonly theme: Theme;
  // the inspector's collapsed sections, in the sections' order (properties.json); absent while every section is open
  readonly collapsedSections?: readonly SectionId[] | undefined;
  // how the Elements panel lays its tiles out (palette.setDensity); absent while it is the default, two columns
  readonly paletteDensity?: PaletteDensity | undefined;
  // the Elements panel's collapsed groups (palette.toggleGroup), in the palette's order; absent while every group is open
  readonly collapsedGroups?: readonly string[] | undefined;
  // what each Layers row shows beside its name (layers.setRowDetails), in the command's order; absent while it is the
  // default, the HTML tag alone
  readonly rowDetails?: readonly RowDetail[] | undefined;
  // the canvas zoom in percent (view.zoomIn, view.zoomTo…; src/editor/view/camera.ts); absent in Fit mode
  readonly zoom?: number | undefined;
  // the canvas's view switches (view.toggleOutlines, view.toggleZones; src/editor/view/overlays.ts); absent while off
  readonly outlines?: true | undefined;
  readonly zones?: true | undefined;
  // the rulers and the manual guides hidden (view.toggleRulers, guides.toggleVisible; src/editor/view/overlays.ts); absent
  // while they show
  readonly rulersHidden?: true | undefined;
  readonly guidesHidden?: true | undefined;
  // snapping on (snap.setEnabled), and the targets and distance Snap settings kept (snap.setSettings;
  // src/editor/view/snap.ts); absent while off, and while the settings are the defaults
  readonly snap?: true | undefined;
  readonly snapSettings?: SnapSettings | undefined;
  // the smart guides (alignment lines, equal-spacing markers) and equal spacing turned off (view.toggleSmartGuides,
  // view.toggleEqualSpacing; src/editor/view/overlays.ts); absent while on
  readonly smartGuidesOff?: true | undefined;
  // the breakpoint the editor shows (view.setBreakpoint; src/editor/view/breakpoints.ts); absent while it is the base
  readonly breakpoint?: string | undefined;
  readonly equalSpacingOff?: true | undefined;
  // the boxes of the box model edited as one value for their four sides (inspector.toggleSpacingLink); absent while none
  readonly spacingLinks?: readonly ('padding' | 'margin')[] | undefined;
  // the Style tab showing its essentials only (inspector.setMode); absent while it shows every property
  readonly inspectorMode?: 'essentials' | undefined;
  // where the quick panel was dragged for each element (quickPanel.setOffset; src/editor/quick-panel/quick-panel.ts),
  // by node id; absent while it was dragged for none
  readonly quickPanelOffsets?: Readonly<Record<string, Offset>> | undefined;
  // the last colours the colour picker applied, the newest first, at most RECENT_COLOURS (colorPicker.apply;
  // src/editor/inspector/color-picker.ts); absent while none
  readonly recentColors?: readonly string[] | undefined;
  // Developer tools on (workspace.toggleDeveloperTools; src/editor/workspace/panels.ts): the dock has its Document tab;
  // absent while off
  readonly developerTools?: true | undefined;
}

export const RECENT_COLOURS = 10;

export type RowDetail = CommandArgs['layers.setRowDetails']['detail'];

export type PaletteDensity = CommandArgs['palette.setDensity']['density'];
const GROUP_IDS: readonly string[] = manifest.elements.palette.map((g) => g.id);

// a fresh profile: the default UI language and the default theme of environment.json, every section open
const DEFAULT_THEME = manifest.environment.theme.default;
if (!isTheme(DEFAULT_THEME)) throw new Error(`environment.json: the default theme "${DEFAULT_THEME}" is not a theme of preferences.setTheme`);
export const INITIAL_PREFERENCES: Preferences = { locale: DEFAULT_LOCALE, theme: DEFAULT_THEME };

// Where preferences are kept between sessions; the browser's localStorage by default, a map in tests.
export interface PreferenceStorage {
  read(): string | null;
  write(text: string): void;
}

const KEY = 'preferences';

export const browserStorage: PreferenceStorage = {
  read: () => {
    try {
      return window.localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  write: (text) => {
    try {
      window.localStorage.setItem(KEY, text);
    } catch {
      // storage refused (private window, quota): the preferences last for this session only
    }
  },
};

// The stored preferences, each one only when it is a value the manifest allows; the defaults otherwise.
export function loadPreferences(storage: PreferenceStorage): Preferences {
  const text = storage.read();
  if (text === null) return INITIAL_PREFERENCES;
  try {
    const stored = JSON.parse(text) as Record<string, unknown>;
    const locale = (LOCALES as readonly unknown[]).includes(stored.locale) ? (stored.locale as Locale) : INITIAL_PREFERENCES.locale;
    const theme = isTheme(stored.theme) ? stored.theme : INITIAL_PREFERENCES.theme;
    // the sections of properties.json the list names, in their order; anything else is left out
    const listed: readonly unknown[] = Array.isArray(stored.collapsedSections) ? (stored.collapsedSections as unknown[]) : [];
    const collapsedSections = SECTION_IDS.filter((s) => listed.includes(s));
    const density = PALETTE_DENSITIES.includes(stored.paletteDensity as string) ? (stored.paletteDensity as PaletteDensity) : undefined;
    const groups: readonly unknown[] = Array.isArray(stored.collapsedGroups) ? (stored.collapsedGroups as unknown[]) : [];
    const collapsedGroups = GROUP_IDS.filter((g) => groups.includes(g));
    const details: readonly unknown[] | null = Array.isArray(stored.rowDetails) ? (stored.rowDetails as unknown[]) : null;
    const rowDetails = details === null ? null : ROW_DETAILS.filter((d) => details.includes(d));
    // a zoom within the camera's range, a whole percent; anything else is Fit mode
    const offsets = readOffsets(stored.quickPanelOffsets);
    const recent = Array.isArray(stored.recentColors) ? (stored.recentColors as unknown[]).filter((c): c is string => typeof c === 'string' && c.trim() !== '').slice(0, RECENT_COLOURS) : [];
    const snapSettings = readSnapSettings(stored.snapSettings);
    const zoom = typeof stored.zoom === 'number' && Number.isInteger(stored.zoom) && stored.zoom >= ZOOM_MIN && stored.zoom <= ZOOM_MAX ? stored.zoom : undefined;
    return {
      locale,
      theme,
      ...(collapsedSections.length > 0 ? { collapsedSections } : {}),
      ...(density !== undefined ? { paletteDensity: density } : {}),
      ...(collapsedGroups.length > 0 ? { collapsedGroups } : {}),
      ...(rowDetails !== null ? { rowDetails } : {}),
      ...(zoom !== undefined ? { zoom } : {}),
      ...(stored.outlines === true ? { outlines: true as const } : {}),
      ...(stored.zones === true ? { zones: true as const } : {}),
      ...(stored.rulersHidden === true ? { rulersHidden: true as const } : {}),
      ...(stored.guidesHidden === true ? { guidesHidden: true as const } : {}),
      ...(stored.snap === true ? { snap: true as const } : {}),
      ...(snapSettings !== undefined ? { snapSettings } : {}),
      ...(stored.smartGuidesOff === true ? { smartGuidesOff: true as const } : {}),
      ...(readBreakpoint(stored.breakpoint) !== undefined ? { breakpoint: readBreakpoint(stored.breakpoint) } : {}),
      ...(stored.equalSpacingOff === true ? { equalSpacingOff: true as const } : {}),
      ...(Array.isArray(stored.spacingLinks) && stored.spacingLinks.length > 0 ? { spacingLinks: (['padding', 'margin'] as const).filter((b) => (stored.spacingLinks as unknown[]).includes(b)) } : {}),
      ...(stored.inspectorMode === 'essentials' ? { inspectorMode: 'essentials' as const } : {}),
      ...(offsets !== undefined ? { quickPanelOffsets: offsets } : {}),
      ...(recent.length > 0 ? { recentColors: recent } : {}),
      ...(stored.developerTools === true ? { developerTools: true as const } : {}),
    };
  } catch {
    return INITIAL_PREFERENCES;
  }
}

// Writes the preferences every time a command changes them, once its gesture is over (a quick panel's grip drag
// changes them at every move; its release keeps the last, Escape none).
export function persistPreferences(store: Store<EditorUi>, storage: PreferenceStorage): () => void {
  let last = store.getState().ui.preferences;
  return store.subscribe(() => {
    const now = store.getState().ui.preferences;
    if (now === last || store.gestureOpen()) return;
    last = now;
    storage.write(JSON.stringify(now));
  });
}
