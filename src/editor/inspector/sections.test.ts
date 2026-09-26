import { describe, expect, it } from 'vitest';
import { manualClock } from '../../core/ports/clock.ts';
import { sequentialIds } from '../../core/ports/ids.ts';
import type { MessageId } from '../../generated/ids.ts';
import { translate } from '../../i18n/index.ts';
import type { PreferenceStorage } from '../preferences/preferences.ts';
import { createEditorStore } from '../store.ts';
import { collapsedSections, summaryOf, summaryProperties } from './sections.ts';

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
const store = (storage = memory()) => createEditorStore({ storage, ids: sequentialIds('n'), clock: manualClock() });
const words = (key: MessageId, params?: Readonly<Record<string, string | number>>) => translate('en', key, params);

describe('collapsed sections (inspector/sections.ts)', () => {
  it('collapses and expands a section, the same for every element, recording nothing and leaving the document', () => {
    const s = store();
    const before = s.getState();
    expect(collapsedSections(s.getState().ui)).toEqual([]);
    s.dispatch('inspector.toggleSection', { section: 'space' });
    expect(collapsedSections(s.getState().ui)).toEqual(['space']);
    const root = s.getState().document.pages[0]?.tree.id ?? '';
    s.dispatch('selection.select', { target: root });
    expect(collapsedSections(s.getState().ui)).toEqual(['space']);
    // kept in the sections' order, whatever the order of the clicks
    s.dispatch('inspector.toggleSection', { section: 'text' });
    s.dispatch('inspector.toggleSection', { section: 'layout' });
    expect(collapsedSections(s.getState().ui)).toEqual(['layout', 'space', 'text']);
    s.dispatch('inspector.toggleSection', { section: 'space' });
    s.dispatch('inspector.toggleSection', { section: 'text' });
    s.dispatch('inspector.toggleSection', { section: 'layout' });
    expect(collapsedSections(s.getState().ui)).toEqual([]);
    expect(s.getState().ui.preferences).toEqual({ locale: 'en', theme: 'dark' });
    expect(s.getState().document).toBe(before.document);
    expect(s.getState().history).toBe(before.history);
  });

  it('keeps the collapsed sections in the preferences after a reload, and leaves out what is no section', () => {
    const storage = memory();
    const first = store(storage);
    first.dispatch('inspector.toggleSection', { section: 'text' });
    first.dispatch('inspector.toggleSection', { section: 'space' });
    expect(JSON.parse(storage.text ?? '')).toEqual({ locale: 'en', theme: 'dark', collapsedSections: ['space', 'text'] });
    expect(collapsedSections(store(storage).getState().ui)).toEqual(['space', 'text']);
    const odd = store(memory('{"locale":"en","theme":"dark","collapsedSections":["nope","paint",3]}'));
    expect(collapsedSections(odd.getState().ui)).toEqual(['paint']);
  });

  it('takes only a section of the inspector', () => {
    const s = store();
    expect(() => s.dispatch('inspector.toggleSection', { section: 'nope' })).toThrow(/the inspector has no section nope/);
    expect(collapsedSections(s.getState().ui)).toEqual([]);
  });
});

describe('the summary of a collapsed section (inspector/sections.ts)', () => {
  // the values a section reads, by the longhands it names (properties.json sections[].summary)
  const values = (section: Parameters<typeof summaryProperties>[0], given: readonly string[]) => Object.fromEntries(summaryProperties(section).map((p, i) => [p, given[i] ?? '']));
  const summary = (section: Parameters<typeof summaryProperties>[0], given: readonly string[]) => summaryOf(section, values(section, given), words, 'en');

  it('reads the properties and the longhands of the composites its section names, in order', () => {
    expect(summaryProperties('space')).toEqual(['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
    expect(summaryProperties('size')).toEqual(['width', 'height']);
    expect(summaryProperties('content')).toEqual([]);
  });

  it('writes each section as its values say', () => {
    expect(summary('layout', ['block', 'row'])).toBe('block');
    expect(summary('layout', ['flex', 'column'])).toBe('flex · column');
    expect(summary('space', ['0px', '0px', '0px', '0px', '56px', '40px', '56px', '40px'])).toBe('P 56px 40px');
    expect(summary('space', ['16px', '0px', '16px', '0px', '0px', '0px', '0px', '0px'])).toBe('M 16px 0px');
    expect(summary('space', ['8px', '8px', '8px', '8px', '4px', '2px', '1px', '3px'])).toBe('M 8px · P 4px 2px 1px 3px');
    expect(summary('space', ['0px', '0px', '0px', '0px', '0px', '0px', '0px', '0px'])).toBe('None');
    expect(summary('size', ['auto', '120px'])).toBe('auto × 120px');
    expect(summary('position', ['static', 'auto'])).toBe('static · z auto');
    expect(summary('paint', ['rgba(0, 0, 0, 0)'])).toBe('None');
    expect(summary('paint', ['rgb(255, 0, 0)'])).toBe('rgb(255, 0, 0)');
    const noBorder = [...Array<string>(4).fill('0px'), ...Array<string>(4).fill('none'), ...Array<string>(4).fill('0px')];
    expect(summary('border', noBorder)).toBe('None');
    expect(summary('border', [...Array<string>(4).fill('1px'), ...Array<string>(4).fill('solid'), ...Array<string>(4).fill('4px')])).toBe('1px solid · R 4px');
    expect(summary('border', [...Array<string>(4).fill('0px'), ...Array<string>(4).fill('none'), ...Array<string>(4).fill('4px')])).toBe('R 4px');
    expect(summary('text', ['16px', '400'])).toBe('16px · 400');
    expect(summary('effects', ['1', 'none', 'none', 'none', 'none', 'none', 'none'])).toBe('None');
    expect(summary('effects', ['0.5', 'none', 'none', 'none', 'none', 'none', 'none'])).toBe('1 effect');
    expect(summary('effects', ['0.5', 'rgb(0, 0, 0) 1px 1px 2px 0px', 'none', 'none', 'none', 'none', 'none'])).toBe('2 effects');
  });

  it('has none for a section without a summary, or when the page draws no element', () => {
    expect(summaryOf('content', {}, words, 'en')).toBeNull();
    expect(summaryOf('size', null, words, 'en')).toBeNull();
  });
});
