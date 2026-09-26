// The rulers' marks (ARCHITECTURE.md; spec rulers): page CSS px with 0 at the page's top-left corner (negative before
// it). Labels sit on round values (interactions.json rulers.steps) chosen so that neighbouring labels are at least
// rulers.minLabelSpacing screen px apart at the zoom; minor ticks on the smallest round step dividing the label step
// whose screen size is at least rulers.minTick. From what the canvas measures (each band's place on the screen, the
// page's origin there, the zoom, the primary selection's box and the pointer), rulerMarks gives every mark's place
// along each band; the rulers (rulers.tsx) draw them.
import { manifest } from '../../manifest/runtime.ts';

function constant(id: string): unknown {
  const value = manifest.interactions.constants.find((c) => c.id === id)?.value;
  if (value === undefined) throw new Error(`interactions.json has no ${id}`);
  return value;
}
const STEPS = constant('rulers.steps') as readonly number[];
const MIN_TICK = constant('rulers.minTick') as number;
const MIN_LABEL_SPACING = constant('rulers.minLabelSpacing') as number;

// the label step and the tick step at a zoom: the smallest round step whose labels are far enough apart (the largest
// one, times ten as often as needed, when no listed step is), and the smallest round step dividing it whose ticks are
export function rulerSteps(zoom: number): { readonly label: number; readonly tick: number } {
  let label = STEPS.find((s) => s * zoom >= MIN_LABEL_SPACING);
  if (label === undefined) {
    label = STEPS[STEPS.length - 1] ?? 1000;
    while (label * zoom < MIN_LABEL_SPACING) label *= 10;
  }
  const tick = STEPS.find((s) => label % s === 0 && s * zoom >= MIN_TICK) ?? label;
  return { label, tick };
}

export interface RulerMeasure {
  // each band's start and length on the screen, the page's origin on the screen, the zoom
  readonly x: { readonly start: number; readonly length: number };
  readonly y: { readonly start: number; readonly length: number };
  readonly origin: { readonly x: number; readonly y: number };
  readonly zoom: number;
  // the primary selected element's box and the pointer, on the screen; null without them
  readonly selected: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly pointer: { readonly x: number; readonly y: number } | null;
}

export interface Band {
  // the ticks (page value and place along the band, whether it is labelled) and the labels
  readonly ticks: readonly { readonly value: number; readonly at: number; readonly major: boolean }[];
  readonly labels: readonly { readonly value: number; readonly at: number }[];
  // the selection's extent along the band, and the pointer's place
  readonly selection: { readonly at: number; readonly length: number } | null;
  readonly pointer: number | null;
}

// every mark's place along each band, in the band's px
export function rulerMarks(m: RulerMeasure): { readonly x: Band; readonly y: Band } {
  const steps = rulerSteps(m.zoom);
  const band = (axis: 'x' | 'y'): Band => {
    const span = m[axis];
    const at = (value: number) => m.origin[axis] - span.start + value * m.zoom;
    const from = (span.start - m.origin[axis]) / m.zoom;
    const to = (span.start + span.length - m.origin[axis]) / m.zoom;
    const values = (step: number) => {
      const out: number[] = [];
      for (let v = Math.ceil(from / step) * step; v <= to; v += step) out.push(v);
      return out;
    };
    const box = m.selected;
    return {
      ticks: values(steps.tick).map((value) => ({ value, at: at(value), major: value % steps.label === 0 })),
      labels: values(steps.label).map((value) => ({ value, at: at(value) })),
      selection: box === null ? null : axis === 'x' ? { at: box.x - span.start, length: box.width } : { at: box.y - span.start, length: box.height },
      pointer: m.pointer === null ? null : m.pointer[axis] - span.start,
    };
  };
  return { x: band('x'), y: band('y') };
}
