// What a built bundle is made of, for the limited validation (docs/testing/README.md): every function with a key
// that changes exactly when the function's own code changes, the code that runs when the bundle loads, and every
// CSS rule. The e2e build is not minified (vite.config.ts), so a function's text is its source after the bundler's
// scope hoisting, and the bundler's "//#region <file>" markers name the source file of every offset.
//
// A function's own text is its text with the functions nested in it cut out: changing a nested function does not
// change the function around it, and a test that executed the outer function but never the inner one does not
// depend on the inner one. The load-time code (everything outside every function) runs in every test.
import { createHash } from 'node:crypto';
import * as csstree from 'css-tree';
import ts from 'typescript';

export const hash = (text: string): string => createHash('sha1').update(text).digest('hex').slice(0, 16);

export interface FunctionFact {
  readonly start: number;
  readonly end: number;
  readonly region: string;
  readonly key: string;
}

export interface ScriptFacts {
  readonly functions: readonly FunctionFact[];
  // how many functions share each key (identical own text in the same source file)
  readonly keyCounts: ReadonlyMap<string, number>;
  // the load-time code: the script with every function cut out
  readonly loadTime: string;
  readonly regions: readonly { readonly start: number; readonly end: number; readonly name: string }[];
}

const isFunction = (node: ts.Node): node is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) ||
  ts.isClassStaticBlockDeclaration(node);

// the functions directly inside a node (not inside another function in it)
function nestedFunctions(node: ts.Node): ts.Node[] {
  const found: ts.Node[] = [];
  const visit = (child: ts.Node) => {
    if (isFunction(child)) found.push(child);
    else child.forEachChild(visit);
  };
  node.forEachChild(visit);
  return found;
}

function ownText(text: string, source: ts.SourceFile, node: ts.Node): string {
  const start = node === source ? 0 : node.getStart(source);
  let out = '';
  let at = start;
  for (const inner of nestedFunctions(node)) {
    const innerStart = inner.getStart(source);
    out += text.slice(at, innerStart) + '\u0000';
    at = inner.end;
  }
  return out + text.slice(at, node.end);
}

function regionsOf(text: string): { start: number; end: number; name: string }[] {
  const regions: { start: number; end: number; name: string }[] = [];
  const open: { start: number; name: string }[] = [];
  for (const m of text.matchAll(/^\/\/#(region|endregion)(?: (.*))?$/gm)) {
    if (m[1] === 'region') open.push({ start: m.index, name: (m[2] ?? '').replace(/^\0/, '') });
    else {
      const top = open.pop();
      if (top) regions.push({ start: top.start, end: m.index, name: top.name });
    }
  }
  return regions.sort((a, b) => a.start - b.start);
}

export function analyzeScript(text: string): ScriptFacts {
  const source = ts.createSourceFile('bundle.js', text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const regions = regionsOf(text);
  const regionAt = (offset: number) => {
    let name = '';
    for (const r of regions) if (r.start <= offset && offset <= r.end) name = r.name; // innermost wins: regions nest in order
    return name;
  };
  const functions: FunctionFact[] = [];
  const keyCounts = new Map<string, number>();
  const visit = (node: ts.Node) => {
    if (isFunction(node)) {
      const start = node.getStart(source);
      const region = regionAt(start);
      const key = hash(`${region}\u0000${ownText(text, source, node)}`);
      functions.push({ start, end: node.end, region, key });
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return { functions, keyCounts, loadTime: ownText(text, source, source), regions };
}

// The function a V8 coverage range stands for: the one with exactly that start and end (1035 of 1037 ranges of a
// scenario test), else the innermost function holding the range (a class's field initializers, which V8 runs as a
// function of their own); null when the range is load-time code, which every test depends on anyway.
export function functionAt(facts: ScriptFacts, index: ReadonlyMap<string, FunctionFact>, start: number, end: number): FunctionFact | null {
  const exact = index.get(`${start}:${end}`);
  if (exact) return exact;
  let best: FunctionFact | null = null;
  for (const f of facts.functions) if (f.start <= start && end <= f.end && (best === null || f.end - f.start < best.end - best.start)) best = f;
  return best;
}

export const functionIndex = (facts: ScriptFacts): Map<string, FunctionFact> => new Map(facts.functions.map((f) => [`${f.start}:${f.end}`, f]));

export interface CssRuleFact {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  // for each selector of the rule, the classes its subject (the rightmost compound) requires; null when some selector
  // can match an element without a class of its own (a type, id, attribute or pseudo selector alone), or when the
  // rule is not a style rule (@font-face, @keyframes, @import...): such a rule can reach any test
  readonly subjectClasses: readonly (readonly string[])[] | null;
}

export function analyzeCss(text: string): CssRuleFact[] {
  const ast = csstree.parse(text, { positions: true, parseValue: false, parseCustomProperty: false });
  const rules: CssRuleFact[] = [];
  const context: string[] = [];
  const subjectOf = (selector: csstree.Selector): string[] => {
    const parts = selector.children.toArray();
    let from = 0;
    parts.forEach((p, i) => {
      if (p.type === 'Combinator') from = i + 1;
    });
    return parts.slice(from).flatMap((p) => (p.type === 'ClassSelector' ? [p.name] : []));
  };
  const walk = (list: csstree.List<csstree.CssNode> | null | undefined) => {
    list?.forEach((node) => {
      const start = node.loc?.start.offset ?? 0;
      const end = node.loc?.end.offset ?? 0;
      if (node.type === 'Rule') {
        const prelude = csstree.generate(node.prelude);
        let subjects: string[][] | null = [];
        if (node.prelude.type === 'SelectorList') {
          for (const s of node.prelude.children.toArray()) {
            const classes = s.type === 'Selector' ? subjectOf(s) : [];
            if (classes.length === 0) subjects = null;
            else subjects?.push(classes);
          }
        } else subjects = null;
        rules.push({ key: hash(`${context.join('\u0001')}\u0000${prelude}\u0000${csstree.generate(node.block)}`), start, end, subjectClasses: subjects });
      } else if (node.type === 'Atrule') {
        const name = `@${node.name} ${node.prelude ? csstree.generate(node.prelude) : ''}`;
        const nested = node.block?.children.toArray().some((c) => c.type === 'Rule' || c.type === 'Atrule');
        if (nested && (node.name === 'media' || node.name === 'supports' || node.name === 'layer' || node.name === 'container')) {
          context.push(name);
          walk(node.block?.children);
          context.pop();
        } else {
          rules.push({ key: hash(`${context.join('\u0001')}\u0000${csstree.generate(node)}`), start, end, subjectClasses: null });
        }
      }
    });
  };
  if (ast.type === 'StyleSheet') walk(ast.children);
  return rules;
}
