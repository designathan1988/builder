// The background image (ARCHITECTURE.md, Command owners; specs props-background, gradient-editor): style.setBackgroundImage
// writes the image a field hands it into its property (background-image; never the background shorthand, so the colour
// under it stays) of every selected element, in one undo step. Every control of the background's image writes through
// it (Problems in Pager 5 of the gradient editor):
//  - the image field hands the text typed (`value`): none or one image address, bare or inside url() (the codec
//    image-layers reads it and writes url("…")); an address with another scheme than a web address or a path inside the
//    project is refused naming it (status.url.unsafe), text that is no image as any value a field does not take;
//  - the gradient editor hands an edit (`edit`) of the gradient the primary selected element holds (core/style/gradient.ts):
//    a gradient to edit that is not there is refused (status.gradient.none), a stop removed below two too
//    (status.gradient.minStops), a value the browser does not take as any value a field does not take.
import { message, registerHandler } from '../commands/registry.ts';
import { locate } from '../document/model.ts';
import { isSafeSource } from '../text/inline.ts';
import { imageAddress } from './codecs.ts';
import { editedGradient, type GradientEdit } from './gradient.ts';
import { propertyName, readValue, storedValue, typedText, writeStyle } from './set.ts';

export const setBackgroundImageCommand = registerHandler('style.setBackgroundImage', (context, { property, value, edit }) => {
  if (typeof property !== 'string') throw new Error('style.setBackgroundImage: a door hands the property it edits');
  const { state, rules } = context;
  let text: string;
  if (edit !== undefined && edit !== null) {
    if (typeof edit !== 'object' || Array.isArray(edit)) throw new Error('style.setBackgroundImage: an edit is an object');
    const primary = state.selection[0] === undefined ? null : locate(state.document, state.selection[0]);
    if (primary === null) return { kind: 'change' };
    const edited = editedGradient(storedValue(primary.node, property, rules), edit as GradientEdit);
    if ('refused' in edited) {
      if (edited.refused === 'noGradient') return { kind: 'refused', message: message('status.gradient.none', { name: primary.node.name }) };
      if (edited.refused === 'minStops') return { kind: 'refused', message: message('status.gradient.minStops') };
      // what the edit typed, quoted once as typed: not the stop it names (spec inspector-number-fields, Problems in Pager 3)
      return { kind: 'refused', message: message('status.value.invalid', { property: propertyName(property, rules), value: typedText(Object.fromEntries(Object.entries(edit as Record<string, unknown>).filter(([name]) => name !== 'stop'))) }) };
    }
    text = edited.text;
  } else {
    if (typeof value !== 'string') throw new Error('style.setBackgroundImage: the image field hands the text typed');
    const address = imageAddress(value);
    if (address !== null && address !== '' && !isSafeSource(address)) return { kind: 'refused', message: message('status.url.unsafe', { url: address }) };
    text = value;
  }
  const read = readValue(context, property, text);
  if (read === null) return { kind: 'refused', message: message('status.value.invalid', { property: propertyName(property, rules), value: text }) };
  return writeStyle(context, property, read.css);
});
