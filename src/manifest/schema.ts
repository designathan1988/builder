// The manifest is the single contract of the product: every command, every door
// (entry point) and every scenario is data in manifest/, validated by these schemas.
// Every object is strict, so an unknown field is an error, and every field is
// required, so a missing field is an error. Types are derived from the schemas.
import { z } from 'zod';

const featureId = z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'a kebab-case feature id');
const commandId = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/, 'a dotted camelCase command id');
const doorId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'a kebab-case door id');
const doorRef = z.string().regex(/^[a-z][a-zA-Z0-9.]*#[a-z0-9-]+$/, 'a door reference "<command>#<door>"');
const i18nKey = z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/, 'a dotted i18n key');
const specPath = z.string().regex(/^spec\/behavior\/[a-z0-9-]+\.md$/, 'a path under spec/behavior/');
const camelId = z.string().regex(/^[a-z][a-zA-Z0-9]*$/, 'a camelCase id');
const kebabId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'a kebab-case id');
const cssName = z.string().regex(/^-?[a-z]+(-[a-z]+)*$/, 'a CSS property name');
const htmlTag = z.string().regex(/^[a-z][a-z0-9]*$/, 'an HTML tag name');
const ownerPath = z.string().regex(/^src\/[a-z0-9/-]+\.ts$/, 'a planned module path under src/');

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

// ---------------------------------------------------------------- elements

const allowedChildren = z.union([z.literal('flow'), z.literal('none'), z.array(camelId)]);

export const elementSchema = z.strictObject({
  id: camelId,
  // null only for an element that writes its markup verbatim (content "markup" without its own tag)
  tag: htmlTag.nullable(),
  alternativeTags: z.array(htmlTag),
  labelKey: i18nKey,
  palette: z.boolean(),
  content: z.enum(['children', 'text', 'void', 'empty', 'raw-text', 'markup']),
  allowedChildren,
  requiredParent: z.array(camelId),
  uniqueChildren: z.array(camelId),
  requiredChildren: z.array(camelId),
  firstChild: camelId.nullable(),
  naturalChild: camelId.nullable(),
  interactive: z.boolean(),
  excludesInteractive: z.boolean(),
  forbiddenAncestors: z.array(camelId),
  control: z.boolean(),
  maxControls: z.number().int().positive().nullable(),
  defaultStyles: z.record(camelId, z.string()),
  defaultTextKey: i18nKey.nullable(),
});

export const attributeSchema = z.strictObject({
  id: camelId,
  html: z.string().regex(/^[a-z][a-z-]*$/).nullable(),
  labelKey: i18nKey,
  valueType: z.enum(['text', 'url', 'number', 'boolean', 'keyword', 'id-ref', 'markup', 'tag', 'class-list', 'path-list']),
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

// ---------------------------------------------------------------- properties

export const unitSchema = z.enum(['px', '%', 'em', 'rem', 'vw', 'vh', 'svh', 'dvh', 'ch', 'deg', 'fr', 's', 'ms']);

export const propertySchema = z.strictObject({
  id: camelId,
  css: cssName,
  labelKey: i18nKey,
  valueType: z.enum([
    'keyword',
    'length',
    'number',
    'integer',
    'color',
    'text',
    'image',
    'shadow-list',
    'transform',
    'filter',
    'track-list',
    'font-family',
    'ratio',
  ]),
  keywords: z.array(z.string()),
  units: z.array(unitSchema),
  // true when free CSS text beyond the keywords and units is accepted
  open: z.boolean(),
  section: kebabId,
  group: kebabId,
  appliesTo: kebabId,
  essential: z.boolean(),
  command: commandId,
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
        id: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/),
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
  property: camelId,
  keywords: z.union([z.literal('all'), z.array(z.string())]),
  units: z.union([z.literal('all'), z.array(z.string())]),
  // required when the door offers fewer keywords or units than the property's catalogue list
  reason: z.string().min(1).nullable(),
});

const adapterSchema = z.strictObject({
  selection: selectionNormalisationSchema,
  offers: offersSchema.nullable(),
  // the properties this door's hit area or control writes
  writes: z.array(camelId),
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
    property: camelId.nullable(),
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

export const commandSchema = z
  .strictObject({
    id: commandId,
    labelKey: i18nKey,
    owner: ownerPath,
    introducedBy: featureId,
    args: z.record(camelId, argSchema),
    availability: z.strictObject({ predicate: camelId, refusalKey: i18nKey.nullable() }),
    refusals: z.array(i18nKey),
    confirmation: z.strictObject({ messageKey: i18nKey, confirmKey: i18nKey, cancelKey: i18nKey }).nullable(),
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

export type Environment = z.infer<typeof environmentSchema>;
export type ElementType = z.infer<typeof elementSchema>;
export type Attribute = z.infer<typeof attributeSchema>;
export type PaletteGroup = z.infer<typeof paletteGroupSchema>;
export type ElementsFile = z.infer<typeof elementsFileSchema>;
export type Property = z.infer<typeof propertySchema>;
export type PropertiesFile = z.infer<typeof propertiesFileSchema>;
export type InteractionsFile = z.infer<typeof interactionsFileSchema>;
export type Door = z.infer<typeof doorSchema>;
export type DoorKind = Door['kind'];
export type Command = z.infer<typeof commandSchema>;
export type CommandsFile = z.infer<typeof commandsFileSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type FeaturesFile = z.infer<typeof featuresFileSchema>;
export type Locale = z.infer<typeof localeSchema>;
