// The checkpoint records (docs/testing/README.md, "The cycle"): the tree the whole browser suite last ran on and
// whether it passed, and the same for npm run verify:fast. A push to main takes a commit both passed on
// (tools/hooks/guard.ts). This file is also the Playwright reporter that records the whole suite
// (playwright.config.ts): it comes after the status reporter, which can fail a run, so it records the final status.
import fs from 'node:fs';
import path from 'node:path';
import type { FullConfig, FullResult, Reporter, Suite } from '@playwright/test/reporter';
import { wholeSuite } from '../../tests/support/global-teardown.ts';
import { treeOf, workingTree } from './impact.ts';

export const CHECKPOINT_FILE = path.join('.cache', 'impact', 'checkpoint.json');

export interface Checkpoint {
  readonly tree: string;
  readonly passed: boolean;
  readonly tests?: number;
  readonly at: string;
}
export interface Checkpoints {
  readonly e2e?: Checkpoint;
  readonly verify?: Checkpoint;
}

export function readCheckpoints(file = CHECKPOINT_FILE): Checkpoints {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Checkpoints) : {};
}

export function recordCheckpoint(kind: keyof Checkpoints, checkpoint: Checkpoint, file = CHECKPOINT_FILE): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ ...readCheckpoints(file), [kind]: checkpoint }));
  fs.renameSync(tmp, file);
}

export default class CheckpointReporter implements Reporter {
  private tests = 0;

  onBegin(_config: FullConfig, suite: Suite): void {
    this.tests = suite.allTests().length;
  }

  onEnd(result: FullResult): void {
    // only a run of the whole suite is a checkpoint; the tree is the one the run started on (global-setup.ts)
    const snapshot = process.env.E2E_SNAPSHOT;
    if (!wholeSuite(process.argv, process.env.E2E_SELECTION) || !snapshot) return;
    const tree = treeOf(snapshot) ?? workingTree();
    recordCheckpoint('e2e', { tree, passed: result.status === 'passed', tests: this.tests, at: new Date().toISOString() });
  }
}
