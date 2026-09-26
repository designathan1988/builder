// The project's variables in the Styles view (DESIGN.md "Regions", styles; spec css-variables-tokens): the design
// tokens grouped by kind (Colours, Sizes, Fonts), each a row of its name field (tokens.rename), its value field
// (tokens.update) and Delete (tokens.delete), under the section's New variable (tokens.create), which opens the list of
// kinds: each item makes a variable of its kind with the next free name (the kind, a dash and a number) and its kind's
// first value. A field keeps its text on Enter or when it is left, as the inspector's text fields do, for the variable
// it was drawn for.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { isFeatureBuilt } from '../../app/features.ts';
import { tokensOf, type Token } from '../../core/design/tokens.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { CommandId, FeatureId, MessageId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { DoorControl, Icon, useDoor } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { afterGesture } from '../input/pointer.ts';
import { useEditorState, useStore } from '../store.ts';
import { useT } from '../text.ts';

const DOORS = doorSlots('styles');
// the doors of the section: New variable (its command takes a kind), a row's name field (a name), value field (a value
// for a token) and Delete (the token alone)
const ADD = DOORS.find((d) => 'kind' in d.command.args);
const RENAME = DOORS.find((d) => 'name' in d.command.args && 'token' in d.command.args);
const UPDATE = DOORS.find((d) => 'value' in d.command.args && 'token' in d.command.args);
const DELETE = DOORS.find((d) => Object.keys(d.command.args).join() === 'token');
// tokens.create's kinds, in their manifest order (a colour, a length, a font size), and a first value for each, the
// value a new variable of the kind starts with, and the words of each kind's group
const KINDS: readonly string[] = ADD?.command.args.kind?.values ?? [];
const FIRST_VALUES: readonly string[] = ['#000000', '16px', '16px'];
const GROUPS: readonly MessageId[] = ['styles.group.colours', 'styles.group.sizes', 'styles.group.fonts'];

// the next free name of a kind: the kind, a dash and the first number no variable has
function nextName(kind: string, tokens: readonly Token[]): string {
  for (let n = 1; ; n += 1) if (!tokens.some((t) => t.name === `${kind}-${n}`)) return `${kind}-${n}`;
}

// An item of New variable's list: it makes a variable of its kind, and the list closes.
function KindItem({ entry, args, label, onDone }: { readonly entry: DoorEntry; readonly args: Readonly<Record<string, string>>; readonly label: string; readonly onDone: () => void }) {
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      className={`variables__kind${door.available ? '' : ' is-unavailable'}`}
      data-door={entry.ref}
      data-args={JSON.stringify(args)}
      title={door.title}
      aria-disabled={door.available ? undefined : true}
      onClick={() => {
        if (!door.available) return;
        door.run();
        onDone();
      }}
    >
      {label}
    </button>
  );
}

function NewVariable({ entry, tokens }: { readonly entry: DoorEntry; readonly tokens: readonly Token[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const door = useDoor(entry, {}, undefined, isFeatureBuilt(entry.door.feature as FeatureId));
  return (
    <span className="variables__new">
      <button
        type="button"
        className={`door door--icon-button${door.available ? '' : ' is-unavailable'}`}
        data-door={entry.ref}
        data-args="{}"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={door.label}
        title={door.title}
        aria-disabled={door.available ? undefined : true}
        onClick={() => (door.available ? setOpen((was) => !was) : undefined)}
      >
        {entry.door.icon !== null ? <Icon name={entry.door.icon} size="md" /> : null}
      </button>
      {open ? (
        <span className="variables__kinds" role="listbox" aria-label={door.label}>
          {KINDS.map((kind, i) => (
            <KindItem key={kind} entry={entry} args={{ kind, name: nextName(kind, tokens), value: FIRST_VALUES[i] ?? '' }} label={t(`styles.newVariable.${kind}` as MessageId)} onDone={() => setOpen(false)} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

// A field of a variable's row: its text kept with its door's command for the variable it was drawn for, on Enter or
// when it is left, whenever it differs from what the variable holds.
function VariableField({ entry, token, filled, held, label }: { readonly entry: DoorEntry; readonly token: string; readonly filled: string; readonly held: string; readonly label: string }) {
  const store = useStore();
  const args = { token };
  const door = useDoor(entry, args, label, isFeatureBuilt(entry.door.feature as FeatureId));
  const input = useRef<HTMLInputElement>(null);
  const said = useEditorState((s) => s.message);
  useEffect(() => {
    if (input.current !== null) input.current.value = held;
  }, [held, said]);
  const keep = () => {
    const text = input.current?.value ?? '';
    if (text === held) return;
    afterGesture(() => (store.dispatch as (id: CommandId, a: unknown) => DispatchResult)(entry.command.id as CommandId, { ...entry.door.args, ...args, [filled]: text }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    keep();
  };
  return (
    <form className={`variables__field${door.available ? '' : ' is-unavailable'}`} data-door={entry.ref} data-args={JSON.stringify(args)} title={door.title} onSubmit={submit}>
      <input ref={input} className="input" aria-label={label} spellCheck={false} disabled={!door.available} onBlur={keep} />
    </form>
  );
}

export function Variables() {
  const t = useT();
  const tokens = useEditorState((s) => tokensOf(s.document));
  return (
    <div className="variables">
      <div className="section-title">
        <span className="section-title__text">{t('panel.variables')}</span>
        <span className="section-title__actions">{ADD !== undefined ? <NewVariable entry={ADD} tokens={tokens} /> : null}</span>
      </div>
      {KINDS.map((kind, i) => {
        const group = tokens.filter((token) => token.kind === kind);
        if (group.length === 0) return null;
        return (
          <div key={kind} className="variables__group" role="group" aria-label={t(GROUPS[i] ?? 'panel.variables')}>
            <div className="variables__group-title">{t(GROUPS[i] ?? 'panel.variables')}</div>
            {group.map((token) => (
              <div key={token.name} className="variables__row">
                {RENAME !== undefined ? <VariableField key={`${token.name}-name`} entry={RENAME} token={token.name} filled="name" held={token.name} label={t('styles.variableName')} /> : null}
                {UPDATE !== undefined ? <VariableField key={`${token.name}-value`} entry={UPDATE} token={token.name} filled="value" held={token.value} label={t('styles.variableValue')} /> : null}
                {DELETE !== undefined ? <DoorControl entry={DELETE} args={{ token: token.name }} ready={isFeatureBuilt(DELETE.door.feature as FeatureId)} /> : null}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

