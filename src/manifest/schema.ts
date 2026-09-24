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
// What browsers implement comes from manifest/generated/css-compat.json (MDN's browser-compat-data):
// a property or keyword is edited only when Chrome, Firefox and Safari all support it. The document
// stores the finest-grained property browsers implement: the longhands when every engine implements
// all of them (a composite writes them). When an engine lacks a longhand, the manifest declares the
// choice: a composite that omits the missing longhands (omits, with the reason), or the shorthand
// stored whole (storedWhole, with the reason: box-shadow, text-align, vertical-align).

// The browsers an exported site must work in.
export const BROWSERS = ['chrome', 'firefox', 'safari'] as const;
export type Browser = (typeof BROWSERS)[number];

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
  'text-shadow-list',
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
  // the CSS property name: a longhand, or the coarser property browsers implement when an engine
  // lacks one of its longhands (css-compat.json)
  id: cssName,
  labelKey: i18nKey,
  section: kebabId,
  group: kebabId,
  control: z.enum(CONTROL_TYPES),
  valueType: z.enum(VALUE_TYPES),
  // parses and serialises the value; the document stores the canonical CSS text, or the typed
  // fields of a structured value type, which only the codec turns into CSS
  codec: codecId,
  // the element predicate that decides where the property applies
  appliesTo: predicateId,
  essential: z.boolean(),
  // every door that writes this property
  doors: z.array(doorRef),
  subsets: z.array(subsetSchema),
});

// A shorthand whose longhands every browser implements exists only as a composite control: its door
// writes every longhand in one command and one undo step, and rendering and export write the stored
// longhands as they are. A longhand an engine lacks is left out (omits, with the reason).
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

// A structured value type: the document stores typed fields, never CSS text, and the codec is the only
// code that turns them into CSS. Handles and fields edit one typed field (a door's adapter.fields).
// These value types of VALUE_TYPES are structured; each needs its structure declared in properties.json.
export const STRUCTURED_VALUE_TYPES: readonly (typeof VALUE_TYPES)[number][] = ['shadow-list', 'text-shadow-list'];
export const STRUCTURE_FIELD_TYPES = ['length', 'color', 'boolean'] as const;
export const structureSchema = z.strictObject({
  // a structured value type of VALUE_TYPES
  id: z.enum(VALUE_TYPES),
  codec: codecId,
  // true: the value is a list of layers (first painted on top), written comma-separated; none is the empty list
  list: z.boolean(),
  fields: z
    .array(
      z.strictObject({
        id: camelId,
        type: z.enum(STRUCTURE_FIELD_TYPES),
        // how the field reaches CSS: "value" writes it, "keyword" writes `keyword` when true, and
        // "hides-layer" keeps the layer in the document JSON but out of the CSS when true
        css: z.enum(['value', 'keyword', 'hides-layer']),
        keyword: z.string().min(1).nullable(),
        // for a length field, the unit list of manifest/generated/css-properties.json (units) it offers; null otherwise
        units: z.string().min(1).nullable(),
        // the field's value in the sample layer manifest:check serialises and matches against the syntax
        sample: z.union([z.string().min(1), z.boolean()]),
      }),
    )
    .min(1),
});

// A compatibility recipe: the declarations browsers need for one effect that no standard property
// provides in every engine (legacy line clamp; user-select, which Safari supports only prefixed).
// One door writes all of them in one command and one undo step, and clearing it removes all of them.
// Recipes are the only place where vendor-prefixed properties or values appear; their fixed values
// are matched against the syntax browsers implement (CSSTree's MDN data), because they exist for
// legacy values the official grammar does not define.
export const recipeSchema = z.strictObject({
  id: kebabId,
  labelKey: i18nKey,
  section: kebabId,
  group: kebabId,
  control: z.enum(CONTROL_TYPES),
  codec: codecId,
  appliesTo: predicateId,
  // value null: the value the door edits
  declarations: z.array(z.strictObject({ property: cssName, value: z.string().min(1).nullable() })).min(2),
  // How the recipe shares the edited properties it also writes (the line clamp writes display, overflow-x
  // and overflow-y); null when it writes none. Applying the recipe keeps their previous values with it and
  // clearing it restores them; a door that writes one of them while the recipe is set clears the recipe
  // in the same command and undo step; their fields show the recipe while it is set.
  shared: z
    .strictObject({ clear: z.literal('restores-previous'), otherWrite: z.literal('clears-recipe'), fields: z.literal('show-recipe') })
    .nullable(),
  // the spec section that defines the legacy behaviour, and the BCD entry that records the browsers' support
  // of the declaration that carries the door's value
  source: z.strictObject({
    spec: z.string().regex(/^https:\/\/\S+#\S+$/, 'a spec URL with its section anchor'),
    bcd: z.string().regex(/^css\.properties\.[a-z-]+$/, 'a BCD entry such as css.properties.line-clamp'),
  }),
  doors: z.array(doorRef),
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
  // in cascade order: the first is the base breakpoint (base: true, the only one), the others inherit
  // from the one before them (desktop-first: Desktop, Laptop, Tablet, Phone)
  breakpoints: z
    .array(z.strictObject({ id: kebabId, labelKey: i18nKey, width: z.number().int().positive(), base: z.boolean() }))
    .min(1),
  states: z.array(z.strictObject({ id: kebabId, labelKey: i18nKey, pseudo: z.string().nullable() })).min(1),
  structures: z.array(structureSchema),
  properties: z.array(propertySchema).min(1),
  composites: z.array(compositeSchema),
  recipes: z.array(recipeSchema),
  // a coupling's effect runs inside the triggering command: same transaction, same undo step
  couplings: z.array(couplingSchema),
  // Shorthands stored whole: an engine lacks one of their longhands, and the reason says why the
  // manifest stores the shorthand instead of a composite that omits the missing longhands.
  storedWhole: z.array(z.strictObject({ property: cssName, reason: z.string().min(1) })),
  // The lexer fallback allowlist: the only values accepted by the syntax browsers implement (CSSTree's
  // MDN data) where the official syntax rejects them or lacks a definition, each with its reason.
  // values null: every value of the property. recipe: the entry holds only for that recipe's
  // declarations, and it also vouches for its values where BCD does not track them.
  syntaxFallbacks: z.array(
    z.strictObject({
      property: cssName,
      values: z.array(z.string().min(1)).min(1).nullable(),
      recipe: kebabId.nullable(),
      reason: z.string().min(1),
    }),
  ),
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
  // the property, composite or recipe whose values the door offers
  property: z.union([cssName, kebabId]),
  // "generated": the keywords of manifest/generated/css-properties.json that css-compat.json says
  // Chrome, Firefox and Safari all support, and the units; otherwise the id of a subset declared on
  // that property or composite
  list: kebabId,
});

const adapterSchema = z.strictObject({
  selection: selectionNormalisationSchema,
  offers: offersSchema.nullable(),
  // the properties this door's hit area or control writes (never a shorthand whose longhands every
  // browser implements); a recipe door writes the recipe's declarations
  writes: z.array(cssName),
  // the typed fields of a structured value this door edits (a shadow layer's offsetX, blur...);
  // empty for a door that edits a plain value or adds, removes or resets whole layers
  fields: z.array(camelId),
});

// A region of the interface DESIGN.md names (layout.json lists them); a menu's own region is "menu:<menu>".
const regionId = z.string().regex(/^[a-z]+(-[a-z]+)*(:[a-z]+(-[a-z]+)*)?$/, 'a region id such as "canvas-toolbar" or "menu:view"');

const placementSchema = z.union([
  z.literal('none'), // a key or a canvas gesture has no control of its own
  z.literal('unplaced'), // not placed yet: manifest:check rule placement refuses it
  // the region of DESIGN.md that draws the control, and its position there (1 first)
  z.strictObject({ region: regionId, order: z.number().int().positive() }),
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
    // exactly one of property, composite, recipe and attribute
    property: cssName.nullable(),
    composite: kebabId.nullable(),
    recipe: kebabId.nullable(),
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
    // a property of properties.json, a composite id or a recipe id
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

// ---------------------------------------------------------------- layout (the regions of DESIGN.md)
// Every region DESIGN.md draws, and the control that opens each menu. A door's placement names one of
// these regions. The area says where the region sits: a fixed part of the window, an overlay that
// opens over it, or "component", the parts of a control repeated wherever it is drawn (every field,
// every Layers row, every tab strip).

export const REGION_AREAS = ['top-bar', 'left', 'centre', 'right', 'dock', 'status-bar', 'overlay', 'component'] as const;
// The regions a state control never occupies: a state belongs to the element's class selector, never
// to the page, so it is chosen only in the inspector's selector bar (manifest:check rule state-placement).
export const PAGE_REGIONS = ['canvas-frame', 'canvas-toolbar'] as const;

export const layoutFileSchema = z.strictObject({
  regions: z.array(z.strictObject({ id: regionId, area: z.enum(REGION_AREAS) })).min(1),
  // the button that opens each menu (its items are the menu's doors): its label, where it is drawn, and its order there
  menus: z.array(
    z.strictObject({
      id: menuIdSchema,
      labelKey: i18nKey,
      anchors: z.array(z.strictObject({ region: regionId, order: z.number().int().positive() })).min(1),
    }),
  ),
});

// ---------------------------------------------------------------- checks (the Checks tab of the dock)
// The categories the Checks tab groups its issues by, each arriving with the feature that produces its checks.
export const checksFileSchema = z.strictObject({
  categories: z.array(z.strictObject({ id: kebabId, labelKey: i18nKey, feature: featureId })).min(1),
});

// ---------------------------------------------------------------- glossary (src/i18n/glossary.json)
// One term per concept in each language. Each concept names the CSS property whose label is its term;
// manifest:check rule label-term proves every label of that property is the term, and that no label, in
// either language, names two different CSS properties.
export const glossarySchema = z.strictObject({
  concepts: z
    .array(
      z.strictObject({
        id: kebabId,
        property: cssName,
        terms: z.strictObject({ en: z.string().min(1), 'pt-BR': z.string().min(1) }),
        note: z.string().min(1),
      }),
    )
    .min(1),
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
  // functions webref defines only in scoped versions (rect() of <basic-shape> and of clip) → the scope
  // roots; each version is written inline into the syntaxes its scope reaches
  scopedFunctions: z.record(z.string(), z.array(z.string())),
});

// A browser's support: the version that added it, or false (why says what is missing).
const supportVersion = z.union([z.string().regex(/^≤?\d+(\.\d+)*$/, 'a release number'), z.literal(false)]);
const supportFields = {
  chrome: supportVersion,
  firefox: supportVersion,
  safari: supportVersion,
  why: z.partialRecord(z.enum(BROWSERS), z.string().min(1)),
};

// The value shape a syntax form BCD tracks stands for: at least N space-separated components in a layer,
// at least two keywords, at least two comma-separated layers, or a negative number.
export const FORM_SHAPES_LIST = ['components-2', 'components-3', 'components-4', 'keywords-2', 'layers-2', 'negative'] as const;
export type FormShape = (typeof FORM_SHAPES_LIST)[number];

const entrySupport = z.strictObject({ bcd: z.string().nullable(), ...supportFields });

export const generatedCompatSchema = z.strictObject({
  $generated: generatedHeader,
  // the current stable release of each browser according to BCD
  browsers: z.strictObject({ chrome: z.string().min(1), firefox: z.string().min(1), safari: z.string().min(1) }),
  // the general-purpose functions CSS Values defines (calc(), min(), clamp()...), usable wherever their
  // result type is accepted, so no property's syntax names them: lower-case name, without "()" → support
  valueFunctions: z.record(z.string(), entrySupport),
  // every unit of css-properties.json's unit lists, lower-case ("%" for percentages) → its support
  units: z.record(z.string(), entrySupport),
  properties: z.record(
    cssName,
    z.strictObject({
      // the BCD entry that decided, null when BCD has none
      bcd: z.string().nullable(),
      // how the name maps to that entry when it is not the entry's own name (a prefix, an alternative name)
      via: z.string().nullable(),
      ...supportFields,
      // lower-case keyword → its support outside functions, and inside each function it appears in
      keywords: z.record(z.string(), z.strictObject({ bcd: z.string().nullable(), ...supportFields, inFunctions: z.record(z.string(), entrySupport) })),
      // lower-case function name, without "()" → its support
      functions: z.record(z.string(), entrySupport),
      // BCD subfeature key of a syntax form (two_value_syntax, multiple_shadows) → the value shape and its support
      forms: z.record(z.string(), z.strictObject({ shape: z.enum(FORM_SHAPES_LIST), bcd: z.string().nullable(), ...supportFields })),
    }),
  ),
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
  layout: layoutFileSchema,
  checks: checksFileSchema,
  features: featuresFileSchema,
  references: referencesFileSchema,
  consumers: consumersFileSchema,
  'generated/css-properties': generatedCssSchema,
  'generated/css-compat': generatedCompatSchema,
  'generated/html-elements': generatedHtmlSchema,
} as const;

export type Environment = z.infer<typeof environmentSchema>;
export type ElementType = z.infer<typeof elementSchema>;
export type Attribute = z.infer<typeof attributeSchema>;
export type PaletteGroup = z.infer<typeof paletteGroupSchema>;
export type ElementsFile = z.infer<typeof elementsFileSchema>;
export type Property = z.infer<typeof propertySchema>;
export type Composite = z.infer<typeof compositeSchema>;
export type Structure = z.infer<typeof structureSchema>;
export type Recipe = z.infer<typeof recipeSchema>;
export type SyntaxFallback = PropertiesFile['syntaxFallbacks'][number];
export type Coupling = z.infer<typeof couplingSchema>;
export type Subset = z.infer<typeof subsetSchema>;
export type PropertiesFile = z.infer<typeof propertiesFileSchema>;
export type InteractionsFile = z.infer<typeof interactionsFileSchema>;
export type Door = z.infer<typeof doorSchema>;
export type DoorKind = Door['kind'];
export type History = z.infer<typeof historySchema>;
export type Command = z.infer<typeof commandSchema>;
export type CommandsFile = z.infer<typeof commandsFileSchema>;
export type LayoutFile = z.infer<typeof layoutFileSchema>;
export type ChecksFile = z.infer<typeof checksFileSchema>;
export type Glossary = z.infer<typeof glossarySchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type Feature = z.infer<typeof featureSchema>;
export type FeaturesFile = z.infer<typeof featuresFileSchema>;
export type ReferencesFile = z.infer<typeof referencesFileSchema>;
export type ConsumersFile = z.infer<typeof consumersFileSchema>;
export type GeneratedCss = z.infer<typeof generatedCssSchema>;
export type GeneratedCompat = z.infer<typeof generatedCompatSchema>;
export type GeneratedHtml = z.infer<typeof generatedHtmlSchema>;
export type Locale = z.infer<typeof localeSchema>;
