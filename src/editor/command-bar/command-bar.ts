// The command bar (ARCHITECTURE.md; spec command-bar; DESIGN.md `command-palette`): commandBar.open shows it and
// ui.dismiss closes it (menus/overlays.ts). What it offers is the manifest's command-bar doors, one entry per door, but
// an insert door gives one entry per palette entry and an open-panel door one per panel the shell draws a body for;
// commands first, then insert, open panel, set property and edit property, each group in the order of the command
// files. An entry is offered only while its door is built and its command can run on the selection. The query filters
// and ranks them (matchScore): each word of the query matches a word of the label from its start, anywhere in it, the
// initials of its words; the recently run entries come first while the query is empty.
import { registerHandler } from '../../core/commands/registry.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import type { EditorUi } from '../state.ts';

export const openCommandBar = registerHandler<'commandBar.open', EditorUi>('commandBar.open', ({ state }) => (state.ui.commandBar === true ? { kind: 'change' } : { kind: 'change', ui: { ...state.ui, commandBar: true } }));

const constant = (id: string): number => {
  const value = manifest.interactions.constants.find((c) => c.id === id)?.value;
  if (typeof value !== 'number') throw new Error(`interactions.json has no number ${id}`);
  return value;
};
export const MAX_RESULTS = constant('commandBar.maxResults');
export const RECENT_COUNT = constant('commandBar.recentCount');

export type EntryKind = 'command' | 'insert' | 'open-panel' | 'set-property' | 'edit-property';
const KIND_ORDER: readonly EntryKind[] = ['command', 'insert', 'open-panel', 'set-property', 'edit-property'];
// a scope typed before the query keeps one kind of entry (DESIGN.md: Commands >, Insert +, Panels /, Properties #)
const SCOPES: Readonly<Record<string, readonly EntryKind[]>> = { '>': ['command'], '+': ['insert'], '/': ['open-panel'], '#': ['set-property', 'edit-property'] };
export const SCOPE_PREFIXES = Object.keys(SCOPES);

// the command-bar doors, grouped by kind in the bar's order, each group in the order of the command files
export const BAR_DOORS: readonly DoorEntry[] = KIND_ORDER.flatMap((kind) => manifest.doors.filter((d) => d.door.kind === 'command-bar' && d.door.entry === kind));
export const kindOf = (entry: DoorEntry): EntryKind => (entry.door.kind === 'command-bar' ? entry.door.entry : 'command');

// An entry the bar can list: its door, the arguments the entry adds to the door's, and its label as shown.
export interface BarEntry {
  readonly entry: DoorEntry;
  readonly args: Readonly<Record<string, unknown>>;
  readonly label: string;
  readonly key: string;
}
export const entryKey = (entry: DoorEntry, args: Readonly<Record<string, unknown>>): string => `${entry.ref} ${JSON.stringify(args)}`;

// the text as matched: lower case, without accents
const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const wordsOf = (text: string): string[] => fold(text).split(/[^\p{L}\p{N}]+/u).filter((w) => w !== '');

// How well a query matches a label: null when a word of the query matches nothing; higher is better. The words of the
// query match in any order ("hero insert" finds "Insert Hero"), each from the start of a word of the label ("ins"),
// anywhere in the label, or as the initials of its words ("wiar" finds "Wrap in a row").
export function matchScore(query: string, label: string): number | null {
  const words = wordsOf(query);
  if (words.length === 0) return 0;
  const labelWords = wordsOf(label);
  const text = labelWords.join(' ');
  const initials = labelWords.map((w) => w[0] ?? '').join('');
  let score = 0;
  for (const word of words) {
    if (labelWords.some((w) => w.startsWith(word))) score += 4;
    else if (text.includes(word)) score += 3;
    else if (word.length > 1 && initials.includes(word)) score += 2;
    else return null;
  }
  // the label that starts as the query does comes first
  const first = words[0];
  return first !== undefined && text.startsWith(first) ? score + 1 : score;
}

// The entries a query shows, at most MAX_RESULTS: a scope prefix keeps its kind; with no words, the recently run
// entries (newest first) before the others in the bar's order; otherwise the best matches, ties in the bar's order.
export function shownEntries(query: string, offered: readonly BarEntry[], recent: readonly string[]): BarEntry[] {
  const trimmed = query.trimStart();
  const scope = SCOPES[trimmed.charAt(0)];
  const pool = scope ? offered.filter((e) => scope.includes(kindOf(e.entry))) : offered;
  const words = scope ? trimmed.slice(1) : trimmed;
  if (wordsOf(words).length === 0) {
    const first = recent.slice(0, RECENT_COUNT).flatMap((key) => pool.filter((e) => e.key === key));
    return [...first, ...pool.filter((e) => !first.includes(e))].slice(0, MAX_RESULTS);
  }
  return pool
    .flatMap((e, index) => {
      const score = matchScore(words, e.label);
      return score === null ? [] : [{ e, score, index }];
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_RESULTS)
    .map(({ e }) => e);
}

// The entries run from the bar in this session, the newest first: a view's memory, like a menu's open item, not the
// editor's state (nothing else reads it).
const ran: string[] = [];
export const recentEntries = (): readonly string[] => ran;
export function remember(key: string): void {
  const at = ran.indexOf(key);
  if (at >= 0) ran.splice(at, 1);
  ran.unshift(key);
  ran.length = Math.min(ran.length, RECENT_COUNT);
}
