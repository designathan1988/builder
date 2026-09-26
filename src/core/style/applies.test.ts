import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { DocNode } from '../document/model.ts';
import { rulesFromManifest } from '../document/validate.ts';
import { elementPredicate, kindsOf, shownForKinds } from './applies.ts';
import { codecOf } from './codecs.ts';
import { factsOf } from './set.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const node = (type: string, tag: string | null = null): DocNode => ({ id: type as NodeId, type: type as DocNode['type'], name: type, tag: tag as DocNode['tag'], attributes: {}, classes: [], styles: {}, text: null, children: [] });

describe('the element predicates (spec props-element-specific)', () => {
  it('reads a kind from the tag the element is written with', () => {
    expect(elementPredicate('list', node('list', 'ul'), RULES)).toBe(true);
    expect(elementPredicate('list', node('listItem', 'li'), RULES)).toBe(true);
    expect(elementPredicate('list', node('section', 'section'), RULES)).toBe(false);
    // a list switched to an ordered list is still a list; a section switched to an article is not one
    expect(elementPredicate('list', node('list', 'ol'), RULES)).toBe(true);
    // with no tag of its own, the type's
    expect(elementPredicate('table', node('table'), RULES)).toBe(true);
    expect(elementPredicate('tableOrCaption', node('caption', 'caption'), RULES)).toBe(true);
    expect(elementPredicate('table', node('caption', 'caption'), RULES)).toBe(false);
  });

  it('shows the media properties only on the replaced elements they act on (Problems in Pager 1)', () => {
    expect(elementPredicate('media', node('image', 'img'), RULES)).toBe(true);
    expect(elementPredicate('media', node('video', 'video'), RULES)).toBe(true);
    expect(elementPredicate('media', node('picture', 'picture'), RULES)).toBe(false);
    expect(elementPredicate('media', node('svg', 'svg'), RULES)).toBe(false);
  });

  it('shows the form properties only on the controls Chrome styles with them (Problems in Pager 2)', () => {
    expect(elementPredicate('formControl', node('input', 'input'), RULES)).toBe(true);
    expect(elementPredicate('formControl', node('select', 'select'), RULES)).toBe(true);
    expect(elementPredicate('formControl', node('option', 'option'), RULES)).toBe(false);
    expect(elementPredicate('textInput', node('textarea', 'textarea'), RULES)).toBe(true);
    expect(elementPredicate('textInput', node('select', 'select'), RULES)).toBe(false);
    expect(elementPredicate('textarea', node('input', 'input'), RULES)).toBe(false);
  });

  it('answers what an element holds, and nothing for a predicate that reads more than the element', () => {
    expect(elementPredicate('text', node('paragraph', 'p'), RULES)).toBe(true);
    expect(elementPredicate('text', node('image', 'img'), RULES)).toBe(false);
    expect(elementPredicate('svgShape', node('rectangle', 'rect'), RULES)).toBe(true);
    expect(elementPredicate('hasBox', node('rectangle', 'rect'), RULES)).toBe(false);
    expect(elementPredicate('flexContainer', node('div', 'div'), RULES)).toBeNull();
    expect(elementPredicate('always', node('div', 'div'), RULES)).toBeNull();
  });

  it('shows a kind of field only while every selected element is of that kind', () => {
    const list = node('list', 'ul');
    const item = node('listItem', 'li');
    const table = node('table', 'table');
    expect(kindsOf([list, item], RULES)).toEqual(['list']);
    expect(kindsOf([list, table], RULES)).toEqual([]);
    expect(kindsOf([], RULES)).toEqual([]);
    expect(shownForKinds(['list-style-type'], kindsOf([list], RULES), RULES)).toBe(true);
    expect(shownForKinds(['list-style-type'], kindsOf([list, table], RULES), RULES)).toBe(false);
    expect(shownForKinds(['border-collapse'], kindsOf([list], RULES), RULES)).toBe(false);
    expect(shownForKinds(['caption-side'], kindsOf([table], RULES), RULES)).toBe(true);
    // a property of any other predicate always shows, a selection or none
    expect(shownForKinds(['width', 'color', 'justify-content'], [], RULES)).toBe(true);
  });
});

// what a property's codec writes for a typed text, against what the property offers; null when it reads nothing
const written = (property: string, text: string): string | null => {
  const codec = codecOf(RULES.propertyFacts.get(property)?.codec ?? '');
  if (codec === null) throw new Error(`no codec for ${property}`);
  const value = codec.read(text, factsOf(property, RULES));
  return value === null ? null : codec.write(value);
};

describe('the codecs of the element-specific properties', () => {
  it('length-pair: one or two lengths, a bare number in px, no percentage (Problems in Pager 4)', () => {
    expect(written('border-spacing', '4 8')).toBe('4px 8px');
    expect(written('border-spacing', '6')).toBe('6px');
    expect(written('border-spacing', '2px 2px')).toBe('2px');
    expect(written('border-spacing', '10%')).toBeNull();
    expect(written('border-spacing', '1px 2px 3px')).toBeNull();
    expect(written('border-spacing', 'wide')).toBeNull();
  });

  it('counter-style: a keyword, any counter style name, or a string (Problems in Pager 6)', () => {
    expect(written('list-style-type', 'None')).toBe('none');
    expect(written('list-style-type', 'upper-greek')).toBe('upper-greek');
    expect(written('list-style-type', '"- "')).toBe('"- "');
    expect(written('list-style-type', '12px')).toBeNull();
    expect(written('list-style-type', '"open')).toBeNull();
  });

  it('image: none, a gradient or an address written url(), never a script (Problems in Pager 5)', () => {
    expect(written('list-style-image', 'none')).toBe('none');
    expect(written('list-style-image', 'linear-gradient(red, blue)')).toBe('linear-gradient(red, blue)');
    expect(written('list-style-image', 'marker.png')).toBe('url("marker.png")');
    expect(written('list-style-image', 'javascript:alert(1)')).toBeNull();
  });
});
