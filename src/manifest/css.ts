// CSSTree's lexer built from the official CSS syntaxes. The generator uses it to derive the
// keyword and unit lists of manifest/generated/css-properties.json, and manifest:check uses the
// same construction, from that generated file, to validate every value a door offers or writes.
//
// The official data "lives on the edge" and its grammar is known to be incomplete (for example the
// Fill and Stroke 3 draft's <paint> no longer lists <color>, although every browser accepts
// `fill: red`). A value the official syntax rejects is therefore also matched against the syntax
// CSSTree bundles from MDN's browser data; the match says which syntax accepted it, so a caller can
// report every value that needed the browser syntax.
import { fork, lexer as implementedLexer, parse, type Lexer } from 'css-tree';

export interface CssSyntaxes {
  // property name → value definition syntax
  properties: Readonly<Record<string, string | null>>;
  // type or function name (functions end with "()") → value definition syntax
  types: Readonly<Record<string, string>>;
}

export type CssMatch = { ok: true; by: 'official' | 'implemented' } | { ok: false; reason: string };

export interface CssMatcher {
  lexer: Lexer;
  // null when the value matches the property's official syntax, the lexer's reason otherwise
  match(property: string, value: string): string | null;
  // the official syntax first, then the syntax browsers implement (CSSTree's MDN data)
  matchEither(property: string, value: string): CssMatch;
}

function matchWith(lexer: Lexer, property: string, value: string): string | null {
  let ast;
  try {
    ast = parse(value, { context: 'value' });
  } catch (error) {
    return `not parseable as a CSS value: ${(error as Error).message}`;
  }
  let result;
  try {
    result = lexer.matchProperty(property, ast);
  } catch (error) {
    // the official grammar is known to be incomplete: a syntax may name a type nobody defines
    return `the syntax cannot be matched: ${(error as Error).message}`;
  }
  if (result.error === null) return null;
  return result.error.message.split('\n')[0] ?? 'mismatch';
}

export function createCssMatcher(syntaxes: CssSyntaxes): CssMatcher {
  const properties: Record<string, string> = {};
  for (const [name, syntax] of Object.entries(syntaxes.properties)) if (syntax !== null) properties[name] = syntax;
  const lexer = fork({ properties, types: { ...syntaxes.types } }).lexer;
  const match = (property: string, value: string) => matchWith(lexer, property, value);
  const matchEither = (property: string, value: string): CssMatch => {
    const official = match(property, value);
    if (official === null) return { ok: true, by: 'official' };
    if (matchWith(implementedLexer, property, value) === null) return { ok: true, by: 'implemented' };
    return { ok: false, reason: official };
  };
  return { lexer, match, matchEither };
}
