// The page's settings (ARCHITECTURE.md, Command owners; spec page-properties): the attributes elements.json gives the
// element of a page's root alone (its title, language, direction, and with their features its description, sharing
// and linked scripts). They belong to the page, not to the root's element: they are stored on the page root
// (`attributes`), the renderer writes the HTML ones on the page's <html> (lang, dir), and page.setSetting sets them.
//
// page.setSetting: one setting of the page the canvas shows (the first page, until explorer-pages). Its doors are the
// Settings tab's fields of the page root; each hands the setting and the text its field holds.
//  - The text is taken without the spaces around it. An empty one removes the setting (spec, Problems in Pager 5): the
//    page then has none of its own.
//  - A keyword setting (the direction) takes one of its keywords (elements.json), written in any case. The page's
//    language (the setting whose HTML attribute is lang) takes a language tag, in BCP 47's shape: letters, then subtags
//    of letters and digits, each after a "-". Anything else is refused with status.page.settingInvalid, which names the
//    setting and the value, and nothing changes (Problems in Pager 3).
//  - The same value records nothing (history.noChange "no-entry"); the status bar says the setting's value either way.
//  - The settings of the other value types (an address, the linked scripts) arrive with their features (page-seo-meta,
//    code-panel-edit-js), whose doors are not available yet: no door hands one here.
import type { AttributeRules } from '../document/validate.ts';
import { message, registerHandler, type Message } from '../commands/registry.ts';

// Whether an attribute is a setting of the page: elements.json gives it to the element type of a page's root alone.
export function isPageSetting(appliesTo: readonly string[] | 'all' | undefined, rootType: string): boolean {
  return appliesTo !== undefined && appliesTo !== 'all' && appliesTo.length === 1 && appliesTo[0] === rootType;
}

// the HTML attribute that holds a language, and the shape of a language tag (BCP 47: subtags of at most 8 characters)
const LANGUAGE = 'lang';
const LANGUAGE_TAG = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

// The value a setting keeps for a text typed into its field (not empty, without the spaces around it), or null when
// the setting cannot take it.
function keptValue(setting: string, rule: AttributeRules, typed: string): string | null {
  switch (rule.valueType) {
    case 'keyword': {
      const keyword = typed.toLowerCase();
      return rule.keywords.includes(keyword) ? keyword : null;
    }
    case 'text':
      return rule.html === LANGUAGE && !LANGUAGE_TAG.test(typed) ? null : typed;
    default:
      throw new Error(`page.setSetting: ${setting} is a setting of type ${rule.valueType}, which no built feature sets yet`);
  }
}

export const setPageSettingCommand = registerHandler('page.setSetting', ({ state, rules }, { setting, value }) => {
  const page = state.document.pages[0];
  const rule = rules.attributeValues.get(setting);
  // a door hands a setting of the page and the text of its field; anything else is a defect of the door
  if (page === undefined) throw new Error('page.setSetting: the document has no page');
  if (rule === undefined || !isPageSetting(rules.attributes.get(setting), rules.root.type)) throw new Error(`page.setSetting: ${setting} is no setting of the page`);
  const name = { key: rule.labelKey };
  const path = ['pages', 0, 'tree', 'attributes', setting];
  const stored = page.tree.attributes[setting];
  // an on/off setting (a layout grid, spec layout-grid-overlay): its checkbox hands true or false; on is stored as
  // true, off as no setting at all
  if (rule.valueType === 'boolean') {
    if (typeof value !== 'boolean') throw new Error('page.setSetting: an on/off setting takes true or false');
    const said = message(value ? 'status.page.settingOn' : 'status.page.settingOff', { setting: name });
    if ((stored === true) === value) return { kind: 'change', message: said };
    return { kind: 'change', patches: [value ? { op: 'add', path, value: true } : { op: 'remove', path }], message: said };
  }
  if (typeof value !== 'string') throw new Error('page.setSetting: the value is not a string');
  const typed = value.trim();
  if (typed === '') {
    const removed: Message = message('status.page.settingRemoved', { setting: name });
    return stored === undefined ? { kind: 'change', message: removed } : { kind: 'change', patches: [{ op: 'remove', path }], message: removed };
  }
  const kept = keptValue(setting, rule, typed);
  if (kept === null) return { kind: 'refused', message: message('status.page.settingInvalid', { setting: name, value: typed }) };
  const set = message('status.page.settingSet', { setting: name, value: kept });
  if (stored === kept) return { kind: 'change', message: set };
  return { kind: 'change', patches: [{ op: stored === undefined ? 'add' : 'replace', path, value: kept }], message: set };
});
