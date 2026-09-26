// The inspector (DESIGN.md "Inspector"; spec inspector-panel): its header (the tabs, Page properties, the Element
// actions menu) and the body of the tab it shows (workspace.setActiveTab). A tab whose body the inspector does not draw
// yet (Interactions, until events-actions) is not available yet (DESIGN.md "Build order").
//  - Style: the selector bar, then the Style tab's region, as tall as what it shows (the inspector column scrolls it):
//    with nothing selected, the hints first (and the fields stay empty); then the value-origin legend, Essentials only
//    / All properties, the property search and the sections, always all eight and in order (properties.json), each
//    with the fields the manifest
//    places in inspector-style in their order. A section's header collapses and expands it (inspector.toggleSection);
//    a collapsed one shows no field and summarises the values the page computes (sections.ts). A field offers every
//    value of the catalogue in All properties (the generated list and the presets, DESIGN.md) and draws a
//    keyword-buttons control with the keyword icons of properties.json; the commands behind them arrive with their
//    features, so each shows "not available yet".
//  - Settings: no selector bar; its region starts under the header. The text of the one selected text element (its
//    field keeps the text with text.set), then the attribute fields that apply to the element's type, in their order;
//    on the page root, the fields of the page's settings keep what is typed with page.setSetting; on a Link Block or a
//    link, the Link address keeps it with element.setLink; the HTML tag field keeps a typed tag with element.setTag.
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import type { AttributeId, CommandId, FeatureId, KeyContextId, MessageId, SectionId, StyleTargetId } from '../../generated/ids.ts';
import type { CommandArgs } from '../../generated/commands.ts';
import { GENERATED_VALUES } from '../../generated/value-lists.ts';
import { isFeatureBuilt } from '../../app/features.ts';
import { locate, type DocNode, type NodeId, type StoredValue } from '../../core/document/model.ts';
import { structuredCss } from '../../core/render/output.ts';
import { attributeApplies, formControls } from '../../core/elements/inputs.ts';
import { partTypesOf, selectionInTable } from '../../core/elements/parts.ts';
import { equivalentTags } from '../../core/elements/tag.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { elementIcon, manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { MenuButton } from '../doors/menu.tsx';
import { GLYPHS, doorSlots, drawnAsOf, partOf, slotsIn } from '../doors/placement.ts';
import { afterGesture } from '../input/pointer.ts';
import { collapsedSections, editedProperties, inspectorMode, isEssential, summaryOf, summaryProperties } from '../inspector/sections.ts';
import { MODEL_RULES, useEditorState, useStore, type EditorStore, layeredRules } from '../store.ts';
import { classOrigin, styleSource } from '../inspector/style-target.ts';
import { inspectorTab } from '../workspace/layout.ts';
import { isPanelOpen, panelName } from '../workspace/panels.ts';
import { useLocale, useT } from '../text.ts';
import { activeBreakpoint, BREAKPOINTS } from '../view/breakpoints.ts';
import { activeState, STATES } from '../view/style-state.ts';
import { KeywordButtons, NumberField, TextStyleField, presetsOf, usePageValues, type FieldPart } from './field.tsx';
import { storedValue, shownValue } from '../../core/style/set.ts';
import { kindsOf, shownForKinds } from '../../core/style/applies.ts';
import { withTrackAdded } from '../../core/style/tracks.ts';
import { functionArgument, functionOfControl, translateAxis, translateWith } from '../../core/style/functions.ts';
import { Slots } from './slots.tsx';
import { Affects, TargetChips, classBarControl } from './class-bar.tsx';
import { GradientControl, isGradientControl } from './gradient.tsx';
import { ShadowControl, isShadowControl } from './shadow.tsx';

interface Target {
  readonly id: string;
  readonly section: string;
  readonly labelKey: string;
  readonly control: string;
  readonly icons: Readonly<Record<string, string>>;
  readonly subsets: readonly { readonly id: string; readonly values: readonly string[] | null }[];
  // a composite's longhands, in its shorthand's order
  readonly longhands?: readonly string[];
}

const TARGETS = new Map<string, Target>([
  ...manifest.properties.properties.map((p) => [p.id, p] as const),
  ...manifest.properties.composites.map((c) => [c.id, { ...c, icons: {} }] as const),
  ...manifest.properties.recipes.map((r) => [r.id, { ...r, icons: {}, subsets: [] }] as const),
]);
const SECTIONS = manifest.properties.sections;
// the selector bar's target chip and the × drawn inside a class chip
const CHIP = doorSlots('inspector-selector-bar').find((d) => drawnAsOf(d) === 'item');
const CHIP_PART = CHIP ? partOf('inspector-selector-bar', CHIP) : null;
const ORIGINS: readonly { readonly key: MessageId; readonly origin: string }[] = [
  { key: 'inspector.legend.here', origin: 'here' },
  { key: 'inspector.legend.breakpoint', origin: 'breakpoint' },
  { key: 'inspector.legend.state', origin: 'state' },
  { key: 'inspector.legend.inherited', origin: 'inherited' },
  { key: 'inspector.legend.default', origin: 'default' },
];

// the controls drawn as the text field of a style value (field.tsx TextStyleField): typed, Enter keeps it
const TEXT_CONTROLS: readonly string[] = ['keyword-menu', 'font-menu', 'text-field', 'number-field', 'slider', 'track-editor', 'transform-fields'];

const targetOf = (entry: DoorEntry): Target | null => {
  const d = entry.door;
  if (d.kind !== 'inspector-field') return null;
  const id = d.property ?? d.composite ?? d.recipe;
  return id !== null ? (TARGETS.get(id) ?? null) : null;
};

// The values a field offers in All properties: the generated list of its property and its presets.
function offered(entry: DoorEntry): readonly string[] {
  const offers = entry.door.adapter.offers;
  if (!offers) return [];
  const generated = offers.list === 'generated' ? (GENERATED_VALUES[offers.property as StyleTargetId]?.keywords ?? []) : [];
  return [...new Set([...generated, ...presetsOf(entry)])];
}

// A field's controls, disabled while its door is (not available yet, or its predicate does not hold).
function FieldInput({ entry, target, label, available }: { readonly entry: DoorEntry; readonly target: Target; readonly label: string; readonly available: boolean }) {
  const d = entry.door;
  const off = available ? '' : ' is-unavailable';
  const ariaDisabled = available ? undefined : true;
  // a field the door draws as a button (its drawnAs): an editor's action, or one fixed value (Spread writes space-between)
  if (d.kind === 'inspector-field' && d.drawnAs === 'button') {
    return (
      <button type="button" className={`door door--button${off}`} aria-disabled={ariaDisabled} aria-label={label}>
        <span className="door__label">{typeof d.args.value === 'string' ? d.args.value : label}</span>
      </button>
    );
  }
  if (target.control === 'keyword-buttons' && entry.door.kind === 'inspector-field' && entry.door.control === 'field') {
    return (
      <span className="segmented segmented--values" role="group" aria-label={label}>
        {offered(entry).map((value) => {
          const icon = target.icons[value];
          return (
            <button key={value} type="button" className={`door door--segment${off}`} aria-disabled={ariaDisabled} title={value} aria-label={value}>
              {icon !== undefined ? <Icon name={icon} size="sm" /> : <span className="door__label">{value}</span>}
            </button>
          );
        })}
      </span>
    );
  }
  if (target.control === 'keyword-menu' || target.control === 'font-menu') {
    return (
      <button type="button" className={`select${off}`} aria-disabled={ariaDisabled} aria-label={label} aria-haspopup="listbox">
        <span className="select__value" />
        <Icon name={GLYPHS.dropdown} size="xs" />
      </button>
    );
  }
  return (
    <span className="input-wrap">
      {target.control === 'color-field' ? <span className="swatch" /> : null}
      <input className="input" disabled={!available} aria-label={label} />
    </span>
  );
}

function Field({ entry }: { readonly entry: DoorEntry }) {
  const t = useT();
  const target = targetOf(entry);
  // a field that carries only its command's label is labelled by its property, composite or recipe (the glossary's
  // term, rule label-term); a button with a label of its own (Spread, Stretch) keeps it. A field is usable only once
  // its own feature is registered as built (DESIGN.md "Build order"): style.set runs Width and Height long before
  // Display or Color.
  const own = entry.door.labelKey !== entry.command.labelKey;
  const door = useDoor(entry, {}, target && !own ? t(target.labelKey as MessageId) : undefined, isFeatureBuilt(entry.door.feature as FeatureId));
  if (!target) return null;
  const cssName = entry.door.kind === 'inspector-field' ? (entry.door.property ?? target.id) : target.id;
  // a composite of lengths (gap: row-gap and column-gap) is a text field of its longhands, one or two lengths
  if (target.control === 'length-field' && entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'field' && entry.door.composite !== null && 'property' in entry.command.args) {
    return <TextStyleField entry={entry} door={door} property={entry.door.composite} longhands={target.longhands ?? null} label={door.label} />;
  }
  // the shadow editor's controls (shadow.tsx)
  if (isShadowControl(entry)) return <ShadowControl entry={entry} door={door} />;
  // the gradient editor's controls (gradient.tsx)
  if (isGradientControl(entry)) return <GradientControl entry={entry} door={door} />;
  // a field of a part of a value: a translate axis (Move X, Move Y), one function of a filter or a transform (Blur,
  // Skew X), by its door's control
  const part = partOfField(entry);
  if (part !== null && entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'field' && entry.door.property !== null) {
    return <TextStyleField entry={entry} door={door} property={entry.door.property} longhands={null} label={door.label} part={part} />;
  }
  // the Add column button of a grid's tracks: its door, standing for the tracks it writes (core/style/tracks.ts)
  if (entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'button' && entry.door.control === 'add-track' && entry.door.property !== null) {
    return <AddTrackButton entry={entry} available={door.available} face={door.face} title={door.title} property={entry.door.property} />;
  }
  // a field drawn as a button that writes one fixed value (Stretch: align-items stretch; Spread: justify-content
  // space-between): its door, standing for that value
  if (entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'button') {
    return (
      <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify(entry.door.args)} title={door.title}>
        <span className="field-row__label" />
        <button type="button" className={`door door--button${door.available ? '' : ' is-unavailable'}`} aria-disabled={door.available ? undefined : true} onClick={door.run}>
          <span className="door__label">{door.face}</span>
        </button>
      </div>
    );
  }
  // a length field is the field component: typing, units, steps and the scrub (spec inspector-number-fields)
  if (target.control === 'length-field' && entry.door.kind === 'inspector-field' && entry.door.property !== null) return <NumberField entry={entry} door={door} property={entry.door.property} label={door.label} />;
  // keyword buttons: one button per value the property offers (field.tsx)
  if (target.control === 'keyword-buttons' && entry.door.kind === 'inspector-field' && entry.door.control === 'field' && entry.door.property !== null && 'property' in entry.command.args) {
    return <KeywordButtons entry={entry} door={door} property={entry.door.property} values={offered(entry)} icons={target.icons} label={door.label} />;
  }
  // a keyword menu, a font menu, a text field, a number field, a slider or a track list of a property or composite: a
  // text field suggesting its keywords
  if (TEXT_CONTROLS.includes(target.control) && entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'field' && 'property' in entry.command.args) {
    return <TextStyleField entry={entry} door={door} property={entry.door.property ?? target.id} longhands={entry.door.composite !== null ? (target.longhands ?? null) : null} label={door.label} />;
  }
  // a border or radius field: its own command (style.setBorder, style.setRadius), the same field; the typed text is
  // parted into the command's arguments (field.tsx)
  if ((target.control === 'border-editor' || target.control === 'radius-editor') && entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'field') {
    const edited = entry.door.composite ?? entry.door.property ?? target.id;
    return <TextStyleField entry={entry} door={door} property={edited} longhands={entry.door.composite !== null ? (target.longhands ?? null) : null} label={door.label} ownCommand />;
  }
  // an image field (the background image): its own command, the same field
  if (target.control === 'image-field' && entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'field' && entry.door.property !== null && 'property' in entry.command.args) {
    return <TextStyleField entry={entry} door={door} property={entry.door.property} longhands={null} label={door.label} ownCommand />;
  }
  // a colour field: its swatch opens the colour picker (color.tsx), its text keeps a typed colour like a text field
  if (target.control === 'color-field' && entry.door.kind === 'inspector-field' && entry.door.drawnAs === 'field' && entry.door.property !== null && 'property' in entry.command.args) {
    return <TextStyleField entry={entry} door={door} property={entry.door.property} longhands={null} label={door.label} colour />;
  }
  return (
    <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label" title={cssName}>
        {door.label}
      </span>
      <FieldInput entry={entry} target={target} label={door.label} available={door.available} />
    </div>
  );
}

// The part of a value a field edits alone, by its door's control (manifest data): a translate axis (translate-x,
// translate-y: style.set with the whole translate, core/style/functions.ts translateWith), or one function of a filter or
// a transform (filter-blur, transform-skew-x: the door's command with that function's argument); null for any other.
function partOfField(entry: DoorEntry): FieldPart | null {
  if (entry.door.kind !== 'inspector-field' || entry.door.property === null) return null;
  const { control, property } = entry.door;
  const axis = ['translate-x', 'translate-y'].indexOf(control);
  if (axis >= 0) return { show: (held) => translateAxis(held, axis), args: (text, held) => ({ property, value: translateWith(held, axis, text) }) };
  const list = Object.entries(entry.command.args).find(([name, arg]) => name !== 'property' && arg.type === 'json')?.[0];
  if (list === undefined || !/^(filter|transform)-/.test(control)) return null;
  const name = functionOfControl(control);
  return { show: (held) => functionArgument(held, name), args: (text) => ({ property, [list]: { [name]: text } }) };
}

// The Add column button (spec props-grid-container): it writes the tracks the primary selected element's columns have,
// then one more (withTrackAdded), with its door's command; its door stands for those tracks.
function AddTrackButton({ entry, available, face, title, property }: { readonly entry: DoorEntry; readonly available: boolean; readonly face: string; readonly title: string; readonly property: string }) {
  const store = useStore();
  const next = useEditorState((s) => {
    const node = styleSource(s);
    return node ? withTrackAdded(storedValue(node, property, layeredRules(s.ui))) : null;
  });
  const ready = available && next !== null;
  return (
    <div className={`field-row${ready ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify({ property, value: next })} title={title}>
      <span className="field-row__label" />
      <button
        type="button"
        className={`door door--button${ready ? '' : ' is-unavailable'}`}
        aria-disabled={ready ? undefined : true}
        onClick={() => (ready ? (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, property, value: next }) : undefined)}
      >
        <span className="door__label">{face}</span>
      </button>
    </div>
  );
}

// The sides of a box in the order a box composite lists its longhands (CSS Box 3: top, right, bottom, left), each named
// as CSS Logical Properties name it in a horizontal, top-to-bottom writing mode; the side argument of style.setSpacing.
const BOX_SIDES = ['block-start', 'inline-end', 'block-end', 'inline-start'] as const;
// the link of a box (inspector.toggleSpacingLink): the style region's control whose command takes a box and nothing else
const SPACING_LINK = doorSlots('inspector-style').find((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'icon-button' && Object.keys(d.command.args).join() === 'box');

// A field of the box model (spec props-spacing): one side of a box, or, while the box is linked, its four sides. It shows
// the value the primary selected element holds (the four sides' when they agree, else nothing), else the value the page
// computes; it is the one field of a form of its own, so Enter submits it and keeps what it holds with its door's command
// (style.setSpacing, with its box and sides), as leaving it with typing not kept yet does (one undo step).
function SpacingField({ entry, box, sides, properties, where, label }: { readonly entry: DoorEntry; readonly box: string; readonly sides: string; readonly properties: readonly string[]; readonly where: string; readonly label: string }) {
  const store = useStore();
  const door = useDoor(entry, { box, sides }, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const primary = useEditorState((st) => st.selection[0] ?? null);
  const stored = useEditorState((st) => {
    const node = styleSource(st);
    if (!node) return undefined;
    const values = properties.map((p) => storedValue(node, p, layeredRules(st.ui)));
    return values.some((v) => v === undefined) ? undefined : new Set(values).size === 1 ? values[0] : '';
  });
  const computed = usePageValues(stored === undefined ? primary : null, properties);
  const computedText = computed === null ? undefined : new Set(properties.map((p) => computed[p])).size === 1 ? computed[properties[0] ?? ''] : '';
  const shown = stored ?? computedText ?? '';
  const said = useEditorState((st) => st.message);
  const field = useRef<HTMLInputElement>(null);
  const typed = useRef(false);
  const command = entry.command.id;
  useEffect(() => {
    if (field.current === null) return;
    field.current.value = shown;
    typed.current = false;
  }, [shown, said]);
  const keep = () => {
    const element = field.current;
    if (element === null || !typed.current) return;
    typed.current = false;
    const value = element.value;
    keepAfterGesture(() => {
      if (store.getState().selection.length === 0) return;
      (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(command, { box, sides, value });
    });
  };
  return (
    <form
      className={`box__side box__side--${where}`}
      data-door={entry.ref}
      data-args={JSON.stringify({ box, sides })}
      title={door.title}
      onSubmit={(event) => {
        event.preventDefault();
        keep();
      }}
    >
      <input
        ref={field}
        className="box__input"
        disabled={!door.available || primary === null}
        aria-label={door.label}
        spellCheck={false}
        onInput={() => {
          typed.current = true;
        }}
        onBlur={keep}
      />
    </form>
  );
}

// The box model (DESIGN.md "Sections": margin outside, padding inside): the composites drawn as a box model
// (properties.json control box-model), each a box around the next in their placement order, the first outermost. Each
// box has its label and its link (inspector.toggleSpacingLink); unlinked, a field on each side writes that side's
// longhand; linked, one field (the box's own door) writes its four sides. No property is named here.
// no box linked (one value, so the selector returns the same list while nothing changes)
const NO_LINKS: readonly string[] = [];
function BoxModel({ doors }: { readonly doors: readonly DoorEntry[] }) {
  const t = useT();
  const links = useEditorState((st) => st.ui.preferences.spacingLinks ?? NO_LINKS);
  const boxes = doors.filter((d) => d.door.kind === 'inspector-field' && d.door.composite !== null);
  const sideField = (css: string | undefined) => doors.find((d) => d.door.kind === 'inspector-field' && d.door.property === css);
  const draw = (level: number): ReactNode => {
    const box = boxes[level];
    const target = box ? targetOf(box) : null;
    if (!box || !target) return <span className="box__core" />;
    const linked = (links as readonly string[]).includes(target.id);
    const longhands = target.longhands ?? [];
    const side = (where: (typeof BOX_SIDES)[number]) => {
      const index = BOX_SIDES.indexOf(where);
      const css = longhands[index];
      const entry = sideField(css);
      const label = css !== undefined ? TARGETS.get(css)?.labelKey : undefined;
      // the side a longhand is: its name after the box's (padding-top: top), a value of style.setSpacing's sides
      return entry && css ? <SpacingField key={entry.ref} entry={entry} box={target.id} sides={css.slice(target.id.length + 1)} properties={[css]} where={where} label={label !== undefined ? t(label as MessageId) : css} /> : null;
    };
    return (
      <div className={`box box--${target.id}${linked ? ' is-linked' : ''}`}>
        {/* the box's label stands for its composite door while the box is unlinked; linked, the four sides' field does */}
        <span className="box__label" data-door={linked ? undefined : box.ref} data-args={linked ? undefined : JSON.stringify({ box: target.id, sides: 'all' })}>
          {t(target.labelKey as MessageId)}
        </span>
        {SPACING_LINK ? <DoorControl entry={SPACING_LINK} args={{ box: target.id }} className="box__link" /> : null}
        {linked ? (
          <SpacingField entry={box} box={target.id} sides="all" properties={longhands} where="all" label={t(target.labelKey as MessageId)} />
        ) : (
          <>
            {side('block-start')}
            {side('inline-start')}
          </>
        )}
        {draw(level + 1)}
        {linked ? null : (
          <>
            {side('inline-end')}
            {side('block-end')}
          </>
        )}
      </div>
    );
  };
  return draw(0);
}

// The section header (the disclosure door of inspector-style) and every door after it, in its section; an editor
// control sits in the section of the field before it. A section with no Style field (Content: its fields are in the
// Settings tab; Interactions: its own tab) is not a Style section.
const SECTION_HEADER = doorSlots('inspector-style').find((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'disclosure');
const SECTION_DOORS = (() => {
  const headerOrder = SECTION_HEADER && typeof SECTION_HEADER.door.placement === 'object' ? SECTION_HEADER.door.placement.order : 0;
  const bySection = new Map<string, DoorEntry[]>();
  let section: string = SECTIONS[0]?.id ?? '';
  for (const slot of slotsIn('inspector-style')) {
    if (slot.kind !== 'door' || slot.order <= headerOrder) continue;
    section = targetOf(slot.entry)?.section ?? section;
    const list = bySection.get(section) ?? [];
    list.push(slot.entry);
    bySection.set(section, list);
  }
  return bySection;
})();
const STYLE_SECTIONS = SECTIONS.filter((s) => (SECTION_DOORS.get(s.id) ?? []).length > 0);

function StyleSections() {
  const t = useT();
  const locale = useLocale();
  const collapsed = useEditorState((s) => collapsedSections(s.ui));
  // the one selected element, whose values a collapsed section summarises
  const only = useEditorState((s) => (s.selection.length === 1 ? (s.selection[0] ?? null) : null));
  const properties = useMemo(() => collapsed.flatMap((section) => summaryProperties(section)), [collapsed]);
  const values = usePageValues(only, properties);
  const node = useSingleNode();
  const mode = useEditorState((s) => inspectorMode(s.ui));
  const revealed = useEditorState((s) => s.ui.revealed?.field ?? null);
  const kinds = useSelectionKinds();
  // what the element holds a value of, at the base breakpoint and state
  const held = node === null ? NO_HELD : heldProperties(node);
  return (
    <>
      {STYLE_SECTIONS.map((s) => {
        const section = s.id as SectionId;
        const doors = (SECTION_DOORS.get(s.id) ?? []).filter((d) => shownForSelection(d, kinds) && (mode === 'all' || shownInEssentials(d, held, revealed)));
        const set = (SECTION_PROPERTIES.get(s.id) ?? []).filter((p) => held.has(p)).length;
        const closed = collapsed.includes(section);
        const summary = closed ? summaryOf(section, values, t, locale) : null;
        const boxDoors = doors.filter((d) => targetOf(d)?.control === 'box-model');
        return (
          <section key={s.id} className="inspector-section" aria-label={t(s.labelKey as MessageId)}>
            {SECTION_HEADER ? (
              <DoorControl entry={SECTION_HEADER} args={{ section }} expanded={!closed} className="inspector-section__header">
                <span className="door__label">{t(s.labelKey as MessageId)}</span>
                {summary !== null ? <span className="inspector-section__summary">{summary}</span> : null}
                {set > 0 ? <span className="inspector-section__count">{t('inspector.valuesSet', { count: set })}</span> : null}
              </DoorControl>
            ) : null}
            {closed
              ? null
              : doors.map((d) => {
                  if (targetOf(d)?.control === 'box-model') return boxDoors[0] === d ? <BoxModel key={d.ref} doors={boxDoors} /> : null;
                  if (d.door.kind === 'panel-control' && d.door.drawnAs === 'field' && cssTextArg(d) !== null && node !== null) return <DeclarationsField key={`${d.ref}@${node.id}`} entry={d} node={node} />;
                  if (d === SPACING_LINK) return null;
                  if (d.door.kind === 'panel-control' && d.door.control === ANCHOR_CONTROL) return <AnchorControl key={d.ref} entry={d} />;
                  if (d.door.kind === 'panel-control') return <Fragment key={d.ref}>{d.door.drawnAs === 'icon-button' ? <DoorControl entry={d} /> : <PanelField entry={d} />}</Fragment>;
                  return (
                    <Fragment key={d.ref}>
                      <Field entry={d} />
                      <ClassOrigin entry={d} />
                      <LayerOrigin entry={d} />
                    </Fragment>
                  );
                })}
          </section>
        );
      })}
    </>
  );
}

// the properties each section holds (properties.json), for the count of values set its header shows
const SECTION_PROPERTIES = new Map<string, readonly string[]>(STYLE_SECTIONS.map((s) => [s.id, manifest.properties.properties.filter((p) => p.section === s.id).map((p) => p.id)] as const));
const NO_HELD: ReadonlySet<string> = new Set();
// the properties (and recipes) a node holds a value of at the base breakpoint and state
function heldProperties(node: DocNode): ReadonlySet<string> {
  const byState = (node.styles as Record<string, Record<string, Record<string, StoredValue>> | undefined>)[MODEL_RULES.base.breakpoint];
  return new Set(Object.keys(byState?.[MODEL_RULES.base.state] ?? {}));
}
// the property, composite or recipe a door of the Style tab edits, or null (an editor control)
function editedTarget(entry: DoorEntry): string | null {
  if (entry.door.kind !== 'inspector-field') return null;
  return entry.door.property ?? entry.door.composite ?? entry.door.recipe ?? null;
}
// Whether the essentials mode draws a door (spec inspector-advanced-mode): an editor control always; a field when its
// property is one of the essentials, when the element holds a value of it, or when it was just revealed.
function shownInEssentials(entry: DoorEntry, held: ReadonlySet<string>, revealed: string | null): boolean {
  const target = editedTarget(entry);
  if (target === null) return true;
  return isEssential(target) || target === revealed || editedProperties(target).some((p) => held.has(p));
}
// The anchor control (spec absolute-anchors, Problems in Pager 2): per axis, the start edge, the centre, the end edge
// and both edges, each the control's door standing for that edge set (position.setAnchors, mode set), the anchors held
// drawn pressed; disabled while the selection is not positioned.
const ANCHOR_CONTROL = 'anchor-control';
// the rows follow position.setAnchors's edges in the manifest's order: left, right, top, bottom, the two centres, the two
// stretches; a door's label is its edge's (command.anchor.<edge in camel case>)
const camel = (edge: string) => edge.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
function anchorRows(entry: DoorEntry): readonly (readonly string[])[] {
  const [left = '', right = '', top = '', bottom = '', horizontalCenter = '', verticalCenter = '', horizontalStretch = '', verticalStretch = ''] = entry.command.args.edge?.values ?? [];
  return [
    [left, horizontalCenter, right, horizontalStretch],
    [top, verticalCenter, bottom, verticalStretch],
  ];
}
function AnchorControl({ entry }: { readonly entry: DoorEntry }) {
  const t = useT();
  const ready = isFeatureBuilt(entry.door.feature as FeatureId);
  return (
    <div className="field-row anchor-control" role="group" aria-label={t('anchors.title')}>
      <span className="field-row__label">{t('anchors.title')}</span>
      <div className="anchor-control__rows">
        {anchorRows(entry).map((row, i) => (
          <div key={i} className="segmented segmented--wide">
            {row.map((edge) => (
              <DoorControl key={edge} entry={entry} args={{ edge, mode: 'set' }} label={t(`command.anchor.${camel(edge)}` as MessageId)} className="anchor-control__item" ready={ready} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// With the Element target, the class a field's value comes from, while the element holds none of its own (spec
// shared-style-classes): the field shows the value the page computes, and this note names the class.
function ClassOrigin({ entry }: { readonly entry: DoorEntry }) {
  const t = useT();
  const target = editedTarget(entry);
  const origin = useEditorState((s) => (target === null ? null : (editedProperties(target).map((p) => classOrigin(s, p, MODEL_RULES)).find((o) => o !== null) ?? null)));
  if (origin === null) return null;
  return (
    <div className="field-origin" data-origin="class" data-field={entry.ref}>
      {t('inspector.fromClass', { name: origin })}
    </div>
  );
}

// Away from the base layer (a breakpoint or a state chosen; spec breakpoint-overrides, state-styles), where a field's value
// comes from: set at the edited layer ("here", naming the breakpoint), or inherited from a larger breakpoint or the base
// state (naming it). Nothing at the base layer, nor for a value no layer sets.
function LayerOrigin({ entry }: { readonly entry: DoorEntry }) {
  const t = useT();
  const target = editedTarget(entry);
  const origin = useEditorState((s) => {
    const rules = layeredRules(s.ui);
    const node = styleSource(s);
    if (target === null || node === null || rules === MODEL_RULES) return null;
    const found = editedProperties(target).map((p) => shownValue(node, p, rules)).find((v) => v !== undefined);
    if (found === undefined) return null;
    const here = found.breakpoint === rules.base.breakpoint && found.state === rules.base.state;
    return `${here ? 'here' : found.state !== rules.base.state ? 'state' : 'breakpoint'}|${found.breakpoint}|${found.state}`;
  });
  if (origin === null) return null;
  const [kind = '', breakpoint = '', state = ''] = origin.split('|');
  const breakpointName = t((BREAKPOINTS.find((b) => b.id === breakpoint)?.labelKey ?? 'breakpoint.desktop') as MessageId);
  const stateLabel = STATES.find((x) => x.id === state)?.labelKey;
  const source = kind === 'state' && stateLabel !== undefined ? `${breakpointName} · ${t(stateLabel as MessageId)}` : breakpointName;
  return (
    <div className="field-origin" data-origin={kind} data-field={entry.ref}>
      {kind === 'here' ? t('inspector.origin.here', { breakpoint: breakpointName }) : t('inspector.origin.from', { source })}
    </div>
  );
}

// The kinds of element every selected element is of (core/style/applies.ts), as one text so the hook's answer is stable.
const useSelectionKinds = (): readonly string[] =>
  useEditorState((s) => kindsOf(s.selection.flatMap((id) => locate(s.document, id)?.node ?? []), MODEL_RULES).join(' '))
    .split(' ')
    .filter((kind) => kind !== '');
// Whether a door of the Style tab is drawn for the selection (spec props-element-specific): a field of a kind of element
// (a table's, a list's, a form control's, a medium's) only while every selected element is of that kind.
function shownForSelection(entry: DoorEntry, kinds: readonly string[]): boolean {
  const target = editedTarget(entry);
  return target === null || shownForKinds(editedProperties(target), kinds, MODEL_RULES);
}

// The Add a property button (spec inspector-add-property): it opens the list of the properties the Style tab does not
// draw now (essentials mode), filtered by what is typed; choosing one reveals its field (inspector.reveal), which takes
// the focus. The button and each item are the reveal door, the items standing for their property.
const REVEAL = doorSlots('inspector-style').find((d) => d.door.kind === 'panel-control' && d.door.control === 'add-property-item');
function AddProperty() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const mode = useEditorState((s) => inspectorMode(s.ui));
  const revealed = useEditorState((s) => s.ui.revealed?.field ?? null);
  const node = useSingleNode();
  const kinds = useSelectionKinds();
  const door = useDoor(REVEAL ?? (manifest.doors[0] as DoorEntry), {}, t('inspector.addProperty'), REVEAL !== undefined && isFeatureBuilt(REVEAL.door.feature as FeatureId));
  if (REVEAL === undefined) return null;
  const held = node === null ? NO_HELD : heldProperties(node);
  const hidden =
    mode === 'all'
      ? []
      : [...new Set([...SECTION_DOORS.values()].flat().filter((d) => shownForSelection(d, kinds) && !shownInEssentials(d, held, revealed)).flatMap((d) => editedTarget(d) ?? []))].filter((target) => {
          const label = TARGETS.get(target)?.labelKey;
          const words = `${label === undefined ? '' : t(label as MessageId)} ${target}`.toLowerCase();
          return words.includes(query.trim().toLowerCase());
        });
  return (
    <div className="add-property">
      <button type="button" className={`door door--icon-button${door.available ? '' : ' is-unavailable'}`} data-door={REVEAL.ref} data-args="{}" aria-haspopup="menu" aria-expanded={open} aria-label={door.label} title={door.title} aria-disabled={door.available ? undefined : true} onClick={() => (door.available ? setOpen(!open) : undefined)}>
        {REVEAL.door.icon !== null ? <Icon name={REVEAL.door.icon} size="md" /> : null}
      </button>
      {open ? (
        <div className="add-property__menu" role="menu" aria-label={door.label}>
          <input className="input" type="search" aria-label={t('inspector.addProperty.filter')} placeholder={t('inspector.addProperty.filter')} value={query} onChange={(event) => setQuery(event.currentTarget.value)} data-local="add-property-filter" />
          {hidden.length === 0 ? <p className="add-property__none">{t('inspector.addProperty.none')}</p> : null}
          {hidden.map((target) => (
            <DoorControl key={target} entry={REVEAL} args={{ property: target }} label={`${t((TARGETS.get(target)?.labelKey ?? '') as MessageId)} · ${target}`} className="add-property__item" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// The command argument a panel field's CSS text fills: its one text argument besides the node it stands for
// (style.setCustomDeclarations' declarations), when the command stands for a node; null otherwise.
function cssTextArg(entry: DoorEntry): string | null {
  const args = Object.entries(entry.command.args);
  if (!args.some(([name, arg]) => name === 'target' && arg.type === 'node')) return null;
  const text = args.filter(([name, arg]) => name !== 'target' && arg.type === 'string');
  return text.length === 1 ? (text[0] as [string, unknown])[0] : null;
}

// the node's declarations at the base breakpoint and state, "property: value;" each, on one line
function declarationsText(node: DocNode): string {
  const byState = (node.styles as Record<string, Record<string, Record<string, StoredValue>> | undefined>)[MODEL_RULES.base.breakpoint];
  // a structured value (a shadow's layers) as the page writes it
  return Object.entries(byState?.[MODEL_RULES.base.state] ?? {})
    .map(([property, value]) => `${property}: ${typeof value === 'string' ? value : structuredCss(value, MODEL_RULES.structures.get(property) ?? [])};`)
    .join(' ');
}

// The element's CSS declarations (style.setCustomDeclarations): a field showing what the element holds at the base
// breakpoint and state, the declarations separated by ";"; Enter (the field is the one field of its form, so Enter
// submits it) or leaving it (Tab, a click elsewhere, another selection) keeps what it holds for the node it was drawn
// for, one undo step, when it differs from what it last showed. A refused text is shown again as the document holds it
// after the command says why.
function DeclarationsField({ entry, node }: { readonly entry: DoorEntry; readonly node: DocNode }) {
  const store = useStore();
  const filled = cssTextArg(entry) ?? '';
  const args = useMemo(() => ({ target: node.id }), [node.id]);
  const door = useDoor(entry, args);
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const shown = useRef('');
  const stored = declarationsText(node);
  const said = useEditorState((s) => s.message);
  const command = entry.command.id;
  useEffect(() => {
    if (field.current === null) return;
    field.current.value = stored;
    shown.current = stored;
  }, [stored, said]);
  useEffect(() => {
    const row = form.current;
    const element = field.current;
    if (row === null || element === null) return;
    const keep = () => {
      if (element.value === shown.current) return;
      shown.current = element.value;
      const text = element.value;
      keepAfterGesture(() => {
        if (locate(store.getState().document, args.target) === null) return;
        (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(command, { ...args, [filled]: text });
      });
    };
    const submit = (event: Event) => {
      event.preventDefault();
      keep();
    };
    row.addEventListener('submit', submit);
    element.addEventListener('blur', keep);
    return () => {
      row.removeEventListener('submit', submit);
      element.removeEventListener('blur', keep);
      keep();
    };
  }, [store, command, args, filled]);
  return (
    <form ref={form} className={`field-row field-row--wide${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title}>
      <span className="field-row__label">{door.label}</span>
      <input ref={field} className="input" disabled={!door.available} aria-label={door.label} spellCheck={false} />
    </form>
  );
}

// The alignment matrix (spec props-flex-container): three rows of three cells, each the matrix's door standing for
// where the cell is drawn (x across, y down: start, center, end), named from the catalogue; the cell standing for what
// the element holds is pressed.
const MATRIX_PLACES = ['start', 'center', 'end'] as const;
function MatrixCell({ entry, x, y }: { readonly entry: DoorEntry; readonly x: string; readonly y: string }) {
  const t = useT();
  const name = t('inspector.alignment.cell', { x: { key: `inspector.alignment.x.${x}` as MessageId }, y: { key: `inspector.alignment.y.${y}` as MessageId } });
  return (
    <DoorControl entry={entry} args={{ x, y }} label={name} className="matrix__cell">
      <span className="matrix__bars" aria-hidden="true" />
    </DoorControl>
  );
}
function AlignmentMatrix({ entry, label }: { readonly entry: DoorEntry; readonly label: string }) {
  return (
    <span className="matrix" role="group" aria-label={label}>
      {MATRIX_PLACES.flatMap((y) => MATRIX_PLACES.map((x) => <MatrixCell key={`${x}-${y}`} entry={entry} x={x} y={y} />))}
    </span>
  );
}

// an editor control of the Style tab that is not a property field (the alignment matrix, the anchors, the custom declarations)
function PanelField({ entry }: { readonly entry: DoorEntry }) {
  const door = useDoor(entry);
  return (
    <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label">{door.label}</span>
      {entry.door.kind === 'panel-control' && entry.door.control === 'alignment-matrix' ? (
        <AlignmentMatrix entry={entry} label={door.label} />
      ) : (
        <input className="input" disabled={!door.available} aria-label={door.label} />
      )}
    </div>
  );
}

// What the selector bar names (DESIGN.md "Inspector": the element's icon, name and tag): the one selected element,
// with its exported tag (the page root's is body); with several selected, how many; with none, that nothing is. Read
// from the store's selection, so the inspector never says something the store contradicts.
function SelectedElement() {
  const t = useT();
  const count = useEditorState((s) => s.selection.length);
  const node = useSingleNode();
  if (count > 1) return <div className="selector-bar__element">{t('canvas.selectedCount', { count })}</div>;
  if (node === null) return <div className="selector-bar__element">{t('inspector.nothingSelected')}</div>;
  return (
    <div className="selector-bar__element">
      <Icon name={elementIcon(node.type) ?? GLYPHS.folder} size="sm" />
      <span className="selector-bar__name">{node.name}</span>
      <small className="selector-bar__tag">{node.tag ?? ''}</small>
    </div>
  );
}

// With nothing selected, what the inspector suggests (spec inspector-panel, "Nothing selected"): add an element from
// the Insert panel, select one, edit a text.
function Hints() {
  const t = useT();
  return (
    <ul className="inspector-hints">
      <li>{t('inspector.hint.insert', { panel: { key: panelName('elements') } })}</li>
      <li>{t('inspector.hint.select')}</li>
      <li>{t('inspector.hint.editText')}</li>
    </ul>
  );
}

// the one selected element, or null with none or several selected
const useSingleNode = () => useEditorState((s) => (s.selection.length === 1 && s.selection[0] !== undefined ? (locate(s.document, s.selection[0])?.node ?? null) : null));

// The Style tab: the selector bar, then its region, as tall as what it shows inside the scrolling column.
function StyleTab() {
  const t = useT();
  const none = useEditorState((s) => s.selection.length === 0);
  return (
    <>
      <SelectorBar />
      <div className="inspector-scroll">
        <div className="inspector-body" data-region="inspector-style">
          {none ? <Hints /> : null}
          <ul className="legend">
            {ORIGINS.map((o) => (
              <li key={o.origin} className={`legend__item legend__item--${o.origin}`}>
                {t(o.key)}
              </li>
            ))}
          </ul>
          <div className="inspector-mode">
            <div className="segmented segmented--wide" role="group">
              <Slots region="inspector-style" render={(slot) => (slot.kind === 'door' && slot.entry.door.kind === 'panel-control' && slot.entry.door.drawnAs === 'segment' ? undefined : null)} />
            </div>
            <AddProperty />
          </div>
          <input className="search" type="search" placeholder={t('inspector.searchProperty')} aria-label={t('inspector.searchProperty')} data-local="search" />
          <div className="inspector-sections">
            <StyleSections />
          </div>
        </div>
      </div>
    </>
  );
}

// The attributes of elements.json by id, and the Settings tab's attribute fields in their order there.
const ATTRIBUTES = new Map(manifest.elements.attributes.map((a) => [a.id, a]));
const SETTINGS_FIELDS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'inspector-field' && d.door.attribute !== null);
// the toggles of a table's parts (caption, head, foot; core/elements/parts.ts), drawn while the selection is in a table
const TABLE_PART_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'toggle');
// the parts editor (core/elements/parts.ts): the buttons that add a part of a type (their door fixes the type), and the
// buttons of each part that stand for it (their command takes the part as its target: move up, move down, remove)
const ADD_PART_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'button' && typeof d.door.args.type === 'string');
const PART_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'icon-button' && d.command.args.target?.type === 'node');
// the person's own attributes (feature element-attributes-aria): the doors whose command takes an attribute's name
// (and its value): in the manifest's order, the name field that adds one and the value field of each, both fields of the
// command that sets a value; then the remove button
const CUSTOM_DOORS = doorSlots('inspector-settings').filter((d) => d.door.kind === 'panel-control' && d.command.args.name?.type === 'string');
const [CUSTOM_ADD, CUSTOM_VALUE] = CUSTOM_DOORS.filter((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'field' && 'value' in d.command.args);
const CUSTOM_REMOVE = CUSTOM_DOORS.find((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'icon-button' && !('value' in d.command.args));

// Runs what a field keeps as it loses the focus once no pointer gesture is open (afterGesture of the pointer owner): a
// command recorded once per dispatch never joins a gesture.
function keepAfterGesture(run: () => void): void {
  afterGesture(run);
}

// Keeps a text with the door's command (text.set), from a field (keepAfterGesture). Nothing is kept for a node the
// document no longer holds.
function keepText(store: EditorStore, command: CommandId, target: NodeId, content: string): void {
  keepAfterGesture(() => {
    if (locate(store.getState().document, target) === null) return;
    (store.dispatch as (id: CommandId, args: CommandArgs['text.set']) => DispatchResult)(command, { target, content });
  });
}

// the key context the text field names (interactions.json), whose doors are Enter (text.set keeps what the field holds,
// which the keymap reads as the command's content) and Escape (text.cancelEdit); Shift+Enter is not bound there, so
// the text area takes its own line break
const TEXT_FIELD_CONTEXT: KeyContextId = 'element-text-field';

// The text of the one selected text element (spec inspector-panel, "Text field"), drawn for its door (the command that
// takes the node's `content`). Typing changes only the field; its keys are the keymap's doors of its key context.
// The field shows the text the document holds: when it is drawn, when that text changes, and after every command
// that says something (the store's last message): Enter kept the text or was refused (a locked element), Escape
// cancelled what was typed. Leaving the field with typing not kept yet (Tab, a click elsewhere, another selection or
// tab) keeps it, one undo step. The field is drawn once per node (its key), so a node's typing is kept for that node.
function TextField({ entry, node, label }: { readonly entry: DoorEntry; readonly node: DocNode; readonly label: string }) {
  const store = useStore();
  const door = useDoor(entry, { target: node.id }, label);
  const field = useRef<HTMLTextAreaElement>(null);
  // whether the person typed since the field last showed the document's text: the field's own draft, never document
  // state
  const draft = useRef({ typed: false });
  const said = useEditorState((s) => s.message);
  const stored = node.text ?? '';
  const target = node.id;
  const command = entry.command.id;
  useEffect(() => {
    const element = field.current;
    if (element === null) return;
    element.value = stored;
    draft.current.typed = false;
  }, [stored, said]);
  useEffect(() => {
    const element = field.current;
    const typing = draft.current;
    if (element === null) return;
    const keep = () => {
      if (!typing.typed) return;
      typing.typed = false;
      keepText(store, command, target, element.value);
    };
    const onInput = () => {
      typing.typed = true;
    };
    element.addEventListener('input', onInput);
    element.addEventListener('blur', keep);
    return () => {
      element.removeEventListener('input', onInput);
      element.removeEventListener('blur', keep);
      // the field goes (another selection, another tab) with typing not kept yet: it is kept
      keep();
    };
  }, [store, command, target]);
  return (
    <div className={`field-row field-row--wide${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify({ target })} title={door.title}>
      <span className="field-row__label">{label}</span>
      <textarea ref={field} className="input input--area" rows={3} disabled={!door.available} aria-label={label} spellCheck={false} data-key-context={TEXT_FIELD_CONTEXT} />
    </div>
  );
}

// How an attribute field's text reaches its door's command, what the field shows and what it suggests, or null for a
// field that keeps no text:
//  - a setting of the page (spec page-properties, Problems in Pager 1), on the page root: the field stands for its
//    setting (the command's argument that takes an attribute, by its manifest type, names it) and its text fills the
//    command's other argument;
//  - an attribute whose command takes a text argument of the attribute's own name (element.setLink's href, spec
//    elements-structure; element.setTag's tag, spec semantic-tag-switch): the field stands for its node (the command's
//    target, when it takes one; element.setTag acts on the selection) and its text fills that argument.
// The field shows the value the node stores for the attribute (empty while it has none), except the HTML tag, which is
// the node's own tag, shown with the element's equivalent tags as suggestions (core/elements/tag.ts). A boolean
// attribute (a toggle) keeps no text.
export interface KeptText {
  readonly args: Readonly<Record<string, string>>;
  readonly filled: string;
  readonly stored: string;
  readonly suggestions: readonly string[];
  // a text of several lines (an embed's markup): a text area kept when the field is left, Enter breaking the line
  readonly multiline?: boolean;
}
// the value type of the attribute that is an element's HTML tag (elements.json), and a field that suggests nothing
const TAG_VALUE = 'tag';
// the value type of an attribute that names another node by its id (a label's for)
const ID_REF = 'id-ref';
// the keywords an attribute takes (elements.json), offered as suggestions
const keywordsOf = (attribute: AttributeId): readonly string[] => ATTRIBUTES.get(attribute)?.keywords ?? NO_SUGGESTIONS;
// the value type of an attribute that is the element's own markup (an embed's), edited as several lines
const MARKUP_VALUE = 'markup';
// the attribute that is the node's list of classes (elements.json), kept in the node's own classes
const CLASSES = 'classes';
const NO_SUGGESTIONS: readonly string[] = [];
export function keptTextOf(entry: DoorEntry, attribute: AttributeId, valueType: string, node: DocNode): KeptText | null {
  if (valueType === 'boolean') return null;
  const args = Object.entries(entry.command.args);
  const value = node.attributes[attribute];
  // the classes are the node's own list, shown as its words
  const stored = attribute === CLASSES ? node.classes.join(' ') : value === undefined ? '' : String(value);
  const target = args.find(([name, arg]) => name === 'target' && arg.type === 'node');
  const forNode = target === undefined ? {} : { target: node.id };
  // a command that names the attribute it sets (page.setSetting, element.setAttribute): the field stands for its
  // attribute and its node, and its text fills the command's other argument
  const named = args.find(([, arg]) => arg.type === 'attribute')?.[0];
  if (named !== undefined) {
    const filled = args.find(([name]) => name !== named && name !== 'target')?.[0];
    return filled === undefined ? null : { args: { [named]: attribute, ...forNode }, filled, stored, suggestions: keywordsOf(attribute) };
  }
  // a command whose one argument is a choice (element.setInputType's type): the field suggests its values
  const choices = args.filter(([name]) => name !== 'target');
  const choice = choices.length === 1 ? choices[0] : undefined;
  if (choice !== undefined && choice[1].type === 'enum') return { args: forNode, filled: choice[0], stored, suggestions: choice[1].values };
  // markup (an embed's, kept as the node's text; an SVG's, kept in its attribute): the command's one text argument
  // besides its node, several lines
  if (valueType === MARKUP_VALUE) {
    const text = args.filter(([name, arg]) => name !== 'target' && arg.type === 'string');
    const filled = text.length === 1 ? (text[0] as [string, unknown])[0] : undefined;
    return filled === undefined ? null : { args: forNode, filled, stored: value !== undefined ? stored : (node.text ?? ''), suggestions: NO_SUGGESTIONS, multiline: true };
  }
  const own = args.find(([name, arg]) => name === attribute && (arg.type === 'string' || arg.type === 'json'));
  if (own === undefined) return null;
  const kept = { args: forNode, filled: attribute };
  if (valueType !== TAG_VALUE) return { ...kept, stored, suggestions: NO_SUGGESTIONS };
  const element = MODEL_RULES.elements.get(node.type);
  return { ...kept, stored: node.tag ?? '', suggestions: element === undefined ? NO_SUGGESTIONS : equivalentTags(element) };
}

// An attribute field that keeps its text (keptTextOf): a one-line text field of its door, standing for its arguments,
// whose text fills the command's argument named for it. Typing changes only the field, which keeps its keys (the
// field key context binds no Enter). The field is the one field of a form of its own, so Enter submits it, as the
// browser submits a form implicitly (no key is handled here): the submission keeps its text, and so does leaving the
// field (Tab, a click elsewhere) or its going (another selection, another tab), whenever the text differs from the one
// it last showed or kept; each keeping is one undo step (keepAfterGesture), for the node the field was drawn for. The
// field shows what keptTextOf says the node stores: when it is drawn, when that value changes, and after every command
// that says something (the value kept, or refused while the document keeps its own). The values it suggests (the
// element's equivalent tags) are offered under it as the browser offers a list of suggestions for a text field. A
// field whose door's feature is not registered as built (the page's description, until page-seo-meta) is not
// available yet, although the command it shares is built.
export function KeptTextField({ entry, node, kept, label, attribute }: { readonly entry: DoorEntry; readonly node: DocNode; readonly kept: KeptText; readonly label: string; readonly attribute?: string }) {
  const store = useStore();
  const { filled, stored, suggestions } = kept;
  const json = JSON.stringify(kept.args);
  const args = useMemo(() => JSON.parse(json) as Readonly<Record<string, string>>, [json]);
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const listId = useId();
  // the text the field last showed or kept: the field's own draft, never document state
  const draft = useRef({ shown: '' });
  const said = useEditorState((s) => s.message);
  const command = entry.command.id;
  const owner = node.id;
  useEffect(() => {
    const element = field.current;
    if (element === null) return;
    element.value = stored;
    draft.current.shown = stored;
  }, [stored, said]);
  // the field the inspector was asked to show (inspector.reveal) takes the focus
  const revealed = useEditorState((s) => s.ui.revealed);
  useEffect(() => {
    if (revealed !== undefined && revealed.field === attribute) field.current?.focus();
  }, [revealed, attribute]);
  useEffect(() => {
    const row = form.current;
    const element = field.current;
    const typing = draft.current;
    if (row === null || element === null) return;
    const keep = () => {
      const text = element.value;
      if (text === typing.shown) return;
      typing.shown = text;
      keepAfterGesture(() => {
        // nothing is kept for a node the document no longer holds
        if (locate(store.getState().document, owner) === null) return;
        (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(command, { ...args, [filled]: text });
      });
    };
    // the form's submission never leaves the editor
    const submit = (event: Event) => {
      event.preventDefault();
      keep();
    };
    row.addEventListener('submit', submit);
    element.addEventListener('blur', keep);
    return () => {
      row.removeEventListener('submit', submit);
      element.removeEventListener('blur', keep);
      // the field goes (another selection, another tab) with a text not kept yet: it is kept
      keep();
    };
  }, [store, command, args, filled, owner]);
  return (
    <form ref={form} className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title}>
      <span className="field-row__label">{label}</span>
      {kept.multiline === true ? (
        <textarea ref={field} className="input input--area" rows={4} disabled={!door.available} aria-label={label} spellCheck={false} />
      ) : (
        <input ref={field} className="input" disabled={!door.available} aria-label={label} spellCheck={false} list={suggestions.length > 0 ? listId : undefined} />
      )}
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.map((value) => (
            <option key={value} value={value} />
          ))}
        </datalist>
      ) : null}
    </form>
  );
}

// The command argument a boolean attribute's toggle fills: the argument of the attribute's own name that takes a
// boolean (element.setLink's newTab), or null when the command takes none.
function toggleArgOf(entry: DoorEntry, attribute: AttributeId): { readonly args: Readonly<Record<string, string>>; readonly filled: string } | null {
  const args = Object.entries(entry.command.args);
  const named = args.find(([, arg]) => arg.type === 'attribute')?.[0];
  if (named !== undefined) {
    const filled = args.find(([name]) => name !== named && name !== 'target')?.[0];
    return filled === undefined ? null : { args: { [named]: attribute }, filled };
  }
  const own = args.find(([name, arg]) => name === attribute && arg.type === 'boolean');
  return own === undefined ? null : { args: {}, filled: own[0] };
}

// A boolean attribute of the Settings tab (Open in a new tab, Required, Disabled…): a checkbox standing for its node,
// checked while the node stores the attribute; a click runs the door's command with the other state, one undo step.
function ToggleField({ entry, node, attribute, label }: { readonly entry: DoorEntry; readonly node: DocNode; readonly attribute: AttributeId; readonly label: string }) {
  const store = useStore();
  const toggle = toggleArgOf(entry, attribute);
  const target = 'target' in entry.command.args ? node.id : undefined;
  const json = JSON.stringify({ ...(toggle?.args ?? {}), ...(target === undefined ? {} : { target }) });
  const args = useMemo(() => JSON.parse(json) as Readonly<Record<string, string>>, [json]);
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const on = node.attributes[attribute] === true;
  const flip = () => (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(entry.command.id, { ...args, [toggle?.filled ?? attribute]: !on });
  return (
    <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title}>
      <span className="field-row__label">{label}</span>
      <input type="checkbox" checked={on} disabled={!door.available} aria-label={label} onChange={flip} />
    </div>
  );
}

// The parts of the selected element (a select's options and groups, a picture's or a video's sources, a video's
// tracks): each part by name with its move up, move down and remove buttons, then the buttons that add each type of
// part the element takes. Drawn only for an element that takes parts.
function PartsEditor({ node }: { readonly node: DocNode }) {
  const takes = partTypesOf(MODEL_RULES, node);
  const adds = ADD_PART_DOORS.filter((d) => takes(String(d.door.args.type)));
  if (adds.length === 0) return null;
  const parts = node.children.filter((child) => MODEL_RULES.contentModel.names(node.tag ?? '', child.tag ?? ''));
  return (
    <div className="parts-editor">
      {parts.map((part) => (
        <div key={part.id} className="field-row">
          <span className="field-row__label">{part.name}</span>
          {PART_DOORS.map((d) => (
            <DoorControl key={d.ref} entry={d} args={{ target: part.id }} />
          ))}
        </div>
      ))}
      <div className="field-row">
        {adds.map((d) => (
          <DoorControl key={d.ref} entry={d} />
        ))}
      </div>
    </div>
  );
}

// The person's own attributes of the selected element (aria-*, data-*, role…): each by name with its value field (kept
// on Enter or on leaving it, one undo step) and its remove button; then a name field and the add button. The button
// adds the typed name with an empty value or, with no name typed, puts the caret in the name field, where Enter adds it.
// The name field's form is the add door's control: it stands for the empty value it adds and keeps the name typed.
const ADDED = { value: '' } as const;
const ADDED_VALUE = JSON.stringify(ADDED);
function CustomAttributes({ node, add: addEntry }: { readonly node: DocNode; readonly add: DoorEntry }) {
  const store = useStore();
  const t = useT();
  const addDoor = useDoor(addEntry, {}, undefined, isFeatureBuilt(addEntry.door.feature as FeatureId));
  const typedName = useRef<HTMLInputElement>(null);
  const dispatch = store.dispatch as (id: CommandId, args: unknown) => DispatchResult;
  const add = () => {
    const field = typedName.current;
    if (field === null) return;
    if (field.value.trim() === '') {
      field.focus();
      return;
    }
    if (dispatch(addEntry.command.id, { name: field.value, ...ADDED }).status === 'done') field.value = '';
  };
  // Enter in the name field submits its form, which adds the name
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add();
  };
  return (
    <div className="custom-attributes" aria-label={addDoor.label}>
      {Object.entries(node.customAttributes ?? {}).map(([name, value]) => (
        <CustomAttributeRow key={`${node.id}:${name}`} node={node} name={name} value={value} />
      ))}
      <form className={`field-row${addDoor.available ? '' : ' is-unavailable'}`} title={addDoor.title} onSubmit={submit} data-door={addEntry.ref} data-args={ADDED_VALUE}>
        <input ref={typedName} className="input" disabled={!addDoor.available} aria-label={t('inspector.customAttribute.name')} placeholder={t('inspector.customAttribute.name')} spellCheck={false} data-local="custom-attribute-name" />
        <button type="button" className="door door--icon-button" disabled={!addDoor.available} aria-label={addDoor.label} onClick={add}>
          {addEntry.door.icon !== null ? <Icon name={addEntry.door.icon} size="md" /> : null}
        </button>
      </form>
    </div>
  );
}

function CustomAttributeRow({ node, name, value }: { readonly node: DocNode; readonly name: string; readonly value: string }) {
  const store = useStore();
  const valueEntry = CUSTOM_VALUE as DoorEntry;
  const removeEntry = CUSTOM_REMOVE as DoorEntry;
  const args = useMemo(() => ({ name }), [name]);
  const door = useDoor(valueEntry, args, name, isFeatureBuilt(valueEntry.door.feature as FeatureId));
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const shown = useRef(value);
  const said = useEditorState((s) => s.message);
  useEffect(() => {
    if (field.current === null) return;
    field.current.value = value;
    shown.current = value;
  }, [value, said]);
  useEffect(() => {
    const row = form.current;
    const element = field.current;
    if (row === null || element === null) return;
    const keep = () => {
      if (element.value === shown.current) return;
      shown.current = element.value;
      const text = element.value;
      keepAfterGesture(() => {
        if (locate(store.getState().document, node.id) === null) return;
        (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(valueEntry.command.id, { name, value: text });
      });
    };
    const submit = (event: Event) => {
      event.preventDefault();
      keep();
    };
    row.addEventListener('submit', submit);
    element.addEventListener('blur', keep);
    return () => {
      row.removeEventListener('submit', submit);
      element.removeEventListener('blur', keep);
      keep();
    };
  }, [store, valueEntry, name, node.id]);
  return (
    <form ref={form} className={`field-row field-row--action${door.available ? '' : ' is-unavailable'}`} data-door={valueEntry.ref} data-args={JSON.stringify(args)} title={door.title}>
      <span className="field-row__label">{name}</span>
      <input ref={field} className="input" disabled={!door.available} aria-label={name} spellCheck={false} />
      <DoorControl entry={removeEntry} args={args} />
    </form>
  );
}

// A label's `for` (element.setLabelTarget): a field offering the form controls of the page by name; keeping a name
// (Enter or leaving the field) points the label at that control, which is given an id when it has none. The field
// shows the name of the control the label points at.
function LabelTargetField({ entry, node, label }: { readonly entry: DoorEntry; readonly node: DocNode; readonly label: string }) {
  const store = useStore();
  const door = useDoor(entry, {}, label, isFeatureBuilt(entry.door.feature as FeatureId));
  // the form controls of the document, read once per document (a selector returning a new list would never settle)
  const document = useEditorState((s) => s.document);
  const controls = useMemo(() => formControls(document), [document]);
  const current = controls.find((c) => node.attributes.labelFor !== undefined && c.attributes.id === node.attributes.labelFor)?.name ?? '';
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const listId = useId();
  const said = useEditorState((s) => s.message);
  const arg = Object.entries(entry.command.args).find(([, a]) => a.type === 'node')?.[0] ?? '';
  useEffect(() => {
    if (field.current !== null) field.current.value = current;
  }, [current, said]);
  useEffect(() => {
    const row = form.current;
    const element = field.current;
    if (row === null || element === null) return;
    const keep = () => {
      const typed = element.value.trim();
      if (typed === current) return;
      const control = formControls(store.getState().document).find((c) => c.name === typed);
      if (control === undefined) {
        element.value = current;
        return;
      }
      keepAfterGesture(() => (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id, { [arg]: control.id }));
    };
    const submit = (event: Event) => {
      event.preventDefault();
      keep();
    };
    row.addEventListener('submit', submit);
    element.addEventListener('blur', keep);
    return () => {
      row.removeEventListener('submit', submit);
      element.removeEventListener('blur', keep);
    };
  }, [store, entry, arg, current]);
  return (
    <form ref={form} className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label">{label}</span>
      <input ref={field} className="input" disabled={!door.available} aria-label={label} spellCheck={false} list={listId} />
      <datalist id={listId}>
        {controls.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </form>
  );
}

// An attribute field of the Settings tab whose command, or whose door's feature, arrives later (Open in a new tab
// shares element.setLink with the Link address and comes with elements-text): drawn disabled, "not available yet".
function AttributeField({ entry, label, toggle }: { readonly entry: DoorEntry; readonly label: string; readonly toggle: boolean }) {
  const door = useDoor(entry, {}, label, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label">{label}</span>
      {toggle ? <input type="checkbox" disabled={!door.available} aria-label={label} /> : <input className="input" disabled={!door.available} aria-label={label} />}
    </div>
  );
}

// The Settings tab: no selector bar (DESIGN.md), its region right under the header. With one element selected, the
// fields of the attributes that apply to its type (elements.json), in their order, the text first.
function SettingsTab() {
  const t = useT();
  const count = useEditorState((s) => s.selection.length);
  const node = useSingleNode();
  const inTable = useEditorState((s) => selectionInTable(s.document, s.selection));
  return (
    <div className="inspector-scroll">
      <div className="inspector-body" data-region="inspector-settings">
        {count === 0 ? (
          <>
            <p className="inspector-empty">{t('inspector.nothingSelected')}</p>
            <Hints />
          </>
        ) : node === null ? (
          <p className="inspector-empty">{t('canvas.selectedCount', { count })}</p>
        ) : (
          SETTINGS_FIELDS.map((entry) => {
            const attribute = entry.door.kind === 'inspector-field' && entry.door.attribute !== null ? ATTRIBUTES.get(entry.door.attribute) : undefined;
            if (attribute === undefined || (attribute.elements !== 'all' && !attribute.elements.includes(node.type))) return null;
            // an input shows only the attributes its type takes (core/elements/inputs.ts)
            if (!attributeApplies(node, attribute.id)) return null;
            if (attribute.valueType === ID_REF) return <LabelTargetField key={`${entry.ref}@${node.id}`} entry={entry} node={node} label={t(attribute.labelKey as MessageId)} />;
            const label = t(attribute.labelKey as MessageId);
            if ('content' in entry.command.args) return <TextField key={`${entry.ref}@${node.id}`} entry={entry} node={node} label={label} />;
            // a setting of the page on the page root (core/page/settings.ts), a link (core/elements/link.ts), or the
            // element's HTML tag (core/elements/tag.ts)
            const kept = keptTextOf(entry, attribute.id as AttributeId, attribute.valueType, node);
            if (kept !== null) return <KeptTextField key={`${entry.ref}@${node.id}`} entry={entry} node={node} kept={kept} label={label} attribute={attribute.id} />;
            if (attribute.valueType === 'boolean' && toggleArgOf(entry, attribute.id as AttributeId) !== null)
              return <ToggleField key={`${entry.ref}@${node.id}`} entry={entry} node={node} attribute={attribute.id as AttributeId} label={label} />;
            return <AttributeField key={entry.ref} entry={entry} label={label} toggle={attribute.valueType === 'boolean'} />;
          })
        )}
        {node !== null ? <PartsEditor node={node} /> : null}
        {node !== null && CUSTOM_ADD !== undefined && CUSTOM_VALUE !== undefined && CUSTOM_REMOVE !== undefined ? <CustomAttributes node={node} add={CUSTOM_ADD} /> : null}
        {node !== null && inTable ? (
          <div className="field-row field-row--toggles">
            {TABLE_PART_DOORS.map((entry) => (
              <DoorControl key={entry.ref} entry={entry} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// The body of each inspector tab the editor draws; the tab of any other is not available yet.
const TAB_BODIES: Readonly<Record<string, ComponentType>> = { style: StyleTab, settings: SettingsTab };

export function Inspector() {
  const t = useT();
  const open = useEditorState((s) => isPanelOpen(s.ui, 'inspector'));
  const tab = useEditorState((s) => inspectorTab(s.ui));
  if (!open) return null;
  const Body = TAB_BODIES[tab];
  return (
    <aside className="inspector" aria-label={t(panelName('inspector'))}>
      <div className="inspector-header" data-region="inspector-header">
        <div className="inspector-header__tabs" role="tablist">
          <Slots
            region="inspector-header"
            render={(slot) => {
              if (slot.kind !== 'door' || drawnAsOf(slot.entry) !== 'tab') return null;
              const panel = slot.entry.door.args.panel;
              return <DoorControl key={slot.entry.ref} entry={slot.entry} ready={typeof panel === 'string' && panel in TAB_BODIES} />;
            }}
          />
        </div>
        <span className="inspector-header__actions">
          <Slots region="inspector-header" render={(slot) => (slot.kind === 'door' && drawnAsOf(slot.entry) === 'tab' ? null : undefined)} />
        </span>
      </div>
      {Body ? <Body /> : null}
    </aside>
  );
}

// The selector bar of the Style tab (DESIGN.md "Inspector"): the selected element, its targets, the state picker and
// the active breakpoint.
function SelectorBar() {
  const t = useT();
  // the state and the breakpoint the editor edits (view/style-state.ts, view/breakpoints.ts)
  const state = useEditorState((s) => activeState(s.ui));
  const breakpoint = useEditorState((s) => activeBreakpoint(s.ui));
  const breakpointIcon = doorSlots('canvas-frame').find((d) => d.door.args.breakpoint === breakpoint.id)?.door.icon ?? null;
  return (
    <div className="selector-bar" data-region="inspector-selector-bar">
      <SelectedElement />
      <div className="selector-bar__targets">
        <TargetChips />
        <Slots
          region="inspector-selector-bar"
          render={(slot) => {
            if (slot.kind === 'menu') return null;
            const drawn = slot.entry.door.kind === 'panel-control' ? slot.entry.door.drawnAs : null;
            // the target chips and the × drawn inside them stand for the element's targets (TargetChips draws them)
            if (drawn === 'item' || slot.entry === CHIP_PART) return null;
            return classBarControl(slot.entry);
          }}
        />
      </div>
      <Affects />
      <div className="selector-bar__state">
        <Slots
          region="inspector-selector-bar"
          render={(slot) =>
            slot.kind === 'menu' ? (
              <MenuButton key={slot.menu} menu={slot.menu} anchor={slot.anchor} indicator className="state-picker">
                <span className="state-picker__key">{t('menu.styleState')}</span>
                <span className="state-picker__value">{t(state.labelKey as MessageId)}</span>
              </MenuButton>
            ) : null
          }
        />
        <span className="active-breakpoint" title={t('inspector.activeBreakpoint')}>
          {breakpointIcon !== null ? <Icon name={breakpointIcon} size="sm" /> : null}
          <span>{t(breakpoint.labelKey as MessageId)}</span>
          <span className="active-breakpoint__width">{breakpoint.width}</span>
        </span>
      </div>
    </div>
  );
}
