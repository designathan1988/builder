// A shadow typed as CSS text (spec shadow-editor, Problems in Pager 4): editedLayers reads each comma-separated layer's
// lengths as X, Y, blur and spread, `inset`, and the rest as its colour; an empty text takes every layer away; a text
// that makes no layer is refused.
import { describe, expect, it } from 'vitest';
import type { StructureField } from '../document/validate.ts';
import { editedLayers } from './shadows.ts';

const TEXT: readonly StructureField[] = [
  { id: 'color', type: 'color' },
  { id: 'offsetX', type: 'length' },
  { id: 'offsetY', type: 'length' },
  { id: 'blur', type: 'length' },
  { id: 'hidden', type: 'boolean' },
] as unknown as readonly StructureField[];
const BOX: readonly StructureField[] = [...TEXT, { id: 'spread', type: 'length' }, { id: 'inset', type: 'boolean' }] as unknown as readonly StructureField[];

describe('a shadow typed as CSS', () => {
  it('reads X, Y and blur, a bare number as px, and the colour', () => {
    expect(editedLayers([], TEXT, { css: '0 1px 2px #000' })).toEqual({ layers: [{ color: '#000', offsetX: '0px', offsetY: '1px', blur: '2px', hidden: false }] });
  });
  it('reads each comma-separated layer, a colour with commas in it whole', () => {
    expect(editedLayers([], TEXT, { css: '1px 1px rgba(0, 0, 0, 0.5), 0 0 4px red' })).toEqual({
      layers: [
        { color: 'rgba(0, 0, 0, 0.5)', offsetX: '1px', offsetY: '1px', blur: '0px', hidden: false },
        { color: 'red', offsetX: '0px', offsetY: '0px', blur: '4px', hidden: false },
      ],
    });
  });
  it('reads inset and the spread of a box shadow, and currentcolor when no colour is typed', () => {
    expect(editedLayers([], BOX, { css: 'inset 0 2px 4px 1px' })).toEqual({ layers: [{ color: 'currentcolor', offsetX: '0px', offsetY: '2px', blur: '4px', hidden: false, spread: '1px', inset: true }] });
  });
  it('takes every layer away when emptied', () => {
    expect(editedLayers([{ color: 'red', offsetX: '1px', offsetY: '1px', blur: '0px', hidden: false }], TEXT, { css: '  ' })).toEqual({ layers: [] });
  });
  it('refuses a text with fewer than two lengths, too many, or a negative blur', () => {
    expect(editedLayers([], TEXT, { css: 'abc' })).toEqual({ refused: 'css' });
    expect(editedLayers([], TEXT, { css: '1px 2px 3px 4px red' })).toEqual({ refused: 'css' });
    expect(editedLayers([], TEXT, { css: '1px 2px -3px red' })).toEqual({ refused: 'css' });
  });
});
