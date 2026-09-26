// Gradients (ARCHITECTURE.md; spec gradient-editor): the one reader and writer of the gradient a background image
// holds, and of the edits the gradient editor makes to it. A gradient is its type (linear, radial, conic), its angle
// (linear and conic) and its stops (a colour at a position from 0 to 100 %), written as CSS text into background-image
// only, never the background shorthand (Problems in Pager 1). style.setBackgroundImage applies an edit to the gradient
// the element holds through `editedGradient`.
import { formatColor, parseColor } from './color.ts';

export type GradientType = 'linear' | 'radial' | 'conic';
export interface GradientStop {
  readonly color: string;
  readonly position: number;
}
export interface Gradient {
  readonly type: GradientType;
  readonly angle: number;
  readonly stops: readonly GradientStop[];
}

// the gradient Add a gradient writes (spec, "Trigger")
export const DEFAULT_GRADIENT: Gradient = {
  type: 'linear',
  angle: 135,
  stops: [
    { color: '#4f46e5', position: 0 },
    { color: '#22d3ee', position: 100 },
  ],
};
// at least two stops (spec, "Hit zones": removeStop refuses below)
export const MIN_STOPS = 2;

// the pieces of a text between commas outside parentheses
function pieces(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let piece = '';
  for (const c of text) {
    if (c === '(') depth += 1;
    if (c === ')') depth -= 1;
    if (c === ',' && depth === 0) {
      out.push(piece.trim());
      piece = '';
    } else piece += c;
  }
  out.push(piece.trim());
  return out;
}

const round = (n: number): number => Math.round(n * 100) / 100;
const clampPercent = (n: number): number => Math.min(100, Math.max(0, n));

// the gradient a background image holds, or null for one that is no gradient this editor writes
export function parseGradient(text: string | undefined): Gradient | null {
  const call = /^\s*(linear|radial|conic)-gradient\((.*)\)\s*$/is.exec(text ?? '');
  if (call === null) return null;
  const type = (call[1] ?? '').toLowerCase() as GradientType;
  const parts = pieces(call[2] ?? '');
  let angle = type === 'conic' ? 180 : 180;
  const head = parts[0] ?? '';
  const turned = type === 'linear' ? /^(-?\d+(?:\.\d+)?)deg$/i.exec(head) : type === 'conic' ? /^from\s+(-?\d+(?:\.\d+)?)deg\b/i.exec(head) : null;
  const shaped = type === 'radial' && /^(circle|ellipse)\b/i.test(head);
  if (turned !== null) angle = Number(turned[1]);
  const stopTexts = turned !== null || shaped || (type === 'conic' && /^(from|at)\b/i.test(head)) ? parts.slice(1) : parts;
  const stops: GradientStop[] = [];
  for (const [i, stop] of stopTexts.entries()) {
    const at = /^(.*\S)\s+(-?\d+(?:\.\d+)?)%$/.exec(stop);
    const color = at === null ? stop : (at[1] ?? '');
    const position = at === null ? (stopTexts.length === 1 ? 0 : (i / (stopTexts.length - 1)) * 100) : Number(at[2]);
    if (color === '') return null;
    stops.push({ color, position });
  }
  return stops.length >= MIN_STOPS ? { type, angle, stops } : null;
}

export function writeGradient({ type, angle, stops }: Gradient): string {
  const list = stops.map((s) => `${s.color} ${round(s.position)}%`).join(', ');
  if (type === 'radial') return `radial-gradient(circle at 50% 50%, ${list})`;
  if (type === 'conic') return `conic-gradient(from ${round(angle)}deg at 50% 50%, ${list})`;
  return `linear-gradient(${round(angle)}deg, ${list})`;
}

// the colour a gradient has at a position: its stops' colours mixed between the stops around it (Problems in Pager 4:
// a stop added there keeps the rendering); a stop's own colour when the colours are not ones this reader mixes
export function colorAt(stops: readonly GradientStop[], position: number): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const after = sorted.findIndex((s) => s.position >= position);
  if (after <= 0) return (sorted[after < 0 ? sorted.length - 1 : 0] ?? sorted[0])?.color ?? '';
  const [from, to] = [sorted[after - 1], sorted[after]];
  if (from === undefined || to === undefined) return sorted[0]?.color ?? '';
  const [a, b] = [parseColor(from.color), parseColor(to.color)];
  if (a === null || b === null || to.position === from.position) return from.color;
  const t = (position - from.position) / (to.position - from.position);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  return formatColor({ r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b), a: Math.round((a.a + (b.a - a.a) * t) * 100) / 100 });
}

// An edit of the gradient editor (style.setBackgroundImage's `edit`): add the default gradient; switch the type (with
// the angle the editor kept for that type, Problems in Pager 3); set the angle; set a stop's colour or position; add a
// stop at a position; remove a stop (never below two); nudge a stop along the bar; reverse; distribute evenly; reset.
// A stop's edits name it by its index (`stop`): the stop the editor has chosen, or the stop a key acts on.
export interface GradientEdit {
  readonly add?: boolean;
  readonly type?: GradientType;
  readonly angle?: number | string;
  readonly stop?: number;
  readonly color?: string;
  readonly position?: number | string;
  readonly addStopAt?: number;
  readonly removeStop?: boolean;
  readonly nudge?: number;
  readonly reverse?: boolean;
  readonly distribute?: boolean;
  readonly reset?: boolean;
}

// why an edit cannot be made
export type GradientRefusal = 'noGradient' | 'minStops' | 'value';

const number = (value: number | string | undefined, unit: string): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const typed = /^\s*(-?\d+(?:\.\d+)?)\s*(?:[a-z%]*)\s*$/i.exec(value ?? '');
  if (typed === null) return null;
  const suffix = (value ?? '').trim().replace(/^-?\d+(?:\.\d+)?/, '').trim().toLowerCase();
  return suffix === '' || suffix === unit ? Number(typed[1]) : null;
};

// The CSS text the background image holds once the edit is made, or why it cannot be made.
export function editedGradient(held: string | undefined, edit: GradientEdit): { readonly text: string } | { readonly refused: GradientRefusal } {
  if (edit.reset === true) return { text: 'none' };
  if (edit.add === true) return { text: writeGradient(parseGradient(held) ?? DEFAULT_GRADIENT) };
  const g = parseGradient(held);
  if (g === null) return { refused: 'noGradient' };
  let next: Gradient = g;
  if (edit.type !== undefined) {
    const angle = edit.angle === undefined ? g.angle : number(edit.angle, 'deg');
    if (angle === null) return { refused: 'value' };
    next = { ...next, type: edit.type, angle };
  } else if (edit.angle !== undefined) {
    const angle = number(edit.angle, 'deg');
    if (angle === null) return { refused: 'value' };
    next = { ...next, angle };
  }
  const index = edit.stop;
  if (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= next.stops.length)) return { refused: 'value' };
  if ((edit.removeStop === true || edit.color !== undefined || edit.position !== undefined || edit.nudge !== undefined) && index === undefined) return { refused: 'value' };
  if (edit.stop !== undefined && edit.color !== undefined) {
    const color = edit.color.trim();
    if (color === '') return { refused: 'value' };
    next = { ...next, stops: next.stops.map((s, i) => (i === edit.stop ? { ...s, color } : s)) };
  }
  if (edit.stop !== undefined && edit.position !== undefined) {
    const position = number(edit.position, '%');
    if (position === null || position < 0 || position > 100) return { refused: 'value' };
    next = { ...next, stops: next.stops.map((s, i) => (i === edit.stop ? { ...s, position } : s)) };
  }
  if (edit.stop !== undefined && edit.nudge !== undefined) {
    next = { ...next, stops: next.stops.map((s, i) => (i === edit.stop ? { ...s, position: clampPercent(s.position + (edit.nudge ?? 0)) } : s)) };
  }
  if (edit.addStopAt !== undefined) {
    const position = clampPercent(edit.addStopAt);
    next = { ...next, stops: [...next.stops, { color: colorAt(next.stops, position), position }].sort((a, b) => a.position - b.position) };
  }
  if (edit.removeStop === true) {
    if (next.stops.length <= MIN_STOPS) return { refused: 'minStops' };
    next = { ...next, stops: next.stops.filter((_, i) => i !== index) };
  }
  if (edit.reverse === true) next = { ...next, stops: [...next.stops].reverse().map((s) => ({ ...s, position: 100 - s.position })) };
  if (edit.distribute === true) next = { ...next, stops: next.stops.map((s, i) => ({ ...s, position: next.stops.length === 1 ? 0 : (i / (next.stops.length - 1)) * 100 })) };
  return { text: writeGradient(next) };
}
