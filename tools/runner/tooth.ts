// The runner's tooth proof (npm run e2e:tooth [feature ids]): for each feature that runs (every command it lists is
// built), its scenario tests are run again against a dev server whose feature is switched off by the tooth plugin
// (tools/runner/tooth-plugin.ts): its command handlers made no-ops, or, for a feature without commands, the module it
// names (toothProof). Every one of its tests must fail on an assertion; a feature with a test that still passes, or
// that only times out, has no tooth, and the run fails. The raw result of each run is printed.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { FEATURES, FEATURE_TAG, runnable } from './scenarios.ts';

const only = process.argv.slice(2);
const features = FEATURES.filter(runnable).filter((f) => only.length === 0 || only.includes(f.id));
const cli = path.join('node_modules', '@playwright', 'test', 'cli.js');
let toothless = 0;

interface Listed {
  readonly specs?: readonly { readonly title: string; readonly tests: readonly { readonly results: readonly { readonly status: string; readonly errors?: readonly { readonly message?: string }[] }[] }[] }[];
  readonly suites?: readonly Listed[];
}

// Why a test failed: the first line of its message and, when it is another line, the matcher that compared (an
// expect with a message of its own starts with that message), without the terminal's colour codes.
function firstLine(message: string | undefined): string {
  // eslint-disable-next-line no-control-regex
  const lines = (message ?? '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const first = lines[0] ?? '';
  const matcher = lines.find((l) => /expect\(/.test(l));
  return matcher === undefined || matcher === first ? first : `${first} | ${matcher}`;
}
// An action or a wait that ran out of time (`locator.click: Timeout 5000ms exceeded.`) is no assertion: the test
// never compared a result. An expect that ran out of time compared one until then, and is an assertion.
const actionTimeout = (line: string): boolean => /: Timeout \d+ms exceeded/.test(line) && !/expect\(/.test(line);

for (const feature of features) {
  const env = { ...process.env, TOOTH_COMMANDS: feature.commands.join(','), TOOTH_MODULE: feature.commands.length === 0 ? (feature.toothProof ?? '') : '', E2E_PORT: process.env.TOOTH_PORT ?? '5390' };
  const run = spawnSync(process.execPath, [cli, 'test', 'tests/e2e/scenarios.spec.ts', '--grep', FEATURE_TAG(feature.id), '--reporter=json', '--output', '.cache/pw-tooth'], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const report = JSON.parse(run.stdout) as { suites: Listed[] };
  const outcomes: { title: string; status: string; reason: string }[] = [];
  const walk = (s: Listed) => {
    for (const spec of s.specs ?? [])
      for (const t of spec.tests) {
        const last = t.results.at(-1);
        const reason = firstLine(last?.errors?.[0]?.message);
        // a failure that only ran out of time on an action counts as a timeout
        const status = last?.status === 'failed' && actionTimeout(reason) ? 'actionTimedOut' : (last?.status ?? 'none');
        outcomes.push({ title: spec.title, status, reason });
      }
    for (const inner of s.suites ?? []) walk(inner);
  };
  for (const s of report.suites) walk(s);
  const off = feature.commands.length > 0 ? `handlers of ${feature.commands.join(', ')} made no-ops, their availability predicates held true` : `module ${feature.toothProof ?? '(none named)'} made a no-op`;
  console.log(`\n${feature.id}: ${off}`);
  // a tooth is a test that fails on an assertion; one that passes, or times out, proves nothing
  const LABEL: Record<string, string> = {
    passed: 'PASSED (no tooth)',
    timedOut: 'TIMED OUT (no tooth: a test fails on an assertion, never on time)',
    actionTimedOut: 'ACTION TIMED OUT (no tooth: a test fails on an assertion, never on time)',
  };
  for (const o of outcomes) console.log(`  ${LABEL[o.status] ?? o.status}  ${o.title}${o.reason === '' ? '' : `\n      ${o.reason}`}`);
  const failed = outcomes.filter((o) => o.status === 'failed').length;
  if (outcomes.length === 0 || failed < outcomes.length) toothless += 1;
  console.log(`  ${failed} of ${outcomes.length} tests fail with the feature switched off: ${outcomes.length > 0 && failed === outcomes.length ? 'it has teeth' : 'NO TOOTH'}`);
}
console.log(`\ntooth proof: ${features.length} features, ${toothless} without teeth`);
process.exit(toothless === 0 && features.length > 0 ? 0 : 1);
