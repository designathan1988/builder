// npm run verify:fast after gen:check: typecheck, lint, unit and manifest:check at the same time. Each one's whole
// output is printed, one after the other, with its exit code; the run fails when any of them fails. The result is a
// checkpoint record of the tree it ran on (tools/impact/checkpoint.ts): a push to main takes a commit it passed on.
import { spawn } from 'node:child_process';
import { recordCheckpoint } from '../impact/checkpoint.ts';
import { workingTree } from '../impact/impact.ts';

const STEPS = ['typecheck', 'lint', 'unit', 'manifest:check'] as const;
const tree = workingTree();

function run(script: string): Promise<{ script: string; code: number; output: string; ms: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', script], { shell: true, env: { ...process.env, FORCE_COLOR: '0' } });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('close', (code) => resolve({ script, code: code ?? 1, output, ms: Date.now() - started }));
  });
}

const results = await Promise.all(STEPS.map(run));
for (const r of results) {
  process.stdout.write(r.output);
  console.log(`verify:fast: ${r.script} exit ${r.code} (${r.ms} ms)\n`);
}
const failed = results.filter((r) => r.code !== 0).map((r) => r.script);
console.log(failed.length === 0 ? 'verify:fast: every step passed' : `verify:fast: FAILED ${failed.join(', ')}`);
recordCheckpoint('verify', { tree, passed: failed.length === 0, at: new Date().toISOString() });
process.exit(failed.length === 0 ? 0 : 1);
