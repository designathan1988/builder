// Planted fixtures: each one copies the real manifest and plants exactly one defect.
// The unit test proves that every rule of manifest:check fails on its plant, and only on that rule;
// `npm run manifest:check -- --plant <id>` shows the raw failure.
import type { ManifestInput, RuleId } from '../../src/manifest/check.ts';

type Json = Record<string, unknown>;
interface MutableInput {
  files: Record<string, unknown>;
  catalogues: Record<string, unknown>;
  fileExists: ManifestInput['fileExists'];
}

export interface Plant {
  id: string;
  rule: RuleId;
  description: string;
  apply(input: MutableInput): void;
}

const obj = (value: unknown): Json => value as Json;
const list = (value: unknown): Json[] => value as Json[];
const strings = (value: unknown): string[] => value as string[];

function command(input: MutableInput, id: string): Json {
  for (const [file, data] of Object.entries(input.files)) {
    if (!file.startsWith('commands/')) continue;
    const found = list(obj(data).commands).find((c) => c.id === id);
    if (found) return found;
  }
  throw new Error(`plant: no command ${id}`);
}

function feature(input: MutableInput, id: string): Json {
  for (const [file, data] of Object.entries(input.files)) {
    if (!file.startsWith('features/')) continue;
    const found = list(obj(data).features).find((f) => f.id === id);
    if (found) return found;
  }
  throw new Error(`plant: no feature ${id}`);
}

function door(input: MutableInput, commandId: string, doorId: string): Json {
  const found = list(command(input, commandId).entryPoints).find((d) => d.id === doorId);
  if (!found) throw new Error(`plant: no door ${commandId}#${doorId}`);
  return found;
}

function scenario(doors: string[], expect: Json): Json {
  return {
    id: 'planted-scenario',
    setup: {
      fixture: 'section-with-paragraphs',
      selection: ['/Page/Section/Paragraph'],
      context: 'canvas',
      breakpoint: 'desktop',
      state: 'base',
      locale: 'pt-BR',
      viewport: 'desktop-1440',
      zoom: 100,
    },
    doors,
    expect: {
      document: [{ op: 'remove', path: '/pages/0/tree/children/0/children/0' }],
      selection: ['/Page/Section'],
      history: { undoSteps: 1, undoRestores: true, redoRestores: true },
      render: null,
      persistence: null,
      export: null,
      ...expect,
    },
    refusals: [],
  };
}

const RENDERED = { render: { computed: [{ node: '/Page/Section', property: 'display', value: 'block' }], geometry: [], feedback: [] } };

export const PLANTS: Plant[] = [
  {
    id: 'unknown-field',
    rule: 'schema',
    description: 'a feature carries a hand-set "passes" field',
    apply: (m) => {
      feature(m, 'undo-redo').passes = false;
    },
  },
  {
    id: 'missing-field',
    rule: 'schema',
    description: 'the command history.undo has no owner',
    apply: (m) => {
      delete command(m, 'history.undo').owner;
    },
  },
  {
    id: 'duplicate-id',
    rule: 'duplicate-id',
    description: 'a second feature with the id shortcuts-e2e-sweep',
    apply: (m) => {
      const file = obj(m.files['features/20-shortcut-sweep.json']);
      const features = list(file.features);
      features.push(structuredClone(features[0]) as Json);
    },
  },
  {
    id: 'door-unknown-command',
    rule: 'door-unknown-command',
    description: 'a scenario of delete-element runs through a door of the unknown command element.remove',
    apply: (m) => {
      feature(m, 'delete-element').scenarios = [scenario(['element.remove#key-delete-in-canvas'], RENDERED)];
    },
  },
  {
    id: 'command-without-door',
    rule: 'command-without-door',
    description: 'history.redo has no door',
    apply: (m) => {
      command(m, 'history.redo').entryPoints = [];
    },
  },
  {
    id: 'i18n-missing-pt-br',
    rule: 'i18n-missing',
    description: 'the key command.undo is missing from the pt-BR catalogue',
    apply: (m) => {
      delete obj(m.catalogues['pt-BR'])['command.undo'];
    },
  },
  {
    id: 'i18n-missing-en',
    rule: 'i18n-missing',
    description: 'the key command.delete is missing from the en catalogue',
    apply: (m) => {
      delete obj(m.catalogues.en)['command.delete'];
    },
  },
  {
    id: 'value-set-not-subset',
    rule: 'value-set',
    description: 'the Display field offers "flow", which is not a display keyword of the catalogue',
    apply: (m) => {
      const offers = obj(obj(door(m, 'style.set', 'inspector-display').adapter).offers);
      offers.keywords = ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'contents', 'none', 'flow'];
    },
  },
  {
    id: 'value-set-smaller-without-reason',
    rule: 'value-set',
    description: 'the quick panel W field offers only px and % and gives no reason',
    apply: (m) => {
      const offers = obj(obj(door(m, 'style.set', 'quick-panel-width').adapter).offers);
      offers.units = ['px', '%'];
      offers.reason = null;
    },
  },
  {
    id: 'chord-conflict',
    rule: 'chord-conflict',
    description: 'Duplicate also binds Shift+Ctrl+z anywhere, the chord of Redo',
    apply: (m) => {
      const duplicate = command(m, 'element.duplicate');
      const doors = list(duplicate.entryPoints);
      doors.push({ ...structuredClone(doors[0]), id: 'key-planted', chord: 'Shift+Ctrl+z' } as Json);
    },
  },
  {
    id: 'modifier-conflict',
    rule: 'modifier-conflict',
    description: 'while resizing, Alt also suspends snapping (report PG-14)',
    apply: (m) => {
      const gestures = list(obj(m.files['interactions.json']).gestures);
      const resize = gestures.find((g) => g.id === 'resize');
      if (!resize) throw new Error('plant: no resize gesture');
      list(resize.modifiers).push({ key: 'Alt', meaning: 'suspend-snapping' });
    },
  },
  {
    id: 'feature-needs-later-command',
    rule: 'order',
    description: 'undo-redo needs clipboard.cut, introduced much later by clipboard-cut-system',
    apply: (m) => {
      strings(feature(m, 'undo-redo').commands).push('clipboard.cut');
    },
  },
  {
    id: 'feature-needs-later-feature',
    rule: 'order',
    description: 'select-click depends on hide-element, which comes later',
    apply: (m) => {
      strings(feature(m, 'select-click').dependsOn).push('hide-element');
    },
  },
  {
    id: 'spec-missing',
    rule: 'spec-missing',
    description: 'delete-element points to spec/behavior/delete-elements.md, which does not exist',
    apply: (m) => {
      feature(m, 'delete-element').spec = 'spec/behavior/delete-elements.md';
    },
  },
  {
    id: 'scenario-without-terminal',
    rule: 'scenario-terminal',
    description: 'a scenario of delete-element expects no render, no persistence and no export',
    apply: (m) => {
      feature(m, 'delete-element').scenarios = [scenario(['element.delete#key-delete-in-canvas'], {})];
    },
  },
  {
    id: 'unknown-reference',
    rule: 'unknown-reference',
    description: 'an inspector field edits the unknown property displayMode',
    apply: (m) => {
      door(m, 'style.set', 'inspector-display').property = 'displayMode';
    },
  },
  {
    id: 'feature-command-link',
    rule: 'feature-command-link',
    description: 'hide-element introduces element.toggleHidden but does not list it',
    apply: (m) => {
      const hide = feature(m, 'hide-element');
      hide.commands = strings(hide.commands).filter((c) => c !== 'element.toggleHidden');
    },
  },
];

export function planted(input: ManifestInput, plant: Plant): ManifestInput {
  const copy: MutableInput = {
    files: structuredClone(input.files) as Record<string, unknown>,
    catalogues: structuredClone(input.catalogues) as Record<string, unknown>,
    fileExists: input.fileExists,
  };
  plant.apply(copy);
  return copy;
}
