// Door rendering (ARCHITECTURE.md): one door of the manifest drawn as the control its drawnAs names, with the icon
// the manifest names, its label from the catalogue, its shortcut as a hint, and disabled with "not available yet"
// while its command's entry in the command table is NOT_AVAILABLE_YET. Every icon comes from the sprite by a name
// the manifest gives (a door's icon, a glyph, a panel, an element); no component chooses one.
import { useContext, type MouseEvent, type ReactNode } from 'react';
import { COMMANDS, PREDICATES } from '../../app/commands.ts';
import { isBuilt, type PredicateTable } from '../../core/commands/registry.ts';
import { projectFileText } from '../../core/project/archive.ts';
import type { DispatchResult } from '../../core/store/store.ts';
import type { CommandId, KeyContextId, MessageId, PredicateId } from '../../generated/ids.ts';
import type { DoorEntry } from '../../manifest/runtime.ts';
import { chordHint } from '../input/keymap.ts';
import { pressedByPointer } from '../input/pointer.ts';
import type { EditorUi } from '../state.ts';
import { MODEL_RULES, useEditorState, useStore } from '../store.ts';
import { PanelBodies } from '../shell/bodies.ts';
import { useT } from '../text.ts';
import { opensEmptyPanel } from '../workspace/panels.ts';
import { readClipboard } from '../clipboard.ts';
import { isCurrent, labelParamsOf } from './current.ts';
import { GLYPHS } from './placement.ts';

export function Icon({ name, size = 'md' }: { readonly name: string; readonly size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  return (
    <svg className={`icon icon--${size}`} aria-hidden="true" focusable="false">
      <use href={`#${name}`} />
    </svg>
  );
}

export function isDoorBuilt(entry: DoorEntry): boolean {
  return isBuilt(COMMANDS[entry.command.id]);
}

export interface DoorState {
  // the accessible name and the tooltip's text
  readonly label: string;
  // the text the control shows: the door's face label when the drawing shows a shorter text ("+ Class"), else the label
  readonly face: string;
  readonly title: string;
  readonly built: boolean;
  // built and its availability predicate holds now (Undo with an empty history does not)
  readonly available: boolean;
  readonly current: boolean;
  readonly chord: string | null;
  // why the control is disabled: "not available yet" while its command is not built (DESIGN.md "Build order"), then
  // the door's own reason (disabledReasonKey) while its predicate does not hold; null when it is enabled
  readonly reason: MessageId | null;
  readonly run: () => void;
}

// What every control of a door needs: its label, its tooltip (with the shortcut, or why it is disabled), whether its
// command is built, whether it stands for the current state, and running it through the store. A control that
// stands for one property, attribute or palette entry is labelled by it (the door's own label names the command
// with placeholders: "Set {property} to {value}"), so the caller passes that label. A control whose item a later
// feature brings (`ready` false: a palette entry whose feature the feature table does not register as built,
// src/app/features.ts) is not available yet either. The shortcut
// shown is the command's key in the context the control acts in (`keysIn`: the canvas's for the context menu).
export function useDoor(entry: DoorEntry, args: Readonly<Record<string, unknown>> = {}, labelled?: string, ready = true, keysIn: KeyContextId = 'global'): DoorState {
  const t = useT();
  const store = useStore();
  // a door whose only effect is to open a panel the shell draws no body for is not available yet, like an unbuilt command
  const drawsBody = useContext(PanelBodies);
  const built = ready && isDoorBuilt(entry) && !opensEmptyPanel({ ...entry.door.args, ...args }, drawsBody);
  const current = useEditorState((s) => built && isCurrent(entry, s, args));
  const available = useEditorState((s) => built && ((PREDICATES as PredicateTable<EditorUi>)[entry.command.availability.predicate as PredicateId]?.test(s, MODEL_RULES) ?? true));
  // the words the label fills in for the state now (the command's labelParams), as one JSON text so the hook's value
  // is stable between renders
  const params = useEditorState((s) => (built ? JSON.stringify(labelParamsOf(entry, s)) : '{}'));
  const label = labelled ?? t(entry.door.labelKey as MessageId, JSON.parse(params) as Record<string, string>);
  const face = labelled === undefined && entry.door.faceLabelKey !== null ? t(entry.door.faceLabelKey as MessageId) : label;
  const chord = chordHint(entry.command.id, keysIn);
  const reason: MessageId | null = !built ? 'common.notAvailableYet' : available ? null : (entry.door.disabledReasonKey as MessageId);
  const title = reason !== null ? t('common.disabledTitle', { label, reason: { key: reason } }) : chord !== null ? t('common.withShortcut', { label, shortcut: chord }) : label;
  const run = () => {
    if (!built || !available) return;
    const dispatch = store.dispatch as (id: CommandId, args: unknown) => DispatchResult;
    const given = { ...entry.door.args, ...args };
    // a command that reads a file (File › Open) asks the browser for it, and runs with the file's text
    const file = Object.entries(entry.command.args).find(([name, arg]) => arg.type === 'file' && !arg.optional && !(name in given))?.[0];
    // a command that takes what the system clipboard holds (clipboard.paste) runs once the clipboard is read
    const clipboard = Object.entries(entry.command.args).find(([name, arg]) => arg.type === 'clipboard' && !(name in given))?.[0];
    if (clipboard !== undefined) {
      void readClipboard().then((content) => dispatch(entry.command.id, { ...given, [clipboard]: content }));
      return;
    }
    if (file === undefined) {
      dispatch(entry.command.id, given);
      return;
    }
    // the file's text as the project reader takes it (archive.ts): a project archive's project.json, or the file's own
    // text (File › Open is the one command that takes a file)
    void chooseFile().then(async (bytes) => {
      if (bytes !== null) dispatch(entry.command.id, { ...given, [file]: await projectFileText(bytes) });
    });
  };
  return { label, face, title, built, available, current, chord, reason, run };
}

// The browser's file chooser, as a user opens it; the chosen file's text, or null when nothing was chosen.
function chooseFile(): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', () => {
      const chosen = input.files?.[0];
      if (chosen) void chosen.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), () => resolve(null));
      else resolve(null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export interface DoorControlProps {
  readonly entry: DoorEntry;
  // arguments the context adds (the panel a close button belongs to, the page a row stands for)
  readonly args?: Readonly<Record<string, unknown>>;
  // the content of an item, a tab or a disclosure (a row's name, a tab's width); the label when absent; null for a
  // disclosure drawn as its caret alone
  readonly children?: ReactNode;
  // a disclosure's state
  readonly expanded?: boolean;
  readonly className?: string;
  // the label of what the control stands for (a palette entry), instead of the door's own
  readonly label?: string;
  // false while what the control stands for arrives with a feature not registered as built (a palette entry's)
  readonly ready?: boolean;
  // the key context the control acts in, whose shortcut its title shows (the text toolbar's: the text editing keys)
  readonly keysIn?: KeyContextId;
  // false: out of the Tab order (a field's Reset this value while the field holds nothing to reset)
  readonly tabbable?: boolean;
}

// A toolbar or panel control, drawn as its door's drawnAs says.
export function DoorControl({ entry, args = {}, children, expanded, className, label, ready = true, keysIn = 'global', tabbable = true }: DoorControlProps) {
  const door = useDoor(entry, args, label, ready, keysIn);
  const { door: d } = entry;
  const pointerRuns = pressedByPointer(entry);
  const drawnAs = d.kind === 'toolbar' || d.kind === 'panel-control' ? d.drawnAs : 'button';
  // a toggle button says whether its state is on (the door's pressed, manifest data)
  const pressed = (d.kind === 'toolbar' || d.kind === 'panel-control') && d.pressed;
  const icon = d.icon !== null ? <Icon name={d.icon} size={drawnAs === 'icon-button' ? 'md' : 'sm'} /> : null;
  const common = {
    type: 'button' as const,
    className: ['door', `door--${drawnAs}`, door.current ? 'is-current' : '', door.available ? '' : 'is-unavailable', className ?? ''].filter((c) => c !== '').join(' '),
    'data-door': entry.ref,
    // what this control stands for when its door is drawn once per item (a node's row, a palette entry's tile): the
    // keys a shortcut of the same command acts on while it has the focus
    'data-args': Object.keys(args).length > 0 ? JSON.stringify(args) : undefined,
    title: door.title,
    tabIndex: tabbable ? undefined : -1,
    'aria-disabled': door.available ? undefined : true,
    // a control whose presses the pointer owner runs (a palette tile: a press is its click or its drag, pointer.ts)
    // runs here only an activation with no press (detail 0: assistive technology's)
    onClick: pointerRuns ? (event: MouseEvent) => (event.detail === 0 ? door.run() : undefined) : door.run,
  };
  switch (drawnAs) {
    case 'icon-button':
      return (
        <button {...common} aria-label={door.label} aria-pressed={pressed ? door.current : undefined}>
          {icon}
        </button>
      );
    case 'tab':
      return (
        <button {...common} role="tab" aria-selected={door.current} aria-label={door.face !== door.label ? door.label : undefined}>
          {icon}
          {children ?? <span className="door__label">{door.face}</span>}
        </button>
      );
    case 'segment':
      return (
        <button {...common} aria-pressed={door.current} aria-label={door.label}>
          {icon}
          {children ?? <span className="door__label">{door.face}</span>}
        </button>
      );
    case 'disclosure':
      // children null: the caret alone (a tree row's), named by its label
      return (
        <button {...common} aria-expanded={expanded ?? true} aria-label={children === null ? door.label : undefined}>
          <Icon name={expanded === false ? GLYPHS.collapsed : GLYPHS.expanded} size="xs" />
          {children === undefined ? <span className="door__label">{door.face}</span> : children}
        </button>
      );
    case 'area':
      // part of a larger surface (a backdrop, a ruler): no text of its own, named by its label, out of the Tab order
      return <button {...common} aria-label={door.label} tabIndex={-1} />;
    default:
      return (
        <button {...common} aria-label={children !== undefined || door.face !== door.label ? door.label : undefined} aria-pressed={pressed ? door.current : undefined}>
          {icon}
          {children ?? <span className="door__label">{door.face}</span>}
        </button>
      );
  }
}
