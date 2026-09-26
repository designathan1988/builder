// The command bar's query (spec command-bar, Problems in Pager 3): the words of a query match in any order, from the
// start of a word, anywhere or as initials; a scope prefix keeps one kind of entry; with no words the recently run
// entries come first; at most commandBar.maxResults are shown.
import { describe, expect, it } from 'vitest';
import { BAR_DOORS, MAX_RESULTS, entryKey, kindOf, matchScore, shownEntries, type BarEntry } from './command-bar.ts';

const command = BAR_DOORS.find((d) => kindOf(d) === 'command');
const insert = BAR_DOORS.find((d) => kindOf(d) === 'insert');
if (command === undefined || insert === undefined) throw new Error('the manifest has no command or insert entry');
const entry = (label: string, door = command, args: Readonly<Record<string, unknown>> = { label }): BarEntry => ({ entry: door, args, label, key: entryKey(door, args) });

describe('matchScore', () => {
  it('matches the words of the query in any order, from the start of a word', () => {
    expect(matchScore('insert hero', 'Insert Hero')).not.toBeNull();
    expect(matchScore('hero insert', 'Insert Hero')).not.toBeNull();
    expect(matchScore('ins hero', 'Insert Hero')).not.toBeNull();
  });
  it('matches a word anywhere in the label, or the initials of its words', () => {
    expect(matchScore('wrap', 'Remove wrapper')).not.toBeNull();
    expect(matchScore('wiar', 'Wrap in a row')).not.toBeNull();
  });
  it('refuses a label that one word of the query does not match', () => {
    expect(matchScore('insert footer', 'Insert Hero')).toBeNull();
    expect(matchScore('zz', 'Wrap in a row')).toBeNull();
  });
  it('ignores case and accents', () => {
    expect(matchScore('ÉLÉMENT', 'element')).not.toBeNull();
  });
  it('ranks a word start above a match inside a word, and a label starting as the query first', () => {
    const start = matchScore('wrap', 'Wrap in a row') ?? 0;
    const inside = matchScore('wrap', 'Remove wrapper') ?? 0;
    expect(start).toBeGreaterThan(inside);
  });
});

describe('shownEntries', () => {
  const offered = [entry('Wrap in a row'), entry('Wrap in a column'), entry('Remove wrapper'), entry('Insert Hero', insert, { entry: 'template-hero' }), entry('Duplicate')];
  it('lists the best matches first, ties in the bar order', () => {
    expect(shownEntries('wrap', offered, []).map((e) => e.label)).toEqual(['Wrap in a row', 'Wrap in a column', 'Remove wrapper']);
  });
  it('keeps one kind of entry after a scope prefix', () => {
    expect(shownEntries('+hero', offered, []).map((e) => e.label)).toEqual(['Insert Hero']);
    expect(shownEntries('>hero', offered, [])).toEqual([]);
  });
  it('lists the recently run entries first while the query is empty', () => {
    const duplicate = offered[4] as BarEntry;
    expect(shownEntries('', offered, [duplicate.key]).map((e) => e.label)).toEqual(['Duplicate', 'Wrap in a row', 'Wrap in a column', 'Remove wrapper', 'Insert Hero']);
  });
  it('shows at most commandBar.maxResults entries', () => {
    const many = Array.from({ length: MAX_RESULTS + 5 }, (_, i) => entry(`Wrap ${i}`));
    expect(shownEntries('wrap', many, [])).toHaveLength(MAX_RESULTS);
    expect(shownEntries('', many, [])).toHaveLength(MAX_RESULTS);
  });
});
