// The quick panel on the canvas (spec quick-panel; DESIGN.md "Canvas", Quick panel; the rules are
// src/editor/quick-panel/quick-panel.ts): near the primary selected element, over the stage, a chip that opens the
// panel. The panel holds the doors the manifest places in the quick-panel region, in their order: each field is the
// inspector's own field component (field.tsx) on that door, so it runs the same command with the same arguments as
// the matching inspector field and shows the same value; a field shows only when its property applies to the element.
// A door whose feature is not registered as built is drawn disabled, "not available yet" (the feature table). Its grip
// is the drag door of quickPanel.setOffset (the pointer owner runs the drag); More actions opens the element's context
// menu at the button.
//
// Opening the panel with its chip is not a command (DESIGN.md: data-local): the chip's state is this component's.
// Hidden while a drag runs and while a text is edited in place (the text toolbar replaces it).
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { isFeatureBuilt } from '../../app/features.ts';
import { locate, type DocNode } from '../../core/document/model.ts';
import { functionArgument, functionOfControl, functionsOf, translateAxis, translateWith } from '../../core/style/functions.ts';
import type { AttributeId, FeatureId } from '../../generated/ids.ts';
import { manifest, type DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { GLYPHS, doorSlots } from '../doors/placement.ts';
import { drag } from '../input/pointer.ts';
import { appliesTo, offsetOf, placeChip, placeQuickPanel, quickPanelOffsets, type Box, type Offset } from '../quick-panel/quick-panel.ts';
import { TextStyleField, keptByFieldEnter, type FieldPart } from '../shell/field.tsx';
import { EDIT_MODES, modeApplies, modeBuilt, type EditMode } from './edit-mode.ts';
import { MODEL_RULES } from '../store.ts';
import type { MessageId } from '../../generated/ids.ts';
import { KeptTextField, keptTextOf } from '../shell/inspector.tsx';
import { useEditorState } from '../store.ts';
import { useT } from '../text.ts';
import { canvasFrame, nodeBox } from './coordinates.ts';

const REGION = 'quick-panel';
const FIELDS = doorSlots(REGION);
// the grip: the panel drag door of the quick panel's command pressed on it
const GRIP = manifest.doors.find((d) => d.door.kind === 'panel-drag' && d.door.source === 'quick-panel-grip') ?? null;
// the attribute that is an element's HTML tag (elements.json), which the Tag field keeps
const TAG_VALUE = 'tag';
const TAG = (manifest.elements.attributes.find((a) => a.valueType === TAG_VALUE)?.id ?? null) as AttributeId | null;
// the properties drawn as a colour field (a swatch that opens the colour picker)
const COLOUR = new Set(manifest.properties.properties.filter((p) => p.control === 'color-field').map((p) => p.id));
// the inspector's fields of one function of a filter or a transform (filter-blur, transform-skew-x), by their control
const FUNCTION_DOORS = manifest.doors.filter((d) => d.door.kind === 'inspector-field' && d.door.property !== null && d.door.control.startsWith(`${d.door.property}-`) && Object.entries(d.command.args).some(([name, arg]) => name !== 'property' && arg.type === 'json'));
const FUNCTION_CONTROLS = new Set(FUNCTION_DOORS.map((d) => (d.door.kind === 'inspector-field' ? d.door.control : '')));
// the properties whose value is a list of functions those fields edit (filter, transform)
const FUNCTION_PROPERTIES = new Set(FUNCTION_DOORS.map((d) => (d.door.kind === 'inspector-field' ? d.door.property : null)));
const CHIP = { width: 24, height: 24 };

// What an Effects field typed means for style.setFilter's functions: none for nothing, every function typed set and
// every one held but not typed taken away; a text that is no list of functions goes as it is, which the command refuses.
function functionsTyped(text: string, held: string | undefined): unknown {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'none') return 'none';
  const typed = functionsOf(trimmed);
  if (typed === null || typed.length === 0) return trimmed;
  const gone = (functionsOf(held) ?? []).filter((f) => !typed.some((t) => t.name === f.name)).map((f) => [f.name, ''] as const);
  return Object.fromEntries([...gone, ...typed.map((f) => [f.name, f.argument] as const)]);
}

// The part of a value a quick panel field edits, by its control: a translate axis (Move X), one function of a filter
// or a transform (Skew X: the function of the inspector field of the same control), or a filter's whole list
// (Effects); null for a field of the whole value.
function partOf(entry: DoorEntry, property: string): FieldPart | null {
  const control = entry.door.kind === 'quick-panel' ? entry.door.control : '';
  const axis = [`${property}-x`, `${property}-y`].indexOf(control);
  if (axis >= 0 && 'value' in entry.command.args) return { show: (held) => translateAxis(held, axis), args: (text, held) => ({ property, value: translateWith(held, axis, text) }) };
  const list = Object.entries(entry.command.args).find(([name, arg]) => name !== 'property' && arg.type === 'json')?.[0];
  if (list === undefined || !FUNCTION_PROPERTIES.has(property)) return null;
  const inspectorControl = `${property}-${control}`;
  if (FUNCTION_CONTROLS.has(inspectorControl)) {
    const name = functionOfControl(inspectorControl);
    return { show: (held) => functionArgument(held, name), args: (text) => ({ property, [list]: { [name]: text } }) };
  }
  return { show: (held) => held ?? '', args: (text, held) => ({ property, [list]: functionsTyped(text, held) }) };
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
// the Tag field; a door drawn as a button of the panel's bar: a command on the element itself (More actions) or one
// that writes no property (align, distribute, the Edit on canvas modes)
const isTag = (entry: DoorEntry) => TAG !== null && TAG in entry.command.args;
const isAction = (entry: DoorEntry) => !isTag(entry) && (entry.command.args.target?.type === 'node' || entry.door.adapter.writes.length === 0);

// A door whose command takes one choice the door leaves open (Edit on canvas: canvas.setEditMode's mode): a button that
// opens the list of its values, each an item of the door standing for its value, pressed when it is the one in force.
// A value whose handles are not built is not available yet (canvas/edit-mode.ts modeBuilt).
function ChoiceItem({ entry, name, value, node, onDone }: { readonly entry: DoorEntry; readonly name: string; readonly value: EditMode; readonly node: DocNode; readonly onDone: () => void }) {
  const t = useT();
  const args = { [name]: value };
  const door = useDoor(entry, args, t(`canvas.editMode.${value}` as MessageId), isFeatureBuilt(entry.door.feature as FeatureId) && modeBuilt(value));
  // a mode with nothing to edit on the element (a shadow mode on an element with no shadow): disabled, with the reason
  const applies = modeApplies(value, node, MODEL_RULES);
  const available = door.available && applies;
  return (
    <button
      type="button"
      role="option"
      aria-selected={door.current}
      className={`quick-panel__option${available ? '' : ' is-unavailable'}${door.current ? ' is-current' : ''}`}
      data-door={entry.ref}
      data-args={JSON.stringify(args)}
      title={applies ? door.title : t('common.disabledTitle', { label: door.label, reason: { key: 'canvas.editMode.nothingToEdit' } })}
      aria-disabled={available ? undefined : true}
      onClick={() => {
        if (!available) return;
        door.run();
        onDone();
      }}
    >
      {door.label}
    </button>
  );
}
function ChoiceMenu({ entry, name, node }: { readonly entry: DoorEntry; readonly name: string; readonly node: DocNode }) {
  const [open, setOpen] = useState(false);
  const door = useDoor(entry, {}, undefined, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <span className="quick-panel__menu">
      <button
        type="button"
        className={`door door--button${door.available ? '' : ' is-unavailable'}`}
        data-door={entry.ref}
        data-args="{}"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={door.title}
        aria-disabled={door.available ? undefined : true}
        onClick={() => (door.available ? setOpen((was) => !was) : undefined)}
      >
        <span className="door__label">{door.label}</span>
        <Icon name={GLYPHS.dropdown} size="xs" />
      </button>
      {open ? (
        <span className="quick-panel__options" role="listbox" aria-label={door.label}>
          {EDIT_MODES.map((value) => (
            <ChoiceItem key={value} entry={entry} name={name} value={value} node={node} onDone={() => setOpen(false)} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

function QuickField({ entry, node }: { readonly entry: DoorEntry; readonly node: DocNode }) {
  const ready = isFeatureBuilt(entry.door.feature as FeatureId);
  const door = useDoor(entry, {}, undefined, ready);
  const args = entry.command.args;
  const writes = entry.door.adapter.writes;
  // the element's HTML tag, kept with element.setTag, suggesting its equivalent tags (the inspector's Tag field)
  if (TAG !== null && isTag(entry)) {
    const kept = keptTextOf(entry, TAG, TAG_VALUE, node);
    return kept === null ? null : <KeptTextField key={node.id} entry={entry} node={node} kept={kept} label={door.label} />;
  }
  // a command whose one choice the door leaves open: its menu
  const choices = Object.entries(args).filter(([name, arg]) => arg.type === 'enum' && !(name in entry.door.args));
  const [choice] = choices;
  if (choices.length === 1 && choice !== undefined && Object.keys(args).length === 1) return <ChoiceMenu entry={entry} name={choice[0]} node={node} />;
  // a command on the element itself (More actions: its context menu), or one that writes no property: its button
  if (isAction(entry)) return <DoorControl entry={entry} args={args.target?.type === 'node' ? { target: node.id } : {}} ready={ready} className="quick-panel__action" />;
  // a composite of every longhand the door writes (Border): its own command, every side
  const composite = manifest.properties.composites.find((c) => sameList(c.longhands, writes));
  if (composite !== undefined) {
    const side = args.sides?.values[0];
    return <TextStyleField entry={entry} door={door} property={composite.id} longhands={composite.longhands} label={door.label} ownCommand extra={side === undefined ? {} : { sides: side }} />;
  }
  if (!('property' in args)) return null;
  const property = writes[0] ?? '';
  const part = partOf(entry, property);
  if (part !== null) return <TextStyleField entry={entry} door={door} property={property} longhands={null} label={door.label} part={part} />;
  // a command of its own that takes the value (Gradient: style.setBackgroundImage) keeps it with its own form
  return <TextStyleField entry={entry} door={door} property={property} longhands={null} label={door.label} colour={COLOUR.has(property)} ownCommand={!keptByFieldEnter(entry)} />;
}

// The grip: pressed and moved, it drags the panel (the pointer owner runs quickPanel.setOffset from the offset the panel
// is drawn at now); it stands for the element.
function Grip({ entry, node, offset }: { readonly entry: DoorEntry; readonly node: DocNode; readonly offset: Offset | null }) {
  const args = { target: node.id };
  const door = useDoor(entry, args, undefined, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <span
      className={`quick-panel__grip${door.available ? '' : ' is-unavailable'}`}
      data-door={entry.ref}
      data-args={JSON.stringify(args)}
      data-offset={offset === null ? undefined : JSON.stringify(offset)}
      aria-disabled={door.available ? undefined : true}
      role="button"
      tabIndex={-1}
      aria-label={door.label}
      title={door.title}
    >
      <Icon name={GLYPHS.grip} size="sm" />
    </span>
  );
}

interface Placed {
  // the element it was placed for, and whether open: a placing for another element, or the chip's for the panel, is none
  readonly id: string;
  readonly open: boolean;
  readonly box: Box;
  readonly element: Box;
  // the widest the panel may be: the stage less its inset on both sides
  readonly widest: number;
}

const token = (element: Element, name: string) => parseFloat(getComputedStyle(element).getPropertyValue(name)) || 0;

export function QuickPanel({ stage }: { readonly stage: RefObject<HTMLDivElement | null> }) {
  const t = useT();
  const node = useEditorState((s) => {
    const at = s.selection[0] === undefined ? null : locate(s.document, s.selection[0]);
    // the page root has no quick panel
    return at === null || at.parent === null ? null : at.node;
  });
  const editing = useEditorState((s) => s.ui.textEdit.node !== null);
  const offsets = useEditorState((s) => quickPanelOffsets(s.ui));
  const dragging = useSyncExternalStore(drag.subscribe, drag.get);
  const [open, setOpen] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const shown = node !== null && !editing && dragging === null;
  const id = node?.id ?? null;
  const offset: Offset | null = id === null ? null : (offsets[id] ?? null);

  // placed at every frame (the element moves with the page's layout, a scroll, a zoom), set only when it moves
  useEffect(() => {
    if (!shown || id === null) return;
    let request = 0;
    const measure = () => {
      const area = stage.current;
      const frame = canvasFrame();
      const drawn = open ? panel.current : chip.current;
      const box = frame ? nodeBox(frame, id) : null;
      if (area && box && drawn) {
        const origin = area.getBoundingClientRect();
        const element = { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height };
        const size = open ? { width: drawn.offsetWidth, height: drawn.offsetHeight } : CHIP;
        const label = area.querySelector('[data-chrome="label"]:not(.is-measuring)');
        const gap = token(area, '--space-4');
        const spacing = { gap, inset: token(area, '--space-8'), above: label instanceof HTMLElement ? label.offsetHeight + gap : 0 };
        const whole = { x: 0, y: 0, width: origin.width, height: origin.height };
        // the chip beside the selection's label; the open panel where placeQuickPanel puts it
        const at = label?.getBoundingClientRect();
        const beside = !open && at ? placeChip({ x: at.x - origin.x, y: at.y - origin.y, width: at.width, height: at.height }, size, whole, gap) : null;
        // it never covers the selection's rotation handle (spec rotation-handle), which a narrow element's label reaches:
        // it steps past it, to its right
        const handle = area.querySelector('[data-rotate-handle]')?.getBoundingClientRect();
        const turn = handle ? { x: handle.x - origin.x, y: handle.y - origin.y, width: handle.width, height: handle.height } : null;
        const chipBox = beside !== null && turn !== null && beside.x < turn.x + turn.width && turn.x < beside.x + beside.width && beside.y < turn.y + turn.height && turn.y < beside.y + beside.height ? { ...beside, x: turn.x + turn.width + gap } : beside;
        // the chip waits for the label to be placed: until then it is not drawn where it would cover the page
        const next = !open && chipBox === null ? null : { id, open, box: chipBox ?? placeQuickPanel(element, size, whole, spacing, offset), element, widest: Math.max(0, origin.width - 2 * spacing.inset) };
        setPlaced((before) => (JSON.stringify(before) === JSON.stringify(next) ? before : next));
      }
      request = requestAnimationFrame(measure);
    };
    request = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(request);
  }, [shown, id, open, offset, stage]);

  // opened, the focus goes to its first field; closed, back to the chip
  const focusFirst = useRef(false);
  useLayoutEffect(() => {
    if (!focusFirst.current) return;
    focusFirst.current = false;
    if (open) panel.current?.querySelector<HTMLElement>('input:not(:disabled), button:not([aria-disabled="true"])')?.focus();
    else chip.current?.focus();
  }, [open]);
  const toggle = () => {
    focusFirst.current = true;
    setOpen((was) => !was);
  };
  if (!shown || node === null) return null;
  // a placing made for the element and state drawn now
  const current = placed !== null && placed.id === node.id && placed.open === open ? placed : null;
  const at = current === null ? undefined : { left: current.box.x, top: current.box.y };
  const measuring = current === null ? ' is-measuring' : '';
  if (!open) {
    return (
      <button ref={chip} type="button" className={`quick-panel-chip${measuring}`} style={at} data-region={REGION} data-quick-panel-chip aria-expanded={false} aria-label={t('quickPanel.open')} title={t('quickPanel.open')} onClick={toggle}>
        <Icon name={GLYPHS.quickPanel} size="sm" />
      </button>
    );
  }
  const actions = FIELDS.filter(isAction);
  const fields = FIELDS.filter((entry) => !isAction(entry) && (isTag(entry) || appliesTo(entry.door.adapter.writes, node, MODEL_RULES)));
  return (
    <div
      ref={panel}
      className={`quick-panel${measuring}`}
      style={{ ...at, maxWidth: current?.widest }}
      data-region={REGION}
      role="dialog"
      aria-label={t('quickPanel.open')}
    >
      <div className="quick-panel__bar">
        {GRIP !== null ? <Grip entry={GRIP} node={node} offset={current === null ? null : offsetOf(current.box, current.element)} /> : null}
        <div className="quick-panel__actions">
          {actions.map((entry) => (
            <QuickField key={entry.ref} entry={entry} node={node} />
          ))}
        </div>
        <button ref={chip} type="button" className="quick-panel__close" data-quick-panel-chip aria-expanded={true} aria-label={t('quickPanel.open')} title={t('quickPanel.open')} onClick={toggle}>
          <Icon name={GLYPHS.quickPanel} size="sm" />
        </button>
      </div>
      <div className="quick-panel__fields">
        {fields.map((entry) => (
          <QuickField key={entry.ref} entry={entry} node={node} />
        ))}
      </div>
    </div>
  );
}
