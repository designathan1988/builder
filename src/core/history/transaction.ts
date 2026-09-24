// Transactions: the patches a command applies to the document, their inverses, and the selection before and
// after. Patches follow JSON Patch (RFC 6902) add, remove and replace on a path of keys and indexes; they are
// applied without changing the input (only the objects on the path are copied), and a patch that changes
// nothing is dropped, so a command that changes nothing leaves no patch.
import type { CommandId } from '../../generated/ids.ts';
import type { DocumentJson, Selection } from '../document/model.ts';

export type Path = readonly (string | number)[];
export type Patch =
  | { readonly op: 'add'; readonly path: Path; readonly value: unknown }
  | { readonly op: 'remove'; readonly path: Path }
  | { readonly op: 'replace'; readonly path: Path; readonly value: unknown };

export interface Transaction {
  readonly command: CommandId;
  readonly patches: readonly Patch[];
  // applied in order, they undo the patches (the last patch's inverse first)
  readonly inverses: readonly Patch[];
  readonly selectionBefore: Selection;
  readonly selectionAfter: Selection;
  // when it was recorded (Clock), for coalescing
  readonly at: number;
  // commands that coalesce (manifest history.coalesce) merge with the previous entry of the same key
  readonly coalesceKey: string | null;
}

export class PatchError extends Error {
  override name = 'PatchError';
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return value !== null && typeof value === 'object';
}

function childOf(container: Container, key: string | number): unknown {
  return Array.isArray(container) ? container[Number(key)] : container[String(key)];
}

function copyOf(container: Container): Container {
  return Array.isArray(container) ? [...container] : { ...container };
}

// Defines the key instead of assigning it, so a key such as "__proto__" is an ordinary property.
function setKey(container: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(container, key, { value, writable: true, enumerable: true, configurable: true });
}

// Applies one patch and returns the new root and the patch that undoes it, or null for the inverse when the patch
// changes nothing. Throws PatchError when the path does not fit the document.
function applyOne(root: unknown, patch: Patch): { root: unknown; inverse: Patch | null } {
  const { path } = patch;
  if (path.length === 0) throw new PatchError('a patch never replaces the whole document');
  const parents: Container[] = [];
  let at: unknown = root;
  for (const key of path.slice(0, -1)) {
    if (!isContainer(at)) throw new PatchError(`no container at ${path.join('/')}`);
    parents.push(at);
    at = childOf(at, key);
  }
  if (!isContainer(at)) throw new PatchError(`no container at ${path.join('/')}`);
  const target = at;
  const last = path[path.length - 1] as string | number;
  const next = copyOf(target);
  let inverse: Patch | null;

  if (Array.isArray(next)) {
    const index = Number(last);
    if (!Number.isInteger(index) || index < 0) throw new PatchError(`"${String(last)}" is not an index at ${path.join('/')}`);
    if (patch.op === 'add') {
      if (index > next.length) throw new PatchError(`index ${index} is past the end at ${path.join('/')}`);
      next.splice(index, 0, patch.value);
      inverse = { op: 'remove', path };
    } else {
      if (index >= next.length) throw new PatchError(`no item ${index} at ${path.join('/')}`);
      const old = next[index];
      if (patch.op === 'remove') {
        next.splice(index, 1);
        inverse = { op: 'add', path, value: old };
      } else {
        if (deepEqual(old, patch.value)) return { root, inverse: null };
        next[index] = patch.value;
        inverse = { op: 'replace', path, value: old };
      }
    }
  } else {
    const key = String(last);
    const exists = Object.hasOwn(next, key);
    const old = next[key];
    if (patch.op === 'remove') {
      if (!exists) throw new PatchError(`no key "${key}" at ${path.join('/')}`);
      Reflect.deleteProperty(next, key);
      inverse = { op: 'add', path, value: old };
    } else {
      if (patch.op === 'replace' && !exists) throw new PatchError(`no key "${key}" to replace at ${path.join('/')}`);
      if (exists && deepEqual(old, patch.value)) return { root, inverse: null };
      setKey(next, key, patch.value);
      inverse = exists ? { op: 'replace', path, value: old } : { op: 'remove', path };
    }
  }

  // copy every container on the path, from the target up to the root
  let child: Container = next;
  for (let i = parents.length - 1; i >= 0; i--) {
    const parent = copyOf(parents[i] as Container);
    const key = path[i] as string | number;
    if (Array.isArray(parent)) parent[Number(key)] = child;
    else setKey(parent, String(key), child);
    child = parent;
  }
  return { root: child, inverse };
}

export interface Applied {
  readonly document: DocumentJson;
  // the patches that changed something, in order
  readonly applied: readonly Patch[];
  // their inverses, in the order that undoes them
  readonly inverses: readonly Patch[];
}

export function applyPatches(document: DocumentJson, patches: readonly Patch[]): Applied {
  let root: unknown = document;
  const applied: Patch[] = [];
  const inverses: Patch[] = [];
  for (const patch of patches) {
    const result = applyOne(root, patch);
    if (result.inverse === null) continue;
    root = result.root;
    applied.push(patch);
    inverses.unshift(result.inverse);
  }
  return { document: root as DocumentJson, applied, inverses };
}
