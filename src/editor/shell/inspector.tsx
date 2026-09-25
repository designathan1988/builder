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
//    field keeps the text with text.set), then the attribute fields that apply to the element's type, in their order.
import { Fragment, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { CommandId, KeyContextId, MessageId, SectionId, StyleTargetId } from '../../generated/ids.ts';
import type { CommandArgs } from '../../generated/commands.ts';
import { GENERATED_VALUES } from '../../generated/value-lists.ts';
import { locate, type DocNode, type NodeId } from '../../core/document/model.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { elementIcon, manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { computedValues } from '../canvas/coordinates.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { MenuButton } from '../doors/menu.tsx';
import { GLYPHS, doorSlots, drawnAsOf, partOf, slotsIn } from '../doors/placement.ts';
import { openGesture } from '../input/pointer.ts';
import { collapsedSections, summaryOf, summaryProperties } from '../inspector/sections.ts';
import { useEditorState, useStore, type EditorStore } from '../store.ts';
import { inspectorTab } from '../workspace/layout.ts';
import { isPanelOpen, panelName } from '../workspace/panels.ts';
import { useLocale, useT } from '../text.ts';
import { Slots } from './slots.tsx';

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
const BASE_BREAKPOINT = manifest.properties.breakpoints.find((b) => b.base);
const BASE_STATE = manifest.properties.states[0];
// the icon the frame's tab of the base breakpoint shows, for the read-only active breakpoint
const BASE_BREAKPOINT_ICON = doorSlots('canvas-frame').find((d) => d.door.args.breakpoint === BASE_BREAKPOINT?.id)?.door.icon ?? null;
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

const targetOf = (entry: DoorEntry): Target | null => {
  const d = entry.door;
  if (d.kind !== 'inspector-field') return null;
  const id = d.property ?? d.composite ?? d.recipe;
  return id !== null ? (TARGETS.get(id) ?? null) : null;
};

// The values a field offers in All properties: the generated list of its property and its presets.
function offered(entry: DoorEntry, target: Target): readonly string[] {
  const offers = entry.door.adapter.offers;
  if (!offers) return [];
  const generated = offers.list === 'generated' ? (GENERATED_VALUES[offers.property as StyleTargetId]?.keywords ?? []) : [];
  const presets = offers.presets === null ? [] : (target.subsets.find((s) => s.id === offers.presets)?.values ?? []);
  return [...new Set([...generated, ...presets])];
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
        {offered(entry, target).map((value) => {
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
  // term, rule label-term); a button with a label of its own (Spread, Stretch) keeps it
  const own = entry.door.labelKey !== entry.command.labelKey;
  const door = useDoor(entry, {}, target && !own ? t(target.labelKey as MessageId) : undefined);
  if (!target) return null;
  const cssName = entry.door.kind === 'inspector-field' ? (entry.door.property ?? target.id) : target.id;
  return (
    <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label" title={cssName}>
        {door.label}
      </span>
      <FieldInput entry={entry} target={target} label={door.label} available={door.available} />
    </div>
  );
}

// one side of the box model: a field labelled with its property (Margin top, Padding left…)
function BoxSide({ entry, where }: { readonly entry: DoorEntry; readonly where: string }) {
  const t = useT();
  const property = entry.door.kind === 'inspector-field' ? entry.door.property : null;
  const labelKey = property !== null ? TARGETS.get(property)?.labelKey : undefined;
  const door = useDoor(entry, {}, labelKey !== undefined ? t(labelKey as MessageId) : undefined);
  return <input className={`box__side box__side--${where}`} disabled={!door.available} aria-label={door.label} title={door.title} data-door={entry.ref} />;
}

// the label of a box of the box model: the door that sets all four sides at once
function BoxLabel({ entry, label }: { readonly entry: DoorEntry; readonly label: string }) {
  const door = useDoor(entry, {}, label);
  return (
    <span className="box__label" data-door={entry.ref} title={door.title}>
      {label}
    </span>
  );
}

// A box-sides composite lists its four longhands in its shorthand's order (CSS Box 3: top, right, bottom, left); the
// index of a side's property there places its field. The sides are named as CSS Logical Properties name them in a
// horizontal, top-to-bottom writing mode, in that same order.
const BOX_SIDES = ['block-start', 'inline-end', 'block-end', 'inline-start'] as const;

// The box model (DESIGN.md "Sections": margin outside, padding inside): the composites drawn as a box model
// (properties.json control box-model), each a box around the next in their placement order, the first outermost;
// each side is the field of the composite's longhand at that side's index. No property is named here.
function BoxModel({ doors }: { readonly doors: readonly DoorEntry[] }) {
  const t = useT();
  const boxes = doors.filter((d) => d.door.kind === 'inspector-field' && d.door.composite !== null);
  const sideField = (css: string | undefined) => doors.find((d) => d.door.kind === 'inspector-field' && d.door.property === css);
  const draw = (level: number): ReactNode => {
    const box = boxes[level];
    const target = box ? targetOf(box) : null;
    if (!box || !target) return <span className="box__core" />;
    const side = (where: (typeof BOX_SIDES)[number]) => {
      const entry = sideField(target.longhands?.[BOX_SIDES.indexOf(where)]);
      return entry ? <BoxSide key={entry.ref} entry={entry} where={where} /> : null;
    };
    return (
      <div className={`box box--${target.id}`}>
        <BoxLabel entry={box} label={t(target.labelKey as MessageId)} />
        {side('block-start')}
        {side('inline-start')}
        {draw(level + 1)}
        {side('inline-end')}
        {side('block-end')}
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

// The values the page computes for a node (coordinates.ts computedValues), for the collapsed sections' summaries. The
// page changes after the store does (the renderer applies each change) and loads after the inspector is drawn, so the
// values are read at every frame while a summary shows, as the canvas overlay measures the page: a measure of the
// page, not editor state.
function usePageValues(node: NodeId | null, properties: readonly string[]): Readonly<Record<string, string>> | null {
  const [read, setRead] = useState<{ readonly node: NodeId; readonly values: Readonly<Record<string, string>> | null } | null>(null);
  useEffect(() => {
    if (node === null || properties.length === 0) return;
    let request = 0;
    let last: string | null = null;
    const measure = () => {
      const values = computedValues(node, properties);
      const text = JSON.stringify(values);
      if (text !== last) {
        last = text;
        setRead({ node, values });
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [node, properties]);
  return read !== null && read.node === node ? read.values : null;
}

function StyleSections() {
  const t = useT();
  const locale = useLocale();
  const collapsed = useEditorState((s) => collapsedSections(s.ui));
  // the one selected element, whose values a collapsed section summarises
  const only = useEditorState((s) => (s.selection.length === 1 ? (s.selection[0] ?? null) : null));
  const properties = useMemo(() => collapsed.flatMap((section) => summaryProperties(section)), [collapsed]);
  const values = usePageValues(only, properties);
  return (
    <>
      {STYLE_SECTIONS.map((s) => {
        const section = s.id as SectionId;
        const doors = SECTION_DOORS.get(s.id) ?? [];
        const closed = collapsed.includes(section);
        const summary = closed ? summaryOf(section, values, t, locale) : null;
        const boxDoors = doors.filter((d) => targetOf(d)?.control === 'box-model');
        return (
          <section key={s.id} className="inspector-section" aria-label={t(s.labelKey as MessageId)}>
            {SECTION_HEADER ? (
              <DoorControl entry={SECTION_HEADER} args={{ section }} expanded={!closed} className="inspector-section__header">
                <span className="door__label">{t(s.labelKey as MessageId)}</span>
                {summary !== null ? <span className="inspector-section__summary">{summary}</span> : null}
              </DoorControl>
            ) : null}
            {closed
              ? null
              : doors.map((d) => {
                  if (targetOf(d)?.control === 'box-model') return boxDoors[0] === d ? <BoxModel key={d.ref} doors={boxDoors} /> : null;
                  if (d.door.kind === 'panel-control') return <Fragment key={d.ref}>{d.door.drawnAs === 'icon-button' ? <DoorControl entry={d} /> : <PanelField entry={d} />}</Fragment>;
                  return <Field key={d.ref} entry={d} />;
                })}
          </section>
        );
      })}
    </>
  );
}

// an editor control of the Style tab that is not a property field (the alignment matrix, the anchors, the custom declarations)
function PanelField({ entry }: { readonly entry: DoorEntry }) {
  const door = useDoor(entry);
  return (
    <div className={`field-row${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} title={door.title}>
      <span className="field-row__label">{door.label}</span>
      {entry.door.kind === 'panel-control' && entry.door.control === 'alignment-matrix' ? (
        <span className="matrix" aria-label={door.label} role="grid">
          {Array.from({ length: 9 }, (_, n) => (
            <span key={n} className="matrix__cell" />
          ))}
        </span>
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
          <div className="segmented segmented--wide" role="group">
            <Slots region="inspector-style" render={(slot) => (slot.kind === 'door' && slot.entry.door.kind === 'panel-control' && slot.entry.door.drawnAs === 'segment' ? undefined : null)} />
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

// Keeps a text with the door's command (text.set), from a field: at once, or, when a press on the canvas opened a
// pointer gesture before the field lost the focus (a click elsewhere), once that gesture ends, since a command recorded
// once per dispatch never joins a gesture. Nothing is kept for a node the document no longer holds.
function keepText(store: EditorStore, command: CommandId, target: NodeId, content: string): void {
  const run = () => {
    if (locate(store.getState().document, target) === null) return;
    (store.dispatch as (id: CommandId, args: CommandArgs['text.set']) => DispatchResult)(command, { target, content });
  };
  if (openGesture() === null) {
    run();
    return;
  }
  const wait = () => (openGesture() === null ? run() : requestAnimationFrame(wait));
  requestAnimationFrame(wait);
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

// An attribute field of the Settings tab whose command arrives with its feature: drawn disabled, "not available yet".
function AttributeField({ entry, label, toggle }: { readonly entry: DoorEntry; readonly label: string; readonly toggle: boolean }) {
  const door = useDoor(entry, {}, label);
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
            const label = t(attribute.labelKey as MessageId);
            return 'content' in entry.command.args ? (
              <TextField key={`${entry.ref}@${node.id}`} entry={entry} node={node} label={label} />
            ) : (
              <AttributeField key={entry.ref} entry={entry} label={label} toggle={attribute.valueType === 'boolean'} />
            );
          })
        )}
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
  return (
    <div className="selector-bar" data-region="inspector-selector-bar">
      <SelectedElement />
      <div className="selector-bar__targets">
        <Slots
          region="inspector-selector-bar"
          render={(slot) => {
            if (slot.kind === 'menu') return null;
            const drawn = slot.entry.door.kind === 'panel-control' ? slot.entry.door.drawnAs : null;
            // the target chips and the × drawn inside them stand for the element's targets: none without a selection
            if (drawn === 'item' || slot.entry === CHIP_PART) return null;
            return undefined;
          }}
        />
      </div>
      <div className="selector-bar__state">
        <Slots
          region="inspector-selector-bar"
          render={(slot) =>
            slot.kind === 'menu' ? (
              <MenuButton key={slot.menu} menu={slot.menu} anchor={slot.anchor} indicator className="state-picker">
                <span className="state-picker__key">{t('menu.styleState')}</span>
                <span className="state-picker__value">{BASE_STATE ? t(BASE_STATE.labelKey as MessageId) : null}</span>
              </MenuButton>
            ) : null
          }
        />
        <span className="active-breakpoint" title={t('inspector.activeBreakpoint')}>
          {BASE_BREAKPOINT_ICON !== null ? <Icon name={BASE_BREAKPOINT_ICON} size="sm" /> : null}
          {BASE_BREAKPOINT ? <span>{t(BASE_BREAKPOINT.labelKey as MessageId)}</span> : null}
          {BASE_BREAKPOINT ? <span className="active-breakpoint__width">{BASE_BREAKPOINT.width}</span> : null}
        </span>
      </div>
    </div>
  );
}
