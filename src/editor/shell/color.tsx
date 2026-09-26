// The colour picker (DESIGN.md "Component regions": color-picker; spec color-picker), the one every colour field opens
// (its swatch, the door colorPicker.open): a popover over a shield that takes every click outside it, beside the
// inspector, with its parts in the order of the region's doors:
//  - the previous colour (the one the picker opened with; a click writes it back) beside the current one;
//  - the area: saturation across, brightness down, pressed and dragged through the pointer owner (pointer.ts), and two
//    sliders for the keyboard (arrows 1 %, Shift 10 %, spec Problems in Pager 4);
//  - the hue and alpha sliders; the text field (Enter writes what it holds; a text that is no colour is refused by
//    style.set, and the field shows the colour again);
//  - the format (HSB, RGB, Hex, OKLCH, OKLab) and one field per channel of it and the alpha: a channel value out of its
//    range is rejected and its field shows the last valid value (spec Problems in Pager 1); a colour outside sRGB (an
//    oklch() or a display-p3 one) is kept as it is, and the picker says the area shows the nearest sRGB colour
//    (color-picker-oklch);
//  - the project's saved colours (a click uses one, its × takes it away, Save current adds the colour shown), the
//    recent colours (the last applied, from the preferences) and the eyedropper (Chrome's EyeDropper: the colour it
//    picks is used; without the API it is not drawn) (color-swatches-eyedropper; saving or removing a colour joins the
//    picker's session, so Cancel takes it back with the colour);
//  - Cancel and Apply.
// Every part writes through the picker's session (pointer.ts dispatchInSession): the canvas shows the colour live;
// Apply keeps it as one undo step, Cancel and Escape put the opening value back.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from 'react';
import type { CommandId, FeatureId } from '../../generated/ids.ts';
import { isFeatureBuilt } from '../../app/features.ts';
import { styleSource } from '../inspector/style-target.ts';
import { FORMAT_CHANNELS, alphaBackground, areaBackground, channelText, formatColor, hsbToRgb, hueBackground, inSrgbGamut, parseColor, parseSrgb, rgbToHsb, type Hsba, type Rgba } from '../../core/style/color.ts';
import { CHANNEL_LABELS, recentColours } from '../inspector/color-picker.ts';
import { swatchesOf } from '../../core/design/colors.ts';
import { storedValue } from '../../core/style/set.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { Icon, useDoor } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { computedValues } from '../canvas/coordinates.ts';
import { dispatchInSession } from '../input/pointer.ts';
import { layeredRules, useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { COLOR_SWATCH, usePageValues } from './field.tsx';

// the picker's parts, in their order (layout.json region color-picker)
const PARTS = doorSlots('color-picker');
const partFor = (control: string): DoorEntry | undefined => PARTS.find((p) => p.door.kind === 'panel-control' && p.door.control === control);
const FORMATS = PARTS.filter((p) => p.door.kind === 'panel-control' && p.door.control === 'format');

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

// a part's door runs through the picker's session
function run(entry: DoorEntry, args: Readonly<Record<string, unknown>>): void {
  dispatchInSession(entry.command.id as CommandId, { ...entry.door.args, ...args });
}

function PickerButton({ entry, className }: { readonly entry: DoorEntry; readonly className: string }) {
  const door = useDoor(entry, {}, undefined, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <button
      type="button"
      className={`door ${className}${door.available ? '' : ' is-unavailable'}${door.current ? ' is-current' : ''}`}
      data-door={entry.ref}
      title={door.title}
      aria-disabled={door.available ? undefined : true}
      aria-pressed={className === 'door--segment' ? door.current : undefined}
      onClick={() => (door.available ? run(entry, {}) : undefined)}
    >
      <span className="door__label">{door.face}</span>
    </button>
  );
}

// A text field of the picker (the colour text, a channel): a form of its own, so Enter keeps what it holds; leaving it
// with typing not kept yet keeps it too. It shows `shown` again whenever that changes or a message is said.
function PickerText({ entry, args, shown, label, keep, className }: { readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>>; readonly shown: string; readonly label: string; readonly keep: (text: string) => void; readonly className: string }) {
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const said = useEditorState((s) => s.message);
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef(false);
  useEffect(() => {
    if (input.current === null) return;
    input.current.value = shown;
    typed.current = false;
  }, [shown, said]);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const element = input.current;
    if (element === null || !typed.current) return;
    typed.current = false;
    keep(element.value);
    // a value rejected changes nothing: the field shows the last valid one
    element.value = shown;
  };
  return (
    <form className={className} data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title} onSubmit={submit}>
      <label className="picker__label">
        <span>{label}</span>
        <input
          ref={input}
          className="input"
          aria-label={label}
          spellCheck={false}
          disabled={!door.available}
          onInput={() => {
            typed.current = true;
          }}
          onBlur={() => submit()}
        />
      </label>
    </form>
  );
}

// A slider of the picker (hue, alpha, the area's saturation and brightness for the keyboard): a native range, so it is
// a focusable slider with its value text; each change writes the colour it makes.
function PickerSlider({ entry, property, label, value, max, text, onValue, className, style }: { readonly entry: DoorEntry | null; readonly property: string; readonly label: string; readonly value: number; readonly max: number; readonly text: string; readonly onValue: (n: number) => void; readonly className: string; readonly style?: CSSProperties }) {
  const slider = (
    <input
      type="range"
      className="picker__range"
      min={0}
      max={max}
      step={1}
      value={value}
      aria-label={label}
      aria-valuetext={text}
      onChange={(event) => onValue(Number(event.currentTarget.value))}
    />
  );
  if (entry === null) return slider;
  return (
    <span className={className} data-door={entry.ref} data-args={JSON.stringify({ property })} title={label} style={style}>
      {slider}
    </span>
  );
}

// A door of the picker drawn as its icon (Save current, a saved colour's ×, the eyedropper), standing for its arguments;
// `act` runs it when it is not the door's own run with those arguments (the eyedropper asks the browser first).
function PickerIcon({ entry, args, ready = true, act }: { readonly entry: DoorEntry; readonly args: Readonly<Record<string, unknown>>; readonly ready?: boolean; readonly act?: () => void }) {
  const door = useDoor(entry, args, undefined, ready && isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <button
      type="button"
      className={`door door--icon-button${door.available ? '' : ' is-unavailable'}`}
      data-door={entry.ref}
      data-args={JSON.stringify(args)}
      title={door.title}
      aria-label={door.label}
      aria-disabled={door.available ? undefined : true}
      onClick={() => (door.available ? (act ?? (() => run(entry, args)))() : undefined)}
    >
      {entry.door.icon !== null ? <Icon name={entry.door.icon} size="sm" /> : null}
    </button>
  );
}

// A colour of the picker's lists (a saved one, a recent one): a click uses it.
function ColourChip({ entry, property, colour }: { readonly entry: DoorEntry; readonly property: string; readonly colour: string }) {
  const args = { property, value: colour };
  const door = useDoor(entry, args, undefined, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <button
      type="button"
      className={`picker__chip door${door.available ? '' : ' is-unavailable'}`}
      data-door={entry.ref}
      data-args={JSON.stringify(args)}
      title={`${door.label}: ${colour}`}
      aria-label={`${door.label}: ${colour}`}
      aria-disabled={door.available ? undefined : true}
      style={{ '--swatch-colour': colour } as CSSProperties}
      onClick={() => (door.available ? run(entry, args) : undefined)}
    />
  );
}

// Chrome's EyeDropper, when the browser has it (its sRGBHex is the colour picked; an Escape in it picks none)
interface EyeDropperApi {
  open(): Promise<{ readonly sRGBHex: string }>;
}
const eyeDropper = (): (new () => EyeDropperApi) | null => (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper ?? null;

function Library({ property, current }: { readonly property: string; readonly current: string }) {
  const t = useT();
  const saved = useEditorState((s) => swatchesOf(s.document));
  const recent = useEditorState((s) => recentColours(s.ui));
  const save = partFor('save-current');
  const remove = partFor('swatch-remove');
  const savedPart = partFor('saved-swatch');
  const recentPart = partFor('recent-swatch');
  const dropper = partFor('eyedropper');
  return (
    <div className="picker__library">
      <div className="picker__row" role="group" aria-label={t('colorPicker.saved')}>
        {savedPart !== undefined
          ? saved.map((colour, index) => (
              <span key={`${index}-${colour}`} className="picker__saved">
                <ColourChip entry={savedPart} property={property} colour={colour} />
                {remove !== undefined ? <PickerIcon entry={remove} args={{ index }} /> : null}
              </span>
            ))
          : null}
        {save !== undefined ? <PickerIcon entry={save} args={{ color: current }} ready={current !== ''} /> : null}
        {dropper !== undefined && eyeDropper() !== null ? (
          <PickerIcon
            entry={dropper}
            args={{ property }}
            act={() => {
              const Api = eyeDropper();
              if (Api === null) return;
              void new Api()
                .open()
                .then(({ sRGBHex }) => run(dropper, { property, value: sRGBHex }))
                .catch(() => undefined);
            }}
          />
        ) : null}
      </div>
      {recentPart !== undefined && recent.length > 0 ? (
        <div className="picker__row" role="group" aria-label={t('colorPicker.recent')}>
          {recent.map((colour) => (
            <ColourChip key={colour} entry={recentPart} property={property} colour={colour} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// the popover beside the inspector, level with the field it was opened from (a measure of the layout, written on the
// popover itself)
function useAnchor(property: string): RefObject<HTMLDivElement | null> {
  const popover = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = popover.current;
    if (COLOR_SWATCH === undefined || element === null) return;
    const swatch = document.querySelector(`[data-door="${COLOR_SWATCH.ref}"][data-args='${JSON.stringify({ property })}']`);
    const box = swatch?.getBoundingClientRect();
    const top = box ? Math.max(0, Math.min(box.top, window.innerHeight - element.offsetHeight)) : 0;
    element.style.setProperty('--picker-top', `${top}px`);
  }, [property]);
  return popover;
}

// The picker is modal: while it is open the rest of the window is inert (no pointer, no focus, no assistive
// technology reaches it), as its shield already takes the clicks outside it; the focus goes to the popover.
function useModal(popover: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const shield = popover.current?.parentElement;
    const window = shield?.parentElement;
    if (!shield || !window) return;
    const others = [...window.children].filter((el): el is HTMLElement => el !== shield && el instanceof HTMLElement && !el.inert);
    for (const el of others) el.inert = true;
    popover.current?.focus();
    return () => {
      for (const el of others) el.inert = false;
    };
  }, [popover]);
}

function Picker({ property, previous }: { readonly property: string; readonly previous: string }) {
  const t = useT();
  const format = useEditorState((s) => s.ui.colorPicker?.format ?? 'hsb');
  const primary = useEditorState((s) => s.selection[0] ?? null);
  const stored = useEditorState((s) => {
    const node = styleSource(s);
    return node ? storedValue(node, property, layeredRules(s.ui)) : undefined;
  });
  const properties = useMemo(() => [property], [property]);
  // the page's value too: a named colour the element holds (rebeccapurple) is read as the rgb() the page computes
  const computed = usePageValues(primary, properties)?.[property];
  const current = stored ?? computed ?? '';
  const rgba = parseColor(stored ?? '') ?? parseColor(computed ?? '') ?? BLACK;
  // the colour as it is, outside sRGB too (OKLCH and OKLab show it; the area shows the nearest sRGB colour)
  const exact = parseSrgb(stored ?? '') ?? parseSrgb(computed ?? '');
  const hsb = rgbToHsb(rgba);
  // the hue the area shows: the colour's, else (a grey, black) the one last chosen on the hue slider
  const [chosenHue, setChosenHue] = useState(0);
  const hue = hsb.s > 0 && hsb.v > 0 ? Math.round(hsb.h) : chosenHue;
  // the colour the picker opened with: the element's own, else the one the page shows as it opens (read then, before
  // any part writes)
  const [opened, setOpened] = useState(() => (previous !== '' ? previous : primary === null ? '' : (computedValues(primary, properties)?.[property] ?? current)));
  if (opened === '' && current !== '') setOpened(current);
  const popover = useAnchor(property);
  useModal(popover);
  const write = (entry: DoorEntry | undefined, colour: Rgba) => {
    if (entry !== undefined) run(entry, { property, value: formatColor(colour) });
  };
  const previousPart = partFor('previous-swatch');
  const area = partFor('area');
  const huePart = partFor('hue-slider');
  const alphaPart = partFor('alpha-slider');
  const valuePart = partFor('value-field');
  const channelPart = partFor('channel-field');
  const cancel = partFor('cancel');
  const apply = partFor('apply');
  const withHue = (h: number): Hsba => ({ ...hsb, h });
  const s = Math.round(hsb.s * 100);
  const v = Math.round(hsb.v * 100);
  // the colour Previous writes back: the one the picker opened with, as the picker writes colours
  const openedColour = parseColor(opened);
  const previousValue = openedColour === null ? null : formatColor(openedColour);
  return (
    <div className="picker-shield">
      <div ref={popover} className="picker" role="dialog" aria-modal="true" tabIndex={-1} aria-label={t('colorPicker.title')} data-region="color-picker">
        <div className="picker__header">{t('colorPicker.title')}</div>
        <div className="picker__swatches">
          {previousPart !== undefined ? (
            <button
              type="button"
              className="picker__swatch door"
              data-door={previousPart.ref}
              data-args={JSON.stringify({ property, value: previousValue })}
              title={t('colorPicker.previous')}
              aria-label={t('colorPicker.previous')}
              style={{ '--swatch-colour': opened } as CSSProperties}
              onClick={() => (previousValue !== null ? run(previousPart, { property, value: previousValue }) : undefined)}
            />
          ) : null}
          <span className="picker__swatch" role="img" aria-label={t('colorPicker.current')} title={current} style={{ '--swatch-colour': current } as CSSProperties} />
        </div>
        <Library property={property} current={current} />
        {area !== undefined ? (
          <div
            className="picker__area"
            role="group"
            aria-label={t('colorPicker.area')}
            data-door={area.ref}
            data-args={JSON.stringify({ property })}
            data-color-area=""
            data-hue={hue}
            data-alpha={rgba.a}
            data-property={property}
            style={{ '--picker-area': areaBackground(hue) } as CSSProperties}
          >
            <span className="picker__dot" style={{ '--dot-x': `${s}%`, '--dot-y': `${100 - v}%` } as CSSProperties} />
            <span className="visually-hidden">
              <PickerSlider entry={null} property={property} label={t('colorPicker.saturation')} value={s} max={100} text={`${s}%`} className="" onValue={(n) => write(area, hsbToRgb({ ...withHue(hue), s: n / 100 }))} />
              <PickerSlider entry={null} property={property} label={t('colorPicker.brightness')} value={v} max={100} text={`${v}%`} className="" onValue={(n) => write(area, hsbToRgb({ ...withHue(hue), v: n / 100 }))} />
            </span>
          </div>
        ) : null}
        {huePart !== undefined ? (
          <PickerSlider
            entry={huePart}
            property={property}
            label={t('colorPicker.hue')}
            value={Math.round(hue)}
            max={360}
            text={`${Math.round(hue)}°`}
            className="picker__strip"
            style={{ '--picker-strip': hueBackground() } as CSSProperties}
            onValue={(n) => {
              setChosenHue(n);
              write(huePart, hsbToRgb(withHue(n)));
            }}
          />
        ) : null}
        {alphaPart !== undefined ? (
          <PickerSlider
            entry={alphaPart}
            property={property}
            label={t('colorPicker.alpha')}
            value={Math.round(rgba.a * 100)}
            max={100}
            text={`${Math.round(rgba.a * 100)}%`}
            className="picker__strip picker__strip--alpha"
            style={{ '--picker-strip': alphaBackground(rgba) } as CSSProperties}
            onValue={(n) => write(alphaPart, { ...rgba, a: n / 100 })}
          />
        ) : null}
        {valuePart !== undefined ? <PickerText entry={valuePart} args={{ property }} shown={current} label={t('colorPicker.value')} className="picker__value" keep={(text) => run(valuePart, { property, value: text })} /> : null}
        <span className="segmented segmented--wide" role="group" aria-label={t('command.colorPicker.setFormat')}>
          {FORMATS.map((entry) => (
            <PickerButton key={entry.ref} entry={entry} className="door--segment" />
          ))}
        </span>
        {channelPart !== undefined ? (
          <div className="picker__channels">
            {(FORMAT_CHANNELS[format] ?? []).map((channel) => (
              <PickerText
                key={`${format}-${channel}`}
                entry={channelPart}
                args={{ property, channel }}
                shown={channelText(rgba, channel, exact)}
                label={t(CHANNEL_LABELS[channel])}
                className="picker__channel"
                keep={(text) => run(channelPart, { property, channel, text, base: current })}
              />
            ))}
          </div>
        ) : null}
        {exact !== null && !inSrgbGamut(exact) ? (
          <p className="picker__warning" role="note" data-gamut-warning>
            {t('colorPicker.outOfGamut')}
          </p>
        ) : null}
        <div className="picker__actions">
          {cancel !== undefined ? <PickerButton entry={cancel} className="door--button" /> : null}
          {apply !== undefined ? <PickerButton entry={apply} className="door--primary" /> : null}
        </div>
      </div>
    </div>
  );
}

export function ColorPicker() {
  const open = useEditorState((s) => s.ui.colorPicker);
  if (open === null) return null;
  return <Picker key={open.property} property={open.property} previous={open.previous} />;
}
