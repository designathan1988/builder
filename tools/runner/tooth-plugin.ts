// The tooth proof's switch (tools/runner/tooth.ts), a Vite plugin active only when the runner sets TOOTH_COMMANDS or
// TOOTH_MODULE for the dev server it starts; the product code carries no hook for it.
// - TOOTH_COMMANDS (comma-separated command ids): the command table (src/app/commands.ts) gets, for each, a registered
//   handler that returns without changing anything, so the doors stay enabled and do nothing.
// - TOOTH_MODULE (a module path, such as src/core/render/render.ts): every exported class of the module becomes a class
//   whose methods do nothing, and every exported function one that returns nothing.
import { init, parse } from 'es-module-lexer';
import { normalizePath, type Plugin } from 'vite';

const COMMAND_TABLE = '/src/app/commands.ts';

export function toothPlugin(): Plugin | null {
  const commands = (process.env.TOOTH_COMMANDS ?? '').split(',').filter((c) => c !== '');
  const module = process.env.TOOTH_MODULE ?? '';
  if (commands.length === 0 && module === '') return null;
  return {
    name: 'tooth-proof',
    enforce: 'post',
    async transform(code, id) {
      const file = normalizePath(id).split('?')[0] ?? '';
      if (commands.length > 0 && file.endsWith(COMMAND_TABLE)) {
        return `${code}\nimport { registerHandler as __toothHandler } from '/src/core/commands/registry.ts';\nfor (const __id of ${JSON.stringify(commands)}) COMMANDS[__id] = __toothHandler(__id, () => ({ kind: 'change' }));\n`;
      }
      if (module !== '' && file.endsWith(`/${module}`)) {
        await init;
        const [, exported] = parse(code);
        const locals = exported.map((e) => e.ln).filter((ln): ln is string => ln !== undefined);
        const noop = locals
          .map(
            (ln) =>
              `try { if (typeof ${ln} === 'function') { if (/^class[\\s{]/.test(Function.prototype.toString.call(${ln}))) { const __m = Object.getOwnPropertyNames(${ln}.prototype).filter((n) => n !== 'constructor'); ${ln} = class {}; for (const __n of __m) ${ln}.prototype[__n] = function () {}; } else ${ln} = function () {}; } } catch {}`,
          )
          .join('\n');
        return `${code}\n${noop}\n`;
      }
      return undefined;
    },
  };
}
