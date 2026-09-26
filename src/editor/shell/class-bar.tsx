// The selector bar's class controls (DESIGN.md "Inspector", Style tab 1; spec shared-style-classes), each a door of the
// inspector-selector-bar region:
//  - the target chips (inspector.setStyleTarget): Element, then each class every selected element lists, the target
//    pressed; each class chip holds its × (classes.detach), which removes the class from the selected elements;
//  - + Class (classes.apply): it opens the list of the project's classes the selected elements do not all list, then a
//    field where a new name is typed; choosing a class, or Enter in the field, applies it;
//  - Save the styles as a class (classes.create): it opens a name field; Enter keeps the name, leaving the field closes it;
//  - below them, while a class is the target, how many elements the edit reaches (".card affects 3 elements").
// The lists and fields are the doors' own popups: opening one is not a command (DESIGN.md "What is not a command").
import { useState, type FormEvent, type ReactNode } from 'react';
import { isFeatureBuilt } from '../../app/features.ts';
import { classesOf, usesOfClass } from '../../core/design/classes.ts';
import { locate } from '../../core/document/model.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { CommandId, FeatureId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { doorSlots, drawnAsOf, partOf } from '../doors/placement.ts';
import { afterGesture } from '../input/pointer.ts';
import { styleClassOf } from '../inspector/style-target.ts';
import { useEditorState, useStore } from '../store.ts';
import { useT } from '../text.ts';

const DOORS = doorSlots('inspector-selector-bar');
// the target chip, the × drawn inside a class chip, + Class and Save the styles as a class (their commands' arguments)
const CHIP = DOORS.find((d) => drawnAsOf(d) === 'item' && 'target' in d.command.args);
const REMOVE = CHIP ? partOf('inspector-selector-bar', CHIP) : null;
const APPLY = DOORS.find((d) => drawnAsOf(d) === 'button' && 'className' in d.command.args);
const SAVE = DOORS.find((d) => drawnAsOf(d) === 'icon-button' && 'name' in d.command.args);
const ELEMENT = 'element';
const CLASS = 'class';
const SEPARATOR = '\n';

const ready = (entry: DoorEntry) => isFeatureBuilt(entry.door.feature as FeatureId);

// the classes every selected element lists, in the first element's order, as one text so the hook's answer is stable
function useSharedClasses(): readonly string[] {
  const text = useEditorState((s) => {
    const nodes = s.selection.map((id) => locate(s.document, id)?.node);
    const first = nodes[0];
    if (first === undefined || nodes.some((n) => n === undefined)) return '';
    return first.classes.filter((c) => nodes.every((n) => n?.classes.includes(c))).join(SEPARATOR);
  });
  return text === '' ? [] : text.split(SEPARATOR);
}

// A command run with a typed argument, once no gesture is open.
function useTyped(entry: DoorEntry | undefined, arg: string): (text: string) => void {
  const store = useStore();
  return (text) => {
    if (entry === undefined) return;
    afterGesture(() => (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, [arg]: text }));
  };
}

export function TargetChips() {
  const t = useT();
  const shared = useSharedClasses();
  const none = useEditorState((s) => s.selection.length === 0);
  if (CHIP === undefined || none) return null;
  return (
    <>
      <DoorControl entry={CHIP} args={{ target: ELEMENT }} label={t('inspector.element')} className="target-chip target-chip--element" ready={ready(CHIP)} />
      {shared.map((name) => (
        <span key={name} className="target-chip-group">
          <DoorControl entry={CHIP} args={{ target: CLASS, className: name }} label={`.${name}`} className="target-chip target-chip--class" ready={ready(CHIP)} />
          {REMOVE !== null ? <DoorControl entry={REMOVE} args={{ className: name }} className="target-chip__remove" ready={ready(REMOVE)} /> : null}
        </span>
      ))}
    </>
  );
}

// + Class: the list of the classes to apply and the field of a new name
export function ApplyClass() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const run = useTyped(APPLY, 'className');
  const shared = useSharedClasses();
  const offered = useEditorState((s) => classesOf(s.document).map((c) => c.name).filter((name) => !shared.includes(name)).join(SEPARATOR));
  const door = useDoor(APPLY ?? (DOORS[0] as DoorEntry), {}, undefined, APPLY !== undefined && ready(APPLY));
  if (APPLY === undefined) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem('name') as HTMLInputElement | null;
    run(field?.value ?? '');
    setOpen(false);
  };
  return (
    <span className="class-popup">
      <button
        type="button"
        className={`door door--button target-chip target-chip--add${door.available ? '' : ' is-unavailable'}`}
        data-door={APPLY.ref}
        data-args="{}"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={door.label}
        title={door.title}
        aria-disabled={door.available ? undefined : true}
        onClick={() => (door.available ? setOpen((was) => !was) : undefined)}
      >
        <span className="door__label">{door.face}</span>
      </button>
      {open ? (
        <span className="class-popup__panel" role="dialog" aria-label={door.label}>
          {offered === ''
            ? null
            : offered.split(SEPARATOR).map((name) => (
                <button key={name} type="button" className="class-popup__item" data-door={APPLY.ref} data-args={JSON.stringify({ className: name })} onClick={() => {
                    run(name);
                    setOpen(false);
                  }}>
                  .{name}
                </button>
              ))}
          <form className="class-popup__form" onSubmit={submit}>
            {/* the field takes the focus as the list opens: the person types a new name at once */}
            <input className="input" name="name" autoFocus spellCheck={false} placeholder={t('inspector.className')} aria-label={t('inspector.className')} data-local="class-name" />
          </form>
        </span>
      ) : null}
    </span>
  );
}

// Save the styles as a class: the name field
export function SaveAsClass() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const run = useTyped(SAVE, 'name');
  const door = useDoor(SAVE ?? (DOORS[0] as DoorEntry), {}, undefined, SAVE !== undefined && ready(SAVE));
  if (SAVE === undefined) return null;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const field = event.currentTarget.elements.namedItem('name') as HTMLInputElement | null;
    run(field?.value ?? '');
    setOpen(false);
  };
  return (
    <span className="class-popup">
      <button
        type="button"
        className={`door door--icon-button${door.available ? '' : ' is-unavailable'}`}
        data-door={SAVE.ref}
        data-args="{}"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={door.label}
        title={door.title}
        aria-disabled={door.available ? undefined : true}
        onClick={() => (door.available ? setOpen((was) => !was) : undefined)}
      >
        {SAVE.door.icon !== null ? <Icon name={SAVE.door.icon} size="md" /> : null}
      </button>
      {open ? (
        <span className="class-popup__panel" role="dialog" aria-label={door.label}>
          <form className="class-popup__form" onSubmit={submit}>
            <input className="input" name="name" autoFocus spellCheck={false} placeholder={t('inspector.className')} aria-label={t('inspector.className')} data-local="class-name" onBlur={() => setOpen(false)} />
          </form>
        </span>
      ) : null}
    </span>
  );
}

// how many elements the class that is the style target reaches; nothing with the Element target
export function Affects() {
  const t = useT();
  const target = useEditorState((s) => styleClassOf(s));
  const count = useEditorState((s) => (target === null ? 0 : usesOfClass(s.document, target)));
  if (target === null) return null;
  const selector = `.${target}`;
  return <div className="affects">{count === 1 ? t('inspector.affects.one', { selector }) : t('inspector.affects.other', { selector, count })}</div>;
}

// the control the selector bar draws for + Class and Save the styles as a class; undefined for any other door
export function classBarControl(entry: DoorEntry): ReactNode | undefined {
  if (entry === APPLY) return <ApplyClass key={entry.ref} />;
  if (entry === SAVE) return <SaveAsClass key={entry.ref} />;
  return undefined;
}
