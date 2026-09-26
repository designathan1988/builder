// The export (ARCHITECTURE.md, Command owners; spec export-zip): project.export hands the person site.zip, written by
// the one ZIP writer (core/project/zip.ts), holding each page at its file's path in the project (index.html for the
// home page) and the stylesheet css/styles.css it links. Nothing of the editor reaches the files: no data attribute of
// the renderer, no node id, no editor class or rule, no style attribute or <style> element.
//  - The page's HTML: <!DOCTYPE html>, <html> with the page's language and direction when its settings hold them, a
//    head of <meta charset="utf-8">, the viewport, the title (its setting, else the page's name) and the stylesheet
//    link, then the page root as the <body>. Each element is written with its tag and the attributes the page writes
//    (render.ts elementAttributes, the canvas's rule); a hidden element carries the hidden attribute, its subtree in it.
//    A text is escaped (& < > as entities, " too in an attribute), its marks as <strong>, <em> and <a href>, a line
//    break as <br>; an embed's markup is written as it is. A void element has no end tag.
//  - Classes (spec export-bem-css): an element with styles of its own gets a BEM class from its layer name (lower
//    case, words joined by "-"): outside every styled element it is a block (Hero → hero); inside one it is an element
//    of the outermost styled ancestor below the page (Title in Hero → hero__title); with an author class it is a
//    modifier of its first class (card named Plano assinatura → card--plano-assinatura). A class already taken gets a
//    numeric suffix (hero-2). The author classes come first; an element with neither has no class attribute.
//  - Two exports of the same document are byte-identical: the archive's entries carry a fixed time.
//  - The stylesheet: the design tokens' :root rule, then one rule per style class that holds styles, in the project's
//    order (spec shared-style-classes: before the elements', so an element's own values override its classes), then one
//    rule per styled element, in document order, one declaration per line indented by two spaces, a breakpoint's values
//    in an @media block and a state's under its pseudo-class (render.ts nodeCss, the canvas's).
// Exporting changes nothing in the document and records nothing; the status bar names the file.
import { message, registerHandler } from '../commands/registry.ts';
import type { DocNode, DocumentJson } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import { zip } from '../project/zip.ts';
import { classesCss, elementAttributes, nodeCss } from '../render/output.ts';
import { svgMarkupOf } from '../elements/svg.ts';
import { rootCss } from '../design/tokens.ts';
import type { InlineRun } from '../text/inline.ts';

export const SITE_ARCHIVE = 'site.zip';
export const STYLESHEET = 'css/styles.css';
// the page setting that is the page's title (elements.json), written in the head rather than as an attribute
const TITLE_SETTING = 'pageTitle';

const escapeText = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const escapeAttribute = (text: string): string => escapeText(text).replaceAll('"', '&quot;');

// a text's runs as HTML: marks as their elements, a line break as <br>
function runsHtml(runs: readonly InlineRun[]): string {
  return runs
    .map((run) => {
      if (typeof run === 'string') return run.split('\n').map(escapeText).join('<br>');
      const href = run.tag === 'a' ? ` href="${escapeAttribute(run.href)}"` : '';
      return `<${run.tag}${href}>${runsHtml(run.children)}</${run.tag}>`;
    })
    .join('');
}

const hasStyles = (node: DocNode): boolean => Object.values(node.styles).some((byState) => byState !== undefined && Object.values(byState).some((d) => d !== undefined && Object.keys(d).length > 0));

// a layer name as a class: lower case, every run of other characters one "-", none at either end
function classOf(name: string, fallback: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return words === '' || /^[0-9]/.test(words) ? fallback : words;
}

// The classes the elements of instances share across the pages of one export (spec reusable-components): per component
// and definition part, the class the first styled element of that part got and the styles it holds; and the elements
// that took such a class, whose rule the stylesheet already holds.
interface SharedClasses {
  readonly parts: Map<string, { readonly name: string; readonly styles: string }>;
  readonly reused: Set<string>;
}
const newShared = (): SharedClasses => ({ parts: new Map(), reused: new Set() });

// The generated class of every styled node of a tree, in document order, unique within it: a block, an element of
// its block (the outermost styled ancestor below the page), or a modifier of its first author class. An element of an
// instance holding the same styles as an element of the same part met before takes that element's class.
function generatedClasses(tree: DocNode, shared: SharedClasses): Map<string, string> {
  const taken = new Set<string>();
  const classes = new Map<string, string>();
  const unique = (base: string) => {
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}-${n}`;
    taken.add(name);
    return name;
  };
  const visit = (node: DocNode, block: string | null, root: boolean, instanceOf: string | null) => {
    for (const own of node.classes) taken.add(own);
    let inner = block;
    const within = node.component ?? instanceOf;
    if (hasStyles(node)) {
      const key = within !== null && node.componentPart !== undefined ? `${within}|${node.componentPart.join('.')}` : null;
      const styles = JSON.stringify(node.styles);
      const met = key === null ? undefined : shared.parts.get(key);
      const author = node.classes[0];
      let name: string;
      if (met !== undefined && met.styles === styles) {
        name = met.name;
        taken.add(name);
        shared.reused.add(node.id);
      } else {
        const word = classOf(node.name, node.type.toLowerCase());
        name = unique(author !== undefined ? `${author}--${word}` : block !== null ? `${block}__${word}` : word);
        if (key !== null && met === undefined) shared.parts.set(key, { name, styles });
      }
      classes.set(node.id, name);
      // the outermost styled element below the page is the block of every styled element inside it
      if (block === null && !root && author === undefined) inner = name;
    }
    node.children.forEach((child) => visit(child, inner, false, within));
  };
  visit(tree, null, true, null);
  return classes;
}

const attributesHtml = (attributes: ReadonlyMap<string, string>): string => [...attributes].map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${escapeAttribute(value)}"`)).join('');

// One page of the document as its HTML file and its CSS.
export function exportPage(document: DocumentJson, pageIndex: number, rules: ModelRules, shared: SharedClasses = newShared()): { readonly html: string; readonly css: string } {
  const page = document.pages[pageIndex];
  if (page === undefined) throw new Error(`export: the document has no page ${pageIndex}`);
  const classes = generatedClasses(page.tree, shared);
  const { output, contentModel } = rules;
  const rulesCss: string[] = [];
  let pageAttributes = new Map<string, string>();
  const write = (node: DocNode, depth: number, root: boolean): string => {
    const tag = node.tag ?? 'div';
    const own = elementAttributes(node, tag, root, output);
    if (root) pageAttributes = own.page;
    const generated = classes.get(node.id);
    const attributes = new Map(own.element);
    if (generated !== undefined) {
      attributes.set('class', [...node.classes, generated].join(' '));
      // a class the elements of instances share is written once, by the first of them
      const css = shared.reused.has(node.id) ? '' : nodeCss(node, `.${generated}`, output, 'block');
      if (css !== '') rulesCss.push(css);
    }
    if (node.hidden === true) attributes.set('hidden', '');
    const indent = '  '.repeat(depth);
    const open = `${indent}<${tag}${attributesHtml(attributes)}>`;
    if (contentModel.isVoid(tag)) return open;
    const content = output.elements.get(node.type)?.content;
    if (content === 'text') return `${open}${runsHtml(node.inline ?? [node.text ?? ''])}</${tag}>`;
    if (content === 'markup') return `${open}${node.text ?? ''}</${tag}>`;
    if (node.type === 'summary' || node.type === 'legend') {
      const prefix = escapeText(node.text ?? '');
      const children = node.children.map((child) => write(child, depth + 1, false));
      return children.length === 0 ? `${open}${prefix}</${tag}>` : `${open}${prefix}\n${children.join('\n')}\n${indent}</${tag}>`;
    }
    // an SVG's markup after its shapes (core/elements/svg.ts)
    const markup = svgMarkupOf(node);
    const inner = [...node.children.map((child) => write(child, depth + 1, false)), ...(markup === '' ? [] : [`${indent}  ${markup}`])];
    if (inner.length === 0) return `${open}</${tag}>`;
    return `${open}\n${inner.join('\n')}\n${indent}</${tag}>`;
  };
  const body = write(page.tree, 0, true);
  const stored = page.tree.attributes[TITLE_SETTING as keyof DocNode['attributes']];
  const title = typeof stored === 'string' && stored !== '' ? stored : page.name;
  const html = [
    '<!DOCTYPE html>',
    `<html${attributesHtml(pageAttributes)}>`,
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${escapeText(title)}</title>`,
    `  <link rel="stylesheet" href="${STYLESHEET}">`,
    '</head>',
    body,
    '</html>',
    '',
  ].join('\n');
  return { html, css: rulesCss.length === 0 ? '' : `${rulesCss.join('\n\n')}\n` };
}

// the time every entry of the archive carries: the ZIP format's first day, so the same document gives the same bytes
const FIXED_TIME = Date.UTC(1980, 0, 1);

// The site's files: each page's HTML, by its file, and the one stylesheet they link (the export writes them; the preview
// shows them).
export function siteFiles(document: DocumentJson, rules: ModelRules): { readonly pages: readonly { readonly file: string; readonly html: string }[]; readonly css: string } {
  const classes = newShared();
  const pages = document.pages.map((page, i) => ({ page, files: exportPage(document, i, rules, classes) }));
  // the project's design tokens first, as the :root rule of their variables (core/design/tokens.ts)
  // each block ends with its line's end, as a page's rules do, so a blank line parts every rule from the next
  const shared = [rootCss(document.tokens ?? []), classesCss(document.classes ?? [], rules.output, 'block')].filter((c) => c !== '').map((c) => `${c}\n`);
  const css = [...shared, ...pages.map((p) => p.files.css)].filter((c) => c !== '').join('\n');
  return { pages: pages.map(({ page, files }) => ({ file: page.file, html: files.html })), css };
}

// A page as the preview shows it (spec preview-mode): the exported page itself, its stylesheet written in its head in
// place of the link (the preview has no files to load), and links and forms opening in a new tab, never in the editor.
export function previewPage(document: DocumentJson, rules: ModelRules, pageIndex = 0): string {
  const site = siteFiles(document, rules);
  const html = site.pages[pageIndex]?.html ?? '';
  const link = `  <link rel="stylesheet" href="${STYLESHEET}">`;
  return html.replace(link, `  <base target="_blank">\n  <style>\n${site.css}  </style>`);
}

export const exportProject = registerHandler('project.export', ({ state, rules }) => {
  const encoder = new TextEncoder();
  const site = siteFiles(state.document, rules);
  const entries = [...site.pages.map(({ file, html }) => ({ path: file, bytes: encoder.encode(html) })), { path: STYLESHEET, bytes: encoder.encode(site.css) }];
  const bytes = zip(entries, FIXED_TIME);
  return { kind: 'change' as const, message: message('status.export.done', { file: SITE_ARCHIVE }), download: { name: SITE_ARCHIVE, type: 'application/zip', bytes } };
});
