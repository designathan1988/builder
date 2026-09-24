import { describe, expect, it } from 'vitest';
import { RULES, checkManifest, normaliseChord } from '../../src/manifest/check.ts';
import { loadManifest } from './load.ts';
import { PLANTS, planted } from './plants.ts';

const loaded = loadManifest();

describe('manifest:check', () => {
  it('passes on the real manifest', () => {
    expect(loaded.problems).toEqual([]);
    const result = checkManifest(loaded.input);
    expect(result.problems).toEqual([]);
    expect(result.summary?.features).toBe(179);
  });

  it('has a planted fixture for every rule', () => {
    const planted = new Set(PLANTS.map((p) => p.rule));
    expect(RULES.filter((rule) => !planted.has(rule))).toEqual([]);
  });

  it.each(PLANTS.map((p) => [p.id, p] as const))('fails on the planted fixture "%s", and only on its rule', (_id, plant) => {
    const { problems } = checkManifest(planted(loaded.input, plant));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.rule)).toEqual(problems.map(() => plant.rule));
  });

  it('never changes the real manifest when planting', () => {
    for (const plant of PLANTS) planted(loaded.input, plant);
    expect(checkManifest(loaded.input).problems).toEqual([]);
  });
});

describe('normaliseChord', () => {
  it('treats modifier order and letter case as the same chord', () => {
    expect(normaliseChord('Shift+Ctrl+z')).toBe('Ctrl+Shift+Z');
    expect(normaliseChord('Ctrl+Shift+Z')).toBe('Ctrl+Shift+Z');
    expect(normaliseChord('Alt+Shift+ArrowRight')).toBe('Alt+Shift+ArrowRight');
  });

  it('reads a plus key and punctuation keys', () => {
    expect(normaliseChord('Ctrl++')).toBe('Ctrl++');
    expect(normaliseChord('Ctrl+=')).toBe('Ctrl+=');
    expect(normaliseChord("Ctrl+'")).toBe("Ctrl+'");
    expect(normaliseChord('Ctrl+\\')).toBe('Ctrl+\\');
  });

  it('refuses what is not a chord', () => {
    expect(normaliseChord('Ctrl+')).toBeNull();
    expect(normaliseChord('Hyper+A')).toBeNull();
    expect(normaliseChord('Ctrl+Ctrl+A')).toBeNull();
    expect(normaliseChord('Arrowup')).toBeNull();
  });
});
