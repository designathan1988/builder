// The page's output (ARCHITECTURE.md): the one owner of what the page writes, on the canvas (render.ts) and in the
// export (core/export/export.ts): the manifest data both need (OutputModel), a node's CSS (nodeCss) and the HTML
// attributes of its element (elementAttributes). No class and no DOM: every tool can load it.
import type { ElementsFile, PropertiesFile } from '../../manifest/schema.ts';
import type { DocNode, StyleClass } from '../document/model.ts';
import { isPageSetting } from '../page/settings.ts';
import { viewBoxOf } from '../elements/svg.ts';

// The manifest data the page's output needs, on the canvas and in the export: the elements, their attributes' HTML
// names, the breakpoints, the states' pseudo-classes and the recipes.
export interface OutputModel {
  readonly elements: ReadonlyMap<string, { readonly namespace: 'html' | 'svg'; readonly content: 'children' | 'text' | 'markup' | 'none' }>;
  // attribute id → its HTML attribute name, or null when it is not one (the text, the tag)
  readonly attributes: ReadonlyMap<string, string | null>;
  // attribute id → the element types it applies to, or "all" (a setting of the page applies to a page root's alone)
  readonly appliesTo: ReadonlyMap<string, readonly string[] | 'all'>;
  // the breakpoints in cascade order: the base first, with no media query
  readonly breakpoints: readonly { readonly id: string; readonly width: number; readonly base: boolean }[];
  // state id → its pseudo-class, or null for the base state
  readonly states: ReadonlyMap<string, string | null>;
  // recipe id → its declarations; a null value is the stored value
  readonly recipes: ReadonlyMap<string, readonly { readonly property: string; readonly value: string | null }[]>;
  // property → the fields of its structured value, in order, and how each reaches CSS (properties.json structures)
  readonly structures: ReadonlyMap<string, readonly { readonly id: string; readonly css: 'value' | 'keyword' | 'hides-layer'; readonly keyword: string | null }[]>;
  // the base breakpoint and state, and the properties of a box's size (width, height): an SVG's viewBox is its size
  readonly base: { readonly breakpoint: string; readonly state: string };
  readonly boxSize: readonly string[];
}

const SVG_TAG = 'svg';
const VIEW_BOX = 'viewBox';

// The properties of a box's size, width then height: those the size section of properties.json summarises.
const SIZE_SECTION = 'size';
export const boxSizeOf = (properties: PropertiesFile): readonly string[] => properties.sections.find((s) => s.id === SIZE_SECTION)?.summary ?? [];

export function outputModelFromManifest(elements: ElementsFile, properties: PropertiesFile): OutputModel {
  return {
    elements: new Map(elements.elements.map((e) => [e.id, { namespace: e.namespace, content: e.content }])),
    attributes: new Map(elements.attributes.map((a) => [a.id, a.html])),
    appliesTo: new Map(elements.attributes.map((a) => [a.id, a.elements])),
    breakpoints: properties.breakpoints.map((b) => ({ id: b.id, width: b.width, base: b.base })),
    states: new Map(properties.states.map((s) => [s.id, s.pseudo])),
    base: { breakpoint: properties.breakpoints.find((b) => b.base)?.id ?? '', state: properties.states[0]?.id ?? '' },
    boxSize: boxSizeOf(properties),
    recipes: new Map(properties.recipes.map((r) => [r.id, r.declarations])),
    structures: new Map(
      properties.properties.flatMap((p) => {
        const structure = properties.structures.find((s) => s.id === p.valueType);
        return structure === undefined ? [] : [[p.id, structure.fields.map((f) => ({ id: f.id, css: f.css, keyword: f.keyword }))] as const];
      }),
    ),
  };
}

// The CSS of one node: every declaration of every breakpoint and state it stores, for the selector given; each rule on
// one line for the canvas, or, laid out as a stylesheet a person reads (the export), one declaration per line indented
// by two spaces.
export function nodeCss(node: Pick<DocNode, 'styles'>, selector: string, model: OutputModel, layout: 'line' | 'block' = 'line'): string {
  const blocks: string[] = [];
  for (const breakpoint of model.breakpoints) {
    const byState = node.styles[breakpoint.id as keyof DocNode['styles']];
    if (!byState) continue;
    const rules: string[] = [];
    for (const [state, pseudo] of model.states) {
      const declarations = byState[state as keyof typeof byState];
      if (!declarations) continue;
      const lines = Object.entries(declarations).flatMap(([property, value]) => {
        const recipe = model.recipes.get(property);
        if (recipe) return recipe.map((d) => `${d.property}: ${d.value ?? String(value)};`);
        const fields = model.structures.get(property);
        if (fields !== undefined && Array.isArray(value)) return [`${property}: ${structuredCss(value as readonly Readonly<Record<string, string | boolean>>[], fields)};`];
        return [`${property}: ${String(value)};`];
      });
      if (lines.length === 0) continue;
      const indent = breakpoint.base ? '' : '  ';
      rules.push(layout === 'line' ? `${selector}${pseudo ?? ''} { ${lines.join(' ')} }` : `${indent}${selector}${pseudo ?? ''} {\n${lines.map((l) => `${indent}  ${l}`).join('\n')}\n${indent}}`);
    }
    if (rules.length === 0) continue;
    blocks.push(breakpoint.base ? rules.join('\n') : `@media (max-width: ${breakpoint.width}px) {\n${rules.join('\n')}\n}`);
  }
  return blocks.join('\n');
}

// The project's style classes as their rules (spec shared-style-classes): each class that holds styles, in the project's
// order, its selector the class; the canvas and the export write them before every element's rules, so an element's own
// values, of the same specificity, override them.
export function classesCss(classes: readonly StyleClass[], model: OutputModel, layout: 'line' | 'block' = 'line'): string {
  return classes
    .map((c) => nodeCss(c, `.${c.name}`, model, layout))
    .filter((css) => css !== '')
    .join(layout === 'line' ? '\n' : '\n\n');
}

// The CSS of a structured value (a shadow's layers): each layer that is not hidden, its fields in their structure's
// order (a value as it is stored, a flag as its keyword while it is on), the layers separated by commas; none when no
// layer shows.
export function structuredCss(layers: readonly Readonly<Record<string, string | boolean>>[], fields: readonly { readonly id: string; readonly css: 'value' | 'keyword' | 'hides-layer'; readonly keyword: string | null }[]): string {
  const shown = layers.filter((layer) => !fields.some((f) => f.css === 'hides-layer' && layer[f.id] === true));
  if (shown.length === 0) return 'none';
  return shown
    .map((layer) =>
      fields
        .flatMap((f) => {
          const v = layer[f.id];
          if (f.css === 'value') return typeof v === 'string' ? [v] : [];
          if (f.css === 'keyword') return v === true && f.keyword !== null ? [f.keyword] : [];
          return [];
        })
        .join(' '),
    )
    .join(', ');
}

// The HTML attributes of a node's element as the page writes them, on the canvas and in the export (the editor's own
// marks apart): its classes, its attributes by their HTML names (never an event attribute; a link's address and tab
// only on an <a>; a new tab as target _blank with rel noopener noreferrer), and the person's own attributes (never
// over one of the model's). On the page root, the settings of the page go to the page's <html> (page).
export function elementAttributes(node: DocNode, tag: string, root: boolean, model: OutputModel): { readonly element: Map<string, string>; readonly page: Map<string, string> } {
  const element = new Map<string, string>();
  const page = new Map<string, string>();
  if (node.classes.length > 0) element.set('class', node.classes.join(' '));
  for (const [id, value] of Object.entries(node.attributes)) {
    const name = model.attributes.get(id);
    if (name === null || name === undefined || name.startsWith('on') || value === false) continue;
    // a link switched to a button keeps its address and tab in the document, for when it is switched back, but a
    // button is no link
    if ((name === 'href' || name === 'target') && tag !== 'a') continue;
    if (name === 'target' && value === true) {
      element.set('target', '_blank');
      element.set('rel', 'noopener noreferrer');
      continue;
    }
    (root && isPageSetting(model.appliesTo.get(id), node.type) ? page : element).set(name, value === true ? '' : String(value));
  }
  for (const [name, value] of Object.entries(node.customAttributes ?? {})) if (!element.has(name)) element.set(name, value);
  // an SVG draws in its own size: a unit of its drawing is a CSS px (spec elements-svg-shapes, Problems in Pager 2)
  const viewBox = tag === SVG_TAG ? viewBoxOf(node, model) : null;
  if (viewBox !== null) element.set(VIEW_BOX, viewBox);
  return { element, page };
}

