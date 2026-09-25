// The static checks of npm run check and their ledger (docs/testing/README.md, "Failures").
//
// The static checks keep a tree of their own (.cache/impact/statics.json), apart from the browser map's: a whole
// browser run (npm run e2e) validates the browser tests only, so it must not count as a run of the static checks.
// Each failure is kept as a key (a type error by file, code and message; a file that fails lint; a unit test file that
// fails; a line a whole-project check prints). A kept failure is checked again on every run until it passes, and it
// fails a check only when that check's change touches it: a failure in a changed file, or one the ledger did not hold.
// Every other failure stays listed as open: it does not block independent work, and it fails the checkpoint
// (npm run verify:fast, npm run e2e) until it is fixed.
import fs from 'node:fs';
import path from 'node:path';

export const STATICS_FILE = path.join('.cache', 'impact', 'statics.json');

export interface StaticLedger {
  // the tree the static checks last ran on
  readonly snapshot: string;
  // the failures each check left, by check name
  readonly failures: Readonly<Record<string, readonly string[]>>;
}

export interface Failure {
  readonly key: string;
  // the project file the failure is in, when it is in one ('' otherwise)
  readonly file: string;
  // what to show of it, when the key alone does not say it
  readonly text?: string;
}

export function readStatics(file = STATICS_FILE): StaticLedger | null {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8')) as StaticLedger;
}

export function writeStatics(ledger: StaticLedger, file = STATICS_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(ledger));
  fs.renameSync(tmp, file);
}

const projectPath = (file: string, root: string): string => (path.isAbsolute(file) ? path.relative(root, file) : file).replace(/\\/g, '/');

// tsc --pretty false: "path(line,col): error TSnnnn: message"; the line and column are left out of the key, since
// they move with every edit above the error
export function typecheckFailures(output: string): Failure[] {
  const found: Failure[] = [];
  for (const m of output.matchAll(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/gm)) {
    const file = (m[1] ?? '').trim().replace(/\\/g, '/');
    found.push({ key: `${file}|${m[2] ?? ''}|${(m[3] ?? '').trim()}`, file });
  }
  return found;
}

// eslint --format json: a file with any error or warning fails (the project lints with --max-warnings 0)
export function lintFailures(report: string, root: string): Failure[] {
  const results = JSON.parse(report) as { filePath: string; errorCount: number; warningCount: number; messages: { line?: number; column?: number; ruleId: string | null; message: string }[] }[];
  return results
    .filter((r) => r.errorCount + r.warningCount > 0)
    .map((r) => {
      const file = projectPath(r.filePath, root);
      return { key: file, file, text: r.messages.map((m) => `${file}:${m.line ?? 0}:${m.column ?? 0} ${m.ruleId ?? ''} ${m.message}`).join('\n') };
    });
}

// vitest's JSON report: the test files that ran, and those that failed
export function unitReport(report: string, root: string): { ran: string[]; failed: Failure[] } {
  const results = (JSON.parse(report) as { testResults: { name: string; status: string }[] }).testResults;
  const ran = results.map((r) => projectPath(r.name, root));
  const failed = results.filter((r) => r.status !== 'passed').map((r) => ({ key: projectPath(r.name, root), file: projectPath(r.name, root) }));
  return { ran, failed };
}

// a whole-project check (manifest:check, gen:check) prints each problem on a line that starts with ✗, followed by its
// details (gen:check prints the regenerated diff under its line); each problem with its details is a key
export function problemFailures(output: string): Failure[] {
  const blocks: string[][] = [];
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('✗')) blocks.push([line.trimEnd()]);
    else if (/FAILED/.test(line)) break;
    else blocks.at(-1)?.push(line.trimEnd());
  }
  return blocks.map((b) => ({ key: b.join('\n').trim(), file: '' }));
}

// The failures that fail this check, because the change touches them (in a changed file, or new since the last run),
// and those that stay open.
export function splitFailures(failures: readonly Failure[], held: readonly string[], changed: ReadonlySet<string>): { blocking: Failure[]; open: Failure[] } {
  const known = new Set(held);
  const blocking = failures.filter((f) => changed.has(f.file) || !known.has(f.key));
  const open = failures.filter((f) => !blocking.includes(f));
  return { blocking, open };
}
