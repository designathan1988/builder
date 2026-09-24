// Planted fixtures: each one copies the real manifest and plants exactly one defect.
// The unit test proves that every rule of manifest:check fails on its plant, and only on that rule;
// `npm run manifest:check -- --plant <id>` shows the raw failure.
import type { ManifestInput, RuleId } from '../../src/manifest/check.ts';

type Json = Record<string, unknown>;
interface MutableInput {
  files: Record<string, unknown>;
  catalogues: Record<string, unknown>;
  fileExists: ManifestInput['fileExists'];
  registered: ManifestInput['registered'];
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

function properties(input: MutableInput): Json {
  return obj(input.files['properties.json']);
}

function property(input: MutableInput, id: string): Json {
  const found = list(properties(input).properties).find((p) => p.id === id);
  if (!found) throw new Error(`plant: no property ${id}`);
  return found;
}

function composite(input: MutableInput, id: string): Json {
  const found = list(properties(input).composites).find((c) => c.id === id);
  if (!found) throw new Error(`plant: no composite ${id}`);
  return found;
}

function element(input: MutableInput, id: string): Json {
  const found = list(obj(input.files['elements.json']).elements).find((e) => e.id === id);
  if (!found) throw new Error(`plant: no element ${id}`);
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
    id: 'value-set-unknown-subset',
    rule: 'value-set',
    description: 'the Display field offers the list "palette", which display does not declare',
    apply: (m) => {
      obj(obj(door(m, 'style.set', 'inspector-display').adapter).offers).list = 'palette';
    },
  },
  {
    id: 'value-set-menu-without-list',
    rule: 'value-set',
    description: 'the Display menu declares no list of values',
    apply: (m) => {
      obj(door(m, 'style.set', 'inspector-display').adapter).offers = null;
    },
  },
  {
    id: 'keyword-rejected-by-syntax',
    rule: 'css-syntax',
    description: 'the Display menu subset offers "flexbox", which the official display syntax rejects',
    apply: (m) => {
      strings(list(property(m, 'display').subsets)[0]?.values).push('flexbox');
    },
  },
  {
    id: 'door-writes-shorthand',
    rule: 'shorthand-write',
    description: 'a quick panel control writes the gap shorthand instead of row-gap and column-gap',
    apply: (m) => {
      list(command(m, 'style.set').entryPoints).push({
        id: 'quick-panel-gap',
        kind: 'quick-panel',
        feature: 'quick-panel',
        control: 'gap',
        labelKey: 'quickPanel.width',
        disabledReasonKey: 'common.notAvailableYet',
        placement: 'unplaced',
        adapter: { selection: 'all', offers: null, writes: ['gap'] },
        args: {},
      });
    },
  },
  {
    id: 'handle-writes-transform',
    rule: 'individual-transform',
    description: 'the rotation handle writes transform instead of rotate',
    apply: (m) => {
      obj(door(m, 'style.set', 'handle-rotate').adapter).writes = ['transform'];
      const rotate = property(m, 'rotate');
      rotate.doors = strings(rotate.doors).filter((d) => d !== 'style.set#handle-rotate');
      strings(property(m, 'transform').doors).push('style.set#handle-rotate');
    },
  },
  {
    id: 'coupling-unknown-predicate',
    rule: 'coupling',
    description: 'the border width coupling asks the predicate "styleIsNone", which is not in the closed list',
    apply: (m) => {
      obj(list(properties(m).couplings)[0]?.condition).predicate = 'styleIsNone';
    },
  },
  {
    id: 'field-without-consumer',
    rule: 'consumer',
    description: 'no module reads the coalescing rule of a command',
    apply: (m) => {
      const file = obj(m.files['consumers.json']);
      file.consumers = list(file.consumers).filter((c) => c.field !== 'commands:commands[].history.coalesce');
    },
  },
  {
    id: 'field-holds-expression',
    rule: 'no-logic',
    description: 'the availability of Undo is written as the expression "canUndo && !editingText"',
    apply: (m) => {
      obj(command(m, 'history.undo').availability).predicate = 'canUndo && !editingText';
    },
  },
  {
    id: 'reference-not-planned',
    rule: 'reference',
    description: 'row-gap names the codec "length-percentage-v2", which is neither planned nor registered',
    apply: (m) => {
      property(m, 'row-gap').codec = 'length-percentage-v2';
    },
  },
  {
    id: 'composite-leaves-out-longhand',
    rule: 'composite',
    description: 'the padding composite leaves out padding-left, which the padding shorthand sets',
    apply: (m) => {
      const padding = composite(m, 'padding');
      padding.longhands = strings(padding.longhands).filter((l) => l !== 'padding-left');
    },
  },
  {
    id: 'property-misses-a-door',
    rule: 'door-writes',
    description: 'width does not list the quick panel W field, which writes it',
    apply: (m) => {
      const width = property(m, 'width');
      width.doors = strings(width.doors).filter((d) => d !== 'style.set#quick-panel-width');
    },
  },
  {
    id: 'gesture-without-transaction',
    rule: 'history',
    description: 'resizing records one transaction per pointer event instead of one per gesture',
    apply: (m) => {
      obj(command(m, 'geometry.resize').history).transaction = 'per-dispatch';
    },
  },
  {
    id: 'natural-child-refused-by-html',
    rule: 'html-model',
    description: 'a Summary creates a Paragraph as its natural child; HTML permits only phrasing and headings in <summary>',
    apply: (m) => {
      element(m, 'summary').naturalChild = 'paragraph';
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
    description: 'an inspector field edits the unknown property display-mode',
    apply: (m) => {
      door(m, 'style.set', 'inspector-display').property = 'display-mode';
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
    registered: input.registered,
  };
  plant.apply(copy);
  return copy;
}
