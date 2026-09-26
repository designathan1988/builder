// Settings field placement and catalogue values come from elements.json. A field not claimed by a
// section for this element belongs to Attributes; the same attribute may have a narrower section
// on another element (Source is in Image for an image, but in Attributes for a video).
import { manifest } from '../../manifest/runtime.ts';
import type { DocNode } from '../../core/document/model.ts';

export const ATTRIBUTES = new Map(manifest.elements.attributes.map((attribute) => [attribute.id, attribute]));
export const SETTINGS_SECTIONS = manifest.elements.settingsSections;
export function inputValueEditorOf(node: DocNode): string | null {
  if (node.type !== 'input') return null;
  const type = String(node.attributes.inputType ?? 'text');
  return manifest.elements.inputValueEditors[type] ?? null;
}

export function settingsSectionFor(attribute: string, element: string): string {
  for (const section of SETTINGS_SECTIONS) {
    if (section.id === 'attributes') continue;
    if (section.elements !== 'all' && !section.elements.includes(element)) continue;
    if (section.attributes.includes(attribute)) return section.id;
  }
  return 'attributes';
}
