// The page's layout grids (ARCHITECTURE.md, Command owners; spec layout-grid-overlay): the column grid, the row grid
// and the dot grid, each shown or hidden by its toggle. Whether one is shown is a setting of the page, stored on the
// page root (the attributes gridColumns, gridRows, gridDots of elements.json, which write nothing to the HTML), so
// it is saved with the document, undone as one step and never exported. Each toggle stands for its grid being shown.
// The grids are drawn by the canvas chrome (src/editor/canvas/grid-overlay.tsx) at the page's settings (below).
import { message, registerHandler, type Outcome } from '../commands/registry.ts';
import type { DocumentJson } from '../document/model.ts';
import type { MessageId } from '../../generated/ids.ts';
import { numberConstant, pairConstant } from '../../manifest/runtime.ts';
import { settingOf, settingsOf, type GridName } from './grid-settings.ts';

export type Grid = 'gridColumns' | 'gridRows' | 'gridDots';

export const gridShown = (document: DocumentJson, grid: Grid): boolean => document.pages[0]?.tree.attributes[grid] === true;

function toggled(document: DocumentJson, grid: Grid, shown: MessageId, hidden: MessageId): Outcome<never> {
  if (document.pages[0] === undefined) throw new Error('grid: the document has no page');
  const path = ['pages', 0, 'tree', 'attributes', grid];
  return gridShown(document, grid) ? { kind: 'change', patches: [{ op: 'remove', path }], message: message(hidden) } : { kind: 'change', patches: [{ op: 'add', path, value: true }], message: message(shown) };
}

export const toggleColumns = registerHandler(
  'grid.toggleColumns',
  ({ state }) => toggled(state.document, 'gridColumns', 'status.grid.columnsShown', 'status.grid.columnsHidden'),
  (state) => gridShown(state.document, 'gridColumns'),
);
export const toggleRows = registerHandler(
  'grid.toggleRows',
  ({ state }) => toggled(state.document, 'gridRows', 'status.grid.rowsShown', 'status.grid.rowsHidden'),
  (state) => gridShown(state.document, 'gridRows'),
);
export const toggleDots = registerHandler(
  'grid.toggleDots',
  ({ state }) => toggled(state.document, 'gridDots', 'status.grid.dotsShown', 'status.grid.dotsHidden'),
  (state) => gridShown(state.document, 'gridDots'),
);

// The grids' settings (spec workspace-settings-dialog): the page's `grid` holds those a person set in Guides & Grids;
// the others take their defaults of interactions.json. grid.setSettings keeps one setting of one grid, a number
// within its range (whole, for a count of columns); outside it, refused naming the setting and its range, and nothing
// changes (Problems in Pager 1: Pager clamped it silently). One undo step.
export function gridSetting(document: DocumentJson, grid: GridName, setting: string): number {
  const facts = settingOf(grid, setting);
  if (facts === undefined) throw new Error(`grid: the ${grid} grid has no setting ${setting}`);
  const held: unknown = (document.pages[0]?.tree.grid?.[grid] as Readonly<Record<string, number>> | undefined)?.[setting];
  return typeof held === 'number' ? held : numberConstant(facts.byDefault);
}

export const setGridSettings = registerHandler('grid.setSettings', ({ state, words }, { grid, setting, value }): Outcome<never> => {
  const facts = settingOf(grid, setting);
  const page = state.document.pages[0];
  if (facts === undefined) throw new Error(`grid: the ${grid} grid has no setting ${setting}`);
  if (page === undefined) throw new Error('grid: the document has no page');
  const label = words(facts.labelKey as MessageId);
  const [min, max] = pairConstant(facts.range);
  const next = setting === 'count' ? Math.round(value) : value;
  if (!Number.isFinite(next) || next < min || next > max) return { kind: 'refused', message: message('status.grid.outOfRange', { setting: label, min, max }) };
  const said = message('status.grid.set', { setting: label, value: next });
  const held = page.tree.grid;
  if (held?.[grid] !== undefined && (held[grid] as Readonly<Record<string, number>>)[setting] === next) return { kind: 'change', message: said };
  const settings = { ...held, [grid]: { ...held?.[grid], [setting]: next } };
  const path = ['pages', 0, 'tree', 'grid'];
  return { kind: 'change', patches: [held === undefined ? { op: 'add', path, value: settings } : { op: 'replace', path, value: settings }], message: said };
});

// The grids' lines in page px from the page's top-left corner, at the page's settings (the overlay draws them, the
// snapping pulls edges to them).
interface Columns {
  readonly count: number;
  readonly width: number;
  readonly gutter: number;
  readonly margin: number;
}

// the column bands across a page this wide
export function columnBands(pageWidth: number, grid: Columns): { readonly x: number; readonly width: number }[] {
  const inset = Math.max(grid.margin, (pageWidth - grid.width) / 2);
  const band = pageWidth - 2 * inset;
  const width = (band - grid.gutter * (grid.count - 1)) / grid.count;
  if (width <= 0) return [];
  return Array.from({ length: grid.count }, (_, i) => ({ x: inset + i * (width + grid.gutter), width }));
}

// each grid's settings now, by name (the defaults where the page sets none)
const settingsNow = (document: DocumentJson, grid: GridName): Readonly<Record<string, number>> => Object.fromEntries(settingsOf(grid).map(([name]) => [name, gridSetting(document, grid, name)]));
export const columnsOf = (document: DocumentJson): Columns => settingsNow(document, 'columns') as unknown as Columns;
export const rowsOf = (document: DocumentJson): { readonly height: number; readonly gutter: number } => settingsNow(document, 'rows') as unknown as { height: number; gutter: number };
export const dotsOf = (document: DocumentJson): { readonly spacing: number } => settingsNow(document, 'dots') as unknown as { spacing: number };

// the row bands down a page this tall: each band's top
export function rowBands(pageHeight: number, height: number, gutter: number): number[] {
  const tops: number[] = [];
  if (!(height + gutter > 0)) return tops;
  for (let y = 0; y < pageHeight; y += height + gutter) tops.push(y);
  return tops;
}
