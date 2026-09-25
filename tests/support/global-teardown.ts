// After a browser run (playwright.config.ts globalTeardown): every test that ran becomes an entry of the dependency
// map, with its result, against the build it ran (docs/testing/README.md). A run of the whole suite replaces the map;
// a limited validation (npm run check) updates the tests it ran and moves the map's snapshot to the tree it tested,
// since it accounted for every change since the previous snapshot; any other partial run only updates its tests.
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, entryOf, environmentHash, environmentParts, readBuild, readMap, writeMap, type RawRecord, type TestEntry } from '../../tools/impact/impact.ts';

// the whole suite: no selection, no filter option and no file or line argument on the command line
const FILTERS = ['--grep', '-g', '--grep-invert', '--only-changed', '--last-failed', '--test-list', '--test-list-invert', '--project'];
const TAKES_VALUE = ['--workers', '-j', '--reporter', '--trace', '--output', '--repeat-each', '--max-failures', '--timeout', '--global-timeout', '--shard', '--config', '-c', '--retries', '--tsconfig', ...FILTERS];
export function wholeSuite(argv: readonly string[], selection: string | undefined): boolean {
  if (selection) return false;
  const args = argv.slice(argv.indexOf('test') + 1);
  return args.every((a, i) => {
    if (FILTERS.some((f) => a === f || a.startsWith(`${f}=`))) return false;
    if (a.startsWith('-')) return true;
    // a value of the option before it, or a file / line filter
    return TAKES_VALUE.includes(args[i - 1] ?? '');
  });
}

export default function globalTeardown(): void {
  if (process.env.E2E_RECORD === '0') return;
  const started = Date.now();
  const dir = path.join(RAW_DIR, process.env.E2E_RUN_ID ?? '');
  if (!fs.existsSync(dir)) return;
  const raws = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as RawRecord);
  if (raws.length === 0) return;
  const build = readBuild();
  const parts = environmentParts(raws[0]?.browser ?? 'unknown');
  const environment = environmentHash(parts);
  const whole = wholeSuite(process.argv, process.env.E2E_SELECTION);
  const check = process.env.E2E_CHECK === '1';
  const previous = readMap();
  const kept: Record<string, TestEntry> = !whole && previous !== null && previous.environment === environment ? { ...previous.tests } : {};
  for (const raw of raws) kept[raw.id] = entryOf(raw, build);
  const snapshot = whole || check || previous === null || previous.environment !== environment ? (process.env.E2E_SNAPSHOT ?? '') : previous.snapshot;
  writeMap({ environment, environmentParts: parts, snapshot, builds: { ...(previous?.builds ?? {}), [build.id]: build.entry }, tests: kept });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`impact: ${raws.length} tests recorded in the dependency map (${whole ? 'whole suite' : check ? 'limited validation' : 'partial run'}), ${Object.keys(kept).length} tests mapped, in ${Date.now() - started} ms`);
}
