// Where the value a Style field shows comes from (spec inspector-provenance-reset, Problems in Pager 6; DESIGN.md
// "Inspector", the value-origin legend): the one rule the field's origin note reads.
//  - here: the edited target (the element, or the class while it is the target) holds it at the edited layer;
//  - breakpoint / state: the target holds it at a larger breakpoint or at the base state (the cascade, set.ts
//    shownValue);
//  - class: with the Element target, a class the element lists holds it and the element does not (cascadeSource);
//  - inherited: an inherited property (css-properties.json) that the nearest ancestor setting it sets, on itself or
//    through one of its classes (named);
//  - default: nothing sets it.
import { lineage, type DocNode } from '../../core/document/model.ts';
import type { ModelRules } from '../../core/document/validate.ts';
import type { StoreState } from '../../core/store/store.ts';
import { shownValue } from '../../core/style/set.ts';
import { INHERITED_PROPERTIES } from '../../generated/value-lists.ts';
import type { EditorUi } from '../state.ts';
import { cascadeSource, styleClassOf, styleSource } from './style-target.ts';

type State = StoreState<EditorUi>;

export type ValueOrigin =
  | { readonly kind: 'here' | 'breakpoint' | 'state'; readonly breakpoint: string; readonly state: string }
  | { readonly kind: 'class'; readonly name: string }
  | { readonly kind: 'inherited'; readonly from: string }
  | { readonly kind: 'default' };

const DEFAULT: ValueOrigin = { kind: 'default' };

// the layer a value was found at, named by its kind against the edited one
function layered(found: { readonly breakpoint: string; readonly state: string }, rules: ModelRules): ValueOrigin {
  const here = found.breakpoint === rules.base.breakpoint && found.state === rules.base.state;
  return { kind: here ? 'here' : found.state !== rules.base.state ? 'state' : 'breakpoint', breakpoint: found.breakpoint, state: found.state };
}

// The origin of the value a field of these properties shows for the selection (the primary element); null with
// nothing selected. The first property a layer, a class or an ancestor sets decides.
export function valueOrigin(state: State, properties: readonly string[], rules: ModelRules): ValueOrigin | null {
  const source = styleSource(state);
  const primary = state.selection[0];
  if (source === null || primary === undefined) return null;
  const classTargeted = styleClassOf(state) !== null;
  for (const property of properties) {
    // the target's own layers; with the Element target, then its classes
    const found = classTargeted ? shownValue(source, property, rules) : cascadeSource(state.document, source, property, rules);
    if (found === undefined || found === null) continue;
    if ('className' in found && found.className !== null) return { kind: 'class', name: found.className };
    return layered(found, rules);
  }
  const ancestors: readonly DocNode[] = lineage(state.document, primary).slice(0, -1).reverse();
  for (const property of properties) {
    if (!INHERITED_PROPERTIES.has(property)) continue;
    const from = ancestors.find((a) => cascadeSource(state.document, a, property, rules) !== null);
    if (from !== undefined) return { kind: 'inherited', from: from.name };
  }
  return DEFAULT;
}
