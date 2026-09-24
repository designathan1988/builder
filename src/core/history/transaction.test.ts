import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DocumentJson } from '../document/model.ts';
import { deepFreeze } from '../store/store.ts';
import { PatchError, applyPatches, deepEqual, type Patch, type Path } from './transaction.ts';

// Patches work on any JSON tree; the document is one.
const asDoc = (value: unknown) => value as DocumentJson;

describe('applyPatches', () => {
  const doc = deepFreeze({ a: { list: [1, 2, 3], name: 'x' }, b: null });

  it('adds, removes and replaces by key and by index, and returns the inverses', () => {
    const { document, applied, inverses } = applyPatches(asDoc(doc), [
      { op: 'add', path: ['a', 'list', 1], value: 9 },
      { op: 'replace', path: ['a', 'name'], value: 'y' },
      { op: 'remove', path: ['b'] },
      { op: 'add', path: ['c'], value: { d: true } },
    ]);
    expect(document).toEqual({ a: { list: [1, 9, 2, 3], name: 'y' }, c: { d: true } });
    expect(applied).toHaveLength(4);
    expect(inverses).toEqual([
      { op: 'remove', path: ['c'] },
      { op: 'add', path: ['b'], value: null },
      { op: 'replace', path: ['a', 'name'], value: 'x' },
      { op: 'remove', path: ['a', 'list', 1] },
    ]);
    expect(applyPatches(document, inverses).document).toEqual(doc);
  });

  it('copies only the containers on the path and never changes its input', () => {
    const big = deepFreeze({ left: { deep: { x: 1 } }, right: { deep: { y: 2 } } });
    const { document } = applyPatches(asDoc(big), [{ op: 'replace', path: ['left', 'deep', 'x'], value: 5 }]) as unknown as { document: typeof big };
    expect(big.left.deep.x).toBe(1);
    expect(document.right).toBe(big.right);
    expect(document.left).not.toBe(big.left);
  });

  it('drops a patch that changes nothing, so it leaves no inverse', () => {
    const result = applyPatches(asDoc(doc), [
      { op: 'replace', path: ['a', 'name'], value: 'x' },
      { op: 'replace', path: ['a', 'list'], value: [1, 2, 3] },
      { op: 'add', path: ['b'], value: null },
    ]);
    expect(result.applied).toEqual([]);
    expect(result.inverses).toEqual([]);
    expect(result.document).toBe(doc);
  });

  it('writes a "__proto__" key as an ordinary property, never as the prototype', () => {
    const { document } = applyPatches(asDoc(doc), [{ op: 'add', path: ['__proto__'], value: { polluted: true } }]);
    expect(Object.getPrototypeOf(document)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(document, '__proto__')?.value).toEqual({ polluted: true });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses a path that does not fit the document', () => {
    expect(() => applyPatches(asDoc(doc), [{ op: 'remove', path: ['a', 'missing'] }])).toThrow(PatchError);
    expect(() => applyPatches(asDoc(doc), [{ op: 'replace', path: ['a', 'list', 3], value: 1 }])).toThrow(PatchError);
    expect(() => applyPatches(asDoc(doc), [{ op: 'add', path: ['a', 'list', 5], value: 1 }])).toThrow(PatchError);
    expect(() => applyPatches(asDoc(doc), [{ op: 'add', path: ['a', 'name', 'x'], value: 1 }])).toThrow(PatchError);
    expect(() => applyPatches(asDoc(doc), [{ op: 'replace', path: [], value: 1 }])).toThrow(PatchError);
  });
});

// ---- property: random valid patches on random JSON trees

type Tree = Record<string, unknown> | unknown[];
const containers = (value: unknown, path: Path = []): Path[] => {
  if (value === null || typeof value !== 'object') return [];
  const children = Array.isArray(value) ? value.map((v, i) => containers(v, [...path, i])) : Object.entries(value).map(([k, v]) => containers(v, [...path, k]));
  return [path, ...children.flat()];
};
const at = (root: unknown, path: Path): unknown => path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);

interface Choice {
  pick: number;
  op: number;
  key: string;
  index: number;
  value: unknown;
}

// Turns random choices into patches that fit the tree as it is when each one is applied.
function patchesFor(root: Tree, choices: readonly Choice[]): Patch[] {
  const patches: Patch[] = [];
  let current: unknown = root;
  for (const c of choices) {
    const paths = containers(current);
    const path = paths[c.pick % paths.length] ?? [];
    const target = at(current, path) as Tree;
    let patch: Patch;
    if (Array.isArray(target)) {
      if (c.op === 0 || target.length === 0) patch = { op: 'add', path: [...path, c.index % (target.length + 1)], value: c.value };
      else if (c.op === 1) patch = { op: 'remove', path: [...path, c.index % target.length] };
      else patch = { op: 'replace', path: [...path, c.index % target.length], value: c.value };
    } else {
      const keys = Object.keys(target);
      const existing = keys[c.index % Math.max(keys.length, 1)];
      if (c.op === 0 || existing === undefined) patch = { op: 'add', path: [...path, c.key], value: c.value };
      else if (c.op === 1) patch = { op: 'remove', path: [...path, existing] };
      else patch = { op: 'replace', path: [...path, existing], value: c.value };
    }
    if (patch.path.length === 0) continue;
    current = applyPatches(asDoc(current), [patch]).document;
    patches.push(patch);
  }
  return patches;
}

const json = fc.jsonValue({ maxDepth: 3 }).map((v) => JSON.parse(JSON.stringify(v)) as unknown);
const tree = fc.dictionary(fc.string({ maxLength: 3 }), json, { maxKeys: 4 }).map((d) => deepFreeze(JSON.parse(JSON.stringify(d)) as Tree));
const choices = fc.array(fc.record({ pick: fc.nat(), op: fc.nat({ max: 2 }), key: fc.string({ maxLength: 3 }), index: fc.nat(), value: json }), { maxLength: 12 });

describe('applyPatches, for any valid patches on any JSON tree', () => {
  it('never changes its input, and its inverses restore the input exactly', () => {
    fc.assert(
      fc.property(tree, choices, (root, cs) => {
        const snapshot = JSON.stringify(root);
        const patches = patchesFor(root, cs);
        const result = applyPatches(asDoc(root), patches);
        expect(JSON.stringify(root)).toBe(snapshot);
        expect(result.applied.length).toBeLessThanOrEqual(patches.length);
        const back = applyPatches(result.document, result.inverses).document;
        expect(deepEqual(back, root)).toBe(true);
        // the applied patches alone lead to the same result
        expect(deepEqual(applyPatches(asDoc(root), result.applied).document, result.document)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
