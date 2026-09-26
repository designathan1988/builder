// The command bar (DESIGN.md `command-palette`; spec command-bar): a search field over the list of the entries the
// command bar offers (command-bar/command-bar.ts), each drawn by its command-bar door, with its shortcut. Its keys are
// the doors of its key context: ArrowDown and ArrowUp move the active entry, Enter runs it (focus.ts: the field is a
// combobox), Escape and a press on the backdrop close it (ui.dismiss). An entry pressed runs its command, then the bar
// closes (the close waits for the entry's own click: closing first took the entry away before it ran).
import { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isFeatureBuilt } from '../../app/features.ts';
import type { CommandId, FeatureId, MessageId } from '../../generated/ids.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import { elementIcon, manifest } from '../../manifest/runtime.ts';
import { BAR_DOORS, entryKey, kindOf, recentEntries, remember, shownEntries, type BarEntry } from '../command-bar/command-bar.ts';
import { labelParamsOf } from '../doors/current.ts';
import { DoorControl, Icon, appliesNow, isDoorBuilt } from '../doors/door.tsx';
import { doorSlots } from '../doors/placement.ts';
import { setActiveOption } from '../focus/focus.ts';
import { chordHint } from '../input/keymap.ts';
import { useEditorState, useStore } from '../store.ts';
import { useT } from '../text.ts';
import { PANELS, panelName, type Panel } from '../workspace/panels.ts';
import { PanelBodies } from './bodies.ts';

const BACKDROP = doorSlots('overlay')[0];
const LIST_ID = 'command-bar-list';
const PALETTE = manifest.elements.palette.flatMap((g) => g.entries);
// the keys of the bar's key context (its shortcut doors), as its hints name them
const KEY_DOORS = manifest.doors.filter((d) => d.door.kind === 'shortcut' && d.door.context === 'command-bar');

export function CommandBar() {
  const open = useEditorState((s) => s.ui.commandBar === true);
  return open ? <CommandBarDialog /> : null;
}

function CommandBarDialog() {
  const t = useT();
  const store = useStore();
  const drawsBody = useContext(PanelBodies);
  // what the field holds: the bar's own view (a filter, not a command), as the Insert panel's search
  const [query, setQuery] = useState('');
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // every entry offered now: a built door that applies to the selection (appliesNow; the bar is modal: nothing
  // changes while it is open)
  const offered = useMemo(() => {
    const state = store.getState();
    const runs = (entry: (typeof BAR_DOORS)[number], args: Readonly<Record<string, unknown>>) => isDoorBuilt(entry) && appliesNow(entry, args, store);
    return BAR_DOORS.flatMap((entry): BarEntry[] => {
      const kind = kindOf(entry);
      if (kind === 'insert') {
        return PALETTE.filter((p) => isFeatureBuilt(p.feature as FeatureId) && runs(entry, { entry: p.id })).map((p) => {
          const args = { entry: p.id };
          return { entry, args, label: t(entry.door.labelKey as MessageId, { element: { key: p.labelKey as MessageId } }), key: entryKey(entry, args) };
        });
      }
      if (kind === 'open-panel') {
        return (Object.keys(PANELS) as Panel[])
          .filter((panel) => drawsBody(panel) && runs(entry, { panel }))
          .map((panel) => {
            const args = { panel };
            return { entry, args, label: t(entry.door.labelKey as MessageId, { panel: { key: panelName(panel) } }), key: entryKey(entry, args) };
          });
      }
      if (!runs(entry, {})) return [];
      return [{ entry, args: {}, label: t(entry.door.labelKey as MessageId, labelParamsOf(entry, state)), key: entryKey(entry, {}) }];
    });
  }, [store, drawsBody, t]);
  const shown = useMemo(() => shownEntries(query, offered, recentEntries()), [query, offered]);

  // the field takes the focus while the bar is open, and gives it back to what had it
  useLayoutEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    field.current?.focus();
    return () => {
      if ((document.activeElement === null || document.activeElement === document.body) && before?.isConnected) before.focus();
    };
  }, []);
  // the first entry shown is the active one after every change of the list
  useLayoutEffect(() => {
    const input = field.current;
    const options = [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])];
    if (input) setActiveOption(input, options, options.length > 0 ? 0 : null);
  }, [shown]);

  // closes the bar once an entry ran
  const close = () => {
    if (BACKDROP) (store.dispatch as (id: CommandId, args: unknown) => DispatchResult)(BACKDROP.command.id, BACKDROP.door.args);
  };
  return (
    <div className="command-bar">
      {BACKDROP ? <DoorControl entry={BACKDROP} className="command-bar__backdrop" /> : null}
      <div className="command-bar__panel" role="dialog" aria-modal="true" aria-label={t('command.commandBar')} data-region="command-palette" data-key-context="command-bar">
        <input
          ref={field}
          className="command-bar__field"
          type="text"
          role="combobox"
          data-key-context="command-bar"
          aria-expanded="true"
          aria-controls={LIST_ID}
          aria-autocomplete="list"
          aria-label={t('command.commandBar')}
          placeholder={t('command.commandBar')}
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <ul className="command-bar__list" role="listbox" id={LIST_ID} ref={list} aria-label={t('command.commandBar')}>
          {shown.map((e, i) => (
            <li key={e.key} id={`${LIST_ID}-${i}`} role="option" aria-selected="false" className="command-bar__option" onClick={() => { remember(e.key); close(); }}>
              <Entry e={e} />
            </li>
          ))}
        </ul>
        <p className="command-bar__hints">
          {KEY_DOORS.map((d) => (
            <span key={d.ref} className="command-bar__key">
              <kbd>{chordHint(d.command.id, 'command-bar')}</kbd> {t(d.door.labelKey as MessageId)}
            </span>
          ))}
          <span className="command-bar__key">
            {t('commandBar.hint.filter')}: {t('commandBar.scope.commands')} · {t('commandBar.scope.insert')} · {t('commandBar.scope.panels')} · {t('commandBar.scope.properties')}
          </span>
        </p>
      </div>
    </div>
  );
}

// an entry's row: its icon (an insert entry's element's), its label and its command's shortcut
function Entry({ e }: { readonly e: BarEntry }) {
  const chord = chordHint(e.entry.command.id);
  const element = kindOf(e.entry) === 'insert' ? PALETTE.find((p) => p.id === e.args.entry)?.element : undefined;
  const icon = element !== undefined ? elementIcon(element) : e.entry.door.icon;
  return (
    <DoorControl entry={e.entry} args={e.args} label={e.label} className="command-bar__entry" tabbable={false}>
      {icon !== null && icon !== undefined ? <Icon name={icon} size="sm" /> : <span className="command-bar__no-icon" />}
      <span className="command-bar__label">{e.label}</span>
      {chord !== null && kindOf(e.entry) === 'command' ? <kbd className="command-bar__chord">{chord}</kbd> : null}
    </DoorControl>
  );
}
