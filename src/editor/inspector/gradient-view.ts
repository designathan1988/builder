// The gradient editor's view (spec gradient-editor): which stop its fields edit (the stop pressed on the bar, the
// stop a key moved, the stop a click on the bar added) and the angle it keeps for each type while the type is
// switched (Problems in Pager 3: Linear → Radial → Linear gives the linear angle back). View state of the editor's
// controls, shared by its fields (src/editor/shell/gradient.tsx) and the pointer owner's stop drag
// (src/editor/input/pointer.ts); never document state: every change of the gradient goes through
// style.setBackgroundImage.
import type { GradientType } from '../../core/style/gradient.ts';

let stop = 0;
const angles = new Map<GradientType, number>();
const listeners = new Set<() => void>();
const changed = () => {
  for (const listener of [...listeners]) listener();
};

export const gradientView = {
  stop: (): number => stop,
  chooseStop(index: number): void {
    if (index === stop) return;
    stop = index;
    changed();
  },
  // the angle kept for a type, else the one given
  angleFor: (type: GradientType, fallback: number): number => angles.get(type) ?? fallback,
  keepAngle(type: GradientType, angle: number): void {
    if (angles.get(type) === angle) return;
    angles.set(type, angle);
    changed();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
