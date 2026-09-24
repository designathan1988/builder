// Validates the manifest: first that no hand-written field holds logic, then every file against its
// schema, then the rules that tie the files together and to the generated web data. Pure: the
// caller supplies the parsed files, the i18n catalogues, a way to ask whether a repository path
// exists and the ids code has registered.
import type { z } from 'zod';
import { createCssMatcher, type CssMatcher } from './css.ts';
import { schemaFields } from './fields.ts';
import {
  COUPLING_ACTIONS,
  COUPLING_PREDICATES,
  GESTURE_DOOR_KINDS,
  REFERENCE_KINDS,
  commandsFileSchema,
  consumersFileSchema,
  elementsFileSchema,
  environmentSchema,
  featuresFileSchema,
  generatedCssSchema,
  generatedHtmlSchema,
  interactionsFileSchema,
  propertiesFileSchema,
  referencesFileSchema,
  type Command,
  type CommandsFile,
  type Composite,
  type ConsumersFile,
  type Door,
  type DoorKind,
  type ElementType,
  type ElementsFile,
  type Environment,
  type Feature,
  type FeaturesFile,
  type GeneratedCss,
  type GeneratedHtml,
  type InteractionsFile,
  type PropertiesFile,
  type ReferencesFile,
  type Subset,
} from './schema.ts';

export const RULES = [
  'no-logic',
  'schema',
  'duplicate-id',
  'unknown-reference',
  'door-unknown-command',
  'command-without-door',
  'feature-command-link',
  'i18n-missing',
  'value-set',
  'css-syntax',
  'shorthand-write',
  'composite',
  'door-writes',
  'individual-transform',
  'coupling',
  'history',
  'reference',
  'consumer',
  'html-model',
  'chord-conflict',
  'modifier-conflict',
  'order',
  'spec-missing',
  'scenario-terminal',
] as const;

export type RuleId = (typeof RULES)[number];
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export interface Problem {
  rule: RuleId;
  file: string;
  path: string;
  message: string;
}

export interface ManifestInput {
  // path relative to manifest/ (forward slashes) → parsed JSON
  files: Readonly<Record<string, unknown>>;
  // locale → i18n catalogue (key → text)
  catalogues: Readonly<Record<string, unknown>>;
  // whether a path relative to the repository root exists
  fileExists: (repoPath: string) => boolean;
  // ids that code under src/ registers, by kind (registerHandler, registerPredicate, ...)
  registered: Readonly<Record<ReferenceKind, readonly string[]>>;
}

export interface ManifestSummary {
  features: number;
  featureGroups: number;
  commands: number;
  undoableCommands: number;
  doors: number;
  doorsByKind: Record<string, number>;
  elements: number;
  paletteEntries: number;
  attributes: number;
  generatedProperties: number;
  generatedShorthands: number;
  generatedElements: number;
  properties: number;
  composites: number;
  couplings: number;
  plannedReferences: number;
  registeredReferences: number;
  referencesByKind: Record<string, number>;
  consumers: number;
  // values the official syntax rejects and the browser syntax (CSSTree's MDN data) accepts
  implementedOnly: string[];
  constants: number;
  gestures: number;
  keyContexts: number;
  scenarios: number;
  i18nKeys: number;
}

export interface CheckResult {
  problems: Problem[];
  summary: ManifestSummary | null;
}

interface Parsed {
  environment: Environment;
  elements: ElementsFile;
  properties: PropertiesFile;
  interactions: InteractionsFile;
  references: ReferencesFile;
  consumers: ConsumersFile;
  css: GeneratedCss;
  html: GeneratedHtml;
  commandFiles: { file: string; data: CommandsFile }[];
  featureFiles: { file: string; data: FeaturesFile }[];
}

const SINGLE_FILES: Record<string, { key: keyof Parsed; schema: z.ZodType }> = {
  'environment.json': { key: 'environment', schema: environmentSchema },
  'elements.json': { key: 'elements', schema: elementsFileSchema },
  'properties.json': { key: 'properties', schema: propertiesFileSchema },
  'interactions.json': { key: 'interactions', schema: interactionsFileSchema },
  'references.json': { key: 'references', schema: referencesFileSchema },
  'consumers.json': { key: 'consumers', schema: consumersFileSchema },
  'generated/css-properties.json': { key: 'css', schema: generatedCssSchema },
  'generated/html-elements.json': { key: 'html', schema: generatedHtmlSchema },
};

function issuePath(path: readonly PropertyKey[]): string {
  return path.map((part) => (typeof part === 'number' ? `[${part}]` : `.${String(part)}`)).join('').replace(/^\./, '');
}

function schemaProblems(file: string, error: z.ZodError): Problem[] {
  return error.issues.map((issue) => {
    let message = issue.message;
    if (issue.code === 'unrecognized_keys') message = `unknown field(s): ${issue.keys.join(', ')}`;
    else if (issue.code === 'invalid_type' && /received undefined/.test(issue.message)) message = 'missing field';
    return { rule: 'schema', file, path: issuePath(issue.path), message };
  });
}

// ---------------------------------------------------------------- no logic in data

// Operators and code that never belong in a data value. CSS values and prose pass.
const EXPRESSION = /(===|!==|==|!=|&&|\|\||=>|<=|>=|\$\{|\bfunction\s*\(|\breturn\s+\S.*;)/;

function logicProblems(files: Readonly<Record<string, unknown>>): Problem[] {
  const problems: Problem[] = [];
  for (const [file, json] of Object.entries(files)) {
    if (file.startsWith('generated/')) continue;
    const visit = (value: unknown, path: string): void => {
      if (typeof value === 'string') {
        if (EXPRESSION.test(value)) {
          problems.push({ rule: 'no-logic', file, path, message: `holds an expression (${JSON.stringify(value)}): data names predicates, actions and codecs by id and never holds code or conditions as text` });
        }
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => visit(item, `${path}[${i}]`));
      } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) visit(item, path === '' ? key : `${path}.${key}`);
      }
    };
    visit(json, '');
  }
  return problems;
}

function parseFiles(input: ManifestInput): { parsed: Parsed | null; problems: Problem[] } {
  const problems: Problem[] = [];
  const out: Partial<Parsed> & { commandFiles: Parsed['commandFiles']; featureFiles: Parsed['featureFiles'] } = {
    commandFiles: [],
    featureFiles: [],
  };
  for (const [file, json] of Object.entries(input.files)) {
    const single = SINGLE_FILES[file];
    if (single) {
      const result = single.schema.safeParse(json);
      if (result.success) (out as Record<string, unknown>)[single.key] = result.data;
      else problems.push(...schemaProblems(file, result.error));
    } else if (/^commands\/[a-z0-9-]+\.json$/.test(file)) {
      const result = commandsFileSchema.safeParse(json);
      if (result.success) out.commandFiles.push({ file, data: result.data });
      else problems.push(...schemaProblems(file, result.error));
    } else if (/^features\/\d{2}-[a-z0-9-]+\.json$/.test(file)) {
      const result = featuresFileSchema.safeParse(json);
      if (result.success) out.featureFiles.push({ file, data: result.data });
      else problems.push(...schemaProblems(file, result.error));
    } else {
      problems.push({ rule: 'schema', file, path: '', message: `not a manifest file: expected one of ${Object.keys(SINGLE_FILES).join(', ')}, commands/<domain>.json, features/<NN>-<group>.json` });
    }
  }
  for (const file of Object.keys(SINGLE_FILES)) {
    if (!(file in input.files)) problems.push({ rule: 'schema', file, path: '', message: file.startsWith('generated/') ? 'missing generated file: run npm run gen' : 'missing manifest file' });
  }
  if (out.commandFiles.length === 0 && !Object.keys(input.files).some((f) => f.startsWith('commands/'))) {
    problems.push({ rule: 'schema', file: 'commands/', path: '', message: 'missing: no command file' });
  }
  if (out.featureFiles.length === 0 && !Object.keys(input.files).some((f) => f.startsWith('features/'))) {
    problems.push({ rule: 'schema', file: 'features/', path: '', message: 'missing: no feature file' });
  }
  if (problems.length > 0) return { parsed: null, problems };
  out.commandFiles.sort((a, b) => a.file.localeCompare(b.file));
  out.featureFiles.sort((a, b) => a.file.localeCompare(b.file));
  return { parsed: out as Parsed, problems };
}

// ---------------------------------------------------------------- chords

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const NAMED_KEYS = new Set([
  'Enter', 'Escape', 'Delete', 'Backspace', 'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown', 'ContextMenu',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

// "Shift+Ctrl+z" and "Ctrl+Shift+Z" are the same chord; null when the text is not a chord.
export function normaliseChord(chord: string): string | null {
  let key: string;
  let modifiers: string[];
  if (chord.endsWith('++')) {
    key = '+';
    const head = chord.slice(0, -2);
    modifiers = head === '' ? [] : head.split('+');
  } else {
    const parts = chord.split('+');
    key = parts.pop() ?? '';
    modifiers = parts;
  }
  if (key === '') return null;
  if (key.length === 1) key = key.toUpperCase();
  else if (!NAMED_KEYS.has(key)) return null;
  const seen = new Set<string>();
  for (const modifier of modifiers) {
    if (!(MODIFIER_ORDER as readonly string[]).includes(modifier) || seen.has(modifier)) return null;
    seen.add(modifier);
  }
  const ordered = MODIFIER_ORDER.filter((m) => seen.has(m));
  return [...ordered, key].join('+');
}

// ---------------------------------------------------------------- HTML content model

type HtmlMeta = GeneratedHtml['elements'][string];
const CATEGORY_OF: Record<string, keyof HtmlMeta['categories']> = {
  '@metadata': 'metadata',
  '@flow': 'flow',
  '@sectioning': 'sectioning',
  '@heading': 'heading',
  '@phrasing': 'phrasing',
  '@embedded': 'embedded',
  '@interactive': 'interactive',
  '@labelable': 'labelable',
  '@form': 'form',
  '@script': 'scriptSupporting',
};

function matchesContent(tag: string, meta: HtmlMeta | undefined, pattern: string): boolean {
  const p = pattern.replace(/[?*]$/, '');
  const category = CATEGORY_OF[p];
  if (category !== undefined) return meta !== undefined && meta.categories[category] !== false;
  return p === tag;
}

// null when HTML permits <child> directly inside <parent>, the reason otherwise
export function htmlRefusal(html: GeneratedHtml, parentTag: string, childTag: string): string | null {
  const parent = html.elements[parentTag];
  const child = html.elements[childTag];
  if (!parent) return `<${parentTag}> is not an HTML element of the generated data`;
  if (parent.void) return `<${parentTag}> is a void element`;
  if (parent.textOnly) return `<${parentTag}> holds text only`;
  if (parent.permittedContent !== null && !parent.permittedContent.some((p) => matchesContent(childTag, child, p))) {
    return `<${parentTag}> permits ${parent.permittedContent.join(', ')}, not <${childTag}>`;
  }
  for (const rule of parent.permittedDescendants ?? []) {
    if (rule.exclude.some((p) => matchesContent(childTag, child, p))) return `<${parentTag}> excludes <${childTag}> from its descendants`;
  }
  if (child?.permittedParent && !child.permittedParent.includes(parentTag)) return `<${childTag}> is permitted only in ${child.permittedParent.join(', ')}`;
  if (child?.requiredAncestors) {
    const ok = child.requiredAncestors.some((selector) => {
      const parts = selector.split('>').map((s) => s.trim());
      return parts[parts.length - 2] === parentTag;
    });
    if (!ok) return `<${childTag}> requires ${child.requiredAncestors.join(' or ')}`;
  }
  return null;
}

// ---------------------------------------------------------------- the rules

interface DoorEntry {
  file: string;
  path: string;
  command: Command;
  door: Door;
  ref: string;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

// Controls that present a list of values: their doors must say which list they offer.
const LIST_CONTROLS = new Set(['keyword-menu', 'keyword-buttons', 'length-field', 'font-menu']);

const matcherCache = new WeakMap<object, CssMatcher>();
function cssMatcher(css: GeneratedCss): CssMatcher {
  let matcher = matcherCache.get(css);
  if (!matcher) {
    matcher = createCssMatcher({ properties: Object.fromEntries(Object.entries(css.properties).map(([name, p]) => [name, p.syntax])), types: css.types });
    matcherCache.set(css, matcher);
  }
  return matcher;
}

export function checkManifest(input: ManifestInput): CheckResult {
  const logic = logicProblems(input.files);
  if (logic.length > 0) return { problems: logic, summary: null };
  const { parsed, problems } = parseFiles(input);
  if (!parsed) return { problems, summary: null };
  const p = parsed;
  const report = (rule: RuleId, file: string, path: string, message: string) => problems.push({ rule, file, path, message });
  const css = cssMatcher(p.css);

  // Every id is unique within its kind.
  const unique = (kind: string, file: string, entries: { id: string; path: string }[]) => {
    const seen = new Map<string, string>();
    for (const { id, path } of entries) {
      const first = seen.get(id);
      if (first !== undefined) report('duplicate-id', file, path, `${kind} id "${id}" is already used at ${first}`);
      else seen.set(id, path);
    }
  };

  // ---- collect
  const features: { file: string; path: string; feature: Feature; index: number }[] = [];
  for (const { file, data } of p.featureFiles) {
    data.features.forEach((feature, i) => features.push({ file, path: `features[${i}]`, feature, index: features.length }));
  }
  const featureIndex = new Map<string, number>();
  for (const f of features) if (!featureIndex.has(f.feature.id)) featureIndex.set(f.feature.id, f.index);

  const commands: { file: string; path: string; command: Command }[] = [];
  for (const { file, data } of p.commandFiles) {
    data.commands.forEach((command, i) => commands.push({ file, path: `commands[${i}]`, command }));
  }
  const commandById = new Map<string, Command>();
  for (const c of commands) if (!commandById.has(c.command.id)) commandById.set(c.command.id, c.command);

  const doors: DoorEntry[] = [];
  for (const c of commands) {
    c.command.entryPoints.forEach((door, i) => doors.push({ file: c.file, path: `${c.path}.entryPoints[${i}]`, command: c.command, door, ref: `${c.command.id}#${door.id}` }));
  }
  const doorByRef = new Map(doors.map((d) => [d.ref, d]));

  const elementById = new Map(p.elements.elements.map((e) => [e.id, e]));
  const attributeById = new Map(p.elements.attributes.map((a) => [a.id, a]));
  const paletteEntryIds = new Set(p.elements.palette.flatMap((g) => g.entries.map((e) => e.id)));
  const propertyById = new Map(p.properties.properties.map((prop) => [prop.id, prop]));
  const compositeById = new Map(p.properties.composites.map((c) => [c.id, c]));
  const breakpointIds = new Set(p.properties.breakpoints.map((b) => b.id));
  const stateIds = new Set(p.properties.states.map((s) => s.id));
  const contextIds = new Set(p.interactions.keyContexts.map((k) => k.id));
  const gestureById = new Map(p.interactions.gestures.map((g) => [g.id, g]));
  const constantById = new Map(p.interactions.constants.map((c) => [c.id, c]));
  const viewportIds = new Set(p.environment.viewports.map((v) => v.id));
  const generated = p.css.properties;
  const isShorthand = (name: string) => (generated[name]?.longhands.length ?? 0) > 0;

  // ---- duplicate-id
  unique('feature', 'features/', features.map((f) => ({ id: f.feature.id, path: `${f.file} ${f.path}` })));
  unique('feature group', 'features/', p.featureFiles.map((f) => ({ id: f.data.group, path: f.file })));
  unique('command', 'commands/', commands.map((c) => ({ id: c.command.id, path: `${c.file} ${c.path}` })));
  for (const c of commands) {
    unique(`door of ${c.command.id}`, c.file, c.command.entryPoints.map((d, i) => ({ id: d.id, path: `${c.path}.entryPoints[${i}]` })));
  }
  unique('scenario', 'features/', features.flatMap((f) => f.feature.scenarios.map((s, i) => ({ id: s.id, path: `${f.file} ${f.path}.scenarios[${i}]` }))));
  unique('element', 'elements.json', p.elements.elements.map((e, i) => ({ id: e.id, path: `elements[${i}]` })));
  unique('attribute', 'elements.json', p.elements.attributes.map((a, i) => ({ id: a.id, path: `attributes[${i}]` })));
  unique('palette group', 'elements.json', p.elements.palette.map((g, i) => ({ id: g.id, path: `palette[${i}]` })));
  unique('palette entry', 'elements.json', p.elements.palette.flatMap((g, gi) => g.entries.map((e, i) => ({ id: e.id, path: `palette[${gi}].entries[${i}]` }))));
  unique('property', 'properties.json', p.properties.properties.map((prop, i) => ({ id: prop.id, path: `properties[${i}]` })));
  unique('composite', 'properties.json', p.properties.composites.map((c, i) => ({ id: c.id, path: `composites[${i}]` })));
  unique('coupling', 'properties.json', p.properties.couplings.map((c, i) => ({ id: c.id, path: `couplings[${i}]` })));
  for (const [i, prop] of p.properties.properties.entries()) unique(`subset of ${prop.id}`, 'properties.json', prop.subsets.map((s, si) => ({ id: s.id, path: `properties[${i}].subsets[${si}]` })));
  for (const [i, c] of p.properties.composites.entries()) unique(`subset of ${c.id}`, 'properties.json', c.subsets.map((s, si) => ({ id: s.id, path: `composites[${i}].subsets[${si}]` })));
  // a legacy alias and the property it names are one property
  for (const [i, prop] of p.properties.properties.entries()) {
    const alias = generated[prop.id]?.legacyAliasOf;
    if (alias && propertyById.has(alias)) report('duplicate-id', 'properties.json', `properties[${i}].id`, `${prop.id} is a legacy alias of ${alias}, which is also edited`);
  }
  unique('section', 'properties.json', p.properties.sections.map((s, i) => ({ id: s.id, path: `sections[${i}]` })));
  for (const [si, s] of p.properties.sections.entries()) {
    unique(`group of section ${s.id}`, 'properties.json', s.groups.map((g, i) => ({ id: g.id, path: `sections[${si}].groups[${i}]` })));
  }
  unique('breakpoint', 'properties.json', p.properties.breakpoints.map((b, i) => ({ id: b.id, path: `breakpoints[${i}]` })));
  unique('state', 'properties.json', p.properties.states.map((s, i) => ({ id: s.id, path: `states[${i}]` })));
  unique('key context', 'interactions.json', p.interactions.keyContexts.map((k, i) => ({ id: k.id, path: `keyContexts[${i}]` })));
  unique('constant', 'interactions.json', p.interactions.constants.map((c, i) => ({ id: c.id, path: `constants[${i}]` })));
  unique('gesture', 'interactions.json', p.interactions.gestures.map((g, i) => ({ id: g.id, path: `gestures[${i}]` })));
  unique('viewport', 'environment.json', p.environment.viewports.map((v, i) => ({ id: v.id, path: `viewports[${i}]` })));
  unique('reference', 'references.json', p.references.references.map((r, i) => ({ id: `${r.kind}:${r.id}`, path: `references[${i}]` })));
  unique('consumer field', 'consumers.json', p.consumers.consumers.map((c, i) => ({ id: c.field, path: `consumers[${i}]` })));

  // ---- unknown-reference
  const ref = (ok: boolean, file: string, path: string, message: string) => {
    if (!ok) report('unknown-reference', file, path, message);
  };
  if (!p.environment.locales.available.includes(p.environment.locales.default)) {
    report('unknown-reference', 'environment.json', 'locales.default', `default locale "${p.environment.locales.default}" is not an available locale`);
  }
  for (const [i, e] of p.elements.elements.entries()) {
    if (e.naturalChild !== null) ref(elementById.has(e.naturalChild), 'elements.json', `elements[${i}].naturalChild`, `unknown element type "${e.naturalChild}"`);
    if (e.tag === null && e.content !== 'markup') report('schema', 'elements.json', `elements[${i}].tag`, 'only an element whose content is "markup" may have no tag');
    for (const name of Object.keys(e.defaultStyles)) {
      if (!isShorthand(name)) ref(propertyById.has(name), 'elements.json', `elements[${i}].defaultStyles.${name}`, `"${name}" is not an edited property of properties.json`);
    }
  }
  for (const [i, a] of p.elements.attributes.entries()) {
    if (a.elements !== 'all') for (const id of a.elements) ref(elementById.has(id), 'elements.json', `attributes[${i}].elements`, `unknown element type "${id}"`);
    ref(commandById.has(a.command), 'elements.json', `attributes[${i}].command`, `unknown command "${a.command}"`);
  }
  for (const [gi, g] of p.elements.palette.entries()) {
    for (const [i, e] of g.entries.entries()) {
      ref(elementById.has(e.element), 'elements.json', `palette[${gi}].entries[${i}].element`, `unknown element type "${e.element}"`);
      ref(featureIndex.has(e.feature), 'elements.json', `palette[${gi}].entries[${i}].feature`, `unknown feature "${e.feature}"`);
    }
  }
  const checkPlace = (file: string, path: string, item: { section: string; group: string }) => {
    const section = p.properties.sections.find((s) => s.id === item.section);
    ref(section !== undefined, file, `${path}.section`, `unknown section "${item.section}"`);
    if (section) ref(section.groups.some((g) => g.id === item.group), file, `${path}.group`, `section "${item.section}" has no group "${item.group}"`);
  };
  for (const [i, prop] of p.properties.properties.entries()) {
    checkPlace('properties.json', `properties[${i}]`, prop);
    ref(generated[prop.id] !== undefined, 'properties.json', `properties[${i}].id`, `"${prop.id}" is not a CSS property of the generated web data`);
    for (const [di, d] of prop.doors.entries()) ref(doorByRef.has(d), 'properties.json', `properties[${i}].doors[${di}]`, `unknown door "${d}"`);
  }
  for (const [i, c] of p.properties.composites.entries()) {
    checkPlace('properties.json', `composites[${i}]`, c);
    for (const [di, d] of c.doors.entries()) ref(doorByRef.has(d), 'properties.json', `composites[${i}].doors[${di}]`, `unknown door "${d}"`);
  }
  for (const [i, k] of p.interactions.keyContexts.entries()) {
    if (k.inherits !== null) ref(contextIds.has(k.inherits), 'interactions.json', `keyContexts[${i}].inherits`, `unknown key context "${k.inherits}"`);
  }
  for (const c of commands) {
    ref(featureIndex.has(c.command.introducedBy), c.file, `${c.path}.introducedBy`, `unknown feature "${c.command.introducedBy}"`);
  }
  for (const { file, path, command, door } of doors) {
    ref(featureIndex.has(door.feature), file, `${path}.feature`, `unknown feature "${door.feature}"`);
    for (const [name, value] of Object.entries(door.args)) {
      const arg = command.args[name];
      if (!arg) {
        report('unknown-reference', file, `${path}.args.${name}`, `${command.id} has no argument "${name}"`);
        continue;
      }
      const text = typeof value === 'string' ? value : null;
      if (arg.type === 'enum') ref(text !== null && arg.values.includes(text), file, `${path}.args.${name}`, `"${String(value)}" is not one of ${arg.values.join(', ')}`);
      if (arg.type === 'palette-entry') ref(text !== null && paletteEntryIds.has(text), file, `${path}.args.${name}`, `unknown palette entry "${String(value)}"`);
      if (arg.type === 'property') ref(text !== null && (propertyById.has(text) || compositeById.has(text)), file, `${path}.args.${name}`, `unknown property or composite "${String(value)}"`);
      if (arg.type === 'attribute') ref(text !== null && attributeById.has(text), file, `${path}.args.${name}`, `unknown attribute "${String(value)}"`);
      if (arg.type === 'breakpoint') ref(text !== null && breakpointIds.has(text), file, `${path}.args.${name}`, `unknown breakpoint "${String(value)}"`);
      if (arg.type === 'state') ref(text !== null && stateIds.has(text), file, `${path}.args.${name}`, `unknown state "${String(value)}"`);
    }
    const gesture = 'gesture' in door && door.gesture !== null ? door.gesture : null;
    if (gesture !== null) ref(gestureById.has(gesture), file, `${path}.gesture`, `unknown gesture "${gesture}"`);
    const modifier = 'modifier' in door ? door.modifier : null;
    if (modifier !== null) {
      const declared = gesture !== null ? gestureById.get(gesture)?.modifiers.some((m) => m.key === modifier) : false;
      ref(declared === true, file, `${path}.modifier`, `modifier ${modifier} has no meaning declared in gesture "${gesture ?? 'none'}"`);
    }
    if (door.kind === 'shortcut') ref(contextIds.has(door.context), file, `${path}.context`, `unknown key context "${door.context}"`);
    if (door.kind === 'inspector-field') {
      const named = [door.property, door.composite, door.attribute].filter((x) => x !== null).length;
      if (named !== 1) report('schema', file, path, 'an inspector field names exactly one property, one composite or one attribute');
      if (door.property !== null) ref(propertyById.has(door.property), file, `${path}.property`, `unknown property "${door.property}"`);
      if (door.composite !== null) ref(compositeById.has(door.composite), file, `${path}.composite`, `unknown composite "${door.composite}"`);
      if (door.attribute !== null) {
        const attr = attributeById.get(door.attribute);
        ref(attr !== undefined, file, `${path}.attribute`, `unknown attribute "${door.attribute}"`);
        if (attr) ref(attr.command === command.id, file, `${path}.attribute`, `attribute "${attr.id}" is written by ${attr.command}, not by ${command.id}`);
      }
    }
    for (const name of door.adapter.writes) {
      if (!isShorthand(name)) ref(propertyById.has(name), file, `${path}.adapter.writes`, `"${name}" is not an edited property of properties.json`);
    }
    const offers = door.adapter.offers;
    if (offers) ref(propertyById.has(offers.property) || compositeById.has(offers.property), file, `${path}.adapter.offers.property`, `unknown property or composite "${offers.property}"`);
  }
  for (const f of features) {
    for (const [i, id] of f.feature.commands.entries()) ref(commandById.has(id), f.file, `${f.path}.commands[${i}]`, `unknown command "${id}"`);
    for (const [i, id] of f.feature.dependsOn.entries()) ref(featureIndex.has(id), f.file, `${f.path}.dependsOn[${i}]`, `unknown feature "${id}"`);
    for (const [si, s] of f.feature.scenarios.entries()) {
      const path = `${f.path}.scenarios[${si}].setup`;
      ref(contextIds.has(s.setup.context), f.file, `${path}.context`, `unknown key context "${s.setup.context}"`);
      ref(breakpointIds.has(s.setup.breakpoint), f.file, `${path}.breakpoint`, `unknown breakpoint "${s.setup.breakpoint}"`);
      ref(stateIds.has(s.setup.state), f.file, `${path}.state`, `unknown state "${s.setup.state}"`);
      ref(viewportIds.has(s.setup.viewport), f.file, `${path}.viewport`, `unknown viewport "${s.setup.viewport}"`);
      ref(p.environment.zoomLevels.includes(s.setup.zoom), f.file, `${path}.zoom`, `zoom ${s.setup.zoom} is not one of the environment's zoom levels`);
      ref(p.environment.locales.available.includes(s.setup.locale), f.file, `${path}.locale`, `locale "${s.setup.locale}" is not available`);
    }
  }

  // ---- door-unknown-command: a door reference names a command, then one of its doors
  for (const f of features) {
    for (const [si, s] of f.feature.scenarios.entries()) {
      for (const [di, doorRef] of s.doors.entries()) {
        const [commandPart = '', doorPart = ''] = doorRef.split('#');
        const command = commandById.get(commandPart);
        const path = `${f.path}.scenarios[${si}].doors[${di}]`;
        if (!command) report('door-unknown-command', f.file, path, `door "${doorRef}" points to unknown command "${commandPart}"`);
        else if (!command.entryPoints.some((d) => d.id === doorPart)) report('door-unknown-command', f.file, path, `command ${commandPart} has no door "${doorPart}"`);
      }
    }
  }

  // ---- command-without-door
  for (const c of commands) {
    if (c.command.entryPoints.length === 0) report('command-without-door', c.file, `${c.path}.entryPoints`, `command ${c.command.id} has no door`);
  }

  // ---- feature-command-link: the feature that introduces a command, and the feature of each door, list that command
  const featureById = new Map(features.map((f) => [f.feature.id, f]));
  for (const c of commands) {
    const introducer = featureById.get(c.command.introducedBy);
    if (introducer && !introducer.feature.commands.includes(c.command.id)) {
      report('feature-command-link', c.file, `${c.path}.introducedBy`, `feature ${introducer.feature.id} introduces ${c.command.id} but does not list it in its commands`);
    }
  }
  for (const { file, path, command, door } of doors) {
    const owner = featureById.get(door.feature);
    if (owner && !owner.feature.commands.includes(command.id)) {
      report('feature-command-link', file, `${path}.feature`, `door ${command.id}#${door.id} belongs to feature ${owner.feature.id}, which does not list ${command.id}`);
    }
  }

  // ---- order: nothing needs what is introduced later
  for (const f of features) {
    for (const [i, id] of f.feature.commands.entries()) {
      const command = commandById.get(id);
      const at = command ? featureIndex.get(command.introducedBy) : undefined;
      if (at !== undefined && at > f.index) {
        report('order', f.file, `${f.path}.commands[${i}]`, `feature ${f.feature.id} (#${f.index + 1}) needs ${id}, introduced later by ${command?.introducedBy} (#${at + 1})`);
      }
    }
    for (const [i, id] of f.feature.dependsOn.entries()) {
      const at = featureIndex.get(id);
      if (at !== undefined && at >= f.index) {
        report('order', f.file, `${f.path}.dependsOn[${i}]`, `feature ${f.feature.id} (#${f.index + 1}) depends on ${id} (#${at + 1}), which is not earlier`);
      }
    }
  }
  for (const { file, path, command, door } of doors) {
    const doorAt = featureIndex.get(door.feature);
    const commandAt = featureIndex.get(command.introducedBy);
    if (doorAt !== undefined && commandAt !== undefined && doorAt < commandAt) {
      report('order', file, `${path}.feature`, `door ${command.id}#${door.id} arrives with ${door.feature} (#${doorAt + 1}), before its command is introduced by ${command.introducedBy} (#${commandAt + 1})`);
    }
  }

  // ---- spec-missing
  for (const f of features) {
    if (f.feature.spec !== null && !input.fileExists(f.feature.spec)) report('spec-missing', f.file, `${f.path}.spec`, `spec file ${f.feature.spec} does not exist`);
  }
  for (const [i, c] of p.interactions.constants.entries()) {
    if (!input.fileExists(c.source)) report('spec-missing', 'interactions.json', `constants[${i}].source`, `spec file ${c.source} does not exist`);
  }
  for (const [i, g] of p.interactions.gestures.entries()) {
    if (!input.fileExists(g.source)) report('spec-missing', 'interactions.json', `gestures[${i}].source`, `spec file ${g.source} does not exist`);
  }

  // ---- i18n-missing
  const keyUses = new Map<string, string>();
  const noteKey = (key: string | null, where: string) => {
    if (key !== null && !keyUses.has(key)) keyUses.set(key, where);
  };
  for (const c of commands) {
    noteKey(c.command.labelKey, `${c.file} ${c.path}.labelKey`);
    noteKey(c.command.availability.refusalKey, `${c.file} ${c.path}.availability`);
    c.command.refusals.forEach((k, i) => noteKey(k, `${c.file} ${c.path}.refusals[${i}]`));
    if (c.command.confirmation) {
      noteKey(c.command.confirmation.messageKey, `${c.file} ${c.path}.confirmation`);
      noteKey(c.command.confirmation.confirmKey, `${c.file} ${c.path}.confirmation`);
      noteKey(c.command.confirmation.cancelKey, `${c.file} ${c.path}.confirmation`);
    }
  }
  for (const { file, path, door } of doors) {
    noteKey(door.labelKey, `${file} ${path}.labelKey`);
    noteKey(door.disabledReasonKey, `${file} ${path}.disabledReasonKey`);
  }
  for (const { file, data } of p.featureFiles) {
    noteKey(data.titleKey, `${file} titleKey`);
  }
  for (const f of features) {
    noteKey(f.feature.titleKey, `${f.file} ${f.path}.titleKey`);
    for (const [si, s] of f.feature.scenarios.entries()) {
      s.refusals.forEach((r, i) => noteKey(r.key, `${f.file} ${f.path}.scenarios[${si}].refusals[${i}]`));
      s.expect.render?.feedback.forEach((fb, i) => noteKey(fb.key, `${f.file} ${f.path}.scenarios[${si}].expect.render.feedback[${i}]`));
    }
  }
  p.elements.elements.forEach((e, i) => {
    noteKey(e.labelKey, `elements.json elements[${i}].labelKey`);
    noteKey(e.defaultTextKey, `elements.json elements[${i}].defaultTextKey`);
  });
  p.elements.attributes.forEach((a, i) => noteKey(a.labelKey, `elements.json attributes[${i}].labelKey`));
  p.elements.palette.forEach((g, gi) => {
    noteKey(g.labelKey, `elements.json palette[${gi}].labelKey`);
    g.entries.forEach((e, i) => noteKey(e.labelKey, `elements.json palette[${gi}].entries[${i}].labelKey`));
  });
  p.properties.sections.forEach((s, si) => {
    noteKey(s.labelKey, `properties.json sections[${si}].labelKey`);
    s.groups.forEach((g, i) => noteKey(g.labelKey, `properties.json sections[${si}].groups[${i}].labelKey`));
  });
  p.properties.breakpoints.forEach((b, i) => noteKey(b.labelKey, `properties.json breakpoints[${i}].labelKey`));
  p.properties.states.forEach((s, i) => noteKey(s.labelKey, `properties.json states[${i}].labelKey`));
  p.properties.properties.forEach((prop, i) => noteKey(prop.labelKey, `properties.json properties[${i}].labelKey`));
  p.properties.composites.forEach((c, i) => noteKey(c.labelKey, `properties.json composites[${i}].labelKey`));
  p.interactions.keyContexts.forEach((k, i) => noteKey(k.labelKey, `interactions.json keyContexts[${i}].labelKey`));

  const catalogues = new Map<string, Record<string, unknown>>();
  for (const locale of p.environment.locales.available) {
    const catalogue = input.catalogues[locale];
    if (catalogue === null || typeof catalogue !== 'object') {
      report('i18n-missing', `i18n/${locale}`, '', `no ${locale} catalogue`);
    } else {
      catalogues.set(locale, catalogue as Record<string, unknown>);
    }
  }
  for (const [key, where] of keyUses) {
    for (const [locale, catalogue] of catalogues) {
      const text = catalogue[key];
      if (typeof text !== 'string' || text.trim() === '') report('i18n-missing', `i18n/${locale}`, key, `key "${key}" (used by ${where}) is missing in ${locale}`);
    }
  }
  const [firstLocale, ...otherLocales] = [...catalogues.keys()];
  if (firstLocale !== undefined) {
    const base = catalogues.get(firstLocale) ?? {};
    for (const locale of otherLocales) {
      const other = catalogues.get(locale) ?? {};
      for (const key of Object.keys(base)) if (!(key in other)) report('i18n-missing', `i18n/${locale}`, key, `key "${key}" exists in ${firstLocale} but is missing in ${locale}`);
      for (const key of Object.keys(other)) if (!(key in base)) report('i18n-missing', `i18n/${firstLocale}`, key, `key "${key}" exists in ${locale} but is missing in ${firstLocale}`);
      for (const key of Object.keys(base)) {
        const a = base[key];
        const b = other[key];
        if (typeof a === 'string' && typeof b === 'string' && placeholders(a).join(',') !== placeholders(b).join(',')) {
          report('i18n-missing', `i18n/${locale}`, key, `key "${key}" has placeholders {${placeholders(a).join('}, {')}} in ${firstLocale} but {${placeholders(b).join('}, {')}} in ${locale}`);
        }
      }
    }
  }

  // ---- value-set: a door offers the generated list of its property or composite, or a declared subset of it
  const cssNameOf = (target: string): string | null => {
    if (propertyById.has(target)) return target;
    return compositeById.get(target)?.shorthand ?? null;
  };
  const subsetsOf = (target: string): Subset[] => propertyById.get(target)?.subsets ?? compositeById.get(target)?.subsets ?? [];
  const controlOf = (target: string): string | undefined => propertyById.get(target)?.control ?? compositeById.get(target)?.control;
  const offeredGenerated = new Map<string, string>(); // css name → first door that offers its generated list
  for (const { file, path, command, door, ref: doorRef } of doors) {
    const offers = door.adapter.offers;
    // a button that writes one fixed value (args.value) offers no list
    if (door.kind === 'inspector-field' && (door.property !== null || door.composite !== null) && typeof door.args.value !== 'string') {
      const target = door.property ?? door.composite ?? '';
      const control = controlOf(target);
      if (control !== undefined && LIST_CONTROLS.has(control) && (offers === null || offers.property !== target)) {
        report('value-set', file, `${path}.adapter.offers`, `${doorRef} edits ${target}, a ${control}, but declares no list of values for it`);
      }
    }
    if (!offers) continue;
    if (!propertyById.has(offers.property) && !compositeById.has(offers.property)) continue;
    if (offers.list === 'generated') {
      const name = cssNameOf(offers.property);
      if (name === null) {
        report('value-set', file, `${path}.adapter.offers.list`, `${command.id}#${door.id} offers the generated list of ${offers.property}, which stands for no CSS property`);
        continue;
      }
      const g = generated[name];
      const control = controlOf(offers.property);
      if (g && g.keywords.length === 0 && (control === 'keyword-menu' || control === 'font-menu')) {
        report('value-set', file, `${path}.adapter.offers.list`, `${doorRef} is a menu but the generated list of ${name} has no keyword: declare a subset`);
      }
      if (!offeredGenerated.has(name)) offeredGenerated.set(name, `${file} ${path}`);
    } else if (!subsetsOf(offers.property).some((s) => s.id === offers.list)) {
      report('value-set', file, `${path}.adapter.offers.list`, `${doorRef} offers "${offers.list}", which is neither "generated" nor a subset declared on ${offers.property}`);
    }
  }

  // ---- css-syntax: every value a door offers or writes matches the official syntax (CSSTree's lexer)
  const implementedOnly = new Set<string>();
  const syntax = (file: string, path: string, property: string, value: string) => {
    const result = css.matchEither(property, value);
    if (!result.ok) report('css-syntax', file, path, `"${value}" is not a valid value of ${property}: ${result.reason}`);
    else if (result.by === 'implemented') implementedOnly.add(`${property}: ${value}`);
  };
  for (const [name, where] of offeredGenerated) {
    const g = generated[name];
    if (!g) continue;
    const [file = '', ...rest] = where.split(' ');
    for (const keyword of g.keywords) syntax(file, `${rest.join(' ')} (generated keywords of ${name})`, name, keyword);
    for (const unit of g.units) syntax(file, `${rest.join(' ')} (generated units of ${name})`, name, `1${unit}`);
  }
  const checkSubsets = (file: string, path: string, name: string | null, subsets: Subset[]) => {
    for (const [si, s] of subsets.entries()) {
      if (name === null) {
        report('value-set', file, `${path}.subsets[${si}]`, 'a composite that stands for no CSS property cannot declare a subset of its values');
        continue;
      }
      (s.values ?? []).forEach((value, vi) => syntax(file, `${path}.subsets[${si}].values[${vi}]`, name, value));
      (s.units ?? []).forEach((unit, ui) => syntax(file, `${path}.subsets[${si}].units[${ui}]`, name, `1${unit}`));
    }
  };
  p.properties.properties.forEach((prop, i) => checkSubsets('properties.json', `properties[${i}]`, prop.id, prop.subsets));
  p.properties.composites.forEach((c, i) => checkSubsets('properties.json', `composites[${i}]`, c.shorthand, c.subsets));
  for (const { file, path, door } of doors) {
    const property = door.args.property;
    const value = door.args.value;
    if (typeof property === 'string' && typeof value === 'string') {
      const name = cssNameOf(property);
      if (name !== null) syntax(file, `${path}.args.value`, name, value);
    }
  }
  for (const [i, e] of p.elements.elements.entries()) {
    for (const [name, value] of Object.entries(e.defaultStyles)) if (generated[name]) syntax('elements.json', `elements[${i}].defaultStyles.${name}`, name, value);
  }
  for (const [i, c] of p.properties.couplings.entries()) {
    const path = `couplings[${i}]`;
    if (generated[c.trigger.property]) (c.trigger.values ?? []).forEach((v, vi) => syntax('properties.json', `${path}.trigger.values[${vi}]`, c.trigger.property, v));
    if (c.condition.property !== null && generated[c.condition.property]) c.condition.values.forEach((v, vi) => syntax('properties.json', `${path}.condition.values[${vi}]`, c.condition.property ?? '', v));
    if (c.effect.value !== null && generated[c.effect.property]) syntax('properties.json', `${path}.effect.value`, c.effect.property, c.effect.value);
  }

  // ---- shorthand-write: the document stores only longhands
  for (const [i, prop] of p.properties.properties.entries()) {
    if (isShorthand(prop.id)) report('shorthand-write', 'properties.json', `properties[${i}].id`, `${prop.id} is a shorthand of ${generated[prop.id]?.longhands.join(', ')}: edit it as a composite`);
  }
  for (const { file, path, door, ref: doorRef } of doors) {
    for (const name of door.adapter.writes) if (isShorthand(name)) report('shorthand-write', file, `${path}.adapter.writes`, `${doorRef} writes the shorthand ${name}; a door writes its longhands (${generated[name]?.longhands.join(', ')})`);
  }
  for (const [i, e] of p.elements.elements.entries()) {
    for (const name of Object.keys(e.defaultStyles)) if (isShorthand(name)) report('shorthand-write', 'elements.json', `elements[${i}].defaultStyles.${name}`, `default style ${name} is a shorthand; store its longhands`);
  }

  // ---- composite: a shorthand is edited as a composite whose door writes every longhand in one undoable command
  const compositesOf = new Map<string, Composite[]>();
  for (const [i, c] of p.properties.composites.entries()) {
    const path = `composites[${i}]`;
    for (const name of c.longhands) {
      if (!compositesOf.has(name)) compositesOf.set(name, []);
      compositesOf.get(name)?.push(c);
      if (!propertyById.has(name)) report('composite', 'properties.json', `${path}.longhands`, `${c.id} writes ${name}, which is not an edited property`);
    }
    if (c.shorthand === null) {
      if (c.omits !== null) report('composite', 'properties.json', `${path}.omits`, `${c.id} stands for no shorthand, so it omits nothing`);
    } else {
      const expected = generated[c.shorthand]?.longhands ?? [];
      if (expected.length === 0) {
        report('composite', 'properties.json', `${path}.shorthand`, `${c.shorthand} is not a shorthand in the generated web data`);
      } else {
        const omitted = c.omits?.longhands ?? [];
        const missing = expected.filter((l) => !c.longhands.includes(l) && !omitted.includes(l));
        const extra = [...c.longhands, ...omitted].filter((l) => !expected.includes(l));
        const both = c.longhands.filter((l) => omitted.includes(l));
        if (missing.length > 0) report('composite', 'properties.json', `${path}.longhands`, `${c.id} leaves out ${missing.join(', ')}, which the ${c.shorthand} shorthand sets; write them or declare them in omits with the reason`);
        if (extra.length > 0) report('composite', 'properties.json', `${path}.longhands`, `${extra.join(', ')} are not longhands of ${c.shorthand}`);
        if (both.length > 0) report('composite', 'properties.json', `${path}.omits`, `${both.join(', ')} are both written and omitted`);
      }
    }
    for (const [di, d] of c.doors.entries()) {
      const entry = doorByRef.get(d);
      if (!entry) continue;
      const missing = c.longhands.filter((l) => !entry.door.adapter.writes.includes(l));
      if (missing.length > 0) report('composite', 'properties.json', `${path}.doors[${di}]`, `${d} is a door of ${c.id} but does not write ${missing.join(', ')}: a composite door writes every longhand in one command`);
      if (!entry.command.history.undoable) report('composite', 'properties.json', `${path}.doors[${di}]`, `${d} writes ${c.id} through ${entry.command.id}, which is not undoable: a composite write is one undo step`);
      if (entry.door.kind === 'inspector-field' && entry.door.composite !== c.id) report('composite', entry.file, `${entry.path}.composite`, `${d} is listed as a door of ${c.id} but edits ${entry.door.composite ?? entry.door.property ?? 'nothing'}`);
    }
  }
  for (const { file, path, door, ref: doorRef } of doors) {
    if (door.kind === 'inspector-field' && door.composite !== null) {
      const c = compositeById.get(door.composite);
      if (c && !c.doors.includes(doorRef)) report('composite', file, `${path}.composite`, `${doorRef} edits ${c.id} but ${c.id} does not list it among its doors`);
    }
    // a longhand that has no control of its own is written only with the rest of its composite
    for (const name of door.adapter.writes) {
      if (propertyById.get(name)?.control !== 'part-of-composite') continue;
      const whole = (compositesOf.get(name) ?? []).some((c) => c.longhands.every((l) => door.adapter.writes.includes(l)));
      if (!whole) report('composite', file, `${path}.adapter.writes`, `${doorRef} writes ${name} without the rest of its composite`);
    }
  }
  for (const [i, prop] of p.properties.properties.entries()) {
    if (prop.control === 'part-of-composite' && !compositesOf.has(prop.id)) report('composite', 'properties.json', `properties[${i}].control`, `${prop.id} is part of no composite`);
  }

  // ---- door-writes: a property lists exactly the doors that write it, and a field writes what it edits
  const writers = new Map<string, string[]>();
  for (const { ref: doorRef, door } of doors) {
    for (const name of door.adapter.writes) {
      if (!writers.has(name)) writers.set(name, []);
      writers.get(name)?.push(doorRef);
    }
  }
  for (const [i, prop] of p.properties.properties.entries()) {
    const actual = writers.get(prop.id) ?? [];
    for (const d of actual) if (!prop.doors.includes(d)) report('door-writes', 'properties.json', `properties[${i}].doors`, `${d} writes ${prop.id} but is not listed among its doors`);
    for (const d of prop.doors) if (doorByRef.has(d) && !actual.includes(d)) report('door-writes', 'properties.json', `properties[${i}].doors`, `${d} is listed among the doors of ${prop.id} but does not write it`);
  }
  for (const { file, path, door, ref: doorRef } of doors) {
    if (door.kind === 'inspector-field' && door.property !== null && propertyById.has(door.property) && !door.adapter.writes.includes(door.property)) {
      report('door-writes', file, `${path}.adapter.writes`, `${doorRef} edits ${door.property} but does not write it`);
    }
  }

  // ---- individual-transform: movement, rotation and scaling use translate, rotate and scale
  for (const { file, path, door, ref: doorRef } of doors) {
    if (!door.adapter.writes.includes('transform')) continue;
    if (door.kind === 'canvas-handle' || door.kind === 'canvas-drag') {
      report('individual-transform', file, `${path}.adapter.writes`, `${doorRef} is a canvas handle and writes transform: handles write translate, rotate or scale`);
    }
    const others = door.adapter.writes.filter((w) => w !== 'transform');
    if (others.length > 0) report('individual-transform', file, `${path}.adapter.writes`, `${doorRef} writes transform together with ${others.join(', ')}: transform only holds the functions translate, rotate and scale do not cover`);
  }

  // ---- coupling: rules are data made of a closed list of predicates and actions
  for (const [i, c] of p.properties.couplings.entries()) {
    const path = `couplings[${i}]`;
    const bad = (at: string, message: string) => report('coupling', 'properties.json', `${path}.${at}`, message);
    if (!(COUPLING_PREDICATES as readonly string[]).includes(c.condition.predicate)) bad('condition.predicate', `unknown predicate "${c.condition.predicate}": use one of ${COUPLING_PREDICATES.join(', ')}`);
    if (!(COUPLING_ACTIONS as readonly string[]).includes(c.effect.action)) bad('effect.action', `unknown action "${c.effect.action}": use one of ${COUPLING_ACTIONS.join(', ')}`);
    if (!propertyById.has(c.trigger.property)) bad('trigger.property', `"${c.trigger.property}" is not an edited property`);
    if (c.trigger.via !== null) {
      const via = compositeById.get(c.trigger.via);
      if (!via) bad('trigger.via', `unknown composite "${c.trigger.via}"`);
      else if (!via.longhands.includes(c.trigger.property)) bad('trigger.via', `${via.id} does not write ${c.trigger.property}`);
    }
    if (c.condition.predicate === 'always') {
      if (c.condition.property !== null || c.condition.values.length > 0) bad('condition', '"always" takes no property and no values');
    } else if (c.condition.property === null || !propertyById.has(c.condition.property) || c.condition.values.length === 0) {
      bad('condition', `"${c.condition.predicate}" needs an edited property and at least one value`);
    }
    if (!propertyById.has(c.effect.property)) bad('effect.property', `"${c.effect.property}" is not an edited property`);
    const takesValue = c.effect.action === 'setValue' || c.effect.action === 'setParentValue';
    if (takesValue !== (c.effect.value !== null)) bad('effect.value', takesValue ? `"${c.effect.action}" needs a value` : `"${c.effect.action}" takes no value`);
    if (!featureIndex.has(c.feature)) bad('feature', `unknown feature "${c.feature}"`);
  }

  // ---- history: every command declares how it meets the history
  const writesProperties = new Set(doors.filter((d) => d.door.adapter.writes.length > 0).map((d) => d.command.id));
  for (const c of commands) {
    const h = c.command.history;
    const path = `${c.path}.history`;
    if (!h.undoable) {
      if (writesProperties.has(c.command.id)) report('history', c.file, path, `${c.command.id} writes properties, so it changes the document and must be undoable`);
      continue;
    }
    const gesture = c.command.entryPoints.some((d) => (GESTURE_DOOR_KINDS as readonly DoorKind[]).includes(d.kind));
    if (gesture && h.transaction !== 'per-gesture') report('history', c.file, `${path}.transaction`, `${c.command.id} has pointer-gesture doors: one transaction per gesture`);
    if (!gesture && h.transaction !== 'per-dispatch') report('history', c.file, `${path}.transaction`, `${c.command.id} has no pointer-gesture door: one transaction per dispatch`);
    if (h.coalesce !== 'none') {
      const constant = constantById.get(h.coalesce.within);
      if (!constant) report('history', c.file, `${path}.coalesce.within`, `unknown constant "${h.coalesce.within}"`);
      else if (constant.unit !== 'ms') report('history', c.file, `${path}.coalesce.within`, `constant ${constant.id} is in ${constant.unit}, not ms`);
    }
  }

  // ---- reference: every id the data names for code is planned or registered
  const referenced = new Map<string, string>(); // "kind:id" → first place
  const need = (kind: ReferenceKind, id: string, where: string) => {
    const key = `${kind}:${id}`;
    if (!referenced.has(key)) referenced.set(key, where);
  };
  for (const c of commands) {
    need('handler', c.command.id, `${c.file} ${c.path}.id`);
    need('predicate', c.command.availability.predicate, `${c.file} ${c.path}.availability.predicate`);
  }
  p.properties.properties.forEach((prop, i) => {
    need('codec', prop.codec, `properties.json properties[${i}].codec`);
    need('predicate', prop.appliesTo, `properties.json properties[${i}].appliesTo`);
  });
  p.properties.composites.forEach((c, i) => {
    need('codec', c.codec, `properties.json composites[${i}].codec`);
    need('predicate', c.appliesTo, `properties.json composites[${i}].appliesTo`);
  });
  p.properties.couplings.forEach((c, i) => {
    // an id outside the closed lists is reported by the coupling rule
    if ((COUPLING_PREDICATES as readonly string[]).includes(c.condition.predicate)) need('predicate', c.condition.predicate, `properties.json couplings[${i}].condition.predicate`);
    if ((COUPLING_ACTIONS as readonly string[]).includes(c.effect.action)) need('action', c.effect.action, `properties.json couplings[${i}].effect.action`);
  });
  const listed = new Map(p.references.references.map((r, i) => [`${r.kind}:${r.id}`, { entry: r, index: i }]));
  const registeredIn = (kind: ReferenceKind, id: string) => (input.registered[kind] ?? []).includes(id);
  for (const [key, where] of referenced) {
    const [kind = '', ...rest] = key.split(':');
    const id = rest.join(':');
    const entry = listed.get(key);
    const inCode = registeredIn(kind as ReferenceKind, id);
    if (!entry && !inCode) {
      const [file = '', ...path] = where.split(' ');
      report('reference', file, path.join(' '), `${kind} "${id}" is neither planned in references.json nor registered in code`);
    }
  }
  for (const [key, { entry, index }] of listed) {
    const path = `references[${index}]`;
    if (!referenced.has(key)) report('reference', 'references.json', path, `${entry.kind} "${entry.id}" is listed but nothing in the manifest references it`);
    const inCode = registeredIn(entry.kind, entry.id);
    if (entry.status === 'registered' && !inCode) report('reference', 'references.json', `${path}.status`, `${entry.kind} "${entry.id}" says registered but no code registers it`);
    if (entry.status === 'planned' && inCode) report('reference', 'references.json', `${path}.status`, `${entry.kind} "${entry.id}" is registered in code: mark it registered`);
  }

  // ---- consumer: every field of every schema has a module that reads it
  const fields = schemaFields();
  const readers = new Map(p.consumers.consumers.map((c, i) => [c.field, i]));
  for (const field of fields) if (!readers.has(field)) report('consumer', 'consumers.json', 'consumers', `field ${field} has no reader: name the module that reads it, or remove the field`);
  const fieldSet = new Set(fields);
  for (const [field, i] of readers) if (!fieldSet.has(field)) report('consumer', 'consumers.json', `consumers[${i}].field`, `${field} is not a field of any schema`);

  // ---- html-model: element types follow the generated HTML content model
  const html = p.html.elements;
  const refusal = (parent: ElementType, child: ElementType): string | null => {
    if (parent.content !== 'children') return `${parent.id} holds ${parent.content}, not element children`;
    if (child.namespace === 'svg') return parent.tag !== null && html[parent.tag]?.foreign === true ? null : `${child.id} is an SVG element and goes only inside a foreign (svg) element`;
    if (parent.tag !== null && html[parent.tag]?.foreign === true) return `${parent.id} is foreign content and holds only SVG elements`;
    if (parent.tag === null || child.tag === null) return 'an element without a tag has no content model';
    return htmlRefusal(p.html, parent.tag, child.tag);
  };
  for (const [i, e] of p.elements.elements.entries()) {
    const path = `elements[${i}]`;
    const meta = e.tag !== null ? html[e.tag] : undefined;
    if (e.namespace === 'html' && e.tag !== null) {
      if (!meta) report('html-model', 'elements.json', `${path}.tag`, `<${e.tag}> is not an element of the generated HTML data`);
      else if (meta.deprecated) report('html-model', 'elements.json', `${path}.tag`, `<${e.tag}> is deprecated in the generated HTML data`);
      for (const tag of e.alternativeTags) if (!html[tag] || html[tag]?.deprecated) report('html-model', 'elements.json', `${path}.alternativeTags`, `<${tag}> is not a current HTML element`);
    }
    if (e.namespace === 'svg' && e.tag !== null && html[e.tag]) report('html-model', 'elements.json', `${path}.namespace`, `<${e.tag}> is an HTML element, not an SVG one`);
    if (meta?.void && e.content !== 'none') report('html-model', 'elements.json', `${path}.content`, `<${e.tag}> is void, so its content is "none"`);
    if (meta?.textOnly && e.content === 'children') report('html-model', 'elements.json', `${path}.content`, `<${e.tag}> holds text only`);
    if (e.naturalChild !== null) {
      const child = elementById.get(e.naturalChild);
      const reason = child ? refusal(e, child) : null;
      if (reason !== null) report('html-model', 'elements.json', `${path}.naturalChild`, `${e.naturalChild} cannot be a child of ${e.id}: ${reason}`);
    }
  }
  const enumOf = (tag: string | null, attribute: string) => (tag !== null ? html[tag]?.attributes[attribute]?.enum ?? null : null);
  for (const [i, a] of p.elements.attributes.entries()) {
    if (a.html === null || a.keywords.length === 0) continue;
    const targets = a.elements === 'all' ? [] : a.elements;
    for (const id of targets) {
      const values = enumOf(elementById.get(id)?.tag ?? null, a.html);
      if (values === null) continue;
      for (const k of a.keywords) if (!values.includes(k)) report('html-model', 'elements.json', `attributes[${i}].keywords`, `"${k}" is not a value of ${a.html} on <${elementById.get(id)?.tag ?? id}> (${values.join(', ')})`);
    }
  }
  for (const [gi, g] of p.elements.palette.entries()) {
    for (const [ei, entry] of g.entries.entries()) {
      if (entry.inputType === null) continue;
      const values = enumOf(elementById.get(entry.element)?.tag ?? null, 'type');
      if (values !== null && !values.includes(entry.inputType)) report('html-model', 'elements.json', `palette[${gi}].entries[${ei}].inputType`, `"${entry.inputType}" is not an input type (${values.join(', ')})`);
    }
  }

  // ---- chord-conflict: one chord, one binding, per context
  const bound = new Map<string, string>();
  for (const { file, path, command, door } of doors) {
    if (door.kind !== 'shortcut') continue;
    const chord = normaliseChord(door.chord);
    if (chord === null) {
      report('schema', file, `${path}.chord`, `"${door.chord}" is not a chord (modifiers Ctrl, Alt, Shift, Meta, then one key)`);
      continue;
    }
    const slot = `${door.context}|${chord}`;
    const first = bound.get(slot);
    if (first !== undefined) report('chord-conflict', file, `${path}.chord`, `chord ${chord} is bound twice in context "${door.context}": ${first} and ${command.id}#${door.id}`);
    else bound.set(slot, `${command.id}#${door.id}`);
  }

  // ---- modifier-conflict: one meaning per modifier in each gesture
  for (const [gi, g] of p.interactions.gestures.entries()) {
    const meanings = new Map<string, string>();
    for (const [mi, m] of g.modifiers.entries()) {
      const first = meanings.get(m.key);
      if (first !== undefined && first !== m.meaning) {
        report('modifier-conflict', 'interactions.json', `gestures[${gi}].modifiers[${mi}]`, `${m.key} means both "${first}" and "${m.meaning}" in gesture "${g.id}"`);
      } else meanings.set(m.key, m.meaning);
    }
  }

  // ---- scenario-terminal: a scenario ends on the screen, in storage after a reload, or in the exported files
  for (const f of features) {
    for (const [si, s] of f.feature.scenarios.entries()) {
      const render = s.expect.render;
      const renders = render !== null && render.computed.length + render.geometry.length + render.feedback.length > 0;
      if (!renders && s.expect.persistence === null && s.expect.export === null) {
        report('scenario-terminal', f.file, `${f.path}.scenarios[${si}].expect`, `scenario ${s.id} has no end terminal: expect render, persistence or export`);
      }
    }
  }

  const doorsByKind: Record<string, number> = {};
  for (const { door } of doors) doorsByKind[door.kind] = (doorsByKind[door.kind] ?? 0) + 1;
  const referencesByKind: Record<string, number> = {};
  for (const r of p.references.references) referencesByKind[r.kind] = (referencesByKind[r.kind] ?? 0) + 1;
  const summary: ManifestSummary = {
    features: features.length,
    featureGroups: p.featureFiles.length,
    commands: commands.length,
    undoableCommands: commands.filter((c) => c.command.history.undoable).length,
    doors: doors.length,
    doorsByKind: Object.fromEntries(Object.entries(doorsByKind).sort(([a], [b]) => a.localeCompare(b))),
    elements: p.elements.elements.length,
    paletteEntries: paletteEntryIds.size,
    attributes: p.elements.attributes.length,
    generatedProperties: Object.keys(generated).length,
    generatedShorthands: Object.values(generated).filter((g) => g.longhands.length > 0).length,
    generatedElements: Object.keys(html).length,
    properties: p.properties.properties.length,
    composites: p.properties.composites.length,
    couplings: p.properties.couplings.length,
    plannedReferences: p.references.references.filter((r) => r.status === 'planned').length,
    registeredReferences: p.references.references.filter((r) => r.status === 'registered').length,
    referencesByKind: Object.fromEntries(Object.entries(referencesByKind).sort(([a], [b]) => a.localeCompare(b))),
    consumers: p.consumers.consumers.length,
    implementedOnly: [...implementedOnly].sort(),
    constants: p.interactions.constants.length,
    gestures: p.interactions.gestures.length,
    keyContexts: p.interactions.keyContexts.length,
    scenarios: features.reduce((n, f) => n + f.feature.scenarios.length, 0),
    i18nKeys: keyUses.size,
  };
  return { problems, summary };
}

