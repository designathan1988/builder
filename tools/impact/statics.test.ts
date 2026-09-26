// The static checks' ledger (tools/impact/statics.ts): a failure stays reported until it passes, and fails a check
// only when that check's change touches it.
import { describe, expect, it } from 'vitest';
import { lintFailures, problemFailures, splitFailures, typecheckFailures, unitReport } from './statics.ts';

describe('the failures a static check reports', () => {
  it('keys a type error by file, code and message, so an edit above it keeps its key', () => {
    const before = typecheckFailures('src/a.ts(10,5): error TS2322: Type string is not assignable to type number.\n');
    const moved = typecheckFailures('src/a.ts(14,5): error TS2322: Type string is not assignable to type number.\n');
    expect(before).toEqual([{ key: 'src/a.ts|TS2322|Type string is not assignable to type number.', file: 'src/a.ts' }]);
    expect(moved).toEqual(before);
  });
  it('names the files lint, the unit tests and the whole-project checks fail on', () => {
    const root = 'C:/p';
    const lint = lintFailures(JSON.stringify([{ filePath: 'C:/p/src/a.ts', errorCount: 1, warningCount: 0, messages: [{ line: 3, column: 1, ruleId: 'no-var', message: 'Unexpected var.' }] }, { filePath: 'C:/p/src/b.ts', errorCount: 0, warningCount: 0, messages: [] }]), root);
    expect(lint.map((f) => f.file)).toEqual(['src/a.ts']);
    expect(lint[0]?.text).toBe('src/a.ts:3:1 no-var Unexpected var.');
    const unit = unitReport(JSON.stringify({ testResults: [{ name: 'C:/p/src/a.test.ts', status: 'failed' }, { name: 'C:/p/src/b.test.ts', status: 'passed' }] }), root);
    expect(unit.ran).toEqual(['src/a.test.ts', 'src/b.test.ts']);
    expect(unit.failed.map((f) => f.file)).toEqual(['src/a.test.ts']);
    const problems = problemFailures('manifest:check: 3 files\n✗ [rule] x: one\n✗ npm run gen changed:\n+a\n-b\ngen:check FAILED: ...\n');
    expect(problems.map((p) => p.key)).toEqual(['✗ [rule] x: one', '✗ npm run gen changed:\n+a\n-b']);
  });
});

describe('which failures fail this check', () => {
  const a = { key: 'src/a.ts|TS1|m', file: 'src/a.ts' };
  it('a failure the ledger held, in a file this change did not touch, stays open', () => {
    expect(splitFailures([a], [a.key], new Set(['src/b.ts']))).toEqual({ blocking: [], open: [a] });
  });
  it('a new failure, or one in a file this change touched, fails the check', () => {
    expect(splitFailures([a], [], new Set(['src/b.ts']))).toEqual({ blocking: [a], open: [] });
    expect(splitFailures([a], [a.key], new Set(['src/a.ts']))).toEqual({ blocking: [a], open: [] });
  });
});
