// The inspector's sections (ARCHITECTURE.md, Command owners; spec inspector-panel): which of them are collapsed, and
// what a collapsed section's header summarises.
//
// inspector.toggleSection collapses or expands one section. Every section starts open (DESIGN.md "Inspector"); the
// collapsed set is one per section, the same for every element (spec, Problems in Pager 1), so it survives selection
// changes, and it lives in the preferences (src/editor/preferences/preferences.ts), which keep it after a reload.
// Toggling records nothing in the history and never touches the document.
//
// A collapsed section's header summarises the values in force of the properties and composites its manifest entry
// names (properties.json sections[].summary), read on the page the canvas draws (the CSS computed values, whatever
// sets them: the element's own styles or the browser's defaults; spec, Problems in Pager 2). How each section writes
// them is below (SUMMARIES); the words come from the catalogue.
import { message, registerHandler } from '../../core/commands/registry.ts';
import { fold } from '../../core/text/fold.ts';
import type { CommandArgs } from '../../generated/commands.ts';
import { SECTION_IDS, type MessageId, type SectionId } from '../../generated/ids.ts';
import type { Locale } from '../../i18n/index.ts';
import { pluralForm } from '../../i18n/index.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';
import { withInspectorTab } from '../workspace/layout.ts';
import { withInspector } from '../workspace/panels.ts';

// the inspector's tabs that show an attribute's field and a property's field (DESIGN.md)
const SETTINGS_TAB = 'settings';
const STYLE_TAB = 'style';

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === 'string' && (SECTION_IDS as readonly string[]).includes(value);
}

const NONE: readonly SectionId[] = [];

// the collapsed sections, in their order
export function collapsedSections(ui: EditorUi): readonly SectionId[] {
  return ui.preferences.collapsedSections ?? NONE;
}

export const toggleSection = registerHandler<'inspector.toggleSection', EditorUi>('inspector.toggleSection', ({ state }, { section }) => {
  // the header door of a section names it; anything else is a defect of the door
  if (!isSectionId(section)) throw new Error(`inspector.toggleSection: the inspector has no section ${section}`);
  const collapsed = collapsedSections(state.ui);
  const next = collapsed.includes(section) ? collapsed.filter((s) => s !== section) : [...collapsed, section];
  // kept in the sections' order, so what is stored does not depend on the order of the clicks; none: no list
  const ordered = SECTION_IDS.filter((s) => next.includes(s));
  return { kind: 'change', ui: { ...state.ui, preferences: { ...state.ui.preferences, collapsedSections: ordered.length > 0 ? ordered : undefined } } };
});

// inspector.setMode (spec inspector-advanced-mode): the Style tab shows every property that applies (All properties,
// the default) or its essentials only (the properties properties.json marks essential, a composite when one of its
// longhands is; a field whose property the element holds a value for, or the one just revealed, shows in both). An
// editor preference, kept after a reload; nothing in the document changes.
export type InspectorMode = CommandArgs['inspector.setMode']['mode'];
export const inspectorMode = (ui: EditorUi): InspectorMode => ui.preferences.inspectorMode ?? 'all';

export const setMode = registerHandler<'inspector.setMode', EditorUi>(
  'inspector.setMode',
  ({ state }, { mode }) => {
    const { inspectorMode: _dropped, ...rest } = state.ui.preferences;
    void _dropped;
    return { kind: 'change', ui: { ...state.ui, preferences: mode === 'essentials' ? { ...rest, inspectorMode: mode } : rest } };
  },
  (state, args) => inspectorMode(state.ui) === args.mode,
);

const ESSENTIAL = new Set(manifest.properties.properties.filter((p) => p.essential).map((p) => p.id));
// the properties a field edits: its property, a composite's longhands (LONGHANDS, below), a recipe's own id
export const editedProperties = (target: string): readonly string[] => LONGHANDS.get(target) ?? [target];
// whether a field of this property, composite or recipe is one of the essentials
export const isEssential = (target: string): boolean => editedProperties(target).some((p) => ESSENTIAL.has(p));

// ---------------------------------------------------------------- summaries

// What a section's summary reads, in the order its manifest entry names them: each a property (its value) or a
// composite (the values of its longhands, in the composite's order).
const LONGHANDS = new Map<string, readonly string[]>([
  ...manifest.properties.properties.map((p) => [p.id, [p.id]] as const),
  ...manifest.properties.composites.map((c) => [c.id, c.longhands] as const),
]);
const READS = new Map<SectionId, readonly (readonly string[])[]>(
  manifest.properties.sections.map((s) => [
    s.id as SectionId,
    s.summary.map((id) => {
      const longhands = LONGHANDS.get(id);
      if (longhands === undefined) throw new Error(`properties.json: the summary of the section ${s.id} names ${id}, which is no property or composite`);
      return longhands;
    }),
  ]),
);

// The CSS properties a section's summary reads on the page, for the page reader (coordinates.ts computedValues).
export function summaryProperties(section: SectionId): readonly string[] {
  return (READS.get(section) ?? []).flat();
}

type Words = (key: MessageId, params?: Readonly<Record<string, string | number>>) => string;
// one read item: its longhands' values, in order
type Item = readonly string[];

const isZero = (value: string) => value.trim() !== '' && Number.parseFloat(value) === 0 && /^-?0*\.?0*[a-z%]*$/.test(value.trim());
const allZero = (values: Item) => values.every(isZero);
// four sides (top, right, bottom, left) written as their shorthand would write them: one, two, three or four values
function sides(values: Item): string {
  const [top = '', right = top, bottom = top, left = right] = values;
  if (top === right && top === bottom && top === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return `${top} ${right} ${bottom} ${left}`;
}
// a colour whose alpha is zero: rgba(…, 0), or a colour function's "/ 0"
const isTransparent = (colour: string) => colour === 'transparent' || /^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(colour) || /\/\s*0(?:\.0+)?\)$/.test(colour);
// a value that is none, or the number 1 (opacity, scale), does nothing
const isNoEffect = (value: string) => value === 'none' || value === '1' || value === '';
const first = (item: Item | undefined) => item?.[0] ?? '';

// How each section writes what it reads (the items, in its manifest order); null: the section has no summary.
const SUMMARIES: Readonly<Record<SectionId, ((items: readonly Item[], words: Words, locale: Locale) => string) | null>> = {
  content: null,
  // the display, and the direction of a flex layout
  layout: ([display, direction], words) => (first(display).includes('flex') ? words('inspector.summary.pair', { first: first(display), second: first(direction) }) : first(display)),
  // M margin · P padding, each left out when it is zero on every side
  space: ([margin = [], padding = []], words) => {
    const parts = [
      ...(allZero(margin) ? [] : [words('inspector.summary.margin', { value: sides(margin) })]),
      ...(allZero(padding) ? [] : [words('inspector.summary.padding', { value: sides(padding) })]),
    ];
    return joined(parts, words);
  },
  size: ([width, height], words) => words('inspector.summary.size', { width: first(width), height: first(height) }),
  position: ([position, zIndex], words) => words('inspector.summary.position', { position: first(position), zIndex: first(zIndex) }),
  // the background colour, or None when it is transparent
  paint: ([background], words) => (isTransparent(first(background)) ? words('inspector.summary.none') : first(background)),
  // the edge (width and style) when a side has a style, and R radius when a corner is rounded
  border: ([width = [], style = [], radius = []], words) => {
    const parts = [
      ...(style.every((s) => s === 'none' || s === 'hidden') ? [] : [words('inspector.summary.edge', { width: sides(width), style: sides(style) })]),
      ...(allZero(radius) ? [] : [words('inspector.summary.radius', { value: sides(radius) })]),
    ];
    return joined(parts, words);
  },
  text: ([size, weight], words) => words('inspector.summary.pair', { first: first(size), second: first(weight) }),
  // how many of the effects it reads are on
  effects: (items, words, locale) => {
    const count = items.filter((item) => !item.every(isNoEffect)).length;
    return count === 0 ? words('inspector.summary.none') : words(`inspector.summary.effects.${pluralForm(locale, count)}`, { count });
  },
  interactions: null,
};

function joined(parts: readonly string[], words: Words): string {
  if (parts.length === 0) return words('inspector.summary.none');
  return parts.reduce((all, part) => words('inspector.summary.pair', { first: all, second: part }));
}

// The summary of a section from the values the page computes (property → value), or null when the section has none
// or the page does not draw the element.
export function summaryOf(section: SectionId, values: Readonly<Record<string, string>> | null, words: Words, locale: Locale): string | null {
  const write = SUMMARIES[section];
  if (write === null || values === null) return null;
  const items = (READS.get(section) ?? []).map((longhands) => longhands.map((p) => values[p] ?? ''));
  return write(items, words, locale);
}

// inspector.reveal (spec elements-form-inputs-rules, Problems in Pager 1): the inspector shows the field of a property
// (the Style tab) or of an attribute (the Settings tab), opened if hidden, and that field takes the focus; a
// double-click on a form control on the canvas reveals its Value field, where its value is edited. Nothing in the
// document changes and nothing is recorded. `revealed` counts the requests, so a field tells a new one from one it
// has answered.
export interface Revealed {
  readonly field: string;
  readonly count: number;
}

export const revealField = registerHandler<'inspector.reveal', EditorUi>('inspector.reveal', ({ state }, { property, attribute }) => {
  const field = attribute ?? property;
  if (field === undefined) return { kind: 'change' };
  const shown = withInspectorTab(withInspector(state.ui, true), attribute !== undefined ? SETTINGS_TAB : STYLE_TAB);
  return { kind: 'change', ui: { ...shown, revealed: { field, count: (state.ui.revealed?.count ?? 0) + 1 } } };
});

// Find a property (spec inspector-property-search): inspector.search keeps the Style tab's query in the editor state
// (ui.inspectorSearch, as typed; absent once nothing but spaces is left), never in the document; the tab draws only
// what searchMatches keeps.
export const inspectorSearchOf = (ui: EditorUi): string => ui.inspectorSearch ?? '';
export const searchInspector = registerHandler<'inspector.search', EditorUi>('inspector.search', ({ state }, { query }) => {
  const typed = query.trim();
  const { inspectorSearch: _was, ...rest } = state.ui;
  void _was;
  if (typed === '') return { kind: 'change', ui: rest, message: message('status.inspector.searchCleared') };
  return { kind: 'change', ui: { ...rest, inspectorSearch: query }, message: message('status.inspector.searchFor', { query: typed }) };
});

// Whether a field or an editor control of the Style tab matches a query: the query (case and accents ignored) is part of
// its label as shown, or of one of the CSS names it edits. An empty query matches everything.
export function searchMatches(query: string, label: string, cssNames: readonly string[]): boolean {
  const wanted = fold(query.trim());
  if (wanted === '') return true;
  return fold(label).includes(wanted) || cssNames.some((name) => fold(name).includes(wanted));
}
