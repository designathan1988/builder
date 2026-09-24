// Planted fixtures: each one copies the real manifest and plants exactly one defect.
// The unit test proves that every rule of manifest:check fails on its plant, and only on that rule;
// `npm run manifest:check -- --plant <id>` shows the raw failure.
import type { ManifestInput, RuleId } from '../../src/manifest/check.ts';

type Json = Record<string, unknown>;
interface MutableInput {
  files: Record<string, unknown>;
  catalogues: Record<string, unknown>;
  glossary: unknown;
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

function recipe(input: MutableInput, id: string): Json {
  const found = list(properties(input).recipes).find((r) => r.id === id);
  if (!found) throw new Error(`plant: no recipe ${id}`);
  return found;
}

// a label of its own, in every catalogue, for a planted property or door, so that it names no other property
function plantedLabel(m: MutableInput, key: string, text: string): string {
  for (const catalogue of Object.values(m.catalogues)) obj(catalogue)[key] = text;
  return key;
}

// an edited property with no door, for plants that only need the property itself
function editedProperty(m: MutableInput, id: string, fields: Json): Json {
  const labelKey = plantedLabel(m, `plant.${id.replace(/^-/, '').replace(/-([a-z])/g, (_x, c: string) => c.toUpperCase())}`, `Planted ${id}`);
  return { id, labelKey, section: 'size', group: 'size', control: 'length-field', valueType: 'length', codec: 'length', appliesTo: 'hasBox', essential: false, doors: [], subsets: [], ...fields };
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
    description: 'the quick panel Weight field offers the list "palette", which font-weight does not declare',
    apply: (m) => {
      obj(obj(door(m, 'style.set', 'quick-panel-font-weight').adapter).offers).list = 'palette';
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
        labelKey: 'property.gap',
        disabledReasonKey: 'common.notAvailableYet',
        placement: { region: 'quick-panel', order: 99 },
        adapter: { selection: 'all', offers: null, writes: ['gap'], fields: [] },
        args: {},
      });
    },
  },
  {
    id: 'edited-property-unsupported',
    rule: 'browser-support',
    description: 'column-height is edited as a property; only Chrome implements it (Firefox and Safari lack it in css-compat.json)',
    apply: (m) => {
      list(properties(m).properties).push(editedProperty(m, 'column-height', { section: 'layout', group: 'columns', appliesTo: 'container' }));
    },
  },
  {
    id: 'offered-keyword-unsupported',
    rule: 'browser-support',
    description: 'the flex-wrap menu offers, in Essentials only, a subset with balance, which only Chrome supports',
    apply: (m) => {
      property(m, 'flex-wrap').subsets = [{ id: 'menu', values: ['nowrap', 'wrap', 'wrap-reverse', 'balance'], units: null, reason: 'planted' }];
      obj(obj(door(m, 'style.set', 'inspector-flex-wrap').adapter).offers).essentials = 'menu';
    },
  },
  {
    id: 'prefix-outside-recipe',
    rule: 'vendor-prefix',
    description: '-webkit-text-stroke-width, which all three browsers support, is edited as a plain property instead of inside a recipe',
    apply: (m) => {
      list(properties(m).properties).push(editedProperty(m, '-webkit-text-stroke-width', { section: 'text', group: 'typography', appliesTo: 'text' }));
    },
  },
  {
    id: 'fallback-outside-allowlist',
    rule: 'syntax-fallback',
    description: 'stroke leaves the fallback allowlist, so its default #2b5fe3 (valid only by the browser syntax) is a fallback outside the list',
    apply: (m) => {
      const file = properties(m);
      file.syntaxFallbacks = list(file.syntaxFallbacks).filter((f) => f.property !== 'stroke');
    },
  },
  {
    id: 'recipe-misses-browsers',
    rule: 'recipe',
    description: 'the line clamp recipe writes the unprefixed line-clamp, which no browser ships, instead of -webkit-line-clamp',
    apply: (m) => {
      const unprefix = (name: unknown) => (name === '-webkit-line-clamp' ? 'line-clamp' : name);
      for (const d of list(recipe(m, 'line-clamp').declarations)) d.property = unprefix(d.property);
      const adapter = obj(door(m, 'style.set', 'inspector-line-clamp').adapter);
      adapter.writes = strings(adapter.writes).map((w) => unprefix(w) as string);
    },
  },
  {
    id: 'handle-edits-unknown-field',
    rule: 'structured-value',
    description: 'the shadow blur handle edits the field spread, which a text shadow layer does not have',
    apply: (m) => {
      obj(door(m, 'style.setShadows', 'handle-shadow-blur').adapter).fields = ['spread'];
    },
  },
  {
    id: 'offered-type-keyword-unsupported',
    rule: 'browser-support',
    description: 'the accent-color field offers, in Essentials only, a subset with Mark, a system colour Safari lacks (BCD css.types.color.system-color.mark)',
    apply: (m) => {
      property(m, 'accent-color').subsets = [{ id: 'swatches', values: ['canvastext', 'mark'], units: null, reason: 'planted' }];
      obj(door(m, 'style.set', 'inspector-accent-color').adapter).offers = { property: 'accent-color', list: 'generated', essentials: 'swatches' };
    },
  },
  {
    id: 'recipe-source-not-its-value',
    rule: 'recipe',
    description: 'the line clamp recipe cites css.properties.display, the BCD entry of a fixed declaration, instead of the one carrying the clamp',
    apply: (m) => {
      obj(recipe(m, 'line-clamp').source).bcd = 'css.properties.display';
    },
  },
  {
    id: 'structured-default-as-css-text',
    rule: 'structured-value',
    description: 'the div gets box-shadow "0 1px 2px red" as a CSS-text default, although box-shadow stores typed layers',
    apply: (m) => {
      obj(element(m, 'div').defaultStyles)['box-shadow'] = '0 1px 2px red';
    },
  },
  {
    id: 'composite-subset-sets-omitted-longhand',
    rule: 'composite',
    description: 'a columns subset offers "2 auto / 10em", which sets column-height, a longhand the composite omits',
    apply: (m) => {
      composite(m, 'columns').subsets = [{ id: 'presets', values: ['2 auto', '2 auto / 10em'], units: null, reason: 'planted' }];
    },
  },
  {
    id: 'buttons-with-no-supported-keyword',
    rule: 'value-set',
    description: 'Safari loses every text-align keyword in css-compat.json, so the Text align buttons would be empty',
    apply: (m) => {
      const textAlign = obj(obj(obj(m.files['generated/css-compat.json']).properties)['text-align']);
      for (const k of Object.values(obj(textAlign.keywords))) {
        obj(k).safari = false;
        obj(obj(k).why).safari = 'planted';
      }
    },
  },
  {
    id: 'global-allowlist-cannot-vouch',
    rule: 'browser-support',
    description: 'an allowlist entry for overflow-x: overlay outside any recipe lets the syntax through, but cannot make a value no browser supports acceptable',
    apply: (m) => {
      list(properties(m).syntaxFallbacks).push({ property: 'overflow-x', values: ['overlay'], recipe: null, reason: 'planted' });
      obj(element(m, 'div').defaultStyles)['overflow-x'] = 'overlay';
    },
  },
  {
    id: 'written-function-unsupported',
    rule: 'browser-support',
    description: 'a width subset offers fit-content(10px); BCD css.properties.width.fit-content_function has no browser',
    apply: (m) => {
      property(m, 'width').subsets = [{ id: 'presets', values: ['auto', 'fit-content(10px)'], units: null, reason: 'planted' }];
    },
  },
  {
    id: 'written-untracked-function',
    rule: 'browser-support',
    description: 'a color subset offers device-cmyk(0 0 0 1); BCD tracks no device-cmyk() and no browser implements it',
    apply: (m) => {
      property(m, 'color').subsets = [{ id: 'swatches', values: ['red', 'device-cmyk(0 0 0 1)'], units: null, reason: 'planted' }];
    },
  },
  {
    id: 'offered-unit-unsupported',
    rule: 'browser-support',
    description: 'Safari loses the rcap unit in css-compat.json, and a width subset offers it',
    apply: (m) => {
      const rcap = obj(obj(obj(m.files['generated/css-compat.json']).units).rcap);
      rcap.safari = false;
      obj(rcap.why).safari = 'planted';
      property(m, 'width').subsets = [{ id: 'units', values: null, units: ['px', 'rcap'], reason: 'planted' }];
    },
  },
  {
    id: 'written-form-unsupported',
    rule: 'browser-support',
    description: 'a text-overflow subset offers "clip ellipsis"; the two-value syntax (BCD two_value_syntax) is Firefox only',
    apply: (m) => {
      property(m, 'text-overflow').subsets = [{ id: 'presets', values: ['ellipsis', 'clip ellipsis'], units: null, reason: 'planted' }];
    },
  },
  {
    id: 'recipe-writes-shorthand-of-edited-longhands',
    rule: 'recipe',
    description: 'the line clamp recipe also declares overflow: hidden, a second writer of its own overflow-x and overflow-y',
    apply: (m) => {
      list(recipe(m, 'line-clamp').declarations).push({ property: 'overflow', value: 'hidden' });
      strings(obj(door(m, 'style.set', 'inspector-line-clamp').adapter).writes).push('overflow');
    },
  },
  {
    id: 'shorthand-whose-longhands-browsers-implement',
    rule: 'shorthand-write',
    description: 'inset-block is edited whole although Chrome, Firefox and Safari implement both its longhands',
    apply: (m) => {
      list(properties(m).properties).push(editedProperty(m, 'inset-block', { section: 'position', group: 'position', appliesTo: 'positioned' }));
    },
  },
  {
    id: 'stored-shorthand-and-its-longhand',
    rule: 'shorthand-write',
    description: 'text-align is stored whole, and its longhand text-align-last is edited as well',
    apply: (m) => {
      list(properties(m).properties).push(editedProperty(m, 'text-align-last', { section: 'text', group: 'typography', appliesTo: 'text', control: 'keyword-menu', valueType: 'keyword', codec: 'keyword' }));
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

// The placement rules of DESIGN.md: every door has a region, a state is never chosen on the canvas frame or
// the canvas toolbar, and no label names two CSS properties.
PLANTS.push(
  {
    id: 'door-unplaced',
    rule: 'placement',
    description: 'the top bar Undo button is still unplaced',
    apply: (m) => {
      door(m, 'history.undo', 'toolbar-top-bar').placement = 'unplaced';
    },
  },
  {
    id: 'state-door-on-canvas-toolbar',
    rule: 'state-placement',
    description: 'a Hover state button is drawn on the canvas toolbar (a state belongs to the class, not the page)',
    apply: (m) => {
      list(command(m, 'view.setStyleState').entryPoints).push({
        id: 'toolbar-canvas-toolbar-state-hover',
        kind: 'toolbar',
        feature: 'state-styles',
        toolbar: 'canvas-toolbar',
        labelKey: 'styleState.hover',
        disabledReasonKey: 'common.notAvailableYet',
        placement: { region: 'canvas-toolbar', order: 13 },
        adapter: { selection: 'none', offers: null, writes: [], fields: [] },
        args: { state: 'hover' },
      });
    },
  },
  {
    id: 'inspector-subset-in-all-properties',
    rule: 'all-properties',
    description: 'the inspector Direction field offers only row and column in All properties (All properties offers every value of the catalogue)',
    apply: (m) => {
      property(m, 'flex-direction').subsets = [{ id: 'row-column', values: ['row', 'column'], units: null, reason: 'planted' }];
      obj(door(m, 'style.set', 'inspector-flex-direction').adapter).offers = { property: 'flex-direction', list: 'row-column', essentials: null };
    },
  },
  {
    id: 'label-names-two-properties',
    rule: 'label-term',
    description: 'pt-BR labels gap "Preenchimento", the term of the SVG fill (the mockups used it for padding and fill)',
    apply: (m) => {
      obj(m.catalogues['pt-BR'])['property.gap'] = 'Preenchimento';
    },
  },
);

export function planted(input: ManifestInput, plant: Plant): ManifestInput {
  const copy: MutableInput = {
    files: structuredClone(input.files) as Record<string, unknown>,
    catalogues: structuredClone(input.catalogues) as Record<string, unknown>,
    glossary: structuredClone(input.glossary),
    fileExists: input.fileExists,
    registered: input.registered,
  };
  plant.apply(copy);
  return copy;
}
