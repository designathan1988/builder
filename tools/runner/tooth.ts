// The runner's tooth proof (npm run e2e:tooth [feature ids]): for each feature that runs (every command it lists is
// built), its scenario tests are run again against a dev server whose feature is switched off by the tooth plugin
// (tools/runner/tooth-plugin.ts): its command handlers made no-ops (with those of its scenarios' action doors), or,
// for a feature without commands, the module it names (toothProof). Every one of its tests must fail on an assertion; a feature with a test that still passes, or
// that only times out, has no tooth, and the run fails. The raw result of each run is printed.
// A test whose action undoes what a step before it did (ArrowDown after ArrowUp, drag-level-keys-escape) passes with
// both switched off, since neither then happens: a test that passes with every command off is run once more with the
// commands its steps before the action run switched back on, every other one (the action's own among them) still off,
// and it has a tooth when it fails then. A test with no such step keeps its first result.
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

// The commands a feature's tooth switches off: its own and, when it has commands, those of the action doors its
// scenarios prove (a scenario whose action is another command's door, such as the Escape that cancels a palette
// drag, drag.cancel, proves that door within the feature: its own commands off, it would still pass).
const toothCommands = (feature: (typeof features)[number]): string[] =>
  feature.commands.length === 0 ? [] : [...new Set([...feature.commands, ...feature.scenarios.flatMap((s) => s.doors.map((d) => d.split('#')[0] ?? ''))])];

interface Outcome {
  readonly title: string;
  readonly status: string;
  readonly reason: string;
}

// The scenario tests whose titles match `grep`, run with these commands' handlers (or this module) made no-ops.
function runSwitchedOff(commands: readonly string[], module: string, grep: string): Outcome[] {
  const env = { ...process.env, TOOTH_COMMANDS: commands.join(','), TOOTH_MODULE: module, E2E_PORT: process.env.TOOTH_PORT ?? '5390' };
  const run = spawnSync(process.execPath, [cli, 'test', 'tests/e2e/scenarios.spec.ts', '--grep', grep, '--reporter=json', '--output', '.cache/pw-tooth'], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const report = JSON.parse(run.stdout) as { suites: Listed[] };
  const outcomes: Outcome[] = [];
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
  return outcomes;
}

// The commands switched back on for a test's second run: those of its scenario's steps before the action step that
// the first run switched off, but the action's own (a test is titled "<feature> › <scenario> › <door>").
function stepsBeforeTheAction(feature: (typeof features)[number], commands: readonly string[], title: string): string[] {
  const [, scenario, door] = title.split(' › ');
  const s = feature.scenarios.find((x) => x.id === scenario);
  const action = s?.steps.findIndex((step) => step.action) ?? -1;
  if (s === undefined || action < 0 || door === undefined) return [];
  const own = door.split('#')[0];
  return [...new Set(s.steps.slice(0, action).map((step) => step.door.split('#')[0] ?? ''))].filter((c) => c !== own && commands.includes(c));
}
const exactly = (title: string) => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

for (const feature of features) {
  const commands = toothCommands(feature);
  const outcomes = runSwitchedOff(commands, commands.length === 0 ? (feature.toothProof ?? '') : '', FEATURE_TAG(feature.id));
  const off = commands.length > 0 ? `handlers of ${commands.join(', ')} made no-ops, their availability predicates held true` : `module ${feature.toothProof ?? '(none named)'} made a no-op`;
  console.log(`\n${feature.id}: ${off}`);
  // a tooth is a test that fails on an assertion; one that passes, or times out, proves nothing
  const LABEL: Record<string, string> = {
    passed: 'PASSED (no tooth)',
    timedOut: 'TIMED OUT (no tooth: a test fails on an assertion, never on time)',
    actionTimedOut: 'ACTION TIMED OUT (no tooth: a test fails on an assertion, never on time)',
  };
  for (const o of outcomes) console.log(`  ${LABEL[o.status] ?? o.status}  ${o.title}${o.reason === '' ? '' : `\n      ${o.reason}`}`);
  // a test that passed with every command off runs again with the commands of its steps before the action back on
  const again = new Map<string, { on: string[]; titles: string[] }>();
  for (const o of outcomes.filter((x) => x.status === 'passed')) {
    const on = stepsBeforeTheAction(feature, commands, o.title);
    if (on.length === 0) continue;
    const key = on.join(',');
    again.set(key, { on, titles: [...(again.get(key)?.titles ?? []), o.title] });
  }
  for (const { on, titles } of again.values()) {
    const offAgain = commands.filter((c) => !on.includes(c));
    console.log(`  run again with ${on.join(', ')} back on, the handlers of ${offAgain.join(', ')} still no-ops:`);
    const rerun = runSwitchedOff(offAgain, '', titles.map(exactly).join('|')).filter((o) => titles.includes(o.title));
    for (const o of rerun) {
      console.log(`    ${LABEL[o.status] ?? o.status}  ${o.title}${o.reason === '' ? '' : `\n        ${o.reason}`}`);
      const at = outcomes.findIndex((x) => x.title === o.title);
      if (at >= 0) outcomes[at] = o;
    }
  }
  const failed = outcomes.filter((o) => o.status === 'failed').length;
  if (outcomes.length === 0 || failed < outcomes.length) toothless += 1;
  console.log(`  ${failed} of ${outcomes.length} tests fail with the feature switched off: ${outcomes.length > 0 && failed === outcomes.length ? 'it has teeth' : 'NO TOOTH'}`);
}
console.log(`\ntooth proof: ${features.length} features, ${toothless} without teeth`);
process.exit(toothless === 0 && features.length > 0 ? 0 : 1);
