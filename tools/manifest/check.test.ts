import { describe, expect, it } from 'vitest';
import { RULES, checkManifest, htmlRefusal, normaliseChord } from '../../src/manifest/check.ts';
import { createCssMatcher } from '../../src/manifest/css.ts';
import { generatedCssSchema, generatedHtmlSchema } from '../../src/manifest/schema.ts';
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

  it('has the planted fixtures of the property model, each on its own rule', () => {
    const rules = new Map(PLANTS.map((p) => [p.id, p.rule]));
    expect({
      'keyword-rejected-by-syntax': rules.get('keyword-rejected-by-syntax'),
      'door-writes-shorthand': rules.get('door-writes-shorthand'),
      'handle-writes-transform': rules.get('handle-writes-transform'),
      'coupling-unknown-predicate': rules.get('coupling-unknown-predicate'),
      'field-without-consumer': rules.get('field-without-consumer'),
      'field-holds-expression': rules.get('field-holds-expression'),
      'reference-not-planned': rules.get('reference-not-planned'),
    }).toEqual({
      'keyword-rejected-by-syntax': 'css-syntax',
      'door-writes-shorthand': 'shorthand-write',
      'handle-writes-transform': 'individual-transform',
      'coupling-unknown-predicate': 'coupling',
      'field-without-consumer': 'consumer',
      'field-holds-expression': 'no-logic',
      'reference-not-planned': 'reference',
    });
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

describe('generated web data', () => {
  const css = generatedCssSchema.parse(loaded.input.files['generated/css-properties.json']);
  const html = generatedHtmlSchema.parse(loaded.input.files['generated/html-elements.json']);
  const matcher = createCssMatcher({
    properties: Object.fromEntries(Object.entries(css.properties).map(([name, p]) => [name, p.syntax])),
    types: css.types,
  });

  it('matches values against the official syntax with CSSTree', () => {
    expect(matcher.matchEither('display', 'flex')).toEqual({ ok: true, by: 'official' });
    expect(matcher.matchEither('rotate', '45deg')).toEqual({ ok: true, by: 'official' });
    expect(matcher.matchEither('color', 'oklch(70% 0.15 260)')).toEqual({ ok: true, by: 'official' });
    expect(matcher.matchEither('display', 'flexbox').ok).toBe(false);
    expect(matcher.matchEither('width', '10 px').ok).toBe(false);
  });

  it('falls back to the syntax browsers implement only where the official grammar is incomplete', () => {
    expect(matcher.match('fill', '#dbe7ff')).not.toBeNull();
    expect(matcher.matchEither('fill', '#dbe7ff')).toEqual({ ok: true, by: 'implemented' });
  });

  it('records shorthands with their expanded longhands', () => {
    expect(css.properties.gap?.longhands).toEqual(['row-gap', 'column-gap']);
    expect(css.properties.border?.longhands).toHaveLength(12);
    expect(css.properties['row-gap']?.longhands).toEqual([]);
  });

  it('refuses an HTML placement the content model does not permit', () => {
    expect(htmlRefusal(html, 'ul', 'li')).toBeNull();
    expect(htmlRefusal(html, 'table', 'caption')).toBeNull();
    expect(htmlRefusal(html, 'summary', 'p')).not.toBeNull();
    expect(htmlRefusal(html, 'div', 'li')).not.toBeNull();
    expect(htmlRefusal(html, 'img', 'span')).not.toBeNull();
    expect(htmlRefusal(html, 'form', 'form')).not.toBeNull();
    expect(htmlRefusal(html, 'button', 'a')).not.toBeNull();
  });
});
