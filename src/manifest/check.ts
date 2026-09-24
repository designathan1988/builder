// Validates the manifest: first every file against its schema, then the rules
// that tie the files together. Pure: the caller supplies the parsed files, the
// i18n catalogues and a way to ask whether a repository path exists.
import type { z } from 'zod';
import {
  commandsFileSchema,
  elementsFileSchema,
  environmentSchema,
  featuresFileSchema,
  interactionsFileSchema,
  propertiesFileSchema,
  type Command,
  type CommandsFile,
  type Door,
  type DoorKind,
  type ElementsFile,
  type Environment,
  type Feature,
  type FeaturesFile,
  type InteractionsFile,
  type PropertiesFile,
} from './schema.ts';

export const RULES = [
  'schema',
  'duplicate-id',
  'unknown-reference',
  'door-unknown-command',
  'command-without-door',
  'feature-command-link',
  'i18n-missing',
  'value-set',
  'chord-conflict',
  'modifier-conflict',
  'order',
  'spec-missing',
  'scenario-terminal',
] as const;

export type RuleId = (typeof RULES)[number];

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
}

export interface ManifestSummary {
  features: number;
  featureGroups: number;
  commands: number;
  doors: number;
  doorsByKind: Record<string, number>;
  elements: number;
  paletteEntries: number;
  attributes: number;
  properties: number;
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
  commandFiles: { file: string; data: CommandsFile }[];
  featureFiles: { file: string; data: FeaturesFile }[];
}

const SINGLE_FILES = ['environment.json', 'elements.json', 'properties.json', 'interactions.json'];

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

function parseFiles(input: ManifestInput): { parsed: Parsed | null; problems: Problem[] } {
  const problems: Problem[] = [];
  const out: Partial<Parsed> & { commandFiles: Parsed['commandFiles']; featureFiles: Parsed['featureFiles'] } = {
    commandFiles: [],
    featureFiles: [],
  };
  for (const [file, json] of Object.entries(input.files)) {
    if (file === 'environment.json') {
      const result = environmentSchema.safeParse(json);
      if (result.success) out.environment = result.data;
      else problems.push(...schemaProblems(file, result.error));
    } else if (file === 'elements.json') {
      const result = elementsFileSchema.safeParse(json);
      if (result.success) out.elements = result.data;
      else problems.push(...schemaProblems(file, result.error));
    } else if (file === 'properties.json') {
      const result = propertiesFileSchema.safeParse(json);
      if (result.success) out.properties = result.data;
      else problems.push(...schemaProblems(file, result.error));
    } else if (file === 'interactions.json') {
      const result = interactionsFileSchema.safeParse(json);
      if (result.success) out.interactions = result.data;
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
      problems.push({ rule: 'schema', file, path: '', message: 'not a manifest file: expected one of environment.json, elements.json, properties.json, interactions.json, commands/<domain>.json, features/<NN>-<group>.json' });
    }
  }
  for (const file of SINGLE_FILES) {
    if (!(file in input.files)) problems.push({ rule: 'schema', file, path: '', message: 'missing manifest file' });
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

// ---------------------------------------------------------------- the rules

interface DoorEntry {
  file: string;
  path: string;
  command: Command;
  door: Door;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

export function checkManifest(input: ManifestInput): CheckResult {
  const { parsed, problems } = parseFiles(input);
  if (!parsed) return { problems, summary: null };
  const p = parsed;
  const report = (rule: RuleId, file: string, path: string, message: string) => problems.push({ rule, file, path, message });

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
    c.command.entryPoints.forEach((door, i) => doors.push({ file: c.file, path: `${c.path}.entryPoints[${i}]`, command: c.command, door }));
  }

  const elementIds = new Set(p.elements.elements.map((e) => e.id));
  const attributeById = new Map(p.elements.attributes.map((a) => [a.id, a]));
  const paletteEntryIds = new Set(p.elements.palette.flatMap((g) => g.entries.map((e) => e.id)));
  const propertyById = new Map(p.properties.properties.map((prop) => [prop.id, prop]));
  const breakpointIds = new Set(p.properties.breakpoints.map((b) => b.id));
  const stateIds = new Set(p.properties.states.map((s) => s.id));
  const contextIds = new Set(p.interactions.keyContexts.map((k) => k.id));
  const gestureById = new Map(p.interactions.gestures.map((g) => [g.id, g]));
  const viewportIds = new Set(p.environment.viewports.map((v) => v.id));

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
  unique('CSS property name', 'properties.json', p.properties.properties.map((prop, i) => ({ id: prop.css, path: `properties[${i}]` })));
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

  // ---- unknown-reference
  const ref = (ok: boolean, file: string, path: string, message: string) => {
    if (!ok) report('unknown-reference', file, path, message);
  };
  if (!p.environment.locales.available.includes(p.environment.locales.default)) {
    report('unknown-reference', 'environment.json', 'locales.default', `default locale "${p.environment.locales.default}" is not an available locale`);
  }
  for (const [i, e] of p.elements.elements.entries()) {
    const path = `elements[${i}]`;
    const refs = [
      ...(Array.isArray(e.allowedChildren) ? e.allowedChildren.map((id) => ['allowedChildren', id] as const) : []),
      ...e.requiredParent.map((id) => ['requiredParent', id] as const),
      ...e.uniqueChildren.map((id) => ['uniqueChildren', id] as const),
      ...e.requiredChildren.map((id) => ['requiredChildren', id] as const),
      ...e.forbiddenAncestors.map((id) => ['forbiddenAncestors', id] as const),
      ...(e.firstChild ? [['firstChild', e.firstChild] as const] : []),
      ...(e.naturalChild ? [['naturalChild', e.naturalChild] as const] : []),
    ];
    for (const [field, id] of refs) ref(elementIds.has(id), 'elements.json', `${path}.${field}`, `unknown element type "${id}"`);
    if (e.tag === null && e.content !== 'markup') report('schema', 'elements.json', `${path}.tag`, 'only an element whose content is "markup" may have no tag');
  }
  for (const [i, a] of p.elements.attributes.entries()) {
    if (a.elements !== 'all') for (const id of a.elements) ref(elementIds.has(id), 'elements.json', `attributes[${i}].elements`, `unknown element type "${id}"`);
    ref(commandById.has(a.command), 'elements.json', `attributes[${i}].command`, `unknown command "${a.command}"`);
  }
  for (const [gi, g] of p.elements.palette.entries()) {
    for (const [i, e] of g.entries.entries()) {
      ref(elementIds.has(e.element), 'elements.json', `palette[${gi}].entries[${i}].element`, `unknown element type "${e.element}"`);
      ref(featureIndex.has(e.feature), 'elements.json', `palette[${gi}].entries[${i}].feature`, `unknown feature "${e.feature}"`);
    }
  }
  for (const [i, prop] of p.properties.properties.entries()) {
    const section = p.properties.sections.find((s) => s.id === prop.section);
    ref(section !== undefined, 'properties.json', `properties[${i}].section`, `unknown section "${prop.section}"`);
    if (section) ref(section.groups.some((g) => g.id === prop.group), 'properties.json', `properties[${i}].group`, `section "${prop.section}" has no group "${prop.group}"`);
    ref(commandById.has(prop.command), 'properties.json', `properties[${i}].command`, `unknown command "${prop.command}"`);
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
      if (arg.type === 'property') ref(text !== null && propertyById.has(text), file, `${path}.args.${name}`, `unknown property "${String(value)}"`);
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
      if ((door.property === null) === (door.attribute === null)) {
        report('schema', file, path, 'an inspector field names exactly one property or one attribute');
      }
      if (door.property !== null) {
        const prop = propertyById.get(door.property);
        ref(prop !== undefined, file, `${path}.property`, `unknown property "${door.property}"`);
        if (prop) ref(prop.command === command.id, file, `${path}.property`, `property "${prop.id}" is written by ${prop.command}, not by ${command.id}`);
      }
      if (door.attribute !== null) {
        const attr = attributeById.get(door.attribute);
        ref(attr !== undefined, file, `${path}.attribute`, `unknown attribute "${door.attribute}"`);
        if (attr) ref(attr.command === command.id, file, `${path}.attribute`, `attribute "${attr.id}" is written by ${attr.command}, not by ${command.id}`);
      }
    }
    for (const id of door.adapter.writes) {
      const prop = propertyById.get(id);
      ref(prop !== undefined, file, `${path}.adapter.writes`, `unknown property "${id}"`);
      if (prop && (door.kind === 'inspector-field' || door.kind === 'quick-panel')) {
        ref(prop.command === command.id, file, `${path}.adapter.writes`, `property "${id}" is written by ${prop.command}, not by ${command.id}`);
      }
    }
    if (door.adapter.offers) ref(propertyById.has(door.adapter.offers.property), file, `${path}.adapter.offers.property`, `unknown property "${door.adapter.offers.property}"`);
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

  // ---- value-set: what a door offers is the property's catalogue list, or a declared subset with its reason
  for (const { file, path, command, door } of doors) {
    const offers = door.adapter.offers;
    if (door.kind === 'inspector-field' && door.property !== null) {
      const prop = propertyById.get(door.property);
      if (prop && (prop.keywords.length > 0 || prop.units.length > 0) && (offers === null || offers.property !== prop.id)) {
        report('value-set', file, `${path}.adapter.offers`, `${command.id}#${door.id} edits ${prop.id} but declares no value set for it`);
      }
    }
    if (!offers) continue;
    const prop = propertyById.get(offers.property);
    if (!prop) continue;
    let smaller = false;
    if (offers.keywords !== 'all') {
      for (const k of offers.keywords) if (!prop.keywords.includes(k)) report('value-set', file, `${path}.adapter.offers.keywords`, `${command.id}#${door.id} offers "${k}", which is not in the catalogue keywords of ${prop.id}`);
      if (new Set(offers.keywords).size < prop.keywords.length) smaller = true;
    }
    if (offers.units !== 'all') {
      for (const u of offers.units) if (!(prop.units as string[]).includes(u)) report('value-set', file, `${path}.adapter.offers.units`, `${command.id}#${door.id} offers unit "${u}", which is not in the catalogue units of ${prop.id}`);
      if (new Set(offers.units).size < prop.units.length) smaller = true;
    }
    if (smaller && offers.reason === null) {
      report('value-set', file, `${path}.adapter.offers.reason`, `${command.id}#${door.id} offers less than the catalogue list of ${prop.id} and gives no reason`);
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
  const summary: ManifestSummary = {
    features: features.length,
    featureGroups: p.featureFiles.length,
    commands: commands.length,
    doors: doors.length,
    doorsByKind: Object.fromEntries(Object.entries(doorsByKind).sort(([a], [b]) => a.localeCompare(b))) as Record<DoorKind, number>,
    elements: p.elements.elements.length,
    paletteEntries: paletteEntryIds.size,
    attributes: p.elements.attributes.length,
    properties: p.properties.properties.length,
    constants: p.interactions.constants.length,
    gestures: p.interactions.gestures.length,
    keyContexts: p.interactions.keyContexts.length,
    scenarios: features.reduce((n, f) => n + f.feature.scenarios.length, 0),
    i18nKeys: keyUses.size,
  };
  return { problems, summary };
}
