// The typed field of a spacing band (canvas/edit-handles.tsx): the band a click without a drag opened it on (the
// pointer owner opens it, pointer.ts), numbered so each opening draws a new field. Editor state of the canvas chrome,
// never the document's.
export interface TypedBand {
  readonly ref: string;
  readonly count: number;
}
let open: TypedBand | null = null;
let count = 0;
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of [...listeners]) listener();
};
export const typedBand = {
  get: (): TypedBand | null => open,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  open(ref: string): void {
    count += 1;
    open = { ref, count };
    tell();
  },
  close(): void {
    if (open === null) return;
    open = null;
    tell();
  },
};
