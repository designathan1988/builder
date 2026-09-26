import { describe, expect, it } from 'vitest';
import { channelText, editedColour, inSrgbGamut, parseColor, parseSrgb, toOklab } from './color.ts';

const rgb = (text: string) => parseColor(text);

describe('parseColor reads every CSS colour syntax as the picker shows it', () => {
  it('reads hex with 3, 4, 6 and 8 digits', () => {
    expect(rgb('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(rgb('#0f172a80')).toEqual({ r: 15, g: 23, b: 42, a: 0.5 });
    expect(rgb('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 0.53 });
  });
  it('reads rgb(), hsl() and hwb() in the modern and the legacy syntax', () => {
    expect(rgb('rgb(10 20 30 / 50%)')).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(rgb('rgba(10, 20, 30, 0.25)')).toEqual({ r: 10, g: 20, b: 30, a: 0.25 });
    expect(rgb('hsl(120 100% 50%)')).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(rgb('hsla(0, 100%, 50%, 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(rgb('hwb(240 0% 0%)')).toEqual({ r: 0, g: 0, b: 255, a: 1 });
  });
  it('reads lab(), lch(), oklab(), oklch() and color()', () => {
    expect(rgb('lab(54.29 80.8 69.89)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(rgb('lch(54.29 106.84 40.85)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(rgb('oklab(62.8% 0.2249 0.1258)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(rgb('oklch(0.628 0.2577 29.23)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(rgb('color(srgb 1 0 0 / 0.5)')).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(rgb('color(display-p3 1 0 0)')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });
  it('reads no named colour (the page computes it) and nothing that is no colour', () => {
    expect(rgb('rebeccapurple')).toBeNull();
    expect(rgb('notacolour')).toBeNull();
    expect(rgb('oklch(70% 0.15)')).toBeNull();
  });
});

describe('outside sRGB', () => {
  it('tells a colour sRGB cannot show', () => {
    expect(inSrgbGamut(parseSrgb('color(display-p3 1 0 0)') ?? { r: 0, g: 0, b: 0, a: 1 })).toBe(false);
    expect(inSrgbGamut(parseSrgb('oklch(70% 0.15 260)') ?? { r: 0, g: 0, b: 0, a: 1 })).toBe(true);
    expect(inSrgbGamut(parseSrgb('oklch(70% 0.4 150)') ?? { r: 0, g: 0, b: 0, a: 1 })).toBe(false);
  });
});

describe('OKLCH and OKLab channels', () => {
  it('show the channels of the same colour the other formats show', () => {
    const red = parseColor('#ff0000') ?? { r: 0, g: 0, b: 0, a: 1 };
    expect(channelText(red, 'ok-l')).toBe('62.8');
    expect(channelText(red, 'ok-c')).toBe('0.2577');
    expect(channelText(red, 'ok-h')).toBe('29.23');
    expect(channelText(red, 'ok-a')).toBe('0.2249');
    expect(channelText(red, 'ok-b')).toBe('0.1258');
  });
  it('write the colour in their space, kept outside sRGB, and refuse a value out of range', () => {
    expect(editedColour('#ff0000', 'ok-h', '140', 'oklch')).toBe('oklch(62.8% 0.2577 140)');
    expect(editedColour('oklch(70% 0.15 260)', 'ok-c', '0.4', 'oklch')).toBe('oklch(70% 0.4 260)');
    expect(editedColour('#ff000080', 'ok-l', '50', 'oklab')).toBe('oklab(50% 0.2249 0.1258 / 0.5)');
    expect(editedColour('#ff0000', 'ok-a', '0.9', 'oklab')).toBeNull();
    expect(editedColour('#ff0000', 'r', '0', 'rgb')).toBe('#000000');
  });
  it('round-trips a colour through OKLab', () => {
    const ok = toOklab({ r: 0.2, g: 0.4, b: 0.6, a: 1 });
    expect(rgb(`oklab(${ok.l} ${ok.a} ${ok.b})`)).toEqual(rgb('rgb(51 102 153)'));
  });
});
