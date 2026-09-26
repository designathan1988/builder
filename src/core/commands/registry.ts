// The command registry: the contract every command meets. The table itself, one entry per command, is
// src/app/commands.ts; its type, CommandTable, has a key for every CommandId of the manifest (generated), so a
// missing or an extra entry is a type error. An entry is the command's handler, registered with registerHandler,
// or NOT_AVAILABLE_YET while its feature is not built: every door of such a command is drawn disabled with
// "not available yet", and dispatching it changes nothing.
import type { CommandArgs } from '../../generated/commands.ts';
import type { ActionId, CommandId, FeatureId, MessageId, PredicateId } from '../../generated/ids.ts';
import type { DocumentJson, Selection } from '../document/model.ts';
import type { ModelRules } from '../document/validate.ts';
import type { Patch } from '../history/transaction.ts';
import type { Clock } from '../ports/clock.ts';
import type { ClipboardWrite } from '../ports/clipboard.ts';
import type { CssSupport } from '../ports/css.ts';
import type { DownloadFile } from '../ports/download.ts';
import type { IdGenerator } from '../ports/ids.ts';
import type { Layout } from '../ports/layout.ts';
import type { StoreState } from '../store/store.ts';

export const NOT_AVAILABLE_YET = Object.freeze({ notAvailableYet: true as const });
export type NotAvailableYet = typeof NOT_AVAILABLE_YET;

// A parameter of a message is plain text, a number, or another catalogue key, translated when the message is shown
// (so "{panel} opened." names the panel in the language the person reads it in).
// a value, a text of the catalogue, a whole message (the action an undo names: history.ts), or a count in words: the
// catalogue key whose plural forms (.one, .other) the count takes in the language shown ("1 element", "3 elements";
// the audit's A3.23), chosen when the message is shown
export type PluralBase = MessageId extends infer M ? (M extends `${infer Base}.one` ? Base : never) : never;
export type MessageParam = string | number | { readonly key: MessageId; readonly params?: Readonly<Record<string, MessageParam>> } | { readonly plural: PluralBase; readonly count: number };

export interface Message {
  readonly key: MessageId;
  readonly params: Readonly<Record<string, MessageParam>>;
}

export function message(key: MessageId, params: Readonly<Record<string, MessageParam>> = {}): Message {
  return { key, params };
}

// What a handler asks of the store. A handler never changes state itself.
export type Outcome<Ui> =
  // patches to the document (one transaction), the selection after them, the editor state after them, a message,
  // and a file for the person (the store hands it to the download port once the command has run)
  | { readonly kind: 'change'; readonly patches?: readonly Patch[]; readonly selection?: Selection; readonly ui?: Ui; readonly message?: Message; readonly download?: DownloadFile; readonly clipboard?: ClipboardWrite; readonly editing?: 'take-over' }
  // the command cannot run now: nothing changes and the status bar says why
  | { readonly kind: 'refused'; readonly message: Message }
  // history.undo and history.redo: the store walks its history
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  // project.open: another project replaces the document; the selection and the history start empty
  | { readonly kind: 'load'; readonly document: DocumentJson; readonly message?: Message }
  // the person is asked first (a command whose manifest entry has a confirmation): the store holds the dispatch
  // until the answer, and runs it again with `confirmed` once the person confirms
  | { readonly kind: 'confirm' };

export interface HandlerContext<Ui> {
  readonly state: StoreState<Ui>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  // the model a document must satisfy (validate.ts), for a handler that reads a whole document (File › Open) or
  // creates an element (element.insert)
  readonly rules: ModelRules;
  // a catalogue text in the language the person reads the editor in: the words a new node is named and filled with
  words(key: MessageId): string;
  // where the canvas draws the nodes of the page it shows, for a handler that acts on what a gesture covers (the marquee)
  readonly layout: Layout;
  // whether the browser takes a value for a property, for a handler that writes a value a person typed (style.set)
  readonly css: CssSupport;
  // the class the editor makes the style target (spec shared-style-classes), whose styles a style write goes to while
  // every selected element lists it (core/design/classes.ts targetClass); none when absent: the elements themselves
  readonly styleClass?: string | null;
  // whether the person confirmed this run, answering the confirmation the command asked (outcome `confirm`); absent
  // (a context built outside the store, a unit test's) is not confirmed
  readonly confirmed?: boolean;
  // a saved version's document by its revision, as autosave kept it (spec autosave-corruption-recovery); undefined when
  // there is no such version or no store of versions
  version?(revision: string): unknown;
}

export interface RegisteredHandler<Id extends CommandId, Ui> {
  readonly command: Id;
  // A method, so a core handler written for any editor state (Ui = never) fits every table.
  run(context: HandlerContext<Ui>, args: CommandArgs[Id]): Outcome<Ui>;
  // Whether a door with these arguments stands for the state the store holds now (a checked theme, a pressed panel
  // toggle); a command whose doors stand for no state has none. The command's owner knows it, beside its handler, and
  // may read the model's rules for it (the alignment matrix: the composite it writes).
  current?(state: StoreState<Ui>, args: Readonly<Record<string, unknown>>, rules?: ModelRules): boolean;
  // The words a door's label fills in for the state the store holds now ("Create {tag} inside": the tag of the
  // selected element's natural child); a command whose label fills in nothing has none.
  labelParams?(state: StoreState<Ui>, rules: ModelRules): Readonly<Record<string, string>>;
}

// manifest:check reads `registerHandler('<id>'` to mark the id registered in references.json.
export function registerHandler<Id extends CommandId, Ui = never>(
  command: Id,
  run: (context: HandlerContext<Ui>, args: CommandArgs[Id]) => Outcome<Ui>,
  current?: (state: StoreState<Ui>, args: Readonly<Record<string, unknown>>, rules?: ModelRules) => boolean,
): RegisteredHandler<Id, Ui> {
  return current === undefined ? { command, run } : { command, run, current };
}

export type CommandEntry<Id extends CommandId, Ui> = RegisteredHandler<Id, Ui> | NotAvailableYet;
export type CommandTable<Ui> = { readonly [Id in CommandId]: CommandEntry<Id, Ui> };

export function isBuilt<Id extends CommandId, Ui>(entry: CommandEntry<Id, Ui>): entry is RegisteredHandler<Id, Ui> {
  return entry !== NOT_AVAILABLE_YET;
}

// The feature table (src/app/features.ts) has the same design: an entry for every FeatureId of the manifest, the
// feature registered with registerFeature once it is built, or NOT_AVAILABLE_YET. A door, and a control that stands
// for an item a feature brings (a palette entry), is usable only while its feature is registered (DESIGN.md "Build
// order"); the census fails a registered feature with no scenario, or one of whose scenarios cannot run or fails.
export interface RegisteredFeature<Id extends FeatureId> {
  readonly feature: Id;
}

export function registerFeature<Id extends FeatureId>(feature: Id): RegisteredFeature<Id> {
  return Object.freeze({ feature });
}

export type FeatureEntry<Id extends FeatureId> = RegisteredFeature<Id> | NotAvailableYet;
export type FeatureTable = { readonly [Id in FeatureId]: FeatureEntry<Id> };

export function isRegistered<Id extends FeatureId>(entry: FeatureEntry<Id>): entry is RegisteredFeature<Id> {
  return entry !== NOT_AVAILABLE_YET;
}

// An availability predicate (a command's availability.predicate in the manifest). When it fails, the status bar says
// the command's refusalKey; a predicate that knows the words of its refusal ("{name} has no text to edit.") or which
// of the command's declared refusals applies says so with `refusal` (the store accepts only the command's
// refusalKey or one of its manifest refusals).
// It reads the state and the model's rules (what an element type may hold: a container, a leaf).
export interface RegisteredPredicate<Ui> {
  readonly id: PredicateId;
  test(state: StoreState<Ui>, rules: ModelRules): boolean;
  refusal?(state: StoreState<Ui>, rules: ModelRules): Message;
}

// manifest:check reads `registerPredicate('<id>'` to mark the id registered in references.json.
export function registerPredicate<Ui = never>(
  id: PredicateId,
  test: (state: StoreState<Ui>, rules: ModelRules) => boolean,
  refusal?: (state: StoreState<Ui>, rules: ModelRules) => Message,
): RegisteredPredicate<Ui> {
  return refusal === undefined ? { id, test } : { id, test, refusal };
}

export type PredicateTable<Ui> = { readonly [Id in PredicateId]?: RegisteredPredicate<Ui> };

// The predicate of every command that is always available.
export const always = registerPredicate('always', () => true);

// A coupling's condition (properties.json couplings[].condition.predicate, a closed list): whether it holds for the
// value the element holds for the condition's property and the one its parent holds (undefined: none of its own).
// manifest:check reads `registerCondition('<id>'` as a predicate registered.
export interface RegisteredCondition {
  readonly id: PredicateId;
  holds(own: string | undefined, parent: string | undefined, values: readonly string[]): boolean;
}
export function registerCondition(id: PredicateId, holds: RegisteredCondition['holds']): RegisteredCondition {
  return Object.freeze({ id, holds });
}

// A coupling's action (properties.json couplings[].effect.action, a closed list): what it does to the declarations a
// write of the element is about to make (property → CSS text), given the trigger's property and the effect's.
// manifest:check reads `registerAction('<id>'`.
export interface RegisteredAction {
  readonly id: ActionId;
  apply(values: Record<string, string>, trigger: string, effect: { readonly property: string; readonly value: string | null }, scene: CouplingScene): void;
}
// What an action sees besides the element's declarations: the declarations the write makes of the element's parent
// (setParentValue fills them in), and where the element lies now (keepVisualPlace): its margin edge from its parent's
// padding edge, or from the viewport, in page px; null when nothing measures the page.
export interface CouplingScene {
  readonly parent: Record<string, string>;
  place(within: 'parent' | 'viewport'): { readonly left: number; readonly top: number } | null;
}
export function registerAction(id: ActionId, apply: RegisteredAction['apply']): RegisteredAction {
  return Object.freeze({ id, apply });
}
