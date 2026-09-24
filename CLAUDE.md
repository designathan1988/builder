# Builder

A desktop pagebuilder that runs in recent Chrome only, for professionals who build websites.

Files that drive the work:
- `features.json`: everything the app must do. Each entry may point to a behavior spec in `spec/behavior/`.
- `DESIGN.md`: the interface. Layout, panels, where every capability lives, design tokens.
- `ARCHITECTURE.md`: the modules and the single owner of every concept.
- `PROGRESS.md`: your handoff notes between sessions.

Reference material in `reference/` is read-only. Never write anything inside it.
- `reference/Pager` shows what the app must be able to do. It is not a model for layout or code. To run it, copy it to `.cache/pager-run` and run the copy.
- `reference/Brickflow` and `reference/report.txt` show a previous attempt and the audit of why it failed. Do not copy from them.
- `reference/EXECUTION-DOCUMENT.md` is the plan of the previous attempt. Do not follow it.

When the user writes to you, do what the message says. The user outranks this file. If you are blocked, ask the user in the chat.

Do the work yourself. Do not delegate code or reviews to other models or external workers (for example deepseek-worker). The only reviewer is the `evaluator` subagent.

## Stack and architecture

- npm (never pnpm), TypeScript strict, Vite, React for the editor UI, the document core in plain TypeScript with no React.
- Vitest for unit tests, Playwright with `channel: 'chrome'` for end-to-end tests.
- The document JSON is the source of truth, never the DOM. The edited page renders inside an iframe scaled with CSS `zoom`.
- One store. State changes only through `dispatch(command)`. No document or selection state in `useState` or `useRef`.
- Follow `ARCHITECTURE.md`. Every concept has one owner module listed there. Before you add or change a concept (a drop rule, a wrapper style, a keyword list, a label, a tag list, a shortcut, a preference), use its owner. If the concept is new, add its owner to `ARCHITECTURE.md` in the same commit.
- Follow `DESIGN.md`. Colors, spacing, fonts, radii and shadows come only from the design tokens.
- Every button, menu item and shortcut runs a command that really works. A feature that does not exist yet is shown disabled with a "not available yet" label.
- Code, file names and commits in English. UI text only through i18n; the default UI language is Brazilian Portuguese (`pt-BR`), with English (`en`) available. The product name appears only in `src/config/product.ts`.
- Export: a ZIP with HTML plus a separate CSS file, BEM classes, no inline styles, standard HTML/CSS that works in any browser.
- The dev server port comes from the `PORT` environment variable.

## How every session works

1. Read `PROGRESS.md`, run `git log --oneline -15`, and read `features.json`, `DESIGN.md` and `ARCHITECTURE.md`.
2. Run the full test suite (`npm run verify:fast` and `npm run e2e`). If anything fails, fix that before anything else.
3. Take the first feature with `"passes": false`. Work on that one feature only.
4. Read the feature's spec file (its `spec` field) when it has one. The spec defines the exact behavior, the thresholds and the visual feedback, including the corrections listed under "Problems in Pager". Write or extend a Playwright test that checks that behavior. The test uses the real mouse and keyboard and asserts on the result: the document JSON, measured geometry, computed style, or the content of the exported files. A test that only checks that an element exists does not count.
5. Implement the feature.
6. Run `npm run verify:fast` and the full `npm run e2e`. Everything must pass, not only the new test.
   Then prove the test has teeth, because a green test that would stay green without the feature is how every previous attempt fooled itself: make the feature's command handler return without changing anything, run the feature's test and show it FAILS, then undo that single edit and show the test passes again. Show both raw outputs.
7. Call the `evaluator` subagent for this feature. If it answers NEEDS_WORK, fix every finding and call it again. Do not argue a finding away.
8. Only after the evaluator answers PASS: set `"passes": true` for that feature, update `PROGRESS.md` (what was done, what is next, anything fragile), commit with a message naming the feature id, and push to origin main.
9. Go back to step 3.

## Rules that are never broken

- In `features.json` you only change `passes`, and only after an evaluator PASS. Never delete, merge or reword a feature.
- Never edit, skip or loosen a test to make it pass. If you believe a test is wrong, stop and tell the user why.
- Never report something as working without showing the raw output of the command that proves it.
- Never force push.
