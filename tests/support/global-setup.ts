// Before any browser test runs (playwright.config.ts globalSetup): the working tree the run tests is kept as a
// snapshot commit, and this run's records start empty; the dependency map is updated from them at the end
// (global-teardown.ts, docs/testing/README.md).
import fs from 'node:fs';
import path from 'node:path';
import { RAW_DIR, snapshotTree } from '../../tools/impact/impact.ts';

export default function globalSetup(): void {
  if (process.env.E2E_RECORD === '0') return;
  process.env.E2E_SNAPSHOT ||= snapshotTree();
  process.env.E2E_RUN_ID ||= `run-${process.pid}`;
  fs.rmSync(path.join(RAW_DIR, process.env.E2E_RUN_ID), { recursive: true, force: true });
}
