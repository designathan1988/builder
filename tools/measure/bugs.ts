// The regression proofs of the limited validation (docs/testing/README.md, "Proofs"): deliberate bugs, each one point
// edit in a different area, applied to the clean working tree, validated, then undone with git checkout. Every run
// starts from the same validated state (tools/measure/baseline.ts), and is measured by tools/measure/measure.ts.
//
//   node tools/measure/bugs.ts --each [--only b1,b3]   each bug alone, validated by npm run check
//   node tools/measure/bugs.ts --together              every bug at once, validated by the whole suite (npm run e2e)
//   node tools/measure/bugs.ts --independence          a failure in A stays reported while an independent change B is
//                                                      validated, then A is fixed
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { restoreBaseline } from './baseline.ts';
import { reversePatch, SCENARIOS } from './scenarios.ts';

interface Bug {
  readonly id: string;
  readonly area: string;
  readonly file: string;
  // the exact text replaced, which occurs once in the file (after `after`, when given)
  readonly find: string;
  readonly replace: string;
  readonly after?: string;
}

export const BUGS: readonly Bug[] = [
  { id: 'b1-feature', area: 'a feature module: move up/down swaps with the wrong sibling', file: 'src/core/structure/move.ts', find: "const step = direction === 'up' ? -1 : 1;", replace: "const step = direction === 'up' ? 1 : -1;" },
  { id: 'b2-central', area: 'a central file: the pointer owner no longer names the Ctrl modifier as the manifest does', file: 'src/editor/input/pointer.ts', find: "['ctrlKey', 'Ctrl'],", replace: "['ctrlKey', 'Control']," },
  { id: 'b3-css', area: "a stylesheet rule: the union of several selected elements is outlined solid, not dashed", file: 'src/editor/shell/shell.css', find: 'outline: 1px dashed var(--color-canvas-selection);', replace: 'outline: 1px solid var(--color-canvas-selection);' },
  { id: 'b4-glob-data', area: 'data the app loads only through import.meta.glob (src/manifest/runtime.ts): a heading is inserted as h4', file: 'manifest/elements.json', after: '"id": "heading",', find: '"tag": "h2",', replace: '"tag": "h4",' },
  { id: 'b5-config', area: 'the build configuration: vite.config.ts no longer injects the product name as the page title', file: 'vite.config.ts', find: 'plugins: [react(), productTitle(), toothPlugin()],', replace: 'plugins: [react(), toothPlugin()],' },
];

const git = (args: readonly string[], input?: string) => spawnSync('git', args, { encoding: 'utf8', ...(input !== undefined ? { input } : {}) });

function plant(bug: Bug): void {
  const text = fs.readFileSync(bug.file, 'utf8');
  const from = bug.after === undefined ? 0 : text.indexOf(bug.after);
  if (from < 0) throw new Error(`${bug.id}: ${bug.file} has no "${bug.after ?? ''}"`);
  const at = text.indexOf(bug.find, from);
  if (at < 0 || (bug.after === undefined && text.indexOf(bug.find, at + 1) >= 0)) throw new Error(`${bug.id}: "${bug.find}" is not once in ${bug.file}`);
  fs.writeFileSync(bug.file, text.slice(0, at) + bug.replace + text.slice(at + bug.find.length));
}

function measure(label: string, note: string, command: string): number | null {
  console.log(`bugs: ${label}: ${note}`);
  const r = spawnSync('node', ['tools/measure/measure.ts', '--label', label, '--note', note, '--', command], { stdio: 'inherit', encoding: 'utf8' });
  console.log(`bugs: ${label}: exit ${r.status}`);
  return r.status;
}

if (import.meta.main) {
  const mode = ['--each', '--together', '--independence'].find((m) => process.argv.includes(m));
  if (mode === undefined) throw new Error('usage: node tools/measure/bugs.ts --each [--only b1,b3] | --together | --independence');
  const dirty = git(['status', '--porcelain']).stdout.trim();
  if (dirty !== '') throw new Error(`the proofs need a clean working tree:\n${dirty}`);
  restoreBaseline();
  const only = process.argv.includes('--only') ? (process.argv[process.argv.indexOf('--only') + 1] ?? '').split(',') : null;
  const chosen = BUGS.filter((b) => only === null || only.some((o) => b.id.startsWith(o.toLowerCase())));
  try {
    if (mode === '--each') {
      for (const bug of chosen) {
        restoreBaseline();
        plant(bug);
        try {
          measure(`bug-${bug.id}`, bug.area, 'npm run check');
        } finally {
          git(['checkout', '--', bug.file]);
        }
      }
    } else if (mode === '--together') {
      for (const bug of chosen) plant(bug);
      measure('bugs-together', `every bug at once: ${chosen.map((b) => b.id).join(', ')}`, 'npm run e2e');
    } else {
      // A: a bug in a feature; B: an independent real change (scenario s4, one scenario's steps in the contract)
      const a = BUGS[0] as Bug;
      const b = SCENARIOS.find((s) => s.id === 's4-scenario-data');
      if (b === undefined) throw new Error('scenario s4 is missing');
      restoreBaseline();
      plant(a);
      measure('independence-1-a-broken', `A: ${a.area}`, 'npm run check');
      const applied = git(['apply', '-R', '-'], reversePatch(b));
      if (applied.status !== 0) throw new Error(`B does not apply: ${applied.stderr}`);
      measure('independence-2-b-while-a-fails', `B: ${b.what}, while A still fails`, 'npm run check');
      git(['checkout', '--', a.file]);
      measure('independence-3-a-fixed', 'A fixed, B kept', 'npm run check');
    }
  } finally {
    git(['checkout', '--', ...new Set([...BUGS.map((b) => b.file), ...SCENARIOS.flatMap((s) => s.files)])]);
    restoreBaseline();
  }
}
