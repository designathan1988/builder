// The shadow editor's view (spec shadow-editor): which layer of each shadow (box, text) its fields edit, the row a
// person clicked or the layer just added. View state of the editor's controls, shared by its fields
// (src/editor/shell/shadow.tsx) and the pointer owner's light pad (src/editor/input/pointer.ts); never document state:
// every change of a shadow goes through style.setShadows.
const chosen = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

export const shadowView = {
  layer: (property: string): number => chosen.get(property) ?? 0,
  chooseLayer(property: string, index: number): void {
    if (chosen.get(property) === index) return;
    chosen.set(property, index);
    version += 1;
    for (const listener of [...listeners]) listener();
  },
  version: (): number => version,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
