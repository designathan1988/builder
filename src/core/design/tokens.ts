// The project's design tokens as CSS variables (ARCHITECTURE.md, Command owners; spec css-variables-tokens): each a
// name, a kind (a colour, a length, a font size: tokens.create's kinds) and a value, kept with the project (the
// document's `tokens`, in the order they were made) and named in an element's style as var(--name). The one owner of:
//  - tokens.create, tokens.update, tokens.rename, tokens.delete, one undo step each. A name is a CSS custom property's
//    without its dashes (a letter, then letters, digits and "-"), unique in the project; a value is one the browser takes
//    for the kind (read as the property the kind names reads it: color for a colour, font-size for a font size, a
//    length-percentage property for a length). A rename renames every var(--name) that uses it, in every page (Problems
//    in Pager 2); a variable in use is not deleted, the refusal counts the elements that use it (Problems in Pager 3).
//  - usesToken / tokenReferenceOf: which style values name a variable;
//  - rootCss: the variables as the :root rule the page and the export write (Problems in Pager 1);
//  - tokenKindOf: the kind of variable a property's field offers (Problems in Pager 4): the kind the property is (a
//    font size), else the kind whose value is read as the property's is (a colour field: a colour; a length field: a
//    length); none for any other.
import type { Message } from '../commands/registry.ts';
import { message, registerHandler, type HandlerContext, type Outcome } from '../commands/registry.ts';
import { walk, type DocNode, type DocumentJson } from '../document/model.ts';
import type { Patch } from '../history/transaction.ts';
import { readValue } from '../style/set.ts';

export interface Token {
  readonly name: string;
  readonly kind: string;
  readonly value: string;
}

const NONE: readonly Token[] = [];
export const tokensOf = (document: DocumentJson): readonly Token[] => document.tokens ?? NONE;
const NAME = /^[a-z][a-z0-9-]*$/i;
const escaped = (name: string) => name.replace(/[-]/g, '\\-');
// a style value's reference to a variable: var(--name), with or without a fallback
const referenceTo = (name: string) => new RegExp(`var\\(\\s*--${escaped(name)}\\s*([,)])`, 'g');

// the variable a style value names first, or null
export function tokenReferenceOf(value: string): string | null {
  return /var\(\s*--([a-z][a-z0-9-]*)/i.exec(value)?.[1] ?? null;
}

// the text of a style value, a structured one's (a shadow's layers) as its JSON
const texts = (value: unknown): readonly string[] => (typeof value === 'string' ? [value] : []);

// every place a style value names a variable: the node, its style's breakpoint, state and property, and its text
function usesOf(document: DocumentJson, name: string): { readonly page: number; readonly node: DocNode; readonly path: readonly string[]; readonly value: string }[] {
  const found: { page: number; node: DocNode; path: readonly string[]; value: string }[] = [];
  document.pages.forEach((page, index) => {
    for (const node of walk(page.tree)) {
      const styles = node.styles as Record<string, Record<string, Record<string, unknown>> | undefined>;
      for (const [breakpoint, states] of Object.entries(styles)) {
        for (const [state, declarations] of Object.entries(states ?? {})) {
          for (const [property, value] of Object.entries(declarations ?? {})) {
            for (const text of texts(value)) if (referenceTo(name).test(text)) found.push({ page: index, node, path: [breakpoint, state, property], value: text });
          }
        }
      }
    }
  });
  return found;
}
export const usesToken = (document: DocumentJson, name: string): number => new Set(usesOf(document, name).map((u) => u.node.id)).size;

// the path of a node in a document, from its page
function pathOf(document: DocumentJson, page: number, id: string): (string | number)[] | null {
  const search = (node: DocNode, at: (string | number)[]): (string | number)[] | null => {
    if (node.id === id) return at;
    for (const [i, child] of node.children.entries()) {
      const inner = search(child, [...at, 'children', i]);
      if (inner !== null) return inner;
    }
    return null;
  };
  const tree = document.pages[page]?.tree;
  return tree === undefined ? null : search(tree, ['pages', page, 'tree']);
}

// the property whose values a kind's value is read as: the property the kind names, else one whose codec reads the kind
function probeOf<Ui>(context: HandlerContext<Ui>, kind: string): string | null {
  const { rules } = context;
  if (rules.propertyFacts.has(kind)) return kind;
  return [...rules.propertyFacts.entries()].find(([, facts]) => facts.codec.startsWith(`${kind}-`))?.[0] ?? null;
}

function valueRefusal<Ui>(context: HandlerContext<Ui>, kind: string, value: string): Message | null {
  const probe = probeOf(context, kind);
  const read = probe === null ? null : readValue(context, probe, value);
  return read === null ? message('status.tokens.invalidValue', { value, kind: { key: `styles.kind.${kind}` as Message['key'] } }) : null;
}
const nameRefusal = (document: DocumentJson, name: string, except: string | null): Message | null => {
  if (!NAME.test(name)) return message('status.tokens.badName', { name });
  if (tokensOf(document).some((t) => t.name === name && t.name !== except)) return message('status.tokens.nameTaken', { name });
  return null;
};

export const createToken = registerHandler('tokens.create', (context, { kind, name, value }): Outcome<never> => {
  const { state } = context;
  const typed = name.trim();
  const refused = nameRefusal(state.document, typed, null) ?? valueRefusal(context, kind, value.trim());
  if (refused !== null) return { kind: 'refused', message: refused };
  const token: Token = { name: typed, kind, value: value.trim() };
  const held = tokensOf(state.document);
  const patch: Patch = state.document.tokens === undefined ? { op: 'add', path: ['tokens'], value: [token] } : { op: 'add', path: ['tokens', held.length], value: token };
  return { kind: 'change', patches: [patch], message: message('status.tokens.created', { name: typed }) };
});

function indexOf(document: DocumentJson, name: string): number {
  const at = tokensOf(document).findIndex((t) => t.name === name);
  if (at < 0) throw new Error(`tokens: the project has no variable ${name}`);
  return at;
}

export const updateToken = registerHandler('tokens.update', (context, { token, value }): Outcome<never> => {
  const { state } = context;
  const at = indexOf(state.document, token);
  const held = tokensOf(state.document)[at] as Token;
  const typed = value.trim();
  const refused = valueRefusal(context, held.kind, typed);
  if (refused !== null) return { kind: 'refused', message: refused };
  const said = message('status.tokens.updated', { name: held.name, value: typed });
  if (held.value === typed) return { kind: 'change', message: said };
  return { kind: 'change', patches: [{ op: 'replace', path: ['tokens', at, 'value'], value: typed }], message: said };
});

export const renameToken = registerHandler('tokens.rename', (context, { token, name }): Outcome<never> => {
  const { state } = context;
  const at = indexOf(state.document, token);
  const typed = name.trim();
  const said = message('status.tokens.renamed', { from: token, to: typed });
  if (typed === token) return { kind: 'change', message: said };
  const refused = nameRefusal(state.document, typed, token);
  if (refused !== null) return { kind: 'refused', message: refused };
  // every value that names it names the new name
  const uses: Patch[] = usesOf(state.document, token).flatMap((use) => {
    const nodePath = pathOf(state.document, use.page, use.node.id);
    return nodePath === null ? [] : [{ op: 'replace' as const, path: [...nodePath, 'styles', ...use.path], value: use.value.replace(referenceTo(token), `var(--${typed}$1`) }];
  });
  return { kind: 'change', patches: [{ op: 'replace', path: ['tokens', at, 'name'], value: typed }, ...uses], message: said };
});

export const deleteToken = registerHandler('tokens.delete', ({ state }, { token }): Outcome<never> => {
  const at = indexOf(state.document, token);
  const count = usesToken(state.document, token);
  if (count > 0) return { kind: 'refused', message: message('status.tokens.inUse', { name: token, count }) };
  const patch: Patch = tokensOf(state.document).length === 1 ? { op: 'remove', path: ['tokens'] } : { op: 'remove', path: ['tokens', at] };
  return { kind: 'change', patches: [patch], message: message('status.tokens.deleted', { name: token }) };
});

export function tokenKindOf(property: string, kinds: readonly string[], rules: HandlerContext<unknown>['rules']): string | null {
  if (kinds.includes(property)) return property;
  const codec = rules.propertyFacts.get(property)?.codec;
  return kinds.find((kind) => {
    const probe = rules.propertyFacts.has(kind) ? kind : [...rules.propertyFacts.entries()].find(([, facts]) => facts.codec.startsWith(`${kind}-`))?.[0];
    return probe !== undefined && rules.propertyFacts.get(probe)?.codec === codec;
  }) ?? null;
}

// The variables as the rule of the page's root: ":root { --name: value; }", empty for none.
export function rootCss(tokens: readonly Token[]): string {
  if (tokens.length === 0) return '';
  return `:root {\n${tokens.map((t) => `  --${t.name}: ${t.value};`).join('\n')}\n}`;
}
