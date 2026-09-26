// The number fields' commands (ARCHITECTURE.md, Command owners; spec inspector-number-fields): the arithmetic of a
// numeric field of the inspector, which the field component draws (src/editor/shell/field.tsx). Each takes the field's
// property and the text the field holds (`value`, what the person sees or typed), works out the new value and writes
// it through style.set's one writer (`writeStyle` of src/core/style/set.ts): the same refusals (a locked element), one
// transaction, the status bar naming the value.
//  - field.step: ArrowUp/ArrowDown and the step buttons step by numberField.step, PageUp/PageDown by
//    numberField.pageStep; Shift multiplies a step by numberField.shiftFactor, Alt by numberField.altFactor (the
//    gesture number-field-keys, interactions.json). Presses in a row on the same field and property, each within
//    numberField.stepBurstWindow of the previous one, are one undo step (the manifest's history.coalesce; Problems
//    in Pager 4).
//  - field.scrub: the label dragged horizontally, round(distance / numberField.scrubPixelsPerStep) steps from the value
//    the field held at the press, with the same multipliers (the gesture number-scrub); the pointer owner runs the
//    whole drag as one gesture, so a scrub is one undo step, and Escape cancels it (drag.cancel).
//  - field.setUnit: a keyword the property offers is written as it is; a length is converted to the unit chosen when it
//    keeps its size without measuring the page (convertLength of the codecs), else refused with
//    status.value.unitNotConverted.
//  - field.cancel: Escape in the field puts back the value the document holds (the field shows it again after every
//    message); nothing is written.
// A step or a scrub never takes a length below zero where the browser refuses a negative value (Width, Height: the
// CSS support port). A font-relative unit (em, rem…: FINE_STEP_UNITS of the codecs) moves by numberField.fineStep a
// step, any other by the step itself; a field that holds no number to step (a keyword, calc()) says so
// (status.value.notSteppable) and writes nothing; an empty field steps nothing (Problems in Pager 4).
import { message, registerHandler, type HandlerContext, type Outcome } from '../../core/commands/registry.ts';
import { locate } from '../../core/document/model.ts';
import { convertLength, FINE_STEP_UNITS } from '../../core/style/codecs.ts';
import { propertyName, readValue, writeStyle, writeValue } from '../../core/style/set.ts';
import type { ConstantId } from '../../generated/ids.ts';
import { manifest } from '../../manifest/runtime.ts';

function constant(id: ConstantId): number {
  const value = manifest.interactions.constants.find((c) => c.id === id)?.value;
  if (typeof value !== 'number') throw new Error(`interactions.json has no number ${id}`);
  return value;
}
const STEP = constant('numberField.step');
const PAGE_STEP = constant('numberField.pageStep');
const SHIFT_FACTOR = constant('numberField.shiftFactor');
const ALT_FACTOR = constant('numberField.altFactor');
const SCRUB_PIXELS_PER_STEP = constant('numberField.scrubPixelsPerStep');
const FINE_STEP = constant('numberField.fineStep');

// The factor the key held with a step or a scrub gives it: Shift ×10, Alt ×0.1, none ×1.
export function factorOf(modifier: 'Shift' | 'Alt' | undefined): number {
  return modifier === 'Shift' ? SHIFT_FACTOR : modifier === 'Alt' ? ALT_FACTOR : 1;
}

// The length the field holds moved by `delta` of its own unit, written into the selection; nothing for a field that
// holds no length. Below zero it stops at zero where the browser takes no negative value.
function moved<Ui>(context: HandlerContext<Ui>, property: string, value: string, delta: number): Outcome<Ui> {
  if (value.trim() === '') return { kind: 'change' };
  const read = readValue(context, property, value);
  if (read === null || read.value.kind !== 'length') return { kind: 'refused', message: message('status.value.notSteppable', { property: propertyName(property, context.rules), value: value.trim() }) };
  const unit = read.value.unit;
  const next = read.value.number + delta * (FINE_STEP_UNITS.has(unit) ? FINE_STEP : 1);
  const nextCss = writeValue(property, { kind: 'length', number: next, unit }, context.rules);
  const floor = writeValue(property, { kind: 'length', number: 0, unit }, context.rules);
  const css = nextCss !== null && next < 0 && !context.css.supports(property, nextCss) ? floor : nextCss;
  return css === null ? { kind: 'change' } : writeStyle(context, property, css);
}

export const stepField = registerHandler('field.step', (context, { property, value, direction, size, modifier }) => {
  const delta = (size === 'page' ? PAGE_STEP : STEP) * factorOf(modifier) * (direction === 'up' ? 1 : -1);
  return moved(context, property, value, delta);
});

export const scrubField = registerHandler('field.scrub', (context, { property, value, distance, modifier }) => {
  const delta = Math.round(distance / SCRUB_PIXELS_PER_STEP) * STEP * factorOf(modifier);
  return moved(context, property, value, delta);
});

export const setFieldUnit = registerHandler('field.setUnit', (context, { property, value, unit }) => {
  const refused = { kind: 'refused', message: message('status.value.unitNotConverted', { unit }) } as const;
  const chosen = readValue(context, property, unit);
  // a keyword of the property (auto, min-content…) is its own value
  if (chosen?.value.kind === 'keyword') return writeStyle(context, property, chosen.css);
  const read = readValue(context, property, value);
  if (read === null || read.value.kind !== 'length') return refused;
  const converted = convertLength(read.value, unit);
  const css = converted === null ? null : writeValue(property, { kind: 'length', number: converted, unit }, context.rules);
  // the converted length must be one the property offers and the browser takes (read again as typed)
  const again = css === null ? null : readValue(context, property, css);
  return again === null ? refused : writeStyle(context, property, again.css);
});

export const cancelField = registerHandler('field.cancel', ({ state, rules }, { property }) => {
  const primary = state.selection[0] === undefined ? null : locate(state.document, state.selection[0]);
  if (!primary) return { kind: 'change' };
  return { kind: 'change', message: message('status.field.cancelled', { property: propertyName(property, rules), name: primary.node.name }) };
});
