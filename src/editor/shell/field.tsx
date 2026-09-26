// The field component (DESIGN.md "Component regions": `field`, its parts in order: 1 unit menu, 2 step up, 3 step
// down, 4 reset this value; spec inspector-number-fields): a number or length field of the inspector, drawn for the
// inspector-field door of its property (style.set). Every part is a door of the `field` region, in its order.
//  - The field shows the value the primary selected element holds for the property at the base breakpoint and state,
//    else the value the page computes for it (a field never shows a blank, DESIGN.md "Inspector"). Typing changes only
//    the field; it shows the document's value again after every message (Enter kept the value or was refused, Escape
//    put it back, another command ran) and whenever that value changes.
//  - Its input names the key context `number-field` (interactions.json), whose doors are Enter (style.set keeps what
//    the field holds), Escape (field.cancel), ArrowUp/ArrowDown with Shift and Alt and PageUp/PageDown (field.step):
//    the keymap hands them the field's property and the text it holds; any other key (Delete, Backspace, letters,
//    Ctrl+Z) stays the input's own and never reaches the canvas or the document's history.
//  - Leaving the field with typing not kept yet (Tab, a click elsewhere, a step button, the unit menu, the label's
//    scrub) keeps it: one undo step, before whatever the press does.
//  - Its label is the scrub handle (the panel drag field.scrub#…, run by the pointer owner, src/editor/input/pointer.ts,
//    which reads the text of the field marked data-number-field at the press).
//  - The step buttons run field.step with the text the field holds and the key the click holds (Shift ×10, Alt ×0.1).
//  - The unit menu lists the units and keywords the property offers (the generated lists, All properties) and runs
//    field.setUnit with the one chosen; like any menu it closes on a dismissal (Escape, its backdrop).
// A field whose door is not available (its feature not registered yet, or nothing selected) draws every part disabled.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type MouseEvent } from 'react';
import type { DispatchResult } from '../../core/store/store.ts';
import { locate, type NodeId } from '../../core/document/model.ts';
import { DEFAULT_UNIT, codecOf } from '../../core/style/codecs.ts';
import { borderArgs } from '../../core/style/border.ts';
import { storedLayers, storedValue } from '../../core/style/set.ts';
import type { CommandId, KeyContextId, StyleTargetId } from '../../generated/ids.ts';
import { GENERATED_VALUES } from '../../generated/value-lists.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { computedValues } from '../canvas/coordinates.ts';
import { DoorControl, Icon, useDoor, type DoorState } from '../doors/door.tsx';
import { GLYPHS, doorSlots } from '../doors/placement.ts';
import { afterGesture, modifierOf } from '../input/pointer.ts';
import { MODEL_RULES, useEditorState, useStore, type EditorStore, layeredRules } from '../store.ts';
import { styleClassOf, styleSource } from '../inspector/style-target.ts';
import { useT } from '../text.ts';
import { createToken, tokenKindOf, tokensOf } from '../../core/design/tokens.ts';

// the key context a number field's input names (interactions.json)
const NUMBER_FIELD_CONTEXT: KeyContextId = 'number-field';
// the command a number field's Enter keeps its text with (its shortcut door in the number field's key context); a
// field of another command keeps it with its own form (TextStyleField ownCommand)
const FIELD_ENTER = manifest.doors.find((d) => d.door.kind === 'shortcut' && d.door.context === NUMBER_FIELD_CONTEXT && d.door.chord === 'Enter')?.command.id ?? null;
export const keptByFieldEnter = (entry: DoorEntry): boolean => entry.command.id === FIELD_ENTER;
// the parts of the field component, in their order (layout.json region `field`): a number field's, and the swatch of
// a colour field, which opens the colour picker (color.tsx)
export const COLOR_SWATCH = doorSlots('field').find((p) => p.door.kind === 'panel-control' && p.door.control === 'color-swatch');
// the part that takes the field's value away (style.reset)
const RESET = doorSlots('field').find((p) => p.door.kind === 'panel-control' && p.door.control === 'property-reset');
const PARTS = doorSlots('field').filter((p) => p !== COLOR_SWATCH);
// the label's scrub: the panel drag pressed on a field's label
const SCRUB = manifest.doors.find((d) => d.door.kind === 'panel-drag' && d.door.source === 'field-label') ?? null;
// the backdrop under an open menu
const BACKDROP = doorSlots('overlay')[0];

// The values the page computes for a node (coordinates.ts computedValues). The page changes after the store does (the
// renderer applies each change) and loads after the inspector is drawn, so the values are read at every frame while
// they are shown, as the canvas overlay measures the page: a measure of the page, not editor state.
export function usePageValues(node: NodeId | null, properties: readonly string[]): Readonly<Record<string, string>> | null {
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

// Whether the selected elements show different values of these properties (spec multi-select-edit, Problems in Pager
// 2): an element's value is the one it declares at the base breakpoint and state, else the one the page computes; a
// field is mixed when any selected element's differs from the primary's. One element is never mixed. The values the
// page computes are read at every frame while several elements are selected, as usePageValues reads them.
export function useMixed(properties: readonly string[]): boolean {
  const selection = useEditorState((s) => s.selection);
  const storedText = useEditorState((s) =>
    s.selection.length < 2
      ? '[]'
      : JSON.stringify(
          s.selection.map((id) => {
            const node = locate(s.document, id)?.node;
            return node ? properties.map((p) => storedValue(node, p, layeredRules(s.ui)) ?? null) : null;
          }),
        ),
  );
  const [read, setRead] = useState<{ readonly selection: readonly NodeId[]; readonly text: string } | null>(null);
  // one class as the style target: the elements share its one value (spec shared-style-classes)
  const classTargeted = useEditorState((s) => styleClassOf(s) !== null);
  useEffect(() => {
    if (selection.length < 2) return;
    let request = 0;
    let last: string | null = null;
    const measure = () => {
      const text = JSON.stringify(selection.map((id) => computedValues(id, properties)));
      if (text !== last) {
        last = text;
        setRead({ selection, text });
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [selection, properties]);
  if (selection.length < 2 || classTargeted) return false;
  const stored = JSON.parse(storedText) as ((string | null)[] | null)[];
  const page = read !== null && read.selection === selection ? (JSON.parse(read.text) as (Record<string, string> | null)[]) : [];
  const shown = stored.map((values, i) => JSON.stringify(properties.map((p, j) => values?.[j] ?? page[i]?.[p] ?? '')));
  return shown.some((value) => value !== shown[0]);
}

// The design tokens a field of a property offers next to typed values (spec css-variables-tokens, Problems in Pager 4):
// the project's variables of the kind the property takes, as var(--name).
const TOKEN_KINDS: readonly string[] = manifest.commandById.get(createToken.command)?.args.kind?.values ?? [];
function useTokenSuggestions(property: string): readonly string[] {
  const text = useEditorState((s) => {
    const kind = tokenKindOf(property, TOKEN_KINDS, MODEL_RULES);
    return kind === null ? '' : tokensOf(s.document).filter((t) => t.kind === kind).map((t) => `var(--${t.name})`).join('\n');
  });
  return useMemo(() => (text === '' ? [] : text.split('\n')), [text]);
}

type Dispatch = (id: CommandId, args: unknown) => DispatchResult;

// The units and keywords the unit menu offers for a property (its generated lists), and the one the value shows.
function unitsOf(property: string): readonly string[] {
  const offered = GENERATED_VALUES[property as StyleTargetId];
  return [...(offered?.units ?? []), ...(offered?.keywords ?? [])];
}
function unitShown(property: string, text: string): string {
  const offered = GENERATED_VALUES[property as StyleTargetId];
  const codec = codecOf(MODEL_RULES.propertyFacts.get(property)?.codec ?? '');
  const value = codec?.read(text, { units: offered?.units ?? [], keywords: offered?.keywords ?? [], defaultUnit: DEFAULT_UNIT }) ?? null;
  return value?.kind === 'length' ? value.unit : value?.kind === 'keyword' ? value.keyword : '';
}

// A step button: field.step with the text the field holds and the key the click holds, when the command takes it.
function StepButton({ entry, property, shown, input, ready }: { readonly entry: DoorEntry; readonly property: string; readonly shown: string; readonly input: { readonly current: HTMLInputElement | null }; readonly ready: boolean }) {
  const store = useStore();
  const door = useDoor(entry, { property }, undefined, ready);
  const onClick = (event: MouseEvent) => {
    if (!door.available) return;
    const held = modifierOf(event);
    const modifier = held !== null && entry.command.args.modifier?.values.includes(held) === true ? { modifier: held } : {};
    (store.dispatch as Dispatch)(entry.command.id, { ...entry.door.args, property, value: input.current?.value ?? shown, ...modifier });
  };
  return (
    <button
      type="button"
      className={`door door--icon-button field__step${door.available ? '' : ' is-unavailable'}`}
      data-door={entry.ref}
      data-args={JSON.stringify({ property, value: shown })}
      tabIndex={-1}
      aria-label={door.label}
      title={door.title}
      aria-disabled={door.available ? undefined : true}
      onClick={onClick}
    >
      {entry.door.icon !== null ? <Icon name={entry.door.icon} size="sm" /> : null}
    </button>
  );
}

// The unit menu: its button shows the unit (or keyword) of the value, and opens the list of what the property offers;
// an item runs field.setUnit with the text the field holds. It closes when a dismissal newer than its opening arrives.
function UnitMenu({ entry, property, shown, input, ready }: { readonly entry: DoorEntry; readonly property: string; readonly shown: string; readonly input: { readonly current: HTMLInputElement | null }; readonly ready: boolean }) {
  const store = useStore();
  const door = useDoor(entry, { property }, undefined, ready);
  const dismissals = useEditorState((s) => s.ui.overlays.dismissals);
  const [openedAt, setOpenedAt] = useState<number | null>(null);
  const open = openedAt !== null && openedAt === dismissals && door.available;
  const list = useRef<HTMLDivElement>(null);
  const current = unitShown(property, shown);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open]);
  const choose = (unit: string) => {
    setOpenedAt(null);
    (store.dispatch as Dispatch)(entry.command.id, { ...entry.door.args, property, value: input.current?.value ?? shown, unit });
    input.current?.focus();
  };
  return (
    <span className="menu-anchor field__unit">
      <button
        type="button"
        className="field__unit-button"
        data-door={entry.ref}
        data-args={JSON.stringify({ property, value: shown })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={door.label}
        title={door.title}
        aria-disabled={door.available ? undefined : true}
        onClick={() => {
          if (door.available) setOpenedAt(open ? null : dismissals);
        }}
      >
        {/* a keyword is shown by the field itself: the button then shows only its menu's glyph, leaving the field its room */}
        <span className="field__unit-value">{current === shown.trim() ? '' : current}</span>
        <Icon name={GLYPHS.dropdown} size="xs" />
      </button>
      {open && BACKDROP ? <DoorControl entry={BACKDROP} className="overlay-backdrop" /> : null}
      {open ? (
        <div className="menu field__menu" role="menu" ref={list} aria-label={door.label} data-key-context="menu">
          {unitsOf(property).map((unit) => (
            <button
              key={unit}
              type="button"
              role="menuitemradio"
              aria-checked={unit === current}
              className="menu__item"
              data-door={entry.ref}
              data-args={JSON.stringify({ property, value: shown, unit })}
              onClick={() => choose(unit)}
            >
              <span className="menu__icon">{unit === current ? <Icon name={GLYPHS.checked} size="sm" /> : null}</span>
              <span className="menu__label field__unit-value">{unit}</span>
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

// The values a field's door offers besides its property's keywords: its presets (the properties.json subset its door's
// offers name: the counter styles list-style-type's menu offers).
const SUBSETS = new Map([...manifest.properties.properties, ...manifest.properties.composites].map((p) => [p.id, p.subsets] as const));
export function presetsOf(entry: DoorEntry): readonly string[] {
  const offers = entry.door.adapter.offers;
  if (!offers || offers.presets === null) return [];
  return SUBSETS.get(offers.property)?.find((s) => s.id === offers.presets)?.values ?? [];
}

// The arguments a field whose door is a command of its own runs it with: its door's (a border field's sides), the
// property it edits and the text typed as the command takes them (the background image: property and value; a
// radius: the value; a border: its width, style and colour, parted by core/style/border.ts).
function ownArgs(entry: DoorEntry, property: string, text: string, extra: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const takes = entry.command.args;
  return { ...entry.door.args, ...extra, ...('property' in takes ? { property } : {}), ...('value' in takes ? { value: text } : borderArgs(property, text, MODEL_RULES)) };
}

// The field the inspector was asked to show (inspector.reveal, the Add a property list) takes the focus.
function useRevealed(property: string, input: { readonly current: HTMLInputElement | null }): void {
  const revealed = useEditorState((s) => s.ui.revealed);
  useEffect(() => {
    if (revealed !== undefined && revealed.field === property) input.current?.focus();
  }, [revealed, property, input]);
}

// Keeps what a field holds with its door's command (style.set), once no gesture is open; nothing for a selection that
// is gone.
function keepValue(store: EditorStore, command: CommandId, property: string, value: string): void {
  afterGesture(() => {
    if (store.getState().selection.length === 0) return;
    (store.dispatch as Dispatch)(command, { property, value });
  });
}

export interface NumberFieldProps {
  // the field's door (an inspector-field door of style.set) and its state, whose availability includes its feature's
  readonly entry: DoorEntry;
  readonly door: DoorState;
  readonly property: string;
  readonly label: string;
}

export function NumberField({ entry, door, property, label }: NumberFieldProps) {
  const store = useStore();
  const primary = useEditorState((s) => s.selection[0] ?? null);
  const stored = useEditorState((s) => {
    const node = styleSource(s);
    return node ? storedValue(node, property, layeredRules(s.ui)) : undefined;
  });
  const properties = useMemo(() => [property], [property]);
  const computed = usePageValues(stored === undefined ? primary : null, properties)?.[property];
  // several elements with different values: no value, and Mixed as the field's placeholder (spec multi-select-edit)
  const mixed = useMixed(properties);
  const shown = mixed ? '' : (stored ?? computed ?? '');
  const t = useT();
  // the project's variables the field offers (a length field: the length variables)
  const tokens = useTokenSuggestions(property);
  const listId = useId();
  const said = useEditorState((s) => s.message);
  const available = door.available && primary !== null;
  const input = useRef<HTMLInputElement>(null);
  // whether the person typed since the field last showed the document's value: the field's own draft, never document
  // state
  const draft = useRef({ typed: false });
  const command = entry.command.id;
  useEffect(() => {
    const element = input.current;
    if (element === null) return;
    element.value = shown;
    draft.current.typed = false;
  }, [shown, said]);
  useEffect(() => {
    const element = input.current;
    const typing = draft.current;
    if (element === null) return;
    const keep = () => {
      if (!typing.typed) return;
      typing.typed = false;
      keepValue(store, command, property, element.value);
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
  }, [store, command, property]);
  useRevealed(property, input);
  const scrub = SCRUB === null ? null : <ScrubLabel entry={SCRUB} property={property} shown={shown} label={label} ready={available} />;
  return (
    <div className={`field-row${available ? '' : ' is-unavailable'}${stored !== undefined ? ' is-set' : ''}`} data-door={entry.ref} data-args={JSON.stringify({ property })} data-number-field title={door.title}>
      {scrub ?? <span className="field-row__label">{label}</span>}
      <span className="input-wrap input-wrap--number">
        <input ref={input} className="input" disabled={!available} aria-label={label} inputMode="decimal" spellCheck={false} data-key-context={NUMBER_FIELD_CONTEXT} placeholder={mixed ? t('inspector.mixedValue') : undefined} list={tokens.length > 0 ? listId : undefined} />
        {tokens.length > 0 ? (
          <datalist id={listId}>
            {tokens.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        ) : null}
        {PARTS.map((part) => {
          if (part.door.kind === 'panel-control' && part.door.control === 'unit-menu') return <UnitMenu key={part.ref} entry={part} property={property} shown={shown} input={input} ready={available} />;
          if ('value' in part.command.args) return <StepButton key={part.ref} entry={part} property={property} shown={shown} input={input} ready={available} />;
          // Reset this value: usable while the element holds a value of its own (spec inspector-provenance-reset)
          return <DoorControl key={part.ref} entry={part} args={{ property }} ready={available && (part !== RESET || stored !== undefined)} tabbable={part !== RESET || (available && stored !== undefined)} />;
        })}
      </span>
    </div>
  );
}

// A text field of a style value that is no length (a keyword menu, a ratio, a composite of two longhands such as
// Overflow; spec props-size-overflow): an input that suggests the keywords the property offers, in the same key
// context as a number field, so Enter keeps what it holds with style.set and Escape puts the document's value back
// (field.cancel); leaving it with typing not kept yet keeps it. It shows the value the primary selected element holds
// (a composite's longhands, one value when they are the same), else the value the page computes.
// A part of a value a field edits alone (a translate axis, one function of a filter or a transform): what the field
// shows of the value the element holds, and the arguments of its door's command for a text typed.
const NO_EXTRA: Readonly<Record<string, unknown>> = {};

export interface FieldPart {
  show(held: string | undefined): string;
  args(text: string, held: string | undefined): Record<string, unknown>;
}

export function TextStyleField({
  entry,
  door,
  property,
  longhands,
  label,
  colour = false,
  ownCommand = false,
  part = null,
  extra = NO_EXTRA,
}: {
  readonly entry: DoorEntry;
  readonly door: DoorState;
  readonly property: string;
  readonly longhands: readonly string[] | null;
  readonly label: string;
  readonly colour?: boolean;
  readonly ownCommand?: boolean;
  readonly part?: FieldPart | null;
  // arguments of its own command the field gives beyond its door's (the quick panel's Border: every side)
  readonly extra?: Readonly<Record<string, unknown>>;
}) {
  const store = useStore();
  const primary = useEditorState((s) => s.selection[0] ?? null);
  const parts = useMemo(() => longhands ?? [property], [longhands, property]);
  const storedText = useEditorState((s) => {
    const node = styleSource(s);
    if (!node) return undefined;
    const values = parts.map((p) => storedValue(node, p, layeredRules(s.ui)));
    if (values.some((v) => v === undefined)) return values.every((v) => v === undefined) ? undefined : values.map((v) => v ?? '').join(' ').trim();
    return new Set(values).size === 1 ? values[0] : values.join(' ');
  });
  const computed = usePageValues(storedText === undefined ? primary : null, parts);
  const computedText = computed === null ? undefined : new Set(parts.map((p) => computed[p])).size === 1 ? computed[parts[0] ?? ''] : parts.map((p) => computed[p] ?? '').join(' ');
  const held = useEditorState((s) => {
    const node = styleSource(s);
    return node ? storedValue(node, property, layeredRules(s.ui)) : undefined;
  });
  // the layers of a structured value it holds (a shadow), counted
  const storedLayersOf = useEditorState((s) => {
    const node = styleSource(s);
    return node ? storedLayers(node, property, layeredRules(s.ui)).length : 0;
  });
  // several elements with different values: no value, and Mixed as the field's placeholder (spec multi-select-edit)
  const mixed = useMixed(parts);
  const t = useT();
  const shown = mixed ? '' : part !== null ? part.show(held) : (storedText ?? computedText ?? '');
  // the element holds a value of its own for what the field edits (the row shows it; Reset this value takes it away)
  const set = part !== null ? held !== undefined || storedLayersOf !== 0 : storedText !== undefined || storedLayersOf !== 0;
  const said = useEditorState((s) => s.message);
  // Enter in a field of its own form (a command of its own, or a part) and leaving any field keep the text the same way
  const own = ownCommand || part !== null;
  const keepText = useRef<(text: string) => void>(() => undefined);
  useEffect(() => {
    keepText.current = (text: string) => {
      if (!own) {
        keepValue(store, entry.command.id, property, text);
        return;
      }
      const args = part !== null ? { ...entry.door.args, ...part.args(text, held) } : ownArgs(entry, property, text, extra);
      afterGesture(() => {
        if (store.getState().selection.length === 0) return;
        (store.dispatch as Dispatch)(entry.command.id, args);
      });
    };
  });
  const available = door.available && primary !== null;
  const input = useRef<HTMLInputElement>(null);
  useRevealed(property, input);
  const draft = useRef({ typed: false });
  const command = entry.command.id;
  // the list of its suggestions, one per field (the inspector and the quick panel may draw the same property)
  const listId = useId();
  // the project's variables of the field's kind, then the keywords the property offers
  const tokenSuggestions = useTokenSuggestions(property);
  const keywords = GENERATED_VALUES[(parts[0] ?? property) as StyleTargetId]?.keywords;
  const suggestions = useMemo(() => [...tokenSuggestions, ...new Set([...(keywords ?? []), ...presetsOf(entry)])], [tokenSuggestions, keywords, entry]);
  useEffect(() => {
    const element = input.current;
    if (element === null) return;
    element.value = shown;
    draft.current.typed = false;
  }, [shown, said]);
  useEffect(() => {
    const element = input.current;
    const typing = draft.current;
    if (element === null) return;
    const keep = () => {
      if (!typing.typed) return;
      typing.typed = false;
      keepText.current(element.value);
    };
    const onInput = () => {
      typing.typed = true;
    };
    element.addEventListener('input', onInput);
    element.addEventListener('blur', keep);
    return () => {
      element.removeEventListener('input', onInput);
      element.removeEventListener('blur', keep);
      keep();
    };
  }, [store, command, property]);
  // a field whose door is a command of its own (the background image: style.setBackgroundImage), not style.set: Enter
  // submits its form and keeps what it holds with that command, since the number field's Enter is style.set's
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const element = input.current;
    if (element === null || !draft.current.typed) return;
    draft.current.typed = false;
    keepText.current(element.value);
  };
  return (
    <div className={`field-row${available ? '' : ' is-unavailable'}${set ? ' is-set' : ''}`} data-door={entry.ref} data-args={JSON.stringify({ property })} title={door.title}>
      <span className="field-row__label" title={property}>
        {label}
      </span>
      <span className="input-wrap">
        {colour && COLOR_SWATCH !== undefined ? (
          <DoorControl entry={COLOR_SWATCH} args={{ property }} ready={available} className="field__swatch">
            <span className="swatch" style={{ '--swatch-colour': shown } as CSSProperties} />
          </DoorControl>
        ) : null}
        {own ? (
          <form className="input-wrap__form" onSubmit={submit}>
            <input ref={input} className="input" disabled={!available} aria-label={label} spellCheck={false} placeholder={mixed ? t('inspector.mixedValue') : undefined} />
          </form>
        ) : (
          <input ref={input} className="input" disabled={!available} aria-label={label} spellCheck={false} list={suggestions.length > 0 ? listId : undefined} data-key-context={NUMBER_FIELD_CONTEXT} placeholder={mixed ? t('inspector.mixedValue') : undefined} />
        )}
        {suggestions.length > 0 ? (
          <datalist id={listId}>
            {suggestions.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
        ) : null}
        {RESET !== undefined ? <DoorControl entry={RESET} args={{ property }} ready={available && set} tabbable={available && set} /> : null}
      </span>
    </div>
  );
}

// A property drawn as keyword buttons (text-align; spec props-typography): one button per value it offers, each the
// field's door standing for its value; a click keeps that value with style.set (one undo step), and the button of the
// value the primary selected element holds (else the page computes) is pressed.
export function KeywordButtons({ entry, door, property, values, icons, label }: { readonly entry: DoorEntry; readonly door: DoorState; readonly property: string; readonly values: readonly string[]; readonly icons: Readonly<Record<string, string>>; readonly label: string }) {
  const store = useStore();
  const primary = useEditorState((s) => s.selection[0] ?? null);
  const stored = useEditorState((s) => {
    const node = styleSource(s);
    return node ? storedValue(node, property, layeredRules(s.ui)) : undefined;
  });
  const properties = useMemo(() => [property], [property]);
  const computed = usePageValues(stored === undefined ? primary : null, properties)?.[property];
  // several elements with different values: no button pressed (spec multi-select-edit)
  const mixed = useMixed(properties);
  const shown = mixed ? '' : (stored ?? computed ?? '');
  const available = door.available && primary !== null;
  const command = entry.command.id;
  // the argument the value goes in: style.set's value, position.setMode's mode
  const valueArg = Object.keys(entry.command.args).find((name) => name !== 'property') ?? 'value';
  return (
    <div className={`field-row${available ? '' : ' is-unavailable'}`} title={door.title}>
      <span className="field-row__label" title={property}>
        {label}
      </span>
      <span className="segmented segmented--values" role="group" aria-label={label}>
        {values.map((value) => {
          const icon = icons[value];
          return (
            <button
              key={value}
              type="button"
              className={`door door--segment${available ? '' : ' is-unavailable'}${shown === value ? ' is-current' : ''}`}
              aria-disabled={available ? undefined : true}
              aria-pressed={shown === value}
              title={value}
              aria-label={value}
              data-door={entry.ref}
              data-args={JSON.stringify({ property, [valueArg]: value })}
              onClick={() => {
                if (available) (store.dispatch as Dispatch)(command, { property, [valueArg]: value });
              }}
            >
              {icon !== undefined ? <Icon name={icon} size="sm" /> : <span className="door__label">{value}</span>}
            </button>
          );
        })}
      </span>
    </div>
  );
}

// The field's label, the handle its scrub is pressed on (the pointer owner runs the drag); its tooltip is the CSS
// property name (DESIGN.md "Inspector").
function ScrubLabel({ entry, property, shown, label, ready }: { readonly entry: DoorEntry; readonly property: string; readonly shown: string; readonly label: string; readonly ready: boolean }) {
  const door = useDoor(entry, { property }, undefined, ready);
  return (
    <span
      className={`field-row__label${door.available ? ' field-row__label--scrub' : ''}`}
      data-door={entry.ref}
      data-args={JSON.stringify({ property, value: shown })}
      aria-disabled={door.available ? undefined : true}
      title={property}
    >
      {label}
    </span>
  );
}
