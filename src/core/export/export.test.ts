import { describe, expect, it } from 'vitest';
import type { NodeId } from '../../generated/commands.ts';
import { manifest } from '../../manifest/runtime.ts';
import type { HandlerContext } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import { rulesFromManifest } from '../document/validate.ts';
import { EMPTY_HISTORY } from '../history/history.ts';
import { manualClock } from '../ports/clock.ts';
import { anyCss } from '../ports/css.ts';
import { sequentialIds } from '../ports/ids.ts';
import { noLayout } from '../ports/layout.ts';
import { exportPage, exportProject } from './export.ts';

const RULES = rulesFromManifest(manifest.elements, manifest.properties, manifest.html);
const styled = (declarations: Record<string, string>) => ({ desktop: { base: declarations } }) as DocNode['styles'];
const node = (id: string, name: string, type: string, tag: string, fields: Partial<DocNode> = {}): DocNode => ({ id: id as NodeId, type: type as DocNode['type'], name, tag, attributes: {}, classes: [], styles: {}, text: null, children: [], ...fields });
const page = (children: DocNode[]): DocumentJson => ({ version: 1, pages: [{ id: 'p', name: 'Home', file: 'index.html', tree: node('root', 'Page', 'page', 'body', { children }) }] });
const contextOf = (document: DocumentJson, at: number): HandlerContext<never> => ({
  state: { document, selection: [], history: EMPTY_HISTORY, message: null, ui: undefined as never },
  clock: manualClock(at),
  ids: sequentialIds('x'),
  rules: RULES,
  words: (key) => key,
  layout: noLayout,
  css: anyCss,
});

const DOC = page([
  node('hero', 'Hero', 'section', 'section', {
    styles: styled({ 'padding-top': '56px' }),
    children: [node('title', 'Title', 'heading', 'h1', { text: 'A & B', styles: styled({ 'font-size': '32px' }) }), node('cta', 'Call to action', 'paragraph', 'p', { text: 'Go', styles: styled({ color: 'red' }) }), node('plain', 'Plain', 'paragraph', 'p', { text: 'x' })],
  }),
  node('plan', 'Plano assinatura', 'article', 'article', { classes: ['card'], styles: styled({ width: '200px' }) }),
  node('again', 'Hero', 'div', 'div', { styles: styled({ margin: '0' }) }),
]);

describe('the export (specs export-zip, export-bem-css)', () => {
  it('names styled elements in BEM form: blocks, elements of their block, modifiers of an author class, suffixes on collisions', () => {
    const { html, css } = exportPage(DOC, 0, RULES);
    expect(html).toContain('<section class="hero">');
    expect(html).toContain('<h1 class="hero__title">A &amp; B</h1>');
    expect(html).toContain('<p class="hero__call-to-action">Go</p>');
    expect(html).toContain('<p>x</p>');
    expect(html).toContain('<article class="card card--plano-assinatura"></article>');
    expect(html).toContain('<div class="hero-2"></div>');
    expect(css).toContain('.hero__title {\n  font-size: 32px;\n}');
    expect(css).not.toMatch(/#|\[data-/);
  });

  it('gives the same bytes for the same document, whenever it is exported', () => {
    const first = exportProject.run(contextOf(DOC, 1_000), {} as never);
    const second = exportProject.run(contextOf(DOC, 9_000_000_000), {} as never);
    if (first.kind !== 'change' || second.kind !== 'change') throw new Error('the export did not run');
    expect(first.download?.bytes).toEqual(second.download?.bytes);
  });

  it('exports Summary and Legend text before their child elements with escaped markup', () => {
    const doc = page([
      node('details', 'Details', 'details', 'details', { children: [node('summary', 'Summary', 'summary', 'summary', { text: 'Questions & answers ', children: [node('em', 'Emphasis', 'paragraph', 'span', { text: 'today' })] })] }),
      node('fieldset', 'Fieldset', 'fieldset', 'fieldset', { children: [node('legend', 'Legend', 'legend', 'legend', { text: 'Contact <form>' })] }),
    ]);
    const { html } = exportPage(doc, 0, RULES);
    expect(html).toMatch(/<summary>Questions &amp; answers\s+<span>today<\/span>/);
    expect(html).toContain('<legend>Contact &lt;form&gt;</legend>');
  });
});
