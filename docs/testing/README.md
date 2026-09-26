# Testing

How the project validates a change, why each rule exists, and what was measured to decide it. Every number below
comes from `tools/measure/measure.ts`; its log is in `.cache/logs/` and its record in `.cache/measure/results.jsonl`.

## The cycle

| When | Command | What it runs |
|---|---|---|
| After each change | `npm run check` | The limited validation: only what the change can affect, widened by itself when it cannot tell. |
| At the checkpoint (a commit reaches `main`) | `npm run verify:fast`, then `npm run e2e` | Every static check, then the whole browser suite, on that commit. |
| A failure to understand | `npm run e2e:diagnose` | The failed browser tests again, with their trace. |
| A feature's proof | `npm run e2e:tooth <id>` | Unchanged: the feature's scenarios fail with its handler off. |

The hooks in `.claude/settings.json` (`tools/hooks/guard.ts`) hold the agents to it:

- **The end of a turn.** A turn that leaves changes `npm run check` has not validated is sent back once, to run it. Why:
  a change nobody validated is the most expensive kind to find later.
- **A commit on main.** It takes only a working tree `npm run check` validated, even when the check failed. Why: the
  author has seen the result. A failing tree belongs on a `wip/` branch.
- **A commit on any other branch** (`integration`, `feature/`, `wip/`) takes no check. Why: it saves the work, which
  must never wait for a test (the user's decision after a day of work was left out of every commit); the tests run at
  the end of each block, and `main` is still guarded by the checkpoint below.
- **Which repository.** The guard judges the repository the git command runs in: the path of `git -C`, else the hook's
  cwd, never the project's main folder (a worktree has its own branch and its own records of the checks).
- **A push to main.** It takes only a commit that `npm run e2e` and `npm run verify:fast` both passed on. Each records
  the tree it ran on and its final status (`tools/impact/checkpoint.ts`). Why: `main` stays green. The limited
  validation vouches for a change, and the checkpoint vouches for the commit.

The whole suite runs at the checkpoint and whenever `npm run check` widens to it. It never runs after an ordinary
change. Why: in one builder session it ran after every change, 23 times in 3 h 41, mostly on code nothing had changed.

## What `npm run check` does

It builds the app, then starts two things at once:

- the static checks on what changed since they last ran;
- the browser tests the dependency map cannot vouch for.

Every other test keeps its last result. The output says why each test runs and lists every open failure.

### Browser tests: the dependency map

Every browser run records, for each test, what it used (`tests/support/test.ts`):

- the functions it executed, from Chrome's function-level coverage through CDP;
- the CSS rules it used;
- the classes it saw.

After the run, `tests/support/global-teardown.ts` turns those records into content keys of the build and stores them
in `.cache/impact/map.json`. A function's key is the hash of its own code with its nested functions cut out, read
from the unminified e2e build (`tools/impact/analyze.ts`). A later check runs a test again unless every one of the
following still holds (`tools/impact/impact.ts`, `decide`):

| The test runs again when | Why |
|---|---|
| A function it executed changed | That code is its behaviour. |
| The app's load-time code changed, including the order of the modules | Every test runs it, and a changed import can reorder it. Its effects cannot be traced safely, so the tool does not try. |
| A CSS rule it used changed or moved, or a new rule can match an element it had | Cascade order and a new selector both change the computed style. |
| Its test code, or any local module that code imports, changed | The test-side import graph is followed file by file (`localImports`). Playwright's `--only-changed` missed the 163 scenario tests: they are declared in `tools/runner/scenarios.ts`, outside the spec file (measured: 159 tests selected, none of the runner's). |
| Its scenario, feature or fixture changed | Compared scenario by scenario. The census reads every scenario, so it runs whenever any scenario file changes. |
| It is new, its last record is incomplete, or its spec opens pages the recorder does not follow | Nothing vouches for it. |

Some changes run **every** browser test:

- the environment: `package.json`, the lockfile, the Playwright, Vite and TypeScript configurations, `index.html`, the
  tooth plugin, `tests/support/`, `tools/impact/`, and the versions of the browser, Node and Playwright;
- the data the tests read at run time: `manifest/` (outside the scenario files), `src/i18n/`, `src/generated/` and
  `design/`;
- any other file the build serves.

A failed test stays in the map. It runs again as soon as anything it depends on changes. Until then each check
lists it as an **OPEN FAILURE**: it does not fail that check, and it fails the checkpoint.

### Static checks: their own tree and a ledger

The static checks keep their own tree and their failures in `.cache/impact/statics.json` (`tools/impact/statics.ts`).
They keep a tree apart from the map because a whole browser run moves the map's tree without running them.

| Check | What runs | Widened to everything when |
|---|---|---|
| Type check | The whole program, incrementally | Always. |
| Lint | The changed files, plus those that failed before | `eslint.config.js`, a module it imports (the project's own rules), `src/ui/tokens.css` (its rules read it) or the lockfile changed. |
| Unit tests | `vitest related` on every changed file, data included: it follows JSON and `import.meta.glob`, e.g. 23 of 29 test files for `manifest/elements.json`. Also every unit test whose imports reach `node:fs` or `node:child_process`, since the module graph cannot see what those read. | `vitest.config.ts`, the package files or the TypeScript configurations changed. |
| `manifest:check`, `gen:check` | Every run | Always: `manifest:check` reads every source file, the catalogues and `ARCHITECTURE.md`. |

A failure is keyed: a type error by its file, code and message; lint and unit failures by their file; the whole-project
checks by the problem each one prints. A failure fails the check when it is new or sits in a changed file. A failure
the ledger already held, in a file the change did not touch, stays open: it is listed, checked again on every run,
and blocks the checkpoint.

## Rules, and why

- **No trace on every test** (`trace: 'off'`). Recording every test cost 38% of the scenario tests' CPU and 33% of
  their time. A failure is diagnosed with `npm run e2e:diagnose`.
- **One editor load per test** (`tests/support/editor.ts`, `openEditor`). A goto, clear and reload loaded the editor
  twice, which cost 11% of the CPU and 6% of the time. The helper asserts that the browser profile starts empty.
- **No retries, ever.** A flaky test is reported with its evidence (the failing run's log, and the count over repeated
  runs) and its cause is fixed. Two races were found and fixed this way (below).
- **The e2e build is not minified** (`vite.config.ts`, `E2E_BUILD`). The map needs the functions intact. It costs no
  measurable time: the whole build takes 0.8 s.
- **Workers: 4 by default** (`E2E_WORKERS`, unchanged). For the 163 scenario tests:

  | Workers | Time | Machine CPU-s | Peak CPU | Processes | Memory |
  |---|---|---|---|---|---|
  | 2 | 61.3 s | 355 | 29% | 27 | 2.1 GB |
  | 4 | 35.7 s | 329 | 50% | 47 | 3.8 GB |
  | 8 | 27.0 s | 448 | 93% | 155 | 13.1 GB |

  Going from 4 to 8 workers costs 36% more CPU per test to save 24% of the time. The machine is oversubscribed
  there: 93% peak, 155 processes. The default stays at 4; a run can ask for more through `E2E_WORKERS`.

## Causes found

Each cause was switched off on its own and measured. Figures are for the 163 scenario tests at 4 workers unless noted.

| Cause | Contribution | Fix |
|---|---|---|
| The agents' flow: the whole suite after every change | 23 runs of 334 tests in 3 h 41 | `npm run check` after a change; the suite at the checkpoint (hooks) |
| A trace recorded on every test | 38% of the CPU (535 → 329 CPU-s), 33% of the time (53.1 → 35.7 s) | `a705b87` |
| The editor loaded twice per test | 11% of the CPU (329 → 294 CPU-s), 6% of the time | `92f3b37` |
| A race: the canvas fitted after its first paint | 5 failures in 40 runs under load, 0 after the fix | `bb6f5ad` |
| A race: `openMenu` counted the menu buttons before the editor existed | Failed empty-container under load; reproduced every time with a 6x CPU throttle | `bed7746` |
| More than 4 workers | +36% CPU per test at 8 workers (table above) | Measured; the default stays |

Measured and **not** causes:

- the build step, 0.8 s;
- the app's boot, 170 ms per test;
- the dev server's file watcher: the suite tests the static build since `c3bcb36`.

## Proofs

`tools/measure/scenarios.ts` replays five small real changes from the git history, and `tools/measure/bugs.ts` plants
five deliberate bugs. Both start from the saved validated state (`tools/measure/baseline.ts`).

### Change scenarios

Before, every change cost the same: `npm run verify:fast` and then `npm run e2e`. That was 131.6 s, 460 unit tests and
334 browser tests, measured at `131de7f`.

| Scenario | After (`npm run check`) | Browser tests run | Result |
|---|---|---|---|
| S1: a feature function (`move.ts`) | 30.1 s | 35 of 335 | Caught: 2 browser tests, 1 unit test |
| S2: a function of the pointer owner | 80.0 s | 334 of 335 | Caught: 1 browser test, the type check and lint. The function runs in almost every test. |
| S3: a stylesheet rule and its test | 78.5 s | 333 of 334 | Passed. The rule is used by 331 tests. |
| S4: one scenario's steps | 26.4 s | 2 of 335 | Passed |
| S5: `package.json` | 79.5 s | 335 of 335 (the environment) | Passed |

### Deliberate bugs

Each bug was planted alone, validated by `npm run check`, then undone.

| Bug | Area | Browser tests run | Caught by |
|---|---|---|---|
| b1 | A feature module: move up/down swaps with the wrong sibling | 31 | 11 browser tests, 3 unit tests |
| b2 | A central file: the pointer owner's modifier table | 335 (load-time code) | 6 browser tests |
| b3 | A stylesheet rule: the multi-selection union drawn solid | 32 | 1 browser test |
| b4 | Data loaded only through `import.meta.glob`: the heading's tag | 335 (runtime data) | 6 browser tests |
| b5 | Configuration: `vite.config.ts` loses the title plugin | 335 (environment) | 1 browser test, the type check, lint |

All five at once, under the whole suite, failed 24 tests: exactly the union of the five checks (b2 and b3 share one
test).

### Independence

1. Bug A (b1) was planted: the check failed with 11 browser tests and 3 unit tests.
2. With A still in place, an independent change B (S4) was validated: `PASSED in 25.6 s`. A's 11 browser failures and
   its failing unit test file were listed as open.
3. A was fixed: its 31 tests ran again and passed, and the open failures were gone.

## Findings not refactored

Coupling, measured from the validated map of 335 tests:

- **The boot path.** Every test boots the whole editor, so 405 of the 899 functions in `src/` run in 300 or more
  tests. In 29 files, every function does, among them `store.ts`, `registry.ts`, `shell/*.tsx`, `inspector.tsx`,
  `sidebar.tsx` and `autosave.ts`. A change there legitimately runs about every test. Separating it would mean tests
  that skip the real boot, which the project's rules forbid (tests enter only through doors).
- **The middle tier.** 17 files have a median of 100 to 299 tests per function, for example `pointer.ts` (236),
  `render.ts` (270), `door.tsx` (297) and `keymap.ts` (177). Only 20 files have a median below 100: the feature
  modules, such as `move.ts` (13), `wrap.ts` (31) and `insert.ts` (34).
- **Load-time code.** 418 module-level statements in 67 modules of `src/` run at load, in every test. A change to any
  of them, or to an import that reorders the modules, runs all 335 tests. It happened to S1's first candidate: removing
  an import from `remove.ts` reordered the bundle. `pointer.ts` alone has 35 such statements (its modifier table is
  bug b2). Moving tables into functions would not change which tests execute them, and module order can change
  behaviour, so the tool stays order-sensitive.
- **Global CSS.** 151 of the 234 CSS rules are used by 300 or more tests: the tokens, the reset and the shell layout
  in `shell.css`. S3's rule was used by 331 tests.
- **The unit tests that read files** run on every change: `tools/manifest/check.test.ts`,
  `tools/impact/impact.test.ts` and `tools/lint/plugin.test.ts`. That takes about 14 s, of which
  `tools/manifest/check.test.ts` takes about 13 s. It adds up to 6 s to a check whose browser tests finish sooner.
- **The e2e build does not deep-freeze store states** (`store.ts`: `freeze: import.meta.env.DEV`) since the suite
  moved to the build in `c3bcb36`. A mutation of a past state would no longer throw under test.

Flaky tests, never retried:

- **Fixed in `75b719f`:** `multi-select-click.spec.ts`, "the outline is on the title alone". It failed 2 times in
  about 716 runs. The failure said `Timeout 5000ms exceeded while waiting on the predicate` with no
  Expected/Received, and Playwright prints that only when no call of the poll's predicate returned. The cause was in
  the test's helper, which counted the outlines and then asked each one's box. The count saw an outline that the
  chrome removed on its next frame, and the box of the removed outline waited out the whole poll.

  The test now reads the outlines and the elements in one task of the page. Its claims are stricter:
  - every element has exactly one outline;
  - nothing else is outlined;
  - "the page does not move on a click" is now its own check.

  Planted app bugs make it fail on its assertions: an outline 3 px off, a solid union, a page that moves, and a union
  left for one element.
- **From `PROGRESS.md` finding 12:** `coordinates.spec.ts:181` and a "stable" File menu button timed out in builder
  sessions that ran four suites of 12 workers at once, and reruns passed. There is no failure log. Neither has failed
  in the whole-suite runs of this work, and the coordinates test takes 1.9 s. Each one needs its failure log before it
  can be changed.

## Measurement harness

```
node tools/measure/measure.ts --label <name> [--note <text>] -- <command>
node tools/measure/scenarios.ts --flow before|after [--only s1,s3]
node tools/measure/bugs.ts --each [--only b1,b3] | --together | --independence
node tools/measure/baseline.ts --save
```

`measure.ts` samples the machine's CPU and the command's process tree, found by parent and creation time. It reports
the wall time, CPU seconds, peak processes and memory, the tests run, and orphans. It never ends a process.

An earlier version ended processes. Through process-id reuse, it took system and session processes for orphans of the
tree and ended the ones Windows let it end (Explorer among them) during one run of S3. Windows restarted them. The
harness has reported without ending anything since `a1592ba`.
