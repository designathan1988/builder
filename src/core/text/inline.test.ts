import { describe, expect, it } from 'vitest';
import { manifest } from '../../manifest/runtime.ts';
import { contentModelFrom } from '../elements/content-model.ts';
import { applyInlineChange, canonical, hasMarks, isSafeHref, linkAddressAt, parseInline, pastedRuns, plainText, withText, wordAt, type InlineRun } from './inline.ts';

const MODEL = contentModelFrom(manifest.html);
const bold = (...children: InlineRun[]): InlineRun => ({ tag: 'strong', children });
const italic = (...children: InlineRun[]): InlineRun => ({ tag: 'em', children });
const link = (href: string, ...children: InlineRun[]): InlineRun => ({ tag: 'a', href, children });
const TEXT = ['one two three four'];

describe('inline marks (src/core/text/inline.ts)', () => {
  it('keeps one canonical tree: adjacent runs with the same marks joined, empty ones gone, a link outside bold outside italic', () => {
    expect(canonical(['a', '', 'b'])).toEqual(['ab']);
    expect(canonical([bold('a'), bold('b')])).toEqual([bold('ab')]);
    expect(canonical([italic(bold('x'))])).toEqual([bold(italic('x'))]);
    expect(canonical([bold(link('https://a.b', 'x'))])).toEqual([link('https://a.b', bold('x'))]);
    // an inner link's address wins: links never nest
    expect(canonical([link('https://a.b', 'x', link('https://c.d', 'y'))])).toEqual([link('https://a.b', 'x'), link('https://c.d', 'y')]);
    expect(canonical([bold('')])).toEqual([]);
  });

  it('reads the plain text and whether anything is marked', () => {
    const runs = ['one ', bold('two'), '\nthree'];
    expect(plainText(runs)).toBe('one two\nthree');
    expect(hasMarks(runs)).toBe(true);
    expect(hasMarks(['plain'])).toBe(false);
  });

  it('writes a marked text anew as plain text keeping the marks of what it keeps (the inspector’s text field)', () => {
    const runs = ['one ', bold('two'), ' three'];
    expect(withText(runs, 'one two three')).toEqual(runs);
    expect(withText(runs, 'one twelve three')).toEqual(['one ', bold('twelve'), ' three']);
    expect(withText(runs, 'one  three')).toEqual(['one  three']);
    expect(withText(runs, 'zero one two three')).toEqual(['zero one ', bold('two'), ' three']);
    expect(withText(['plain'], 'other')).toEqual(['other']);
  });

  it('allows http, https, mailto and tel addresses only (Problems in Pager 1)', () => {
    for (const ok of ['https://example.com', 'http://a.b/c?d#e', 'mailto:me@example.com', 'tel:+5511999999999', 'HTTPS://EXAMPLE.COM']) expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '/about', 'about.html', 'https://', 'https://exa mple.com', 'ftp://example.com', '']) expect(isSafeHref(bad), bad).toBe(false);
  });

  it('reads a tree from data: a tree, "unsafe" for an address not allowed, null for anything else', () => {
    expect(parseInline(['a', bold('b'), link('https://x.y', italic('c'))])).toEqual(['a', bold('b'), link('https://x.y', italic('c'))]);
    expect(parseInline([link('javascript:alert(1)', 'x')])).toBe('unsafe');
    expect(parseInline('text')).toBeNull();
    expect(parseInline([{ tag: 'u', children: ['x'] }])).toBeNull();
    expect(parseInline([{ tag: 'strong', children: ['x'], style: 'color: red' }])).toBeNull();
    expect(parseInline([{ tag: 'strong', href: 'https://x.y', children: ['x'] }])).toBeNull();
    expect(parseInline([3])).toBeNull();
  });

  it('finds the word a caret touches', () => {
    const text = 'one two  three';
    expect(wordAt(text, 0)).toEqual({ start: 0, end: 3 });
    expect(wordAt(text, 3)).toEqual({ start: 0, end: 3 });
    expect(wordAt(text, 5)).toEqual({ start: 4, end: 7 });
    expect(wordAt(text, 8)).toBeNull();
    expect(wordAt('Monthly', 7)).toEqual({ start: 0, end: 7 });
    expect(wordAt("don't stop", 2)).toEqual({ start: 0, end: 5 });
    expect(wordAt('', 0)).toBeNull();
  });

  describe('a change of the marks over a range', () => {
    it('toggles a mark over the selected characters only, splitting runs (Problems in Pager 2)', () => {
      const once = applyInlineChange(TEXT, { start: 0, end: 3 }, { kind: 'mark', mark: 'strong' });
      expect(once).toEqual({ runs: [bold('one'), ' two three four'], range: { start: 0, end: 3 } });
      const both = applyInlineChange(once.runs, { start: 4, end: 7 }, { kind: 'mark', mark: 'em' });
      expect(both.runs).toEqual([bold('one'), ' ', italic('two'), ' three four']);
      // Ctrl+B inside part of the bold run removes bold from that part only
      expect(applyInlineChange([bold('one two three')], { start: 4, end: 7 }, { kind: 'mark', mark: 'strong' }).runs).toEqual([bold('one '), 'two', bold(' three')]);
      // a range only partly bold becomes bold as a whole
      expect(applyInlineChange([bold('one'), ' two'], { start: 0, end: 7 }, { kind: 'mark', mark: 'strong' }).runs).toEqual([bold('one two')]);
    });

    it('takes the word a caret touches, and changes nothing where there is none', () => {
      expect(applyInlineChange(['Monthly'], { start: 7, end: 7 }, { kind: 'mark', mark: 'strong' })).toEqual({ runs: [bold('Monthly')], range: { start: 0, end: 7 } });
      expect(applyInlineChange(['Weekly'], { start: 6, end: 6 }, { kind: 'mark', mark: 'em' }).runs).toEqual([italic('Weekly')]);
      expect(applyInlineChange(['a  b'], { start: 2, end: 2 }, { kind: 'mark', mark: 'strong' })).toEqual({ runs: ['a  b'], range: { start: 2, end: 2 } });
    });

    it('links the selected characters, re-addresses or removes the link a caret touches, and never nests links', () => {
      const linked = applyInlineChange(TEXT, { start: 8, end: 13 }, { kind: 'link', href: 'https://example.com' });
      expect(linked.runs).toEqual(['one two ', link('https://example.com', 'three'), ' four']);
      expect(applyInlineChange(['Monthly'], { start: 7, end: 7 }, { kind: 'link', href: 'https://example.com' }).runs).toEqual([link('https://example.com', 'Monthly')]);
      // a caret inside a link takes the whole link, marks inside it included
      const withBold = ['a ', link('https://x.y', 'b ', bold('c')), ' d'];
      expect(applyInlineChange(withBold, { start: 3, end: 3 }, { kind: 'link', href: 'https://z.w' }).runs).toEqual(['a ', link('https://z.w', 'b ', bold('c')), ' d']);
      expect(applyInlineChange(withBold, { start: 3, end: 3 }, { kind: 'link', href: null })).toEqual({ runs: ['a b ', bold('c'), ' d'], range: { start: 2, end: 5 } });
      // part of a link linked elsewhere splits it: two links side by side, never one inside the other
      expect(applyInlineChange([link('https://x.y', 'abcd')], { start: 1, end: 3 }, { kind: 'link', href: 'https://z.w' }).runs).toEqual([link('https://x.y', 'a'), link('https://z.w', 'bc'), link('https://x.y', 'd')]);
      // a bold word inside a link keeps both marks
      expect(applyInlineChange([link('https://x.y', 'ab cd')], { start: 3, end: 5 }, { kind: 'mark', mark: 'strong' }).runs).toEqual([link('https://x.y', 'ab ', bold('cd'))]);
    });

    it('inserts runs in place of the range, with the bold and italic around them, and puts the caret after them', () => {
      expect(applyInlineChange(TEXT, { start: 3, end: 7 }, { kind: 'insert', runs: [' ', bold('RICH')] })).toEqual({ runs: ['one ', bold('RICH'), ' three four'], range: { start: 8, end: 8 } });
      expect(applyInlineChange([bold('onetwo')], { start: 3, end: 3 }, { kind: 'insert', runs: ['-'] }).runs).toEqual([bold('one-two')]);
      expect(applyInlineChange([link('https://x.y', 'ab')], { start: 1, end: 1 }, { kind: 'insert', runs: ['-'] }).runs).toEqual([link('https://x.y', 'a-b')]);
      expect(applyInlineChange([link('https://x.y', 'ab')], { start: 2, end: 2 }, { kind: 'insert', runs: ['c'] }).runs).toEqual([link('https://x.y', 'ab'), 'c']);
    });

    it('reads the address of the link a caret or a range is in, for the link prompt', () => {
      const runs = ['a ', link('https://x.y', 'bc'), ' d'];
      expect(linkAddressAt(runs, { start: 3, end: 3 })).toBe('https://x.y');
      expect(linkAddressAt(runs, { start: 2, end: 4 })).toBe('https://x.y');
      expect(linkAddressAt(runs, { start: 0, end: 4 })).toBeNull();
      expect(linkAddressAt(runs, { start: 1, end: 1 })).toBeNull();
    });
  });

  describe('pasted content (Problems in Pager 3)', () => {
    it('keeps bold, italic and allowed links, gives every other element its text, drops scripts and styles', () => {
      const html = [
        { tag: 'h2', href: null, children: ['Heading'] },
        { tag: 'p', href: null, children: [{ tag: 'b', href: null, children: ['RICH'] }, ' ', { tag: 'i', href: null, children: ['x'] }, ' ', { tag: 'a', href: 'https://example.com', children: ['ok'] }, ' ', { tag: 'a', href: 'javascript:alert(1)', children: ['bad'] }, ' ', { tag: 'span', href: null, children: ['plain'] }] },
        { tag: 'script', href: null, children: ['alert(1)'] },
        { tag: 'style', href: null, children: ['p { color: red }'] },
      ];
      expect(pastedRuns({ status: 'read', html, text: 'ignored' }, MODEL)).toEqual(['Heading\n', bold('RICH'), ' ', italic('x'), ' ', link('https://example.com', 'ok'), ' bad plain']);
    });

    it('runs spaces together as a page shows them, and a <br> is a line break', () => {
      const html = ['\n  ', { tag: 'strong', href: null, children: ['a'] }, '   b\n', { tag: 'br', href: null, children: [] }, '  c  '];
      expect(pastedRuns({ status: 'read', html, text: null }, MODEL)).toEqual([bold('a'), ' b\nc']);
    });

    it('takes the plain text when the HTML holds no text, and nothing from an empty or refused clipboard', () => {
      expect(pastedRuns({ status: 'read', html: [{ tag: 'img', href: null, children: [] }], text: 'line one\r\nline two' }, MODEL)).toEqual(['line one\nline two']);
      expect(pastedRuns({ status: 'read', html: null, text: null }, MODEL)).toEqual([]);
      expect(pastedRuns({ status: 'read', html: [{ tag: 'script', href: null, children: ['x'] }], text: null }, MODEL)).toEqual([]);
      expect(pastedRuns({ status: 'denied' }, MODEL)).toEqual([]);
    });
  });
});
