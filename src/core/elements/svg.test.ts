import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import { rulesFromManifest } from '../document/validate.ts';
import type { DocNode } from '../document/model.ts';
import { geometryAttributes, resizedShape, sanitizedSvgMarkup, shapeBox, shapeGeometry, viewBoxOf } from './svg.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const RESIZE = 'geometry.resize';
const node = (over: Partial<DocNode>): DocNode => ({ id: 'n', type: 'rectangle', name: 'Rectangle', tag: 'rect', attributes: {}, classes: [], styles: {}, text: null, children: [], ...over }) as DocNode;

describe('sanitizedSvgMarkup', () => {
  it('keeps elements, attributes and text as written', () => {
    expect(sanitizedSvgMarkup('<path d="M0 0L10 10" fill="red"/><text x=\'2\'>Hi</text>')).toEqual({ markup: '<path d="M0 0L10 10" fill="red"/><text x="2">Hi</text>' });
  });
  it('takes scripts, foreign objects, event attributes and script addresses away', () => {
    const kept = sanitizedSvgMarkup('<script>alert(1)</script><g onclick="x()"><a href=" JavaScript:alert(1)"><circle r="2"/></a></g><foreignObject><div>html</div></foreignObject>');
    expect(kept).toEqual({ markup: '<g><a><circle r="2"/></a></g>' });
  });
  it('keeps an icon pasted with its own svg element', () => {
    expect(sanitizedSvgMarkup('<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>')).toEqual({ markup: '<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>' });
  });
  it('refuses markup that is not well formed, naming why', () => {
    expect(sanitizedSvgMarkup('<g><path d="M0 0"/>')).toEqual({ refusal: { key: 'status.svg.unclosed', params: { tag: 'g' } } });
    expect(sanitizedSvgMarkup('<g></path>')).toEqual({ refusal: { key: 'status.svg.unmatched', params: { tag: 'path' } } });
    expect(sanitizedSvgMarkup('<path d="M0 0/>')).toEqual({ refusal: { key: 'status.svg.broken', params: {} } });
  });
});

describe('the SVG and its shapes', () => {
  const base = RULES.base;
  const sized = (width: string, height: string) => ({ [base.breakpoint]: { [base.state]: { [RULES.boxSize[0] ?? '']: width, [RULES.boxSize[1] ?? '']: height } } });
  it('draws in its own px size', () => {
    expect(viewBoxOf(node({ type: 'svg', tag: 'svg', styles: sized('160px', '100px') }), RULES)).toBe('0 0 160 100');
    expect(viewBoxOf(node({ type: 'svg', tag: 'svg', styles: sized('50%', '100px') }), RULES)).toBeNull();
  });
  it('places a new shape an eighth of the smaller side in from the edges', () => {
    const rect = geometryAttributes(RULES, 'rectangle', RESIZE);
    expect(Object.values(shapeGeometry('rect', rect, { width: 160, height: 80 }))).toEqual([10, 10, 140, 60]);
    const ellipse = geometryAttributes(RULES, 'ellipse', RESIZE);
    expect(Object.values(shapeGeometry('ellipse', ellipse, { width: 32, height: 32 }))).toEqual([16, 16, 12, 12]);
    const line = geometryAttributes(RULES, 'line', RESIZE);
    expect(Object.values(shapeGeometry('line', line, { width: 32, height: 32 }))).toEqual([4, 28, 28, 4]);
  });
  it('resizes a shape through its own geometry, a line keeping its direction', () => {
    const line = geometryAttributes(RULES, 'line', RESIZE);
    const drawn = node({ type: 'line', tag: 'line', attributes: Object.fromEntries(line.map((id, i) => [id, [4, 28, 28, 4][i] ?? 0])) });
    expect(shapeBox(drawn, line)).toEqual({ x: 4, y: 4, width: 24, height: 24 });
    expect(Object.values(resizedShape(drawn, line, { x: 4, y: 4, width: 40, height: 24 }) ?? {})).toEqual([4, 28, 44, 4]);
    const ellipse = geometryAttributes(RULES, 'ellipse', RESIZE);
    const round = node({ type: 'ellipse', tag: 'ellipse', attributes: Object.fromEntries(ellipse.map((id, i) => [id, [16, 16, 12, 12][i] ?? 0])) });
    expect(Object.values(resizedShape(round, ellipse, { x: 4, y: 4, width: 30, height: 24 }) ?? {})).toEqual([19, 16, 15, 12]);
  });
  it('lets shapes live only inside an SVG, and an SVG hold only shapes', () => {
    expect(RULES.contentModel.names('svg', 'rect')).toBe(true);
    expect(RULES.contentModel.parentsOf('ellipse')).toEqual(['svg']);
    expect(RULES.contentModel.refusal('svg', 'div')).toEqual(['rect', 'ellipse', 'line']);
    expect(RULES.contentModel.refusal('div', 'rect')).toBeNull();
  });
});
