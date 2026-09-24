// The ESLint rules that hold the contract in code (ARCHITECTURE.md, "Lint rules of the contract"). Each rule has a
// planted violation that fails npm run verify:fast (PROGRESS.md records the raw output).
import type { Rule } from 'eslint';

type Node = Rule.Node;

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

const plugin = {
  meta: { name: 'builder' },
  rules: { 'use-ports': usePorts },
};

export default plugin;
