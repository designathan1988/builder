// The inspector (DESIGN.md "Inspector"): its tabs, the selector bar, the value-origin legend, Essentials only / All
// properties, the property search, and the Style tab's sections, always all eight and in order, each with the
// fields the manifest places in inspector-style in their order. A field offers every value of the catalogue in All
// properties (the generated list and the presets, DESIGN.md) and draws a keyword-buttons control with the keyword
// icons of properties.json. Without a selection every field is empty; the commands behind them arrive with their
// features, so each shows "not available yet".
import { Fragment } from 'react';
import type { MessageId, SectionId, StyleTargetId } from '../../generated/ids.ts';
import { GENERATED_VALUES } from '../../generated/value-lists.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { MenuButton } from '../doors/menu.tsx';
import { GLYPHS, doorSlots, slotsIn } from '../doors/placement.ts';
import { useEditorState } from '../store.ts';
import { isPanelOpen, panelName } from '../workspace/panels.ts';
import { useT } from '../text.ts';
import { Slots } from './slots.tsx';

interface Target {
  readonly id: string;
  readonly section: string;
  readonly labelKey: string;
  readonly control: string;
  readonly icons: Readonly<Record<string, string>>;
  readonly subsets: readonly { readonly id: string; readonly values: readonly string[] | null }[];
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

// the label of the margin or the padding box: the door that sets all four sides at once
function BoxLabel({ entry, label }: { readonly entry: DoorEntry | undefined; readonly label: string }) {
  if (!entry) return <span className="box__label">{label}</span>;
  return <BoxLabelDoor entry={entry} label={label} />;
}

function BoxLabelDoor({ entry, label }: { readonly entry: DoorEntry; readonly label: string }) {
  const door = useDoor(entry, {}, label);
  return (
    <span className="box__label" data-door={entry.ref} title={door.title}>
      {label}
    </span>
  );
}

// the margin box drawn around the padding box, each side a field (DESIGN.md "Regions", inspector-style)
function BoxModel({ doors }: { readonly doors: readonly DoorEntry[] }) {
  const t = useT();
  const side = (css: string) => doors.find((d) => d.door.kind === 'inspector-field' && d.door.property === css);
  const whole = (id: string) => doors.find((d) => d.door.kind === 'inspector-field' && d.door.composite === id);
  const input = (entry: DoorEntry | undefined, where: string) => (entry ? <BoxSide key={entry.ref} entry={entry} where={where} /> : null);
  const labelOf = (id: string) => t((TARGETS.get(id)?.labelKey ?? 'inspector.group.box') as MessageId);
  return (
    <div className="box box--margin">
      <BoxLabel entry={whole('margin')} label={labelOf('margin')} />
      {input(side('margin-top'), 'top')}
      {input(side('margin-left'), 'left')}
      <div className="box box--padding">
        <BoxLabel entry={whole('padding')} label={labelOf('padding')} />
        {input(side('padding-top'), 'top')}
        {input(side('padding-left'), 'left')}
        <span className="box__core" />
        {input(side('padding-right'), 'right')}
        {input(side('padding-bottom'), 'bottom')}
      </div>
      {input(side('margin-right'), 'right')}
      {input(side('margin-bottom'), 'bottom')}
    </div>
  );
}

function StyleSections() {
  const t = useT();
  const header = doorSlots('inspector-style').find((d) => d.door.kind === 'panel-control' && d.door.drawnAs === 'disclosure');
  const headerOrder = header && typeof header.door.placement === 'object' ? header.door.placement.order : 0;
  // every door after the section header, in its section; an editor control sits in the section of the field before it
  const bySection = new Map<string, DoorEntry[]>();
  let section: string = SECTIONS[0]?.id ?? '';
  for (const slot of slotsIn('inspector-style')) {
    if (slot.kind !== 'door' || slot.order <= headerOrder) continue;
    section = targetOf(slot.entry)?.section ?? section;
    const list = bySection.get(section) ?? [];
    list.push(slot.entry);
    bySection.set(section, list);
  }
  return (
    <>
      {SECTIONS.map((s) => {
        const doors = bySection.get(s.id) ?? [];
        // a section with no Style field (Content: its fields are in the Settings tab) is not a Style section
        if (doors.length === 0) return null;
        const boxDoors = doors.filter((d) => targetOf(d)?.control === 'box-model');
        return (
          <section key={s.id} className="inspector-section" aria-label={t(s.labelKey as MessageId)}>
            {header ? (
              <DoorControl entry={header} args={{ section: s.id as SectionId }} expanded className="inspector-section__header">
                <span className="door__label">{t(s.labelKey as MessageId)}</span>
              </DoorControl>
            ) : null}
            {doors.map((d) => {
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

export function Inspector() {
  const t = useT();
  const open = useEditorState((s) => isPanelOpen(s.ui, 'inspector'));
  if (!open) return null;
  return (
    <aside className="inspector" aria-label={t(panelName('inspector'))}>
      <div className="inspector-header" data-region="inspector-header">
        <div className="inspector-header__tabs" role="tablist">
          <Slots region="inspector-header" render={(slot) => (slot.kind === 'door' && slot.entry.door.kind === 'panel-control' && slot.entry.door.drawnAs === 'tab' ? undefined : null)} />
        </div>
        <span className="inspector-header__actions">
          <Slots region="inspector-header" render={(slot) => (slot.kind === 'door' && slot.entry.door.kind === 'panel-control' && slot.entry.door.drawnAs === 'tab' ? null : undefined)} />
        </span>
      </div>
      <div className="selector-bar" data-region="inspector-selector-bar">
        <div className="selector-bar__element">{t('inspector.nothingSelected')}</div>
        <div className="selector-bar__targets">
          <Slots
            region="inspector-selector-bar"
            render={(slot) => {
              if (slot.kind === 'menu') return null;
              const drawn = slot.entry.door.kind === 'panel-control' ? slot.entry.door.drawnAs : null;
              // the target chips and their × stand for the element's targets: there are none without a selection
              if (drawn === 'item' || slot.entry.command.id === 'classes.detach') return null;
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
      <div className="inspector-body" data-region="inspector-style">
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
    </aside>
  );
}
