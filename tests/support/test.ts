// The one entry point of every browser test (eslint: specs and the scenario runner import test and expect from here,
// never from '@playwright/test' directly). It adds one automatic fixture, `impact`, which records what each test
// depends on, so that the limited validation (npm run check, docs/testing/README.md) can tell which tests a change
// can affect: Chrome's own JS and CSS coverage of every page the test uses (the functions it executed and the CSS
// rules it used) and every CSS class that appeared in those pages. A test that drives pages of its own (the census)
// hands them to impact.track. The record of each test, passed or failed, is written to .cache/impact/raw/.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };
export type { Download, Locator, Page, TestInfo } from '@playwright/test';

export const RAW_DIR = path.join('.cache', 'impact', 'raw');
const CLASSES_BINDING = '__impactClasses';

export interface PageRecord {
  // per script served by the app (the bundle path), the [start, end] of every function that ran
  readonly js: Record<string, [number, number][]>;
  // per stylesheet served by the app, the [start, end] ranges of the rules that were used
  readonly css: Record<string, [number, number][]>;
}

export interface RawRecord {
  readonly id: string;
  readonly browser: string;
  readonly status: string;
  readonly error: string | null;
  readonly complete: boolean;
  readonly pages: readonly PageRecord[];
  readonly classes: readonly string[];
}

// A test's id is its exact title path (file, describe titles, title) as JSON: scenario titles contain ' › ' themselves.
export const testId = (titlePath: readonly string[]): string => JSON.stringify(titlePath);

// Playwright's grep matches '<file> <describes> <title> <tags>' joined by spaces; this matches one test exactly.
export const testGrep = (id: string): RegExp => {
  const escaped = (JSON.parse(id) as string[]).join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s@\\S+)*$`);
};

// the tests a limited validation runs (E2E_SELECTION: a JSON list of ids written by tools/impact/check.ts)
export function selectedTests(file: string | undefined): RegExp[] | undefined {
  if (file === undefined || file === '') return undefined;
  const ids = JSON.parse(fs.readFileSync(file, 'utf8')) as string[];
  return ids.map(testGrep);
}

interface Impact {
  // records a page the test opened itself (in a browser context of its own); the returned function collects what
  // the page ran, and is called before the test closes that page
  readonly track: (page: Page) => Promise<() => Promise<void>>;
}

const servedPath = (url: string, origin: string): string | null => {
  if (!url.startsWith(origin)) return null;
  const p = new URL(url).pathname;
  return p.endsWith('.js') || p.endsWith('.css') ? p : null;
};

async function startRecording(page: Page, classes: Set<string>, origin: string): Promise<() => Promise<PageRecord>> {
  await page.exposeFunction(CLASSES_BINDING, (names: string[]) => {
    for (const n of names) classes.add(n);
  });
  await page.addInitScript((binding) => {
    const sent = new Set<string>();
    let queued: string[] = [];
    const flush = () => {
      const batch = queued;
      queued = [];
      if (batch.length > 0) (window as unknown as Record<string, (n: string[]) => void>)[binding]?.(batch);
    };
    const note = (el: Element) => {
      for (const c of Array.from(el.classList)) {
        if (sent.has(c)) continue;
        sent.add(c);
        queued.push(c);
      }
    };
    const sweep = (el: Element) => {
      note(el);
      for (const inner of Array.from(el.querySelectorAll('[class]'))) note(inner);
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'attributes' && r.target instanceof Element) note(r.target);
        for (const n of Array.from(r.addedNodes)) if (n instanceof Element) sweep(n);
      }
      if (queued.length > 0) queueMicrotask(flush);
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }, CLASSES_BINDING);
  // V8's function-level coverage, straight from the protocol: which functions ran, no call counts and no block ranges
  // (Playwright's page.coverage always asks for block ranges, which cost 20% of the suite's CPU for nothing the
  // selection reads); it accumulates across navigations until it is taken
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.startPreciseCoverage', { callCount: false, detailed: false });
  await page.coverage.startCSSCoverage({ resetOnNavigation: false });
  return async () => {
    const [{ result }, css] = await Promise.all([cdp.send('Profiler.takePreciseCoverage'), page.coverage.stopCSSCoverage()]);
    await cdp.send('Profiler.stopPreciseCoverage');
    const record: PageRecord = { js: {}, css: {} };
    for (const script of result) {
      const p = servedPath(script.url, origin);
      if (p === null) continue;
      const ran = script.functions.flatMap((f) => (f.ranges[0] !== undefined && f.ranges[0].count > 0 ? [[f.ranges[0].startOffset, f.ranges[0].endOffset] as [number, number]] : []));
      record.js[p] = [...(record.js[p] ?? []), ...ran];
    }
    for (const entry of css) {
      const p = entry.url ? servedPath(entry.url, origin) : null;
      if (p === null) continue;
      record.css[p] = [...(record.css[p] ?? []), ...entry.ranges.map((r) => [r.start, r.end] as [number, number])];
    }
    return record;
  };
}

export const test = base.extend<{ impact: Impact }>({
  impact: [
    async ({ page, baseURL }, use, testInfo) => {
      const recording = process.env.E2E_RECORD !== '0';
      const origin = baseURL ?? '';
      const classes = new Set<string>();
      const pending = new Set<() => Promise<PageRecord>>();
      const pages: PageRecord[] = [];
      let complete = true;
      const collect = async (finish: () => Promise<PageRecord>) => {
        if (!pending.delete(finish)) return;
        try {
          pages.push(await finish());
        } catch {
          // a page closed before it was collected: what it ran is lost, so the record cannot vouch for the test
          complete = false;
        }
      };
      const track = async (p: Page) => {
        if (!recording) return async () => undefined;
        try {
          const finish = await startRecording(p, classes, origin);
          pending.add(finish);
          return () => collect(finish);
        } catch {
          complete = false;
          return async () => undefined;
        }
      };
      await track(page);
      await use({ track });
      if (!recording) return;
      for (const finish of [...pending]) await collect(finish);
      const id = testId(testInfo.titlePath);
      const record: RawRecord = { id, browser: page.context().browser()?.version() ?? 'unknown', status: testInfo.status ?? 'unknown', error: testInfo.error?.message?.split('\n')[0] ?? null, complete, pages, classes: [...classes].sort() };
      const dir = path.join(RAW_DIR, process.env.E2E_RUN_ID ?? 'run');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${createHash('sha1').update(id).digest('hex').slice(0, 20)}-${testInfo.repeatEachIndex}.json`), JSON.stringify(record));
    },
    { auto: true },
  ],
});
