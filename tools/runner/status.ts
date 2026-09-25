// The derived status (CLAUDE.md "Status comes only from the runner"): a Playwright reporter that, after a run,
// prints each feature's status from the results of its scenario tests at the current commit: passes (every test of
// every scenario and door passed), fails, cannot run (it is registered as built, but a scenario of it cannot run: the
// census names why), or not built (it is not registered in the feature table, so its scenarios did not run). A
// registered feature that fails or cannot run fails the whole run. The status holds only for a clean tree, which it
// says; it is never written anywhere.
import { execFileSync } from 'node:child_process';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import { FEATURES, blockers, registered } from './scenarios.ts';

export default class StatusReporter implements Reporter {
  private readonly results = new Map<string, { passed: number; failed: number }>();

  onTestEnd(test: TestCase, result: TestResult): void {
    const feature = test.annotations.find((a) => a.type === 'feature')?.description;
    if (feature === undefined) return;
    const counts = this.results.get(feature) ?? { passed: 0, failed: 0 };
    // a scenario test passes only by passing: a skipped one proves nothing
    if (result.status === 'passed') counts.passed += 1;
    else counts.failed += 1;
    this.results.set(feature, counts);
  }

  // async: Playwright takes a new overall status only from a promise
  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | undefined> {
    if (this.results.size === 0) return undefined;
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const commit = git('rev-parse', '--short', 'HEAD');
    // the auditor's files under manifest/features/ may be in the middle of an edit (the brief's "clean tree")
    const dirty = git('status', '--porcelain').split('\n').filter((l) => l !== '' && !l.slice(3).startsWith('manifest/features/'));
    console.log(`\nstatus at ${commit}, ${dirty.length === 0 ? 'clean tree' : `tree NOT clean (${dirty.length} changed files): the status below does not count`}`);
    let broken = 0;
    for (const f of FEATURES.filter((f) => f.scenarios.length > 0 || registered(f))) {
      const counts = this.results.get(f.id);
      const blocked = registered(f) ? blockers(f) : [];
      if (!registered(f)) console.log(`  ${f.id}: not built`);
      else if (blocked.length > 0) {
        broken += 1;
        console.log(`  ${f.id}: cannot run (${blocked.join('; ')})`);
      } else if (counts === undefined) console.log(`  ${f.id}: not run`);
      else {
        if (counts.failed > 0) broken += 1;
        console.log(`  ${f.id}: ${counts.failed === 0 ? 'passes' : 'fails'} (${counts.passed} of ${counts.passed + counts.failed} tests)`);
      }
    }
    return broken > 0 && result.status === 'passed' ? { status: 'failed' } : undefined;
  }
}
