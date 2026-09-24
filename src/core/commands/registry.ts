// The command registry: the contract every command meets. The table itself, one entry per command, is
// src/app/commands.ts; its type, CommandTable, has a key for every CommandId of the manifest (generated), so a
// missing or an extra entry is a type error. An entry is the command's handler, registered with registerHandler,
// or NOT_AVAILABLE_YET while its feature is not built: every door of such a command is drawn disabled with
// "not available yet", and dispatching it changes nothing.
import type { CommandArgs } from '../../generated/commands.ts';
import type { CommandId, MessageId, PredicateId } from '../../generated/ids.ts';
import type { Selection } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import type { Clock } from '../ports/clock.ts';
import type { IdGenerator } from '../ports/ids.ts';
import type { StoreState } from '../store/store.ts';

export const NOT_AVAILABLE_YET = Object.freeze({ notAvailableYet: true as const });
export type NotAvailableYet = typeof NOT_AVAILABLE_YET;

// A parameter of a message is plain text, a number, or another catalogue key, translated when the message is shown
// (so "{panel} opened." names the panel in the language the person reads it in).
export type MessageParam = string | number | { readonly key: MessageId };

export interface Message {
  readonly key: MessageId;
  readonly params: Readonly<Record<string, MessageParam>>;
}

export function message(key: MessageId, params: Readonly<Record<string, MessageParam>> = {}): Message {
  return { key, params };
}

// What a handler asks of the store. A handler never changes state itself.
export type Outcome<Ui> =
  // patches to the document (one transaction), the selection after them, the editor state after them, a message
  | { readonly kind: 'change'; readonly patches?: readonly Patch[]; readonly selection?: Selection; readonly ui?: Ui; readonly message?: Message }
  // the command cannot run now: nothing changes and the status bar says why
  | { readonly kind: 'refused'; readonly message: Message }
  // history.undo and history.redo: the store walks its history
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' };

export interface HandlerContext<Ui> {
  readonly state: StoreState<Ui>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export interface RegisteredHandler<Id extends CommandId, Ui> {
  readonly command: Id;
  // A method, so a core handler written for any editor state (Ui = never) fits every table.
  run(context: HandlerContext<Ui>, args: CommandArgs[Id]): Outcome<Ui>;
}

// manifest:check reads `registerHandler('<id>'` to mark the id registered in references.json.
export function registerHandler<Id extends CommandId, Ui = never>(command: Id, run: (context: HandlerContext<Ui>, args: CommandArgs[Id]) => Outcome<Ui>): RegisteredHandler<Id, Ui> {
  return { command, run };
}

export type CommandEntry<Id extends CommandId, Ui> = RegisteredHandler<Id, Ui> | NotAvailableYet;
export type CommandTable<Ui> = { readonly [Id in CommandId]: CommandEntry<Id, Ui> };

export function isBuilt<Id extends CommandId, Ui>(entry: CommandEntry<Id, Ui>): entry is RegisteredHandler<Id, Ui> {
  return entry !== NOT_AVAILABLE_YET;
}

// An availability predicate (a command's availability.predicate in the manifest).
export interface RegisteredPredicate<Ui> {
  readonly id: PredicateId;
  test(state: StoreState<Ui>): boolean;
}

// manifest:check reads `registerPredicate('<id>'` to mark the id registered in references.json.
export function registerPredicate<Ui = never>(id: PredicateId, test: (state: StoreState<Ui>) => boolean): RegisteredPredicate<Ui> {
  return { id, test };
}

export type PredicateTable<Ui> = { readonly [Id in PredicateId]?: RegisteredPredicate<Ui> };

// The predicate of every command that is always available.
export const always = registerPredicate('always', () => true);
