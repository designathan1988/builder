// The change scenarios of the measurement harness (docs/testing/README.md): small real changes taken from the git
// history, each applied to the clean working tree (the reverse of a commit's hunk or files), validated by one flow,
// measured by tools/measure/measure.ts, then undone. Every scenario starts from the same validated state
// (tools/measure/baseline.ts).
//
//   node tools/measure/scenarios.ts --flow before|after [--only S1,S3]
//
// before: what every change cost under the previous rules (npm run verify:fast, then the whole browser suite);
// after:  npm run check, the limited validation.
import { spawnSync } from 'node:child_process';
import { restoreBaseline } from './baseline.ts';

interface Scenario {
  readonly id: string;
  readonly what: string;
  readonly commit: string;
  readonly files: readonly string[];
  // only this hunk (1-based) of the first file's diff; the whole diff of the files otherwise
  readonly hunk?: number;
}

export const SCENARIOS: readonly Scenario[] = [
  { id: 's1-feature-function', what: 'a function of a feature module (move up/down refuses a locked element)', commit: '6765fa4', files: ['src/core/structure/move.ts'], hunk: 3 },
  { id: 's2-central-function', what: "a function of the pointer owner, run by every canvas press (a press leaves a focused field)", commit: '1177fe8', files: ['src/editor/input/pointer.ts'], hunk: 2 },
  { id: 's3-css-and-test', what: 'a stylesheet rule and the test that pins it (a main action that cannot run is not accented)', commit: 'd0c0de7', files: ['src/editor/shell/shell.css', 'tests/e2e/door-state.spec.ts'] },
  { id: 's4-scenario-data', what: "one scenario's steps in the contract (drag-level-keys-escape)", commit: 'b31f6b4', files: ['manifest/features/02-structure-editing.json'] },
  { id: 's5-config', what: "the project configuration (package.json's verify:fast script)", commit: '7daedd7', files: ['package.json'] },
];

const FLOWS: Record<string, string> = { before: 'npm run verify:fast && npm run e2e', after: 'npm run check' };

const git = (args: readonly string[], input?: string) => spawnSync('git', args, { encoding: 'utf8', ...(input !== undefined ? { input } : {}) });

export function reversePatch(s: Scenario): string {
  const diff = git(['show', '--format=', s.commit, '--', ...s.files]).stdout;
  if (s.hunk === undefined) return diff;
  const lines = diff.split('\n');
  const header: string[] = [];
  const hunks: string[][] = [];
  for (const line of lines) {
    if (line.startsWith('@@')) hunks.push([line]);
    else if (hunks.length === 0) header.push(line);
    else hunks[hunks.length - 1]?.push(line);
  }
  const chosen = hunks[s.hunk - 1];
  if (!chosen) throw new Error(`${s.id}: ${s.commit} has no hunk ${s.hunk}`);
  return [...header, ...chosen].join('\n') + (chosen.at(-1) === '' ? '' : '\n');
}

if (import.meta.main) {
  const flow = process.argv[process.argv.indexOf('--flow') + 1] ?? '';
  const only = process.argv.includes('--only') ? (process.argv[process.argv.indexOf('--only') + 1] ?? '').split(',') : null;
  if (!(flow in FLOWS)) throw new Error('usage: node tools/measure/scenarios.ts --flow before|after [--only S1,S3]');
  const dirty = git(['status', '--porcelain']).stdout.trim();
  if (dirty !== '') throw new Error(`the scenarios need a clean working tree:\n${dirty}`);
  for (const s of SCENARIOS.filter((x) => only === null || only.some((o) => x.id.startsWith(o.toLowerCase())))) {
    if (flow === 'after') restoreBaseline();
    const patch = reversePatch(s);
    const applied = git(['apply', '-R', '-'], patch);
    if (applied.status !== 0) throw new Error(`${s.id}: the change does not apply: ${applied.stderr}`);
    console.log(`scenario ${s.id}: ${s.what} (reverse of ${s.commit} ${s.files.join(', ')}${s.hunk ? ` hunk ${s.hunk}` : ''})`);
    const r = spawnSync('node', ['tools/measure/measure.ts', '--label', `scenario-${s.id}-${flow}`, '--note', s.what, '--', FLOWS[flow] ?? ''], { stdio: 'inherit', encoding: 'utf8' });
    git(['checkout', '--', ...s.files]);
    if (flow === 'after') restoreBaseline();
    console.log(`scenario ${s.id}: flow exit ${r.status}`);
  }
}
