// The ESLint rules that hold the contract in code (ARCHITECTURE.md, "Lint rules of the contract"). Each rule has a
// planted violation that fails npm run verify:fast (PROGRESS.md records the raw output).
//
// Two plugins: `builder` lints JavaScript and TypeScript (use-ports, no-literal-ui-string, use-tokens for React style
// objects) and `builder-css` lints stylesheets with the @eslint/css language (use-tokens).
import { resolve } from 'node:path';
import type { RuleDefinition, RuleVisitor } from '@eslint/core';
import type { CSSRuleDefinition } from '@eslint/css';
import type { TSESTree } from '@typescript-eslint/utils';
import type { Linter, Rule, SourceCode } from 'eslint';
import { cssPropertyName, DEFAULT_TOKENS_FILE, numberLiteral, styleLiterals, tokenNames, type StyleLiteral } from './style-values.ts';

type Node = Rule.Node;

// A rule over the typescript-eslint AST, which has the JSX nodes that ESLint's own JavaScript types lack.
interface JsxVisitor extends RuleVisitor {
  JSXText?: (node: TSESTree.JSXText) => void;
  JSXAttribute?: (node: TSESTree.JSXAttribute) => void;
  JSXExpressionContainer?: (node: TSESTree.JSXExpressionContainer) => void;
}

type JsxRuleDefinition<MessageIds extends string, RuleOptions extends unknown[] = []> = RuleDefinition<{
  LangOptions: Linter.LanguageOptions;
  Code: SourceCode;
  RuleOptions: RuleOptions;
  Visitor: JsxVisitor;
  Node: TSESTree.Node;
  MessageIds: MessageIds;
  ExtRuleDocs: unknown;
}>;

// The last name of a member chain's object: Date for Date.now, and for globalThis.Date.now or window.Date.now.
function objectName(node: Node): string | null {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') return node.property.name;
  return null;
}

function propertyName(node: Node & { type: 'MemberExpression' }): string | null {
  if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  if (node.computed && node.property.type === 'Literal' && typeof node.property.value === 'string') return node.property.value;
  return null;
}

// builder/use-ports: the time is read only through the Clock port and ids come only from the IdGenerator port.
// The two port modules are the only files the configuration exempts.
const usePorts: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: { description: 'Read the time through the Clock port and take ids from the IdGenerator port' },
    messages: {
      time: '{{what}} reads the time: take a Clock (src/core/ports/clock.ts) instead.',
      id: '{{what}} makes an id: take an IdGenerator (src/core/ports/ids.ts) instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node) {
        const object = objectName(node.object as Node);
        const property = propertyName(node);
        if (object === 'Date' && property === 'now') context.report({ node, messageId: 'time', data: { what: 'Date.now' } });
        if (object === 'Math' && property === 'random') context.report({ node, messageId: 'id', data: { what: 'Math.random' } });
        if (property === 'randomUUID') context.report({ node, messageId: 'id', data: { what: 'crypto.randomUUID' } });
      },
      NewExpression(node) {
        if (objectName(node.callee as Node) === 'Date' && node.arguments.length === 0) context.report({ node, messageId: 'time', data: { what: 'new Date()' } });
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Date') context.report({ node, messageId: 'time', data: { what: 'Date()' } });
      },
    };
  },
};

// The text a person reads: a letter or a digit in any script. Punctuation, symbols and spaces alone are not text.
const HAS_TEXT = /[\p{L}\p{N}]/u;

// The attributes whose value is shown or read out to the person using the interface.
const UI_TEXT_ATTRIBUTES: ReadonlySet<string> = new Set([
  'title',
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-placeholder',
  'aria-valuetext',
  'placeholder',
  'alt',
  'label',
]);

function shown(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

// The literal texts an expression can evaluate to: string literals, template literals and the branches of
// conditional and logical expressions. Anything else (a call to t(), an imported constant) is not a literal.
function literalTexts(expression: TSESTree.Node): Array<{ node: TSESTree.Node; text: string }> {
  switch (expression.type) {
    case 'Literal':
      return typeof expression.value === 'string' && HAS_TEXT.test(expression.value) ? [{ node: expression, text: expression.value }] : [];
    case 'TemplateLiteral': {
      const text = expression.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('…');
      return HAS_TEXT.test(text) ? [{ node: expression, text }] : [];
    }
    case 'ConditionalExpression':
      return [...literalTexts(expression.consequent), ...literalTexts(expression.alternate)];
    case 'LogicalExpression':
      return [...literalTexts(expression.left), ...literalTexts(expression.right)];
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
      return literalTexts(expression.expression);
    default:
      return [];
  }
}

// builder/no-literal-ui-string: UI text comes only from t() over the i18n catalogues, never from a literal in JSX.
const noLiteralUiString: JsxRuleDefinition<'text' | 'attribute'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Take every UI text from t() and the i18n catalogues, never from a literal in JSX' },
    messages: {
      text: 'The JSX text "{{text}}" is UI text written in code: add it to src/i18n/locales/en.json and pt-BR.json and render t(key) instead.',
      attribute:
        'The {{attribute}} text "{{text}}" is UI text written in code: add it to src/i18n/locales/en.json and pt-BR.json and pass t(key) instead.',
    },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node) {
        if (HAS_TEXT.test(node.value)) context.report({ node, messageId: 'text', data: { text: shown(node.value) } });
      },
      JSXExpressionContainer(node) {
        if (node.parent.type !== 'JSXElement' && node.parent.type !== 'JSXFragment') return;
        for (const literal of literalTexts(node.expression)) {
          context.report({ node: literal.node, messageId: 'text', data: { text: shown(literal.text) } });
        }
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !UI_TEXT_ATTRIBUTES.has(node.name.name) || !node.value) return;
        const attribute = node.name.name;
        const expression = node.value.type === 'JSXExpressionContainer' ? node.value.expression : node.value;
        for (const literal of literalTexts(expression)) {
          context.report({ node: literal.node, messageId: 'attribute', data: { attribute, text: shown(literal.text) } });
        }
      },
    };
  },
};

interface TokensOptions {
  tokens?: string;
}

const TOKENS_SCHEMA = [
  {
    type: 'object' as const,
    properties: { tokens: { type: 'string' as const, description: 'The generated tokens stylesheet, relative to the working directory.' } },
    additionalProperties: false,
  },
];

const STYLE_MESSAGES = {
  colour: '{{value}} is a literal colour in {{property}}: use a --color-* token of {{tokens}} (transparent and currentColor are allowed).',
  length:
    '{{value}} is a literal length in {{property}}: use a {{hint}} token of {{tokens}} (0, auto, percentages and viewport units are allowed).',
  font: '{{value}} is a literal font value in {{property}}: use a {{hint}} token of {{tokens}}.',
};

function literalData(literal: Omit<StyleLiteral, 'start' | 'end'>, tokens: string): Record<string, string> {
  return { value: literal.text, property: literal.property, hint: literal.hint, tokens };
}

// The values a style property can take from a literal: the branches of conditional and logical expressions too.
function styleValueNodes(expression: TSESTree.Node): Array<TSESTree.Literal | TSESTree.TemplateLiteral> {
  switch (expression.type) {
    case 'Literal':
    case 'TemplateLiteral':
      return [expression];
    case 'ConditionalExpression':
      return [...styleValueNodes(expression.consequent), ...styleValueNodes(expression.alternate)];
    case 'LogicalExpression':
      return [...styleValueNodes(expression.left), ...styleValueNodes(expression.right)];
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
      return styleValueNodes(expression.expression);
    default:
      return [];
  }
}

function styleKey(property: TSESTree.Property): string | null {
  if (!property.computed && property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal' && typeof property.key.value === 'string') return property.key.value;
  return null;
}

// builder/use-tokens: a React style object takes its colours, spacing, sizes, radii, shadows and font values from the
// tokens, like the stylesheets. A dynamic value (a variable, a template with expressions) is not a literal; the
// literal parts of a template are still checked.
const useTokensInStyle: JsxRuleDefinition<'colour' | 'length' | 'font' | 'variable', [TokensOptions?]> = {
  meta: {
    type: 'problem',
    docs: { description: 'Take every colour, spacing, size, radius, shadow and font value of a style object from the tokens' },
    messages: {
      ...STYLE_MESSAGES,
      variable: 'var({{name}}) reads a custom property that neither {{tokens}} nor this style object defines: use a token of {{tokens}}.',
    },
    schema: TOKENS_SCHEMA,
  },
  create(context) {
    const tokensFile = context.options[0]?.tokens ?? DEFAULT_TOKENS_FILE;
    const tokens = tokenNames(resolve(context.cwd, tokensFile));

    function checkObject(object: TSESTree.ObjectExpression): void {
      const properties = object.properties.flatMap((property) => (property.type === 'Property' ? [property] : []));
      const own = new Set(properties.flatMap((property) => styleKey(property) ?? []).filter((key) => key.startsWith('--')));
      for (const property of properties) {
        const key = styleKey(property);
        if (key === null) continue;
        const name = cssPropertyName(key);
        for (const node of styleValueNodes(property.value)) {
          if (node.type === 'Literal' && typeof node.value === 'number') {
            const literal = numberLiteral(name, node.value);
            if (literal) context.report({ node, messageId: literal.kind === 'font' ? 'font' : 'length', data: literalData(literal, tokensFile) });
            continue;
          }
          const dynamic = node.type === 'TemplateLiteral' && node.expressions.length > 0;
          // The expressions of a template are replaced by 0, so that `${x}px` passes and `${x}px solid red` does not.
          const text =
            node.type === 'TemplateLiteral' ? node.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join('0') : typeof node.value === 'string' ? node.value : null;
          if (text === null) continue;
          for (const literal of styleLiterals(name, text)) {
            if (literal.kind === 'variable') {
              if (!dynamic && !tokens.has(literal.text) && !own.has(literal.text)) {
                context.report({ node, messageId: 'variable', data: { name: literal.text, tokens: tokensFile } });
              }
              continue;
            }
            context.report({ node, messageId: literal.kind, data: literalData(literal, tokensFile) });
          }
        }
      }
    }

    return {
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'style') return;
        if (node.value?.type !== 'JSXExpressionContainer' || node.value.expression.type !== 'ObjectExpression') return;
        checkObject(node.value.expression);
      },
    };
  },
};

// builder-css/use-tokens: a stylesheet takes its colours, spacing, sizes, radii, shadows and font values from the
// tokens, and reads only custom properties the tokens or the stylesheet itself define. The generated tokens file is
// the one stylesheet the configuration exempts. Descriptors of @font-face name a font, and are not checked.
const useTokensInStylesheet: CSSRuleDefinition<{
  RuleOptions: [TokensOptions?];
  MessageIds: 'colour' | 'length' | 'font' | 'variable';
}> = {
  meta: {
    type: 'problem',
    languages: ['css/css'],
    docs: { description: 'Take every colour, spacing, size, radius, shadow and font value of a stylesheet from the tokens' },
    messages: {
      ...STYLE_MESSAGES,
      variable: 'var({{name}}) reads a custom property that neither {{tokens}} nor this stylesheet defines: use a token of {{tokens}}.',
    },
    schema: TOKENS_SCHEMA,
  },
  create(context) {
    const { sourceCode } = context;
    const tokensFile = context.options[0]?.tokens ?? DEFAULT_TOKENS_FILE;
    const tokens = tokenNames(resolve(context.cwd, tokensFile));
    const own = new Set<string>();
    const variables: StyleLiteral[] = [];
    let fontFaces = 0;

    const locOf = (literal: StyleLiteral) => ({ start: sourceCode.getLocFromIndex(literal.start), end: sourceCode.getLocFromIndex(literal.end) });

    return {
      Atrule(node) {
        if (node.name.toLowerCase() === 'font-face') fontFaces += 1;
      },
      'Atrule:exit'(node) {
        if (node.name.toLowerCase() === 'font-face') fontFaces -= 1;
      },
      Declaration(node) {
        if (node.property.startsWith('--')) own.add(node.property);
        if (fontFaces > 0 || !node.value.loc) return;
        const { start, end } = node.value.loc;
        const text = sourceCode.text.slice(start.offset, end.offset);
        for (const literal of styleLiterals(node.property, text, start)) {
          if (literal.kind === 'variable') variables.push(literal);
          else context.report({ loc: locOf(literal), messageId: literal.kind, data: literalData(literal, tokensFile) });
        }
      },
      // A custom property may be defined after the rule that reads it, so var() is checked at the end.
      'StyleSheet:exit'() {
        for (const variable of variables) {
          if (tokens.has(variable.text) || own.has(variable.text)) continue;
          context.report({ loc: locOf(variable), messageId: 'variable', data: { name: variable.text, tokens: tokensFile } });
        }
      },
    };
  },
};

const plugin = {
  meta: { name: 'builder' },
  rules: { 'use-ports': usePorts, 'no-literal-ui-string': noLiteralUiString, 'use-tokens': useTokensInStyle },
};

export const builderCss = {
  meta: { name: 'builder-css' },
  rules: { 'use-tokens': useTokensInStylesheet },
};

export default plugin;
