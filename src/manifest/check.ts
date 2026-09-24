// Validates the manifest: first that no hand-written field holds logic, then every file against its
// schema, then the rules that tie the files together and to the generated web data. Pure: the
// caller supplies the parsed files, the i18n catalogues, a way to ask whether a repository path
// exists and the ids code has registered.
import type { z } from 'zod';
import { createCssMatcher, valueShape, type CssAnalysis, type CssMatcher } from './css.ts';
import { schemaFields } from './fields.ts';
import {
  BROWSERS,
  COUPLING_ACTIONS,
  COUPLING_PREDICATES,
  GESTURE_DOOR_KINDS,
  PAGE_REGIONS,
  REFERENCE_KINDS,
  STRUCTURED_VALUE_TYPES,
  checksFileSchema,
  commandsFileSchema,
  consumersFileSchema,
  elementsFileSchema,
  environmentSchema,
  featuresFileSchema,
  generatedCompatSchema,
  generatedCssSchema,
  generatedHtmlSchema,
  generatedIconsSchema,
  glossarySchema,
  interactionsFileSchema,
  layoutFileSchema,
  menuIdSchema,
  propertiesFileSchema,
  referencesFileSchema,
  type Browser,
  type ChecksFile,
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
  type GeneratedCompat,
  type GeneratedCss,
  type Glossary,
  type LayoutFile,
  type GeneratedHtml,
  type GeneratedIcons,
  type InteractionsFile,
  type PropertiesFile,
  type Recipe,
  type ReferencesFile,
  type Structure,
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
  'all-properties',
  'css-syntax',
  'syntax-fallback',
  'browser-support',
  'vendor-prefix',
  'recipe',
  'structured-value',
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
  'placement',
  'state-placement',
  'label-term',
  'owner',
  'icon-name',
  'icon-required',
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
  // src/i18n/glossary.json: one term per concept in each language
  glossary: unknown;
  // whether a path relative to the repository root exists
  fileExists: (repoPath: string) => boolean;
  // ids that code under src/ registers, by kind (registerHandler, registerPredicate, ...)
  registered: Readonly<Record<ReferenceKind, readonly string[]>>;
  // the text of ARCHITECTURE.md, whose table "Command owners" names the owner module of every command; null when missing
  architecture: string | null;
}

export interface ManifestSummary {
  features: number;
  featureGroups: number;
  commands: number;
  undoableCommands: number;
  doors: number;
  doorsByKind: Record<string, number>;
  // placed doors per region of DESIGN.md (layout.json), and the regions and menus declared
  doorsByRegion: Record<string, number>;
  regions: number;
  menuAnchors: number;
  glossaryConcepts: number;
  elements: number;
  paletteEntries: number;
  attributes: number;
  generatedProperties: number;
  generatedShorthands: number;
  generatedElements: number;
  properties: number;
  composites: number;
  recipes: number;
  structures: number;
  couplings: number;
  // the current stable releases css-compat.json was generated for, and its BCD version
  browsers: Record<Browser, string>;
  compatSource: string;
  // generated keywords of offered lists left out because a browser lacks them
  keywordsLeftOut: number;
  // generated units of offered lists left out because a browser lacks them
  unitsLeftOut: number;
  // recipe values the official syntax rejects and the browser syntax accepts
  recipeBrowserSyntax: string[];
  // each recipe with the spec section and BCD entry it rests on
  recipeSources: string[];
  // each shorthand stored whole, with its reason
  storedWhole: string[];
  // the icon library (name and version, number of icons) and the icons the manifest names
  iconLibrary: string;
  iconsNamed: number;
  doorsWithIcon: number;
  plannedReferences: number;
  registeredReferences: number;
  referencesByKind: Record<string, number>;
  consumers: number;
  // values the official syntax rejects and the browser syntax (CSSTree's MDN data) accepts, all of
  // them for a property of the fallback allowlist
  implementedOnly: string[];
  fallbackAllowlist: string[];
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
  layout: LayoutFile;
  checks: ChecksFile;
  references: ReferencesFile;
  consumers: ConsumersFile;
  css: GeneratedCss;
  compat: GeneratedCompat;
  html: GeneratedHtml;
  icons: GeneratedIcons;
  commandFiles: { file: string; data: CommandsFile }[];
  featureFiles: { file: string; data: FeaturesFile }[];
}

const SINGLE_FILES: Record<string, { key: keyof Parsed; schema: z.ZodType }> = {
  'environment.json': { key: 'environment', schema: environmentSchema },
  'elements.json': { key: 'elements', schema: elementsFileSchema },
  'properties.json': { key: 'properties', schema: propertiesFileSchema },
  'interactions.json': { key: 'interactions', schema: interactionsFileSchema },
  'layout.json': { key: 'layout', schema: layoutFileSchema },
  'checks.json': { key: 'checks', schema: checksFileSchema },
  'references.json': { key: 'references', schema: referencesFileSchema },
  'consumers.json': { key: 'consumers', schema: consumersFileSchema },
  'generated/css-properties.json': { key: 'css', schema: generatedCssSchema },
  'generated/css-compat.json': { key: 'compat', schema: generatedCompatSchema },
  'generated/html-elements.json': { key: 'html', schema: generatedHtmlSchema },
  'generated/icons.json': { key: 'icons', schema: generatedIconsSchema },
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

// ---------------------------------------------------------------- vendor prefixes

// A vendor-prefixed name or value (-webkit-box, -moz-user-select) inside a string.
const VENDOR_PREFIX = /(^|[^a-zA-Z0-9_-])-(webkit|moz|ms|o|khtml|apple|epub)-[a-zA-Z]/i;

// Every string and object key of the hand-written files that holds a vendor prefix, except where skip()
// says a prefix belongs (a compatibility recipe and the writes of its doors).
function prefixProblems(files: Readonly<Record<string, unknown>>, skip: (file: string, path: string) => boolean): Problem[] {
  const problems: Problem[] = [];
  for (const [file, json] of Object.entries(files)) {
    if (file.startsWith('generated/')) continue;
    const visit = (value: unknown, path: string): void => {
      if (skip(file, path)) return;
      if (typeof value === 'string') {
        if (VENDOR_PREFIX.test(value)) problems.push({ rule: 'vendor-prefix', file, path, message: `holds a vendor prefix (${JSON.stringify(value)}): prefixed properties and values appear only in a compatibility recipe` });
      } else if (Array.isArray(value)) {
        value.forEach((item, i) => visit(item, `${path}[${i}]`));
      } else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          const at = path === '' ? key : `${path}.${key}`;
          if (VENDOR_PREFIX.test(key) && !skip(file, at)) problems.push({ rule: 'vendor-prefix', file, path: at, message: `the key ${JSON.stringify(key)} holds a vendor prefix: prefixed properties and values appear only in a compatibility recipe` });
          visit(item, at);
        }
      }
    };
    visit(json, '');
  }
  return problems;
}

// A frozen file cannot change, so its parsed form is kept, per schema: the generated web data, frozen by the
// loader, is parsed once however many times the manifest is checked (every planted fixture shares it).
const parsedFrozen = new WeakMap<z.ZodType, WeakMap<object, z.ZodSafeParseResult<unknown>>>();
function parseFile(schema: z.ZodType, json: unknown): z.ZodSafeParseResult<unknown> {
  if (json === null || typeof json !== 'object' || !Object.isFrozen(json)) return schema.safeParse(json);
  let bySchema = parsedFrozen.get(schema);
  if (!bySchema) {
    bySchema = new WeakMap();
    parsedFrozen.set(schema, bySchema);
  }
  let result = bySchema.get(json);
  if (!result) {
    result = schema.safeParse(json);
    bySchema.set(json, result);
  }
  return result;
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
      const result = parseFile(single.schema, json);
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

// ---------------------------------------------------------------- ARCHITECTURE.md

// The rows of the table under "## Command owners": a module path in backticks, then the command ids it owns in
// backticks. null when the section is missing.
export function architectureOwners(text: string): { module: string; commands: string[]; line: number }[] | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Command owners\s*$/.test(l));
  if (start < 0) return null;
  const rows: { module: string; commands: string[]; line: number }[] = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i] ?? ''); i++) {
    const cells = (lines[i] ?? '').split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const module = /^`([^`]+)`$/.exec(cells[1] ?? '')?.[1];
    if (module === undefined) continue;
    rows.push({ module, commands: [...(cells[2] ?? '').matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? ''), line: i + 1 });
  }
  return rows;
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

// ---------------------------------------------------------------- browser support

// The keywords a door offers as the "generated" list of a property: the keywords of its official syntax
// (css-properties.json) that Chrome, Firefox and Safari all support (css-compat.json).
// The units a door offers with the "generated" list of a property: the units its official syntax accepts
// (css-properties.json) that Chrome, Firefox and Safari all support (css-compat.json units).
export function supportedUnits(css: GeneratedCss, compat: GeneratedCompat, property: string): string[] {
  return (css.properties[property]?.units ?? []).filter((u) => {
    const c = compat.units[u.toLowerCase()];
    return c !== undefined && BROWSERS.every((b) => c[b] !== false);
  });
}

export function supportedKeywords(css: GeneratedCss, compat: GeneratedCompat, property: string): string[] {
  const entry = compat.properties[property];
  return (css.properties[property]?.keywords ?? []).filter((k) => {
    const c = entry?.keywords[k.toLowerCase()];
    return c !== undefined && BROWSERS.every((b) => c[b] !== false);
  });
}

const PREFIX = /^-[a-z]+-/i;
const baseName = (name: string) => name.replace(PREFIX, '').toLowerCase();

// A recipe's generated list: the keywords every browser supports through at least one declaration of
// each group of declarations that carry the door's value (a property and its prefixed forms).
function recipeKeywords(css: GeneratedCss, compat: GeneratedCompat, recipe: Recipe): string[] {
  const valued = recipe.declarations.filter((d) => d.value === null);
  const groups = [...new Set(valued.map((d) => baseName(d.property)))].map((base) => valued.filter((d) => baseName(d.property) === base));
  const candidates = [...new Set(valued.flatMap((d) => (css.properties[d.property]?.keywords ?? []).map((k) => k.toLowerCase())))];
  return candidates.filter((k) =>
    BROWSERS.every((b) =>
      groups.every((group) =>
        group.some((d) => {
          const property = compat.properties[d.property];
          const keyword = property?.keywords[k];
          return property !== undefined && property[b] !== false && keyword !== undefined && keyword[b] !== false;
        }),
      ),
    ),
  );
}

export interface OfferData {
  properties: PropertiesFile;
  css: GeneratedCss;
  compat: GeneratedCompat;
}

// The keywords a door's "generated" list offers for a property, composite or recipe id: the generated
// keywords of its CSS property that all three browsers support; for a recipe, those every browser
// supports through at least one declaration of each group that carries the door's value. null for an
// unknown id. The editor's value lists and manifest:check both read the list from here.
// The units a door's "generated" list offers for a property or composite id (see supportedUnits); a recipe
// offers the units of the declarations that carry its value; null for an unknown id.
export function generatedUnits(data: OfferData, id: string): string[] | null {
  if (data.properties.properties.some((p) => p.id === id)) return supportedUnits(data.css, data.compat, id);
  const composite = data.properties.composites.find((c) => c.id === id);
  if (composite) return composite.shorthand === null ? [] : supportedUnits(data.css, data.compat, composite.shorthand);
  const recipe = data.properties.recipes.find((r) => r.id === id);
  if (recipe) return [...new Set(recipe.declarations.filter((d) => d.value === null).flatMap((d) => supportedUnits(data.css, data.compat, d.property)))];
  return null;
}

export function generatedOffer(data: OfferData, id: string): string[] | null {
  if (data.properties.properties.some((p) => p.id === id)) return supportedKeywords(data.css, data.compat, id);
  const composite = data.properties.composites.find((c) => c.id === id);
  if (composite) return composite.shorthand === null ? [] : supportedKeywords(data.css, data.compat, composite.shorthand);
  const recipe = data.properties.recipes.find((r) => r.id === id);
  if (recipe) return recipeKeywords(data.css, data.compat, recipe);
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
  const recipeById = new Map<string, Recipe>(p.properties.recipes.map((r) => [r.id, r]));
  const structureById = new Map<string, Structure>(p.properties.structures.map((s) => [s.id, s]));
  const recipeDoorRefs = new Set(p.properties.recipes.flatMap((r) => r.doors));
  const isRecipeDoor = (entry: DoorEntry) => recipeDoorRefs.has(entry.ref) || (entry.door.kind === 'inspector-field' && entry.door.recipe !== null);
  const breakpointIds = new Set(p.properties.breakpoints.map((b) => b.id));
  const stateIds = new Set(p.properties.states.map((s) => s.id));
  const contextIds = new Set(p.interactions.keyContexts.map((k) => k.id));
  const gestureById = new Map(p.interactions.gestures.map((g) => [g.id, g]));
  const constantById = new Map(p.interactions.constants.map((c) => [c.id, c]));
  const viewportIds = new Set(p.environment.viewports.map((v) => v.id));
  const generated = p.css.properties;
  const isShorthand = (name: string) => (generated[name]?.longhands.length ?? 0) > 0;

  // Browser support (css-compat.json). Keyword keys are lower-case.
  const compat = p.compat.properties;
  type Support = { chrome: string | false; firefox: string | false; safari: string | false; why: Partial<Record<Browser, string>> };
  const lacking = (s: Support): Browser[] => BROWSERS.filter((b) => s[b] === false);
  const describeLack = (s: Support) => lacking(s).map((b) => `${b} (${s.why[b] ?? 'not supported'})`).join(', ');
  const keywordCompat = (name: string, keyword: string) => compat[name]?.keywords[keyword.toLowerCase()];
  // every browser implements the property
  const supportedByAll = (name: string) => {
    const c = compat[name];
    return c !== undefined && lacking(c).length === 0;
  };
  // the generated keywords of a property that all three browsers support: what "generated" offers
  const offeredKeywords = (name: string): string[] => supportedKeywords(p.css, p.compat, name);
  const vendorPrefixed = (name: string) => PREFIX.test(name);
  const structureOf = (name: string) => structureById.get(propertyById.get(name)?.valueType ?? '');
  // The lexer fallback allowlist: the entry that lets `value` of `property` through, written by `recipe`
  // (null outside a recipe). A recipe-scoped entry holds only for that recipe.
  const fallbackEntry = (property: string, value: string, recipe: string | null): number => p.properties.syntaxFallbacks.findIndex((f) => f.property === property && (f.values === null || f.values.includes(value)) && (f.recipe === null || f.recipe === recipe));
  // a recipe's allowlist entry that names the value vouches for it where BCD does not track it
  const vouched = (property: string, value: string, recipe: string | null) => recipe !== null && p.properties.syntaxFallbacks.some((f) => f.property === property && f.values !== null && f.values.includes(value) && f.recipe === recipe);

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
  unique('recipe', 'properties.json', p.properties.recipes.map((r, i) => ({ id: r.id, path: `recipes[${i}]` })));
  unique('structure', 'properties.json', p.properties.structures.map((s, i) => ({ id: s.id, path: `structures[${i}]` })));
  // a door's property argument names a property, a composite or a recipe: one namespace
  for (const [i, r] of p.properties.recipes.entries()) {
    if (propertyById.has(r.id) || compositeById.has(r.id)) report('duplicate-id', 'properties.json', `recipes[${i}].id`, `recipe id "${r.id}" is also the id of a property or composite`);
  }
  for (const [i, c] of p.properties.composites.entries()) {
    if (propertyById.has(c.id)) report('duplicate-id', 'properties.json', `composites[${i}].id`, `composite id "${c.id}" is also the id of a property`);
  }
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
  if (p.properties.breakpoints.filter((b) => b.base).length !== 1 || p.properties.breakpoints[0]?.base !== true) {
    report('schema', 'properties.json', 'breakpoints', 'the breakpoints are listed in cascade order: exactly one is the base, and it is the first');
  }
  unique('check category', 'checks.json', p.checks.categories.map((k, i) => ({ id: k.id, path: `categories[${i}]` })));
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
  for (const [i, r] of p.properties.recipes.entries()) {
    checkPlace('properties.json', `recipes[${i}]`, r);
    for (const [di, d] of r.doors.entries()) ref(doorByRef.has(d), 'properties.json', `recipes[${i}].doors[${di}]`, `unknown door "${d}"`);
  }
  for (const [i, k] of p.checks.categories.entries()) ref(featureIndex.has(k.feature), 'checks.json', `categories[${i}].feature`, `unknown feature "${k.feature}"`);
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
      if (arg.type === 'property') ref(text !== null && (propertyById.has(text) || compositeById.has(text) || recipeById.has(text)), file, `${path}.args.${name}`, `unknown property, composite or recipe "${String(value)}"`);
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
      const named = [door.property, door.composite, door.recipe, door.attribute].filter((x) => x !== null).length;
      if (named !== 1) report('schema', file, path, 'an inspector field names exactly one property, one composite, one recipe or one attribute');
      if (door.property !== null) ref(propertyById.has(door.property), file, `${path}.property`, `unknown property "${door.property}"`);
      if (door.composite !== null) ref(compositeById.has(door.composite), file, `${path}.composite`, `unknown composite "${door.composite}"`);
      if (door.recipe !== null) ref(recipeById.has(door.recipe), file, `${path}.recipe`, `unknown recipe "${door.recipe}"`);
      if (door.attribute !== null) {
        const attr = attributeById.get(door.attribute);
        ref(attr !== undefined, file, `${path}.attribute`, `unknown attribute "${door.attribute}"`);
        if (attr) ref(attr.command === command.id, file, `${path}.attribute`, `attribute "${attr.id}" is written by ${attr.command}, not by ${command.id}`);
      }
    }
    // a recipe door writes the recipe's declarations (rule recipe); a shorthand is reported by shorthand-write
    if (!isRecipeDoor({ file, path, command, door, ref: `${command.id}#${door.id}` })) {
      for (const name of door.adapter.writes) {
        if (!isShorthand(name)) ref(propertyById.has(name), file, `${path}.adapter.writes`, `"${name}" is not an edited property of properties.json`);
      }
    }
    const offers = door.adapter.offers;
    if (offers) ref(propertyById.has(offers.property) || compositeById.has(offers.property) || recipeById.has(offers.property), file, `${path}.adapter.offers.property`, `unknown property, composite or recipe "${offers.property}"`);
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
  p.properties.recipes.forEach((r, i) => noteKey(r.labelKey, `properties.json recipes[${i}].labelKey`));
  p.interactions.keyContexts.forEach((k, i) => noteKey(k.labelKey, `interactions.json keyContexts[${i}].labelKey`));
  p.layout.menus.forEach((m, i) => noteKey(m.labelKey, `layout.json menus[${i}].labelKey`));
  p.checks.categories.forEach((k, i) => noteKey(k.labelKey, `checks.json categories[${i}].labelKey`));

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

  // ---- value-set: a door offers the generated list of its property, composite or recipe, or a declared subset of it
  const cssNameOf = (target: string): string | null => {
    if (propertyById.has(target)) return target;
    return compositeById.get(target)?.shorthand ?? null;
  };
  const subsetsOf = (target: string): Subset[] => propertyById.get(target)?.subsets ?? compositeById.get(target)?.subsets ?? [];
  const controlOf = (target: string): string | undefined => propertyById.get(target)?.control ?? compositeById.get(target)?.control ?? recipeById.get(target)?.control;
  const KEYWORD_CONTROLS = new Set(['keyword-menu', 'keyword-buttons', 'font-menu']);
  const offerData: OfferData = { properties: p.properties, css: p.css, compat: p.compat };
  const offeredGenerated = new Map<string, string>(); // css name → first door that offers its generated list
  let keywordsLeftOut = 0;
  let unitsLeftOut = 0;
  for (const { file, path, command, door, ref: doorRef } of doors) {
    const offers = door.adapter.offers;
    // a button that writes one fixed value (args.value) offers no list
    if (door.kind === 'inspector-field' && (door.property !== null || door.composite !== null || door.recipe !== null) && typeof door.args.value !== 'string') {
      const target = door.property ?? door.composite ?? door.recipe ?? '';
      const control = controlOf(target);
      if (control !== undefined && LIST_CONTROLS.has(control) && (offers === null || offers.property !== target)) {
        report('value-set', file, `${path}.adapter.offers`, `${doorRef} edits ${target}, a ${control}, but declares no list of values for it`);
      }
    }
    if (!offers) continue;
    const recipe = recipeById.get(offers.property);
    if (!recipe && !propertyById.has(offers.property) && !compositeById.has(offers.property)) continue;
    const control = controlOf(offers.property);
    if (offers.list === 'generated') {
      const list = generatedOffer(offerData, offers.property) ?? [];
      if (list.length === 0 && control !== undefined && KEYWORD_CONTROLS.has(control)) {
        report('value-set', file, `${path}.adapter.offers.list`, `${doorRef} is a ${control} but none of the generated keywords of ${offers.property} is supported by Chrome, Firefox and Safari: declare a subset`);
      }
      if (recipe) continue;
      const name = cssNameOf(offers.property);
      if (name === null) {
        report('value-set', file, `${path}.adapter.offers.list`, `${command.id}#${door.id} offers the generated list of ${offers.property}, which stands for no CSS property`);
        continue;
      }
      if (!offeredGenerated.has(name)) {
        offeredGenerated.set(name, `${file} ${path}`);
        keywordsLeftOut += (generated[name]?.keywords.length ?? 0) - offeredKeywords(name).length;
        unitsLeftOut += (generated[name]?.units.length ?? 0) - supportedUnits(p.css, p.compat, name).length;
      }
    } else if (recipe) {
      report('value-set', file, `${path}.adapter.offers.list`, `${doorRef} offers "${offers.list}", but a recipe declares no subsets: it offers its generated list`);
    } else if (!subsetsOf(offers.property).some((s) => s.id === offers.list)) {
      report('value-set', file, `${path}.adapter.offers.list`, `${doorRef} offers "${offers.list}", which is neither "generated" nor a subset declared on ${offers.property}`);
    }
  }

  // ---- all-properties: in All properties an inspector field offers every value the browser data allows (the
  // generated list: all four flex directions, every text-align value, space-between, space-around and
  // space-evenly) plus its declared presets (font stacks, named weights). Essentials only may offer fewer
  // values, never one All properties lacks. A declared subset stands alone only in the quick panel.
  const declaredList = (target: string, id: string) => subsetsOf(target).find((s) => s.id === id);
  for (const { file, path, door, ref: doorRef } of doors) {
    const offers = door.adapter.offers;
    if (!offers) continue;
    const inspector = door.kind === 'inspector-field';
    if (offers.list !== 'generated' && door.kind !== 'quick-panel') {
      report('all-properties', file, `${path}.adapter.offers.list`, inspector
        ? `${doorRef} offers the subset "${offers.list}" in All properties, which offers every value the browser data allows: offer "generated", name the presets in offers.presets and the shorter list in offers.essentials`
        : `${doorRef} is a ${door.kind} door and offers the subset "${offers.list}": a declared subset stands alone only in the quick panel`);
    }
    for (const [field, id] of [['presets', offers.presets], ['essentials', offers.essentials]] as const) {
      if (id === null) continue;
      if (!inspector) report('all-properties', file, `${path}.adapter.offers.${field}`, `${doorRef} is a ${door.kind} door: only an inspector field has ${field === 'presets' ? 'All properties presets' : 'an Essentials only list'}`);
      else if (!declaredList(offers.property, id)) report('all-properties', file, `${path}.adapter.offers.${field}`, `${doorRef} names "${id}" as its ${field}, which is not a list declared on ${offers.property}`);
    }
    if (!inspector || offers.list !== 'generated' || offers.essentials === null) continue;
    const essentials = declaredList(offers.property, offers.essentials);
    if (!essentials) continue;
    const presets = offers.presets === null ? undefined : declaredList(offers.property, offers.presets);
    const lower = (xs: readonly string[]) => new Set(xs.map((x) => x.toLowerCase()));
    const allValues = lower([...(generatedOffer(offerData, offers.property) ?? []), ...(presets?.values ?? [])]);
    const allUnits = lower([...(generatedUnits(offerData, offers.property) ?? []), ...(presets?.units ?? [])]);
    const missing = [...(essentials.values ?? []).filter((v) => !allValues.has(v.toLowerCase())), ...(essentials.units ?? []).filter((u) => !allUnits.has(u.toLowerCase())).map((u) => `the unit ${u}`)];
    if (missing.length > 0) {
      report('all-properties', file, `${path}.adapter.offers.essentials`, `${doorRef} offers ${missing.map((v) => `"${v}"`).join(', ')} in Essentials only, which All properties lacks (the generated list of ${offers.property}${presets ? ` and the presets "${presets.id}"` : ', no presets'}): Essentials only is a subset of All properties`);
    }
  }

  // ---- css-syntax: every value a door offers or writes matches the official syntax (CSSTree's lexer)
  // ---- syntax-fallback: the browser syntax stands in only for the values of the allowlist
  const fallbackUsed = new Set<number>();
  const implementedOnly = new Set<string>();
  const recipeBrowserSyntax = new Set<string>();
  const syntax = (file: string, path: string, property: string, value: string, recipe: string | null = null): CssAnalysis | null => {
    const result = css.analyse(property, value);
    if (!result.ok) {
      report('css-syntax', file, path, `"${value}" is not a valid value of ${property}: ${result.reason}`);
      return null;
    }
    if (result.by === 'implemented') {
      const entry = fallbackEntry(property, value, recipe);
      if (entry >= 0) {
        fallbackUsed.add(entry);
        (recipe === null ? implementedOnly : recipeBrowserSyntax).add(`${property}: ${value}`);
      } else {
        report('syntax-fallback', file, path, `"${value}" of ${property} matches only the syntax browsers implement (CSSTree's MDN data): the official syntax ${css.match(property, value) === null ? 'reaches it only through a definition webref does not have' : 'rejects it'}; the fallback applies only to the values of the allowlist (syntaxFallbacks)`);
      }
    }
    return result;
  };
  for (const [name, where] of offeredGenerated) {
    const g = generated[name];
    if (!g) continue;
    const [file = '', ...rest] = where.split(' ');
    for (const keyword of offeredKeywords(name)) syntax(file, `${rest.join(' ')} (generated keywords of ${name})`, name, keyword);
    for (const unit of supportedUnits(p.css, p.compat, name)) syntax(file, `${rest.join(' ')} (generated units of ${name})`, name, `1${unit}`);
  }
  // every value the manifest writes or offers, with the CSS property it is a value of
  const written: { file: string; path: string; property: string; value: string; composite: Composite | null }[] = [];
  p.properties.properties.forEach((prop, i) => prop.subsets.forEach((s, si) => (s.values ?? []).forEach((value, vi) => written.push({ file: 'properties.json', path: `properties[${i}].subsets[${si}].values[${vi}]`, property: prop.id, value, composite: null }))));
  p.properties.composites.forEach((c, i) => {
    c.subsets.forEach((s, si) => {
      if (c.shorthand === null) report('value-set', 'properties.json', `composites[${i}].subsets[${si}]`, 'a composite that stands for no CSS property cannot declare a subset of its values');
      else (s.values ?? []).forEach((value, vi) => written.push({ file: 'properties.json', path: `composites[${i}].subsets[${si}].values[${vi}]`, property: c.shorthand ?? '', value, composite: c }));
    });
  });
  for (const { file, path, door } of doors) {
    const property = door.args.property;
    const value = door.args.value;
    if (typeof property === 'string' && typeof value === 'string') {
      const name = cssNameOf(property);
      if (name !== null) written.push({ file, path: `${path}.args.value`, property: name, value, composite: compositeById.get(property) ?? null });
    }
  }
  for (const [i, e] of p.elements.elements.entries()) {
    for (const [name, value] of Object.entries(e.defaultStyles)) if (generated[name]) written.push({ file: 'elements.json', path: `elements[${i}].defaultStyles.${name}`, property: name, value, composite: null });
  }
  for (const [i, c] of p.properties.couplings.entries()) {
    if (c.effect.value !== null && generated[c.effect.property]) written.push({ file: 'properties.json', path: `couplings[${i}].effect.value`, property: c.effect.property, value: c.effect.value, composite: null });
  }
  const analysed = new Map<string, CssAnalysis>();
  for (const w of written) {
    const result = syntax(w.file, w.path, w.property, w.value);
    if (result) analysed.set(`${w.file} ${w.path}`, result);
  }
  for (const [i, c] of p.properties.couplings.entries()) {
    const path = `couplings[${i}]`;
    if (generated[c.trigger.property]) (c.trigger.values ?? []).forEach((v, vi) => syntax('properties.json', `${path}.trigger.values[${vi}]`, c.trigger.property, v));
    if (c.condition.property !== null && generated[c.condition.property]) c.condition.values.forEach((v, vi) => syntax('properties.json', `${path}.condition.values[${vi}]`, c.condition.property ?? '', v));
  }
  for (const [ri, r] of p.properties.recipes.entries()) {
    for (const [di, d] of r.declarations.entries()) {
      if (d.value === null || !generated[d.property]) continue;
      const result = syntax('properties.json', `recipes[${ri}].declarations[${di}].value`, d.property, d.value, r.id);
      if (result) analysed.set(`recipe ${r.id} ${di}`, result);
    }
  }
  for (const [i, f] of p.properties.syntaxFallbacks.entries()) {
    const path = `syntaxFallbacks[${i}]`;
    const bad = (message: string) => report('syntax-fallback', 'properties.json', path, message);
    if (f.recipe === null) {
      if (!propertyById.has(f.property)) bad(`${f.property} is not an edited property`);
    } else {
      const r = recipeById.get(f.recipe);
      if (!r) bad(`unknown recipe "${f.recipe}"`);
      else if (f.values === null) bad(`an entry for recipe ${r.id} names its values`);
      else for (const v of f.values) if (!r.declarations.some((d) => d.property === f.property && d.value === v)) bad(`recipe ${r.id} declares no ${f.property}: ${v}`);
    }
    if (!fallbackUsed.has(i)) bad(`no value of ${f.property} needs the browser syntax${f.values !== null ? ` (${f.values.join(', ')})` : ''}: remove it from the allowlist`);
  }

  // ---- browser-support: the editor edits, offers and writes only what Chrome, Firefox and Safari all support (css-compat.json)
  for (const [i, prop] of p.properties.properties.entries()) {
    const c = compat[prop.id];
    if (!c) report('browser-support', 'properties.json', `properties[${i}].id`, `${prop.id} has no entry in css-compat.json`);
    else if (lacking(c).length > 0) report('browser-support', 'properties.json', `properties[${i}].id`, `${prop.id}${c.via !== null ? ` (${c.via})` : ''} is not supported by ${describeLack(c)}: edit the property browsers implement, or declare a recipe`);
    // a legacy alias (font-stretch for font-width) is edited only while its standard name lacks a browser
    const alias = generated[prop.id]?.legacyAliasOf;
    if (alias && supportedByAll(alias)) report('browser-support', 'properties.json', `properties[${i}].id`, `${prop.id} is a legacy alias of ${alias}, which Chrome, Firefox and Safari all support: edit ${alias}`);
  }
  // Why a written value is not supported by every browser, or null: each of its keywords and functions
  // must be one css-compat.json lists and all three support; a custom identifier (a font family) is checked
  // when BCD tracks it; a syntax form BCD tracks (two-value syntax, several layers, negative values) must
  // be supported when the value has that shape.
  const unsupportedParts = (property: string, value: string, result: CssAnalysis & { ok: true }, browser: Browser | null): string[] => {
    const entry = compat[property];
    if (!entry) return [];
    const out: string[] = [];
    const lacks = (s: Support) => (browser === null ? lacking(s).length > 0 : s[browser] === false);
    const why = (s: Support) => (browser === null ? describeLack(s) : (s.why[browser] ?? 'not supported'));
    result.keywords.forEach((k, i) => {
      const listed = entry.keywords[k];
      // a keyword inside a function has that function's support for it (from in rgb(from …))
      const fn = result.keywordFunctions[i] ?? null;
      const c = fn !== null ? (listed?.inFunctions[fn] ?? listed) : listed;
      if (!c) out.push(`"${k}" is not a keyword css-compat.json lists for ${property}`);
      else if (lacks(c)) out.push(`"${k}"${fn !== null ? ` in ${fn}()` : ''} is not supported by ${why(c)}`);
    });
    for (const id of result.identifiers) {
      const c = entry.keywords[id];
      if (c && lacks(c)) out.push(`"${id}" is not supported by ${why(c)}`);
    }
    const shape = valueShape(value);
    for (const unit of shape.units) {
      const c = p.compat.units[unit];
      if (!c) out.push(`the unit ${unit} is not one css-compat.json lists`);
      else if (lacks(c)) out.push(`the unit ${unit} is not supported by ${why(c)}`);
    }
    for (const fn of shape.functions) {
      const c = entry.functions[fn] ?? p.compat.valueFunctions[fn];
      if (!c) out.push(`${fn}() is not a function css-compat.json lists for ${property}`);
      else if (lacks(c)) out.push(`${fn}() is not supported by ${why(c)}`);
    }
    for (const [key, form] of Object.entries(entry.forms)) {
      const has =
        (form.shape === 'components-2' && shape.components >= 2) ||
        (form.shape === 'components-3' && shape.components >= 3) ||
        (form.shape === 'components-4' && shape.components >= 4) ||
        (form.shape === 'keywords-2' && result.keywords.length >= 2) ||
        (form.shape === 'layers-2' && shape.layers >= 2) ||
        (form.shape === 'negative' && shape.negative);
      if (has && lacks(form)) out.push(`its form ${key} is not supported by ${why(form)}`);
    }
    return out;
  };
  const writtenSupport = (file: string, path: string, property: string, value: string, result: CssAnalysis & { ok: true }) => {
    for (const problem of unsupportedParts(property, value, result, null)) report('browser-support', file, path, `${property}: ${value}: ${problem}`);
  };
  for (const w of written) {
    const result = analysed.get(`${w.file} ${w.path}`);
    if (result?.ok) writtenSupport(w.file, w.path, w.property, w.value, result);
  }
  // the units a subset offers
  const unitSupport = (file: string, path: string, name: string, s: Subset) =>
    (s.units ?? []).forEach((unit, ui) => {
      const c = p.compat.units[unit.toLowerCase()];
      if (!c) report('browser-support', file, `${path}.units[${ui}]`, `the unit ${unit} is not one css-compat.json lists`);
      else if (lacking(c).length > 0) report('browser-support', file, `${path}.units[${ui}]`, `the unit ${unit} (${name}) is not supported by ${describeLack(c)}`);
    });
  p.properties.properties.forEach((prop, i) => prop.subsets.forEach((s, si) => unitSupport('properties.json', `properties[${i}].subsets[${si}]`, prop.id, s)));
  p.properties.composites.forEach((c, i) => c.subsets.forEach((s, si) => unitSupport('properties.json', `composites[${i}].subsets[${si}]`, c.shorthand ?? c.id, s)));
  // a keyword a structured value writes (inset) is checked for every property that stores the structure
  for (const [si, s] of p.properties.structures.entries()) {
    for (const [fi, f] of s.fields.entries()) {
      if (f.keyword === null) continue;
      for (const prop of p.properties.properties.filter((x) => x.valueType === s.id)) {
        const c = keywordCompat(prop.id, f.keyword);
        if (!c) report('browser-support', 'properties.json', `structures[${si}].fields[${fi}].keyword`, `"${f.keyword}" is not a keyword css-compat.json lists for ${prop.id}`);
        else if (lacking(c).length > 0) report('browser-support', 'properties.json', `structures[${si}].fields[${fi}].keyword`, `"${f.keyword}" (${prop.id}) is not supported by ${describeLack(c)}`);
      }
    }
  }

  // ---- vendor-prefix: prefixed properties and values appear only in a compatibility recipe, the writes of its doors and its allowlist entries
  const recipeWrites = new Set(doors.filter(isRecipeDoor).map((d) => `${d.file}|${d.path}.adapter.writes`));
  const recipeFallbacks = new Set(p.properties.syntaxFallbacks.flatMap((f, i) => (f.recipe !== null ? [`syntaxFallbacks[${i}]`] : [])));
  problems.push(
    ...prefixProblems(input.files, (file, path) => {
      if (file === 'properties.json' && (/^recipes(\[|$)/.test(path) || recipeFallbacks.has(path.replace(/^(syntaxFallbacks\[\d+\]).*$/, '$1')))) return true;
      return recipeWrites.has(`${file}|${path.replace(/\[\d+\]$/, '')}`) || recipeWrites.has(`${file}|${path}`);
    }),
  );

  // ---- recipe: the declarations browsers need for one effect, written by one undoable command, working in every browser
  for (const [i, r] of p.properties.recipes.entries()) {
    const path = `recipes[${i}]`;
    const bad = (at: string, message: string) => report('recipe', 'properties.json', at === '' ? path : `${path}.${at}`, message);
    const names = r.declarations.map((d) => d.property);
    for (const [di, d] of r.declarations.entries()) {
      const at = `declarations[${di}]`;
      if (!generated[d.property]) {
        bad(`${at}.property`, `${d.property} is not a CSS property of the generated web data`);
        continue;
      }
      if (names.indexOf(d.property) !== di) bad(`${at}.property`, `${d.property} is declared twice`);
      const editedLonghands = (generated[d.property]?.longhands ?? []).filter((l) => propertyById.has(l));
      if (editedLonghands.length > 0) bad(`${at}.property`, `${d.property} is the shorthand of the edited ${editedLonghands.join(', ')}: a recipe writes those longhands, never a second writer of them`);
      const wholeShorthand = p.properties.storedWhole.find((w) => (generated[w.property]?.longhands ?? []).includes(d.property));
      if (wholeShorthand) bad(`${at}.property`, `${d.property} is a longhand of ${wholeShorthand.property}, which is stored whole: a recipe does not write it beside that property`);
      const c = compat[d.property];
      if (!c || lacking(c).length === BROWSERS.length) bad(`${at}.property`, `no browser supports ${d.property}${c ? `: ${describeLack(c)}` : ''}`);
    }
    const valued = r.declarations.filter((d) => d.value === null);
    if (valued.length === 0) bad('declarations', `${r.id} has no declaration that carries the door's value (value null)`);
    if (!r.declarations.some((d) => vendorPrefixed(d.property) || (d.value !== null && VENDOR_PREFIX.test(d.value)))) {
      bad('declarations', `${r.id} holds no vendor prefix: a recipe exists for legacy prefixed CSS; edit standard properties as properties or composites`);
    }
    if (!valued.some((d) => compat[d.property]?.bcd === r.source.bcd)) {
      bad('source.bcd', `${r.source.bcd} is not the BCD entry of a declaration that carries the door's value (${valued.map((d) => `${d.property}: ${compat[d.property]?.bcd ?? 'none'}`).join(', ')})`);
    }
    const shares = r.declarations.some((d) => propertyById.has(d.property));
    if (shares !== (r.shared !== null)) bad('shared', shares ? `${r.id} also writes edited properties (${names.filter((n) => propertyById.has(n)).join(', ')}): declare how it shares them` : `${r.id} writes no edited property, so it shares none`);
    // every browser gets the effect: each group (a property and its prefixed forms) has a declaration it supports
    const supportedIn = (b: Browser, d: Recipe['declarations'][number], di: number): string | null => {
      const c = compat[d.property];
      if (!c) return 'no compat entry';
      if (c[b] === false) return c.why[b] ?? 'not supported';
      if (d.value === null || vouched(d.property, d.value, r.id)) return null;
      const result = analysed.get(`recipe ${r.id} ${di}`);
      if (!result?.ok) return 'not a valid value';
      return unsupportedParts(d.property, d.value, result, b)[0] ?? null;
    };
    for (const b of BROWSERS) {
      for (const base of new Set(names.map(baseName))) {
        const group = r.declarations.map((d, di) => ({ d, di })).filter(({ d }) => baseName(d.property) === base);
        const reasons = group.map(({ d, di }) => ({ d, why: supportedIn(b, d, di) }));
        if (reasons.every((x) => x.why !== null)) {
          bad('declarations', `${r.id} does not work in ${b}: no declaration of ${base} is supported there: ${reasons.map(({ d, why }) => `${d.property}${d.value !== null ? `: ${d.value}` : ''} (${why ?? ''})`).join('; ')}`);
        }
      }
    }
    for (const [di, d] of r.doors.entries()) {
      const entry = doorByRef.get(d);
      if (!entry) continue;
      if (entry.door.kind !== 'inspector-field' || entry.door.recipe !== r.id) bad(`doors[${di}]`, `${d} is listed as a door of ${r.id} but does not edit it`);
      const writes = entry.door.adapter.writes;
      const missing = names.filter((n) => !writes.includes(n));
      const extra = writes.filter((n) => !names.includes(n));
      if (missing.length > 0 || extra.length > 0) bad(`doors[${di}]`, `${d} must write exactly the declarations of ${r.id}${missing.length > 0 ? `; it leaves out ${missing.join(', ')}` : ''}${extra.length > 0 ? `; it also writes ${extra.join(', ')}` : ''}`);
      if (!entry.command.history.undoable) bad(`doors[${di}]`, `${d} writes ${r.id} through ${entry.command.id}, which is not undoable: a recipe is one undo step`);
    }
  }
  for (const { file, path, door, ref: doorRef } of doors) {
    if (door.kind !== 'inspector-field' || door.recipe === null) continue;
    const r = recipeById.get(door.recipe);
    if (r && !r.doors.includes(doorRef)) report('recipe', file, `${path}.recipe`, `${doorRef} edits ${r.id} but ${r.id} does not list it among its doors`);
  }

  // ---- structured-value: a structured value type declares typed fields that serialise to the property's syntax
  const units = p.css.units;
  for (const [i, s] of p.properties.structures.entries()) {
    const path = `structures[${i}]`;
    const bad = (at: string, message: string) => report('structured-value', 'properties.json', `${path}${at}`, message);
    if (!STRUCTURED_VALUE_TYPES.includes(s.id)) bad('.id', `${s.id} is not a structured value type (${STRUCTURED_VALUE_TYPES.join(', ')})`);
    unique(`field of structure ${s.id}`, 'properties.json', s.fields.map((f, fi) => ({ id: f.id, path: `${path}.fields[${fi}]` })));
    for (const [fi, f] of s.fields.entries()) {
      const at = `.fields[${fi}]`;
      if ((f.css === 'keyword') !== (f.keyword !== null)) bad(at, f.css === 'keyword' ? `${f.id} is written as a keyword but names none` : `${f.id} is not written as a keyword, so it names none`);
      if ((f.type === 'boolean') !== (f.css !== 'value')) bad(at, `${f.id}: a boolean field is written as a keyword or hides the layer; other fields are written as their value`);
      if ((f.type === 'boolean') !== (typeof f.sample === 'boolean')) bad(`${at}.sample`, `the sample of ${f.id} is not a ${f.type}`);
      if ((f.type === 'length') !== (f.units !== null)) bad(`${at}.units`, f.type === 'length' ? `${f.id} is a length: name the unit list it offers` : `${f.id} is not a length, so it offers no units`);
      else if (f.units !== null && !units[f.units]) bad(`${at}.units`, `"${f.units}" is not a unit list of css-properties.json (${Object.keys(units).join(', ')})`);
    }
    const users = p.properties.properties.filter((prop) => prop.valueType === s.id);
    if (users.length === 0) bad('', `no property has the value type ${s.id}`);
    const layer = (flip: string | null) =>
      s.fields
        .filter((f) => f.css !== 'hides-layer')
        .map((f) => (f.css === 'value' ? String(f.sample) : (f.id === flip ? !f.sample : f.sample) === true ? f.keyword : null))
        .filter((part): part is string => part !== null)
        .join(' ');
    const samples = [layer(null), ...s.fields.filter((f) => f.css === 'keyword').map((f) => layer(f.id))];
    if (s.list) samples.push(`${layer(null)}, ${samples[samples.length - 1] ?? layer(null)}`);
    for (const prop of users) {
      if (prop.codec !== s.codec) report('structured-value', 'properties.json', `properties[${p.properties.properties.indexOf(prop)}].codec`, `${prop.id} has the structured value type ${s.id}, whose codec is ${s.codec}, not ${prop.codec}`);
      for (const sample of samples) {
        const reason = css.match(prop.id, sample);
        if (reason !== null) bad('.fields', `a ${s.id} layer serialised from the samples ("${sample}") is not a valid ${prop.id}: ${reason}`);
      }
    }
  }
  for (const [i, prop] of p.properties.properties.entries()) {
    if (STRUCTURED_VALUE_TYPES.includes(prop.valueType) && !structureById.has(prop.valueType)) report('structured-value', 'properties.json', `properties[${i}].valueType`, `${prop.valueType} is a structured value type, but properties.json declares no structure for it`);
    if (structureOf(prop.id) && prop.subsets.length > 0) report('structured-value', 'properties.json', `properties[${i}].subsets`, `${prop.id} stores typed fields, so no subset offers it as CSS text`);
  }
  // a structured value is never written as CSS text: not as a default, a coupling effect or a fixed door value
  for (const [i, e] of p.elements.elements.entries()) {
    for (const name of Object.keys(e.defaultStyles)) if (structureOf(name)) report('structured-value', 'elements.json', `elements[${i}].defaultStyles.${name}`, `${name} stores typed fields, so it has no CSS text default`);
  }
  for (const [i, c] of p.properties.couplings.entries()) {
    if (structureOf(c.effect.property) && c.effect.value !== null) report('structured-value', 'properties.json', `couplings[${i}].effect`, `${c.effect.property} stores typed fields, so a coupling cannot write it as CSS text`);
  }
  for (const { file, path, command, door, ref: doorRef } of doors) {
    const property = door.args.property;
    if (typeof property === 'string' && structureOf(property) && typeof door.args.value === 'string') report('structured-value', file, `${path}.args.value`, `${doorRef} writes ${property}, which stores typed fields, as CSS text`);
    const structured = door.adapter.writes.flatMap((name) => {
      const s = structureOf(name);
      return s ? [{ name, s }] : [];
    });
    // typed fields travel as typed data: the command takes them as a json argument, never as CSS text
    if (structured.length > 0 && !Object.values(command.args).some((a) => a.type === 'json')) {
      report('structured-value', file, `${path}.adapter.writes`, `${doorRef} writes ${structured.map((x) => x.name).join(', ')}, a structured value, through ${command.id}, which takes no typed (json) argument: doors edit typed fields through the codec, never CSS text`);
    }
    if (door.adapter.fields.length > 0 && structured.length === 0) report('structured-value', file, `${path}.adapter.fields`, `${doorRef} edits typed fields but writes no property with a structured value type`);
    for (const field of door.adapter.fields) {
      for (const { name, s } of structured) {
        if (!s.fields.some((f) => f.id === field)) report('structured-value', file, `${path}.adapter.fields`, `${doorRef} edits the field ${field}, which ${name} (${s.id}) does not have`);
      }
    }
  }

  // ---- shorthand-write: the document stores the finest-grained property browsers implement. A shorthand
  // is edited through its longhands (a composite) when all three browsers implement every one of them.
  // When a browser lacks one, the manifest either omits it from the composite or stores the shorthand
  // whole, declared in storedWhole with the reason; a shorthand stored whole has no longhand edited too.
  const storedWhole = new Map(p.properties.storedWhole.map((w, i) => [w.property, i]));
  unique('shorthand stored whole', 'properties.json', p.properties.storedWhole.map((w, i) => ({ id: w.property, path: `storedWhole[${i}]` })));
  for (const [i, prop] of p.properties.properties.entries()) {
    if (!isShorthand(prop.id)) continue;
    const longhands = generated[prop.id]?.longhands ?? [];
    const missing = longhands.filter((l) => !supportedByAll(l));
    if (missing.length === 0) report('shorthand-write', 'properties.json', `properties[${i}].id`, `${prop.id} is a shorthand of ${longhands.join(', ')}, all of which Chrome, Firefox and Safari implement: edit it as a composite of them`);
    else if (!storedWhole.has(prop.id)) report('shorthand-write', 'properties.json', `properties[${i}].id`, `${prop.id} is a shorthand; browsers lack ${missing.join(', ')}: declare it in storedWhole with the reason, or edit a composite that omits them`);
    const overlap = longhands.filter((l) => propertyById.has(l));
    if (overlap.length > 0) report('shorthand-write', 'properties.json', `properties[${i}].id`, `${prop.id} is stored whole, so its longhands ${overlap.join(', ')} are not edited as well: that would be two writers of one value`);
  }
  for (const [i, w] of p.properties.storedWhole.entries()) {
    if (!propertyById.has(w.property) || !isShorthand(w.property)) report('shorthand-write', 'properties.json', `storedWhole[${i}].property`, `${w.property} is not an edited shorthand`);
  }
  for (const entry of doors) {
    if (isRecipeDoor(entry)) continue;
    for (const name of entry.door.adapter.writes) {
      if (isShorthand(name) && !propertyById.has(name)) report('shorthand-write', entry.file, `${entry.path}.adapter.writes`, `${entry.ref} writes the shorthand ${name}; a door writes its longhands (${generated[name]?.longhands.join(', ')})`);
    }
  }
  for (const [i, e] of p.elements.elements.entries()) {
    for (const name of Object.keys(e.defaultStyles)) if (isShorthand(name) && !propertyById.has(name)) report('shorthand-write', 'elements.json', `elements[${i}].defaultStyles.${name}`, `default style ${name} is a shorthand; store its longhands`);
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
    if (c.shorthand !== null && propertyById.has(c.shorthand)) report('composite', 'properties.json', `${path}.shorthand`, `${c.shorthand} is stored whole as a property, so no composite writes its longhands`);
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
  // a value a composite offers or writes sets only the longhands the composite writes: none it omits.
  // The longhand is found as a property the matched syntax references (<'column-height'>), or as a
  // keyword only an omitted longhand's syntax names (emoji for font-variant-emoji).
  for (const w of written) {
    const c = w.composite;
    const omitted = c?.omits?.longhands ?? [];
    if (!c || omitted.length === 0) continue;
    const result = analysed.get(`${w.file} ${w.path}`);
    if (!result?.ok) continue;
    const writtenKeywords = new Set(c.longhands.flatMap((l) => Object.keys(compat[l]?.keywords ?? {})));
    const sets = new Set(result.properties.filter((name) => omitted.includes(name)));
    for (const name of omitted) {
      const own = new Set(Object.keys(compat[name]?.keywords ?? {}));
      if (result.keywords.some((k) => own.has(k) && !writtenKeywords.has(k))) sets.add(name);
    }
    if (sets.size > 0) report('composite', w.file, w.path, `"${w.value}" sets ${[...sets].join(', ')}, which ${c.id} omits (${c.omits?.reason ?? ''})`);
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
  p.properties.recipes.forEach((r, i) => {
    need('codec', r.codec, `properties.json recipes[${i}].codec`);
    need('predicate', r.appliesTo, `properties.json recipes[${i}].appliesTo`);
  });
  p.properties.structures.forEach((s, i) => need('codec', s.codec, `properties.json structures[${i}].codec`));
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

  // ---- placement: every door with a control of its own is drawn in a region of DESIGN.md (layout.json)
  const regionById = new Map(p.layout.regions.map((r) => [r.id, r]));
  unique('region', 'layout.json', p.layout.regions.map((r, i) => ({ id: r.id, path: `regions[${i}]` })));
  unique('menu', 'layout.json', p.layout.menus.map((m, i) => ({ id: m.id, path: `menus[${i}]` })));
  const menuAnchors = new Map(p.layout.menus.map((m) => [m.id, m.anchors]));
  for (const menu of menuIdSchema.options) {
    if (!menuAnchors.has(menu)) report('placement', 'layout.json', 'menus', `menu "${menu}" has no anchor: name the region whose button opens it`);
    if (!regionById.has(`menu:${menu}`)) report('placement', 'layout.json', 'regions', `menu "${menu}" has no region "menu:${menu}" for its items`);
  }
  for (const [mi, m] of p.layout.menus.entries()) {
    for (const [ai, a] of m.anchors.entries()) {
      if (!regionById.has(a.region)) report('placement', 'layout.json', `menus[${mi}].anchors[${ai}].region`, `unknown region "${a.region}"`);
    }
  }
  // doors that are a key or a pointer gesture have no control to place
  const CONTROLLESS: readonly DoorKind[] = ['shortcut', 'canvas-drag', 'canvas-click', 'canvas-wheel', 'canvas-handle', 'layers-drag', 'panel-drag'];
  const doorsByRegion: Record<string, number> = {};
  for (const { file, path, door, ref: doorRef } of doors) {
    const placement = door.placement;
    if (CONTROLLESS.includes(door.kind)) {
      if (placement !== 'none') report('placement', file, `${path}.placement`, `${doorRef} is a ${door.kind} door: it has no control, so its placement is "none"`);
      continue;
    }
    if (placement === 'unplaced' || placement === 'none') {
      report('placement', file, `${path}.placement`, `${doorRef} is ${placement === 'none' ? 'placed "none"' : 'still unplaced'}: DESIGN.md gives every ${door.kind} door a region and an order`);
      continue;
    }
    doorsByRegion[placement.region] = (doorsByRegion[placement.region] ?? 0) + 1;
    if (!regionById.has(placement.region)) {
      report('placement', file, `${path}.placement.region`, `${doorRef} is placed in the unknown region "${placement.region}" (layout.json lists the regions of DESIGN.md)`);
      continue;
    }
    const expected =
      door.kind === 'menu' ? `menu:${door.menu}` : door.kind === 'context-menu' ? 'context-menu' : door.kind === 'command-bar' ? 'command-palette' : door.kind === 'quick-panel' ? 'quick-panel' : null;
    if (expected !== null && placement.region !== expected) report('placement', file, `${path}.placement.region`, `${doorRef} is a ${door.kind} door, drawn in "${expected}", not in "${placement.region}"`);
    if (door.kind === 'inspector-field' && !placement.region.startsWith('inspector-')) report('placement', file, `${path}.placement.region`, `${doorRef} is an inspector field, drawn in an inspector region, not in "${placement.region}"`);
  }
  // one control per position: two doors, or a door and a menu button, never share a region's order
  const slots = new Map<string, string>();
  const claim = (region: string, order: number, who: string, file: string, path: string) => {
    const slot = `${region}@${order}`;
    const first = slots.get(slot);
    if (first !== undefined) report('placement', file, path, `${who} takes order ${order} of region "${region}", already taken by ${first}`);
    else slots.set(slot, who);
  };
  for (const { file, path, door, ref: doorRef } of doors) {
    if (typeof door.placement === 'object') claim(door.placement.region, door.placement.order, doorRef, file, `${path}.placement.order`);
  }
  for (const [mi, m] of p.layout.menus.entries()) {
    for (const [ai, a] of m.anchors.entries()) claim(a.region, a.order, `the button of menu "${m.id}"`, 'layout.json', `menus[${mi}].anchors[${ai}].order`);
  }

  // ---- state-placement: a state belongs to the element's class selector, never to the page, so no
  // control that chooses a state is drawn on the canvas frame or the canvas toolbar
  const pageRegions: readonly string[] = PAGE_REGIONS;
  const choosesState = (command: Command) => Object.values(command.args).some((a) => a.type === 'state');
  const stateMenus = new Set<string>();
  for (const { file, path, command, door, ref: doorRef } of doors) {
    if (!choosesState(command)) continue;
    if (door.kind === 'menu') stateMenus.add(door.menu);
    const placement = door.placement;
    if (typeof placement === 'object' && pageRegions.includes(placement.region)) {
      report('state-placement', file, `${path}.placement.region`, `${doorRef} chooses a style state but is drawn in "${placement.region}": a state belongs to the element's class, so it is chosen only in the inspector's selector bar`);
    }
  }
  for (const [mi, m] of p.layout.menus.entries()) {
    if (!stateMenus.has(m.id)) continue;
    for (const [ai, a] of m.anchors.entries()) {
      if (pageRegions.includes(a.region)) report('state-placement', 'layout.json', `menus[${mi}].anchors[${ai}].region`, `menu "${m.id}" chooses a style state but opens from "${a.region}": a state is chosen only in the inspector's selector bar`);
    }
  }

  // ---- label-term: one label names one CSS property in each language, and each glossary term is the
  // label of its property. A label names a property when it labels an edited property, a composite (its
  // shorthand) or a recipe, or a field that edits one of them as a whole under a label of its own (not
  // a control of a structured value, which adds, removes or edits its layers and fields, not a button that
  // writes one fixed value, not a field that shows its property's label and carries only its command's label).
  const glossaryParse = glossarySchema.safeParse(input.glossary);
  const glossary: Glossary | null = glossaryParse.success ? glossaryParse.data : null;
  if (!glossaryParse.success) problems.push(...schemaProblems('i18n/glossary', glossaryParse.error));
  const namedBy: { key: string; property: string; where: string }[] = [];
  p.properties.properties.forEach((prop, i) => namedBy.push({ key: prop.labelKey, property: prop.id, where: `properties.json properties[${i}]` }));
  p.properties.composites.forEach((c, i) => {
    if (c.shorthand !== null) namedBy.push({ key: c.labelKey, property: c.shorthand, where: `properties.json composites[${i}]` });
  });
  p.properties.recipes.forEach((r, i) => namedBy.push({ key: r.labelKey, property: r.id, where: `properties.json recipes[${i}]` }));
  const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
  for (const { file, path, command, door } of doors) {
    if (door.kind !== 'inspector-field' && door.kind !== 'quick-panel') continue;
    if (door.adapter.fields.length > 0 || 'value' in door.args || door.labelKey === command.labelKey) continue;
    if (door.kind === 'inspector-field' && door.property !== null && structureOf(door.property) !== undefined) continue;
    let named: string[] = [];
    if (door.kind === 'inspector-field') {
      if (door.property !== null) named = [door.property];
      else if (door.composite !== null) named = [compositeById.get(door.composite)?.shorthand ?? ''].filter((x) => x !== '');
      else if (door.recipe !== null) named = [door.recipe];
    } else {
      const writes = door.adapter.writes;
      const composite = p.properties.composites.find((c) => c.shorthand !== null && sameSet(c.longhands, writes));
      const recipe = p.properties.recipes.find((r) => sameSet(r.declarations.map((d) => d.property), writes));
      named = writes.length === 1 ? [...writes] : composite?.shorthand ? [composite.shorthand] : recipe ? [recipe.id] : [...writes];
    }
    for (const property of named) namedBy.push({ key: door.labelKey, property, where: `${file} ${path}` });
  }
  for (const [locale, catalogue] of catalogues) {
    const byLabel = new Map<string, Map<string, string>>();
    for (const n of namedBy) {
      const text = catalogue[n.key];
      if (typeof text !== 'string' || text.trim() === '') continue;
      const label = text.trim().toLowerCase();
      const properties = byLabel.get(label) ?? new Map<string, string>();
      if (!properties.has(n.property)) properties.set(n.property, `${n.key} (${n.where})`);
      byLabel.set(label, properties);
    }
    for (const [label, properties] of byLabel) {
      if (properties.size < 2) continue;
      const list = [...properties].map(([property, from]) => `${property} by ${from}`).join('; ');
      report('label-term', `i18n/${locale}`, label, `the label "${label}" names ${properties.size} CSS properties: ${list}. One term per concept: give each property its own label`);
    }
  }
  if (glossary !== null) {
    unique('glossary concept', 'i18n/glossary', glossary.concepts.map((c, i) => ({ id: c.id, path: `concepts[${i}]` })));
    for (const [i, concept] of glossary.concepts.entries()) {
      const labels = [...new Set(namedBy.filter((n) => n.property === concept.property).map((n) => n.key))];
      if (labels.length === 0) {
        report('label-term', 'i18n/glossary', `concepts[${i}].property`, `concept "${concept.id}" names ${concept.property}, which no field labels`);
        continue;
      }
      for (const [locale, catalogue] of catalogues) {
        const term = concept.terms[locale as keyof typeof concept.terms];
        for (const key of labels) {
          const text = catalogue[key];
          if (typeof text === 'string' && text.trim() !== term) report('label-term', `i18n/${locale}`, key, `${key} labels ${concept.property} "${text}", but the glossary term of "${concept.id}" in ${locale} is "${term}"`);
        }
      }
    }
  }

  // ---- owner: the owner of every command is the module ARCHITECTURE.md names for it, and the other way round
  const ownerRows = input.architecture === null ? null : architectureOwners(input.architecture);
  if (ownerRows === null) {
    report('owner', 'ARCHITECTURE.md', '', input.architecture === null ? 'ARCHITECTURE.md is missing: it names the owner module of every command' : 'ARCHITECTURE.md has no table under "## Command owners"');
  } else {
    const declared = new Map<string, { module: string; line: number }>();
    for (const row of ownerRows) {
      for (const id of row.commands) {
        const first = declared.get(id);
        if (first !== undefined) report('owner', 'ARCHITECTURE.md', `line ${row.line}`, `${id} is owned by ${row.module} and, on line ${first.line}, by ${first.module}: one owner per command`);
        else declared.set(id, { module: row.module, line: row.line });
        if (!commandById.has(id)) report('owner', 'ARCHITECTURE.md', `line ${row.line}`, `${row.module} owns ${id}, which is not a command of the manifest`);
      }
    }
    for (const c of commands) {
      const row = declared.get(c.command.id);
      if (!row) report('owner', c.file, `${c.path}.owner`, `${c.command.id} is owned by ${c.command.owner}, but ARCHITECTURE.md names no owner for it`);
      else if (row.module !== c.command.owner) report('owner', c.file, `${c.path}.owner`, `${c.command.id} is owned by ${c.command.owner} in the manifest but by ${row.module} in ARCHITECTURE.md (line ${row.line})`);
    }
  }

  // ---- icon-name: every icon the manifest names is an icon of the editor's one library (Lucide,
  // manifest/generated/icons.json): door icons, menu buttons, the layout's glyphs, element icons, keyword icons
  const library = new Set(p.icons.icons);
  const iconName = (icon: string | null, file: string, path: string, what: string) => {
    if (icon !== null && !library.has(icon)) report('icon-name', file, path, `${what} names the icon "${icon}", which the icon library (Lucide ${p.icons.$generated.from['lucide-static'] ?? ''}) does not have`);
  };
  for (const { file, path, door, ref: doorRef } of doors) iconName(door.icon, file, `${path}.icon`, doorRef);
  p.layout.menus.forEach((m, mi) => m.anchors.forEach((a, ai) => iconName(a.icon, 'layout.json', `menus[${mi}].anchors[${ai}].icon`, `the button of menu "${m.id}" in ${a.region}`)));
  for (const [glyph, icon] of Object.entries(p.layout.glyphs)) iconName(icon, 'layout.json', `glyphs.${glyph}`, `the ${glyph} glyph`);
  for (const [panel, icon] of Object.entries(p.layout.panels)) iconName(icon, 'layout.json', `panels.${panel}`, `the ${panel} panel`);
  p.elements.elements.forEach((e, i) => iconName(e.icon, 'elements.json', `elements[${i}].icon`, `element ${e.id}`));
  p.properties.properties.forEach((prop, i) => {
    for (const [keyword, icon] of Object.entries(prop.icons)) iconName(icon, 'properties.json', `properties[${i}].icons.${keyword}`, `${prop.id}: ${keyword}`);
  });

  // ---- icon-required: a toolbar door, an icon button and a menu button drawn as an icon button name their icon,
  // so the shell never picks one; a disclosure's icon is the layout's glyph and a key or a pointer gesture has no
  // control, so neither names one; every panel has its icon; a keyword-buttons control drawn with icons has one for
  // every keyword its doors offer
  for (const { file, path, door, ref: doorRef } of doors) {
    const drawnAs = door.kind === 'toolbar' || door.kind === 'panel-control' ? door.drawnAs : null;
    if (CONTROLLESS.includes(door.kind) || drawnAs === 'disclosure') {
      if (door.icon !== null) report('icon-required', file, `${path}.icon`, drawnAs === 'disclosure' ? `${doorRef} is a disclosure: its icon is the layout's expanded or collapsed glyph, so it names none` : `${doorRef} is a ${door.kind} door: it has no control, so no icon`);
      continue;
    }
    if (door.icon !== null) continue;
    if (door.kind === 'toolbar') report('icon-required', file, `${path}.icon`, `${doorRef} is a toolbar door without an icon: every toolbar door names its icon`);
    else if (drawnAs === 'icon-button') report('icon-required', file, `${path}.icon`, `${doorRef} is drawn as an icon button but names no icon`);
  }
  const panelArg = commandById.get('workspace.setPanelOpen')?.args.panel?.values ?? [];
  for (const panel of panelArg) if (!(panel in p.layout.panels)) report('icon-required', 'layout.json', 'panels', `the ${panel} panel has no icon`);
  for (const panel of Object.keys(p.layout.panels)) if (!panelArg.includes(panel)) report('icon-required', 'layout.json', `panels.${panel}`, `"${panel}" is not a panel of workspace.setPanelOpen`);
  p.layout.menus.forEach((m, mi) =>
    m.anchors.forEach((a, ai) => {
      if (a.drawnAs === 'icon-button' && a.icon === null) report('icon-required', 'layout.json', `menus[${mi}].anchors[${ai}].icon`, `the button of menu "${m.id}" in ${a.region} is drawn as an icon button but names no icon`);
    }),
  );
  p.properties.properties.forEach((prop, i) => {
    const icons = Object.keys(prop.icons);
    if (icons.length === 0) return;
    if (prop.control !== 'keyword-buttons') report('icon-required', 'properties.json', `properties[${i}].icons`, `${prop.id} is a ${prop.control}: only keyword buttons show an icon for each keyword`);
    const offered = new Set<string>();
    for (const d of prop.doors) {
      const offers = doorByRef.get(d)?.door.adapter.offers;
      if (!offers || offers.property !== prop.id) continue;
      (offers.list === 'generated' ? (generatedOffer(offerData, prop.id) ?? []) : (subsetsOf(prop.id).find((s) => s.id === offers.list)?.values ?? [])).forEach((v) => offered.add(v));
      for (const id of [offers.presets, offers.essentials]) if (id !== null) (subsetsOf(prop.id).find((s) => s.id === id)?.values ?? []).forEach((v) => offered.add(v));
    }
    const missing = [...offered].filter((v) => !icons.includes(v));
    if (missing.length > 0) report('icon-required', 'properties.json', `properties[${i}].icons`, `${prop.id} shows its keywords as icons but has none for ${missing.join(', ')}`);
  });

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
    doorsByRegion: Object.fromEntries(p.layout.regions.map((r) => [r.id, doorsByRegion[r.id] ?? 0])),
    regions: p.layout.regions.length,
    menuAnchors: p.layout.menus.reduce((n, m) => n + m.anchors.length, 0),
    glossaryConcepts: glossary?.concepts.length ?? 0,
    elements: p.elements.elements.length,
    paletteEntries: paletteEntryIds.size,
    attributes: p.elements.attributes.length,
    generatedProperties: Object.keys(generated).length,
    generatedShorthands: Object.values(generated).filter((g) => g.longhands.length > 0).length,
    generatedElements: Object.keys(html).length,
    properties: p.properties.properties.length,
    composites: p.properties.composites.length,
    recipes: p.properties.recipes.length,
    structures: p.properties.structures.length,
    couplings: p.properties.couplings.length,
    browsers: p.compat.browsers,
    compatSource: Object.entries(p.compat.$generated.from).map(([pkg, v]) => `${pkg} ${v}`).join(', '),
    keywordsLeftOut,
    unitsLeftOut,
    recipeBrowserSyntax: [...recipeBrowserSyntax].sort(),
    recipeSources: p.properties.recipes.map((r) => `${r.id} (${r.source.spec}; BCD ${r.source.bcd})`),
    storedWhole: p.properties.storedWhole.map((w) => `${w.property}: ${w.reason}`),
    iconLibrary: `Lucide ${p.icons.$generated.from['lucide-static'] ?? ''} (${p.icons.icons.length} icons)`,
    iconsNamed: new Set([...doors.map((d) => d.door.icon), ...p.elements.elements.map((e) => e.icon), ...p.layout.menus.flatMap((m) => m.anchors.map((a) => a.icon)), ...Object.values(p.layout.glyphs), ...Object.values(p.layout.panels), ...p.properties.properties.flatMap((prop) => Object.values(prop.icons))].filter((i) => i !== null)).size,
    doorsWithIcon: doors.filter((d) => d.door.icon !== null).length,
    plannedReferences: p.references.references.filter((r) => r.status === 'planned').length,
    registeredReferences: p.references.references.filter((r) => r.status === 'registered').length,
    referencesByKind: Object.fromEntries(Object.entries(referencesByKind).sort(([a], [b]) => a.localeCompare(b))),
    consumers: p.consumers.consumers.length,
    implementedOnly: [...implementedOnly].sort(),
    fallbackAllowlist: p.properties.syntaxFallbacks.map((f) => `${f.property}${f.values === null ? '' : `: ${f.values.join(', ')}`}${f.recipe === null ? '' : ` (recipe ${f.recipe})`}: ${f.reason}`),
    constants: p.interactions.constants.length,
    gestures: p.interactions.gestures.length,
    keyContexts: p.interactions.keyContexts.length,
    scenarios: features.reduce((n, f) => n + f.feature.scenarios.length, 0),
    i18nKeys: keyUses.size,
  };
  return { problems, summary };
}

