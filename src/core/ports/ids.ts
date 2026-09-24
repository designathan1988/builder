// The only source of ids. Everything that creates a node, a page or any other identified thing takes an
// IdGenerator, so tests pass one that counts. A lint rule forbids Math.random and crypto.randomUUID anywhere else.

export interface IdGenerator {
  next(): string;
}

export const randomIds: IdGenerator = {
  next: () => crypto.randomUUID(),
};

// Ids for tests: "<prefix>1", "<prefix>2", …
export function sequentialIds(prefix = 'id'): IdGenerator {
  let n = 0;
  return {
    next: () => `${prefix}${++n}`,
  };
}
