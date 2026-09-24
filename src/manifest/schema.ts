// The manifest is the single contract of the product: every command, every door
// (entry point) and every scenario is data in manifest/, validated by these schemas.
// Every object is strict, so an unknown field is an error, and every field is
// required, so a missing field is an error. Types are derived from the schemas.
// Data holds no logic: predicates, actions, codecs and handlers are named by id and
// listed in references.json; no field holds an expression (manifest:check rule no-logic).
import { z } from 'zod';

const featureId = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'a kebab-case feature id');
const commandId = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/, 'a dotted camelCase command id');
const doorId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'a kebab-case door id');
const doorRef = z.string().regex(/^[a-z][a-zA-Z0-9.]*#[a-z0-9-]+$/, 'a door reference "<command>#<door>"');
const i18nKey = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/, 'a dotted i18n key');
const specPath = z.string().regex(/^spec\/behavior\/[a-z0-9-]+\.md$/, 'a path under spec/behavior/');
const camelId = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'a camelCase id');
const kebabId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'a kebab-case id');
const constantId = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/, 'a dotted constant id');
// a CSS property name as the official data writes it (vendor-prefixed names start with "-")
const cssName = z.string().regex(/^-?[a-z]+(-[a-z0-9]+)*$/, 'a CSS property name');
const htmlTag = z.string().regex(/^[a-z][a-z0-9]*$/, 'an HTML tag name');
const ownerPath = z.string().regex(/^src\/[a-z0-9/-]+\.ts$/, 'a planned module path under src/');
// a predicate, codec or action id: code registers it under this id (references.json)
const predicateId = camelId;
const codecId = kebabId;
const actionId = camelId;

export const localeSchema = z.enum(['pt-BR', 'en']);

// JSON values, for document diffs and fixed door arguments.
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const jsonValue: z.ZodType<Json> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValue), z.record(z.string(), jsonValue)]),
);

// ---------------------------------------------------------------- environment

export const environmentSchema = z.strictObject({
  browser: z.strictObject({ channel: z.literal('chrome') }),
  viewports: z
    .array(z.strictObject({ id: kebabId, width: z.number().int().positive(), height: z.number().int().positive() }))
    .min(1),
  locales: z.strictObject({ default: localeSchema, available: z.array(localeSchema).min(1) }),
  zoomLevels: z.array(z.number().int().positive()).min(1),
  reducedMotion: z.boolean(),
});

// ---------------------------------------------------------------- elements (editor data only)
// The content model (permitted children and parents, void and text-only elements) is not here:
// it comes from manifest/generated/html-elements.json, keyed by tag.

export const elementSchema = z.strictObject({
  id: camelId,
  // null only for an element that writes its markup verbatim (content "markup" without its own tag)
  tag: htmlTag.nullable(),
  // "svg": the tag is an SVG element, placed only inside a foreign (svg) element
  namespace: z.enum(['html', 'svg']),
  alternativeTags: z.array(htmlTag),
  labelKey: i18nKey,
  icon: kebabId,
  palette: z.boolean(),
  // how the editor edits what is inside: element children, rich text, verbatim markup, or nothing
  content: z.enum(['children', 'text', 'markup', 'none']),
  naturalChild: camelId.nullable(),
  // longhand property → value
  defaultStyles: z.record(cssName, z.string()),
  defaultTextKey: i18nKey.nullable(),
});

export const attributeSchema = z.strictObject({
  id: camelId,
  html: z.string().regex(/^[a-z][a-z-]*$/).nullable(),
  labelKey: i18nKey,
  valueType: z.enum(['text', 'url', 'number', 'boolean', 'keyword', 'id-ref', 'markup', 'tag', 'class-list', 'path-list']),
  // for a keyword attribute, the values offered: each is in the attribute's generated HTML enum
  keywords: z.array(z.string()),
  elements: z.union([z.literal('all'), z.array(camelId).min(1)]),
  command: commandId,
});

export const paletteEntrySchema = z.strictObject({
  id: kebabId,
  labelKey: i18nKey,
  element: camelId,
  kind: z.enum(['element', 'template']),
  inputType: z.string().nullable(),
  feature: featureId,
});

export const paletteGroupSchema = z.strictObject({
  id: kebabId,
  labelKey: i18nKey,
  entries: z.array(paletteEntrySchema).min(1),
});

export const elementsFileSchema = z.strictObject({
  elements: z.array(elementSchema).min(1),
  attributes: z.array(attributeSchema).min(1),
  palette: z.array(paletteGroupSchema).min(1),
});

// ---------------------------------------------------------------- properties (the editor layer)
// Keywords, units and longhand lists are never written here: they come from
// manifest/generated/css-properties.json, and manifest:check validates every value a door offers
// or writes against the property's official syntax with CSSTree's lexer.

export const VALUE_TYPES = [
  'length',
  'length-percentage',
  'number',
  'integer',
  'percentage',
  'angle',
  'time',
  'color',
  'keyword',
  'image',
  'gradient',
  'shadow-list',
  'transform-list',
  'font-family-list',
  'url',
  'string',
] as const;

export const CONTROL_TYPES = [
  'keyword-menu',
  'keyword-buttons',
  'length-field',
  'number-field',
  'slider',
  'angle-field',
  'time-field',
  'color-field',
  'text-field',
  'font-menu',
  'image-field',
  'gradient-editor',
  'shadow-editor',
  'filter-editor',
  'transform-fields',
  'track-editor',
  'box-model',
  'border-editor',
  'radius-editor',
  'alignment-matrix',
  'anchor-control',
  // a longhand that has no control of its own: it is written only through its composite
  'part-of-composite',
] as const;

// A declared subset of what the generated data allows, with the reason the editor offers less.
// null for values or units means "the generated list" for that part.
const subsetSchema = z.strictObject({
  id: kebabId,
  values: z.array(z.string().min(1)).min(1).nullable(),
  units: z.array(z.string().min(1)).nullable(),
  reason: z.string().min(1),
});

export const propertySchema = z.strictObject({
  // the CSS longhand name; the document stores only longhands
  id: cssName,
  labelKey: i18nKey,
  section: kebabId,
  group: kebabId,
  control: z.enum(CONTROL_TYPES),
  valueType: z.enum(VALUE_TYPES),
  // parses and serialises the value; the document stores the canonical CSS text
  codec: codecId,
  // the element predicate that decides where the property applies
  appliesTo: predicateId,
  essential: z.boolean(),
  // every door that writes this property
  doors: z.array(doorRef),
  subsets: z.array(subsetSchema),
});

// A shorthand exists only as a composite control: its door writes every longhand in one command
// and one undo step. Rendering and export write the shorthand when every longhand is set (CSSOM
// serialisation), so longhands a browser does not implement on their own still render.
export const compositeSchema = z.strictObject({
  id: kebabId,
  // the CSS shorthand this composite stands for; null for an editor composite (the alignment matrix)
  shorthand: cssName.nullable(),
  labelKey: i18nKey,
  section: kebabId,
  group: kebabId,
  control: z.enum(CONTROL_TYPES),
  codec: codecId,
  appliesTo: predicateId,
  longhands: z.array(cssName).min(2),
  // longhands of the shorthand this composite never writes, and why
  omits: z.strictObject({ longhands: z.array(cssName).min(1), reason: z.string().min(1) }).nullable(),
  doors: z.array(doorRef),
  subsets: z.array(subsetSchema),
});

// Closed lists: a coupling rule names one predicate and one action, never an expression.
export const COUPLING_PREDICATES = [
  'always', // no condition
  'valueIn', // the element's current value of `property` is one of `values`
  'valueNotIn', // the element's current value of `property` is none of `values`
  'parentValueIn', // the parent's current value of `property` is one of `values`
] as const;
export const COUPLING_ACTIONS = [
  'setValue', // also write `value` to `property` of the element
  'setParentValue', // also write `value` to `property` of the parent
  'swapWith', // the value meant for the trigger goes to `property`, and the other way round
  'keepVisualPlace', // also write `property` from the element's current rendered place
] as const;

export const couplingSchema = z.strictObject({
  id: kebabId,
  // the write that triggers the rule: a longhand, optionally only some values, optionally only from one composite
  trigger: z.strictObject({ property: cssName, values: z.array(z.string().min(1)).min(1).nullable(), via: kebabId.nullable() }),
  condition: z.strictObject({ predicate: predicateId, property: cssName.nullable(), values: z.array(z.string().min(1)) }),
  effect: z.strictObject({ action: actionId, property: cssName, value: z.string().min(1).nullable() }),
  // the feature that brings the rule
  feature: featureId,
});

export const propertiesFileSchema = z.strictObject({
  sections: z
    .array(
      z.strictObject({
        id: kebabId,
        labelKey: i18nKey,
        groups: z.array(z.strictObject({ id: kebabId, labelKey: i18nKey })).min(1),
      }),
    )
    .min(1),
  breakpoints: z
    .array(z.strictObject({ id: kebabId, labelKey: i18nKey, width: z.number().int().positive() }))
    .min(1),
  states: z.array(z.strictObject({ id: kebabId, labelKey: i18nKey, pseudo: z.string().nullable() })).min(1),
  properties: z.array(propertySchema).min(1),
  composites: z.array(compositeSchema),
  // a coupling's effect runs inside the triggering command: same transaction, same undo step
  couplings: z.array(couplingSchema),
});

// ---------------------------------------------------------------- interactions

export const modifierKeySchema = z.enum(['Shift', 'Alt', 'Ctrl', 'Meta', 'Space']);

export const interactionsFileSchema = z.strictObject({
  keyContexts: z
    .array(z.strictObject({ id: kebabId, labelKey: i18nKey, inherits: kebabId.nullable() }))
    .min(1),
  constants: z
    .array(
      z.strictObject({
        id: constantId,
        value: z.union([z.number(), z.array(z.number()).min(1)]),
        unit: z.enum(['screen-px', 'css-px', 'ms', 'fraction', 'percent', 'deg', 'count', 'factor', 'zoom-percent']),
        source: specPath,
        note: z.string().min(1),
      }),
    )
    .min(1),
  gestures: z
    .array(
      z.strictObject({
        id: kebabId,
        source: specPath,
        modifiers: z.array(z.strictObject({ key: modifierKeySchema, meaning: kebabId })),
      }),
    )
    .min(1),
});

// ---------------------------------------------------------------- commands and doors

export const selectionNormalisationSchema = z.enum([
  'none', // the command does not act on the selection
  'primary', // the primary selected element
  'single', // exactly one selected element, refused otherwise
  'roots', // every selected root, in document order
  'roots-same-parent', // selected roots that share one parent, refused otherwise
  'all', // every selected element
  'target', // the element or item the door itself points at (row, option, pointer target)
  'focused-row', // the Layers row that has keyboard focus
]);

const offersSchema = z.strictObject({
  // the property or composite whose values the door offers
  property: z.union([cssName, kebabId]),
  // "generated": the keyword and unit lists of manifest/generated; otherwise the id of a subset
  // declared on that property or composite
  list: kebabId,
});

const adapterSchema = z.strictObject({
  selection: selectionNormalisationSchema,
  offers: offersSchema.nullable(),
  // the longhands this door's hit area or control writes (never a shorthand)
  writes: z.array(cssName),
});

const placementSchema = z.union([
  z.literal('none'), // a key or a canvas gesture has no control of its own
  z.literal('unplaced'), // placed by DESIGN.md
  z.strictObject({ region: z.string().min(1), order: z.number().int().positive() }),
]);

const doorCommon = {
  id: doorId,
  feature: featureId,
  labelKey: i18nKey,
  disabledReasonKey: i18nKey,
  placement: placementSchema,
  adapter: adapterSchema,
  args: z.record(camelId, jsonValue),
};

export const menuIdSchema = z.enum([
  'file',
  'edit',
  'arrange',
  'view',
  'help',
  'theme',
  'language',
  'element-actions',
  'zoom',
  'snap',
  'style-state',
  'layers-row-details',
]);

export const doorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...doorCommon, kind: z.literal('shortcut'), chord: z.string().min(1), context: kebabId, gesture: kebabId.nullable() }),
  z.strictObject({ ...doorCommon, kind: z.literal('menu'), menu: menuIdSchema }),
  z.strictObject({ ...doorCommon, kind: z.literal('context-menu') }),
  z.strictObject({ ...doorCommon, kind: z.literal('toolbar'), toolbar: kebabId }),
  z.strictObject({ ...doorCommon, kind: z.literal('quick-panel'), control: kebabId }),
  z.strictObject({
    ...doorCommon,
    kind: z.literal('command-bar'),
    entry: z.enum(['command', 'insert', 'open-panel', 'set-property', 'edit-property']),
  }),
  z.strictObject({
    ...doorCommon,
    kind: z.literal('inspector-field'),
    // exactly one of property (a longhand), composite and attribute
    property: cssName.nullable(),
    composite: kebabId.nullable(),
    attribute: camelId.nullable(),
    control: kebabId,
  }),
  z.strictObject({ ...doorCommon, kind: z.literal('canvas-drag'), source: kebabId, zone: kebabId, gesture: kebabId }),
  z.strictObject({
    ...doorCommon,
    kind: z.literal('canvas-click'),
    target: kebabId,
    button: z.enum(['primary', 'secondary']),
    count: z.union([z.literal(1), z.literal(2)]),
    modifier: modifierKeySchema.nullable(),
    gesture: kebabId,
  }),
  z.strictObject({ ...doorCommon, kind: z.literal('canvas-wheel'), modifier: modifierKeySchema.nullable(), gesture: kebabId }),
  z.strictObject({ ...doorCommon, kind: z.literal('layers-drag'), source: kebabId, zone: kebabId, gesture: kebabId }),
  z.strictObject({ ...doorCommon, kind: z.literal('canvas-handle'), handle: kebabId, gesture: kebabId }),
  z.strictObject({
    ...doorCommon,
    kind: z.literal('panel-control'),
    panel: kebabId,
    control: kebabId,
    modifier: modifierKeySchema.nullable(),
    gesture: kebabId.nullable(),
  }),
  z.strictObject({ ...doorCommon, kind: z.literal('panel-drag'), source: kebabId, zone: kebabId, gesture: kebabId }),
]);

// Door kinds that are pointer gestures: a command with one of them records one transaction per gesture.
export const GESTURE_DOOR_KINDS = ['canvas-drag', 'canvas-handle', 'layers-drag', 'panel-drag'] as const;

const argSchema = z.strictObject({
  type: z.enum([
    'node',
    'nodes',
    'string',
    'number',
    'integer',
    'boolean',
    'enum',
    'json',
    'color',
    'path',
    'palette-entry',
    // a longhand of properties.json, or a composite id
    'property',
    'attribute',
    'breakpoint',
    'state',
    'point',
    'rect',
    'file',
  ]),
  values: z.array(z.string()),
  optional: z.boolean(),
});

// How a command meets the history. Undo always restores the selection from before the command,
// and a command that changes nothing creates no entry.
export const historySchema = z.discriminatedUnion('undoable', [
  z.strictObject({ undoable: z.literal(false) }),
  z.strictObject({
    undoable: z.literal(true),
    // "none", or merge with the previous entry when it has the same target and the same property
    // and came less than the named interval (a constant of interactions.json, in ms) before
    coalesce: z.union([
      z.literal('none'),
      z.strictObject({ same: z.literal('target-and-property'), within: constantId }),
    ]),
    undoRestoresSelection: z.literal('before-command'),
    // "per-gesture": everything one pointer gesture dispatches is one transaction and one entry
    transaction: z.enum(['per-dispatch', 'per-gesture']),
    noChange: z.literal('no-entry'),
  }),
]);

export const commandSchema = z
  .strictObject({
    id: commandId,
    labelKey: i18nKey,
    owner: ownerPath,
    introducedBy: featureId,
    args: z.record(camelId, argSchema),
    availability: z.strictObject({ predicate: predicateId, refusalKey: i18nKey.nullable() }),
    refusals: z.array(i18nKey),
    confirmation: z.strictObject({ messageKey: i18nKey, confirmKey: i18nKey, cancelKey: i18nKey }).nullable(),
    history: historySchema,
    entryPoints: z.array(doorSchema),
  })
  .superRefine((command, ctx) => {
    const always = command.availability.predicate === 'always';
    if (always !== (command.availability.refusalKey === null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['availability', 'refusalKey'],
        message: always
          ? 'must be null when the predicate is "always"'
          : 'is missing: a command that can be unavailable names its refusal key',
      });
    }
  });

export const commandsFileSchema = z.strictObject({
  domain: kebabId,
  commands: z.array(commandSchema).min(1),
});

// ---------------------------------------------------------------- scenarios and features

const nodeRef = z.string().regex(/^\/.*/, 'a node path from the fixture root, such as "/Page/Section/Heading"');

export const scenarioSchema = z.strictObject({
  id: kebabId,
  setup: z.strictObject({
    fixture: kebabId,
    selection: z.array(nodeRef),
    context: kebabId,
    breakpoint: kebabId,
    state: kebabId,
    locale: localeSchema,
    viewport: kebabId,
    zoom: z.number().int().positive(),
  }),
  doors: z.array(doorRef).min(1),
  expect: z.strictObject({
    document: z.array(
      z.discriminatedUnion('op', [
        z.strictObject({ op: z.literal('set'), path: z.string().regex(/^\//), value: jsonValue }),
        z.strictObject({ op: z.literal('remove'), path: z.string().regex(/^\//) }),
      ]),
    ),
    selection: z.array(nodeRef),
    history: z.strictObject({
      undoSteps: z.number().int().nonnegative(),
      undoRestores: z.literal(true),
      redoRestores: z.literal(true),
    }),
    // End terminals. Every assertion names the value it expects: there is no "exists" or "is visible".
    render: z
      .strictObject({
        computed: z.array(z.strictObject({ node: nodeRef, property: cssName, value: z.string().min(1) })),
        geometry: z.array(
          z.strictObject({
            node: nodeRef,
            measure: z.enum(['x', 'y', 'width', 'height']),
            relation: z.enum(['equals', 'less-than', 'greater-than']),
            value: z.number(),
            reference: nodeRef.nullable(),
          }),
        ),
        feedback: z.array(z.strictObject({ key: i18nKey, params: z.record(z.string(), z.union([z.string(), z.number()])) })),
      })
      .nullable(),
    persistence: z.strictObject({ reload: z.literal('immediate'), document: z.literal('same') }).nullable(),
    export: z
      .strictObject({
        files: z
          .array(z.strictObject({ path: z.string().min(1), present: z.array(z.string()), absent: z.array(z.string()) }))
          .min(1),
      })
      .nullable(),
  }),
  refusals: z.array(z.strictObject({ key: i18nKey, document: z.literal('unchanged') })),
});

export const featureSchema = z.strictObject({
  id: featureId,
  titleKey: i18nKey,
  commands: z.array(commandId),
  dependsOn: z.array(featureId),
  spec: specPath.nullable(),
  // Guidance for scenario authors only. No test reads it.
  intent: z.strictObject({
    title: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
    expected: z.array(z.string().min(1)).min(1),
  }),
  scenarios: z.array(scenarioSchema),
});

export const featuresFileSchema = z.strictObject({
  group: kebabId,
  titleKey: i18nKey,
  features: z.array(featureSchema).min(1),
});

// ---------------------------------------------------------------- references and consumers

export const REFERENCE_KINDS = ['handler', 'predicate', 'action', 'codec'] as const;

// Every id the manifest names for code to provide. "planned" until code registers it; a
// "registered" entry must be found registered in src/ (registerHandler/Predicate/Action/Codec).
export const referencesFileSchema = z.strictObject({
  references: z.array(
    z.strictObject({
      kind: z.enum(REFERENCE_KINDS),
      id: z.string().min(1),
      status: z.enum(['planned', 'registered']),
    }),
  ),
});

// Every schema field and the module that reads it. A field nobody reads is dead data.
export const consumersFileSchema = z.strictObject({
  consumers: z.array(
    z.strictObject({
      // "<file>:<path>", arrays as "[]" and record values as "{}", e.g. "commands:commands[].history.coalesce"
      field: z.string().regex(/^[a-z/-]+:[a-zA-Z$]+([.[\]{}a-zA-Z$]*)$/, 'a field path "<file>:<path>"'),
      // a planned module path, or CLAUDE.md for guidance that only authors read
      reader: z.string().regex(/^((src|tools)\/[a-z0-9/._-]+\.tsx?|CLAUDE\.md)$/, 'a module path under src/ or tools/, or CLAUDE.md'),
    }),
  ),
});

// ---------------------------------------------------------------- generated files

const generatedHeader = z.strictObject({
  notice: z.string().min(1),
  by: z.string().min(1),
  from: z.record(z.string(), z.string()),
});

export const generatedCssSchema = z.strictObject({
  $generated: generatedHeader,
  cssWideKeywords: z.array(z.string()),
  units: z.record(z.string(), z.array(z.string())),
  properties: z.record(
    cssName,
    z.strictObject({
      syntax: z.string().nullable(),
      initial: z.string().nullable(),
      inherited: z.boolean().nullable(),
      // expanded longhands: empty for a longhand
      longhands: z.array(cssName),
      legacyAliasOf: cssName.nullable(),
      // single keywords the official syntax accepts on their own (CSS-wide keywords left out)
      keywords: z.array(z.string()),
      // units the official syntax accepts on a number on its own
      units: z.array(z.string()),
      numeric: z.enum(['number', 'integer']).nullable(),
    }),
  ),
  types: z.record(z.string(), z.string()),
});

const htmlFlag = z.union([z.boolean(), z.literal('conditional')]);

export const generatedHtmlSchema = z.strictObject({
  $generated: generatedHeader,
  elements: z.record(
    z.string(),
    z.strictObject({
      deprecated: z.boolean(),
      void: z.boolean(),
      foreign: z.boolean(),
      textOnly: z.boolean(),
      categories: z.strictObject({
        metadata: htmlFlag,
        flow: htmlFlag,
        sectioning: htmlFlag,
        heading: htmlFlag,
        phrasing: htmlFlag,
        embedded: htmlFlag,
        interactive: htmlFlag,
        labelable: htmlFlag,
        form: htmlFlag,
        scriptSupporting: htmlFlag,
      }),
      transparent: z.union([z.boolean(), z.literal('conditional'), z.array(z.string())]),
      permittedContent: z.array(z.string()).nullable(),
      permittedDescendants: z.array(z.strictObject({ exclude: z.array(z.string()) })).nullable(),
      permittedOrder: z.array(z.string()).nullable(),
      permittedParent: z.array(z.string()).nullable(),
      requiredAncestors: z.array(z.string()).nullable(),
      requiredContent: z.array(z.string()).nullable(),
      attributes: z.record(
        z.string(),
        z.strictObject({ boolean: z.boolean(), deprecated: z.boolean(), enum: z.array(z.string()).nullable() }),
      ),
    }),
  ),
});

// Each manifest file and its schema, keyed as consumers.json names them.
export const FILE_SCHEMAS = {
  environment: environmentSchema,
  elements: elementsFileSchema,
  properties: propertiesFileSchema,
  interactions: interactionsFileSchema,
  commands: commandsFileSchema,
  features: featuresFileSchema,
  references: referencesFileSchema,
  consumers: consumersFileSchema,
  'generated/css-properties': generatedCssSchema,
  'generated/html-elements': generatedHtmlSchema,
} as const;

export type Environment = z.infer<typeof environmentSchema>;
export type ElementType = z.infer<typeof elementSchema>;
export type Attribute = z.infer<typeof attributeSchema>;
export type PaletteGroup = z.infer<typeof paletteGroupSchema>;
export type ElementsFile = z.infer<typeof elementsFileSchema>;
export type Property = z.infer<typeof propertySchema>;
export type Composite = z.infer<typeof compositeSchema>;
export type Coupling = z.infer<typeof couplingSchema>;
export type Subset = z.infer<typeof subsetSchema>;
export type PropertiesFile = z.infer<typeof propertiesFileSchema>;
export type InteractionsFile = z.infer<typeof interactionsFileSchema>;
export type Door = z.infer<typeof doorSchema>;
export type DoorKind = Door['kind'];
export type History = z.infer<typeof historySchema>;
export type Command = z.infer<typeof commandSchema>;
export type CommandsFile = z.infer<typeof commandsFileSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type FeaturesFile = z.infer<typeof featuresFileSchema>;
export type ReferencesFile = z.infer<typeof referencesFileSchema>;
export type ConsumersFile = z.infer<typeof consumersFileSchema>;
export type GeneratedCss = z.infer<typeof generatedCssSchema>;
export type GeneratedHtml = z.infer<typeof generatedHtmlSchema>;
export type Locale = z.infer<typeof localeSchema>;
