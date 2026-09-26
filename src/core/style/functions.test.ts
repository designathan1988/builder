import { describe, expect, it } from 'vitest';
import { withBareUnit, withFunction } from './functions.ts';

// spec inspector-number-fields, Problems in Pager 4 (the audit's A3.32): a bare number takes its function's unit
describe('withBareUnit', () => {
  it('gives a bare number its function\'s unit', () => {
    expect(withBareUnit('brightness', '50')).toBe('50%');
    expect(withBareUnit('blur', '4')).toBe('4px');
    expect(withBareUnit('hue-rotate', '-90')).toBe('-90deg');
    expect(withBareUnit('skewX', '.5')).toBe('.5deg');
  });
  it('keeps a number that has a unit, a function without a unit, and anything else', () => {
    expect(withBareUnit('brightness', '1.2')).toBe('1.2%');
    expect(withBareUnit('brightness', '120%')).toBe('120%');
    expect(withBareUnit('scale', '2')).toBe('2');
    expect(withBareUnit('blur', 'calc(2px + 1px)')).toBe('calc(2px + 1px)');
  });
  it('is what withFunction writes', () => {
    expect(withFunction('blur(4px)', 'brightness', '50')).toBe('blur(4px) brightness(50%)');
  });
});
