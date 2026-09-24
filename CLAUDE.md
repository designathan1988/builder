# Builder

A desktop pagebuilder that runs in recent Chrome only. `features.json` lists everything the app must do. `PROGRESS.md` holds your handoff notes between sessions.

Reference material in the reference folder is read-only:
- `reference/Pager` shows what the app must be able to do. It is not a model for layout or code.
- `reference/Brickflow` and `reference/report.txt` show a previous attempt and the audit of why it failed. Do not copy from them.
- reference/EXECUTION-DOCUMENT.md is the plan of the previous attempt; do not follow it.

When the user writes to you, do what the message says. The user outranks this file. If you are blocked, ask the user in the chat.

## Stack and architecture

- npm (never pnpm), TypeScript strict, Vite, React for the editor UI, the document core in plain TypeScript with no React.
- Vitest for unit tests, Playwright with `channel: 'chrome'` for end-to-end tests.
- The document JSON is the source of truth, never the DOM. The edited page renders inside an iframe scaled with CSS `zoom`.
- One store. State changes only through `dispatch(command)`. No document or selection state in `useState` or `useRef`.
- One owner per concept. Before you change a drop rule, a wrapper style, a keyword list, a label, a tag list or a preference, search for every place that implements it and merge them into one module first.
- Every button, menu item and shortcut runs a command that really works. A feature that does not exist yet is shown disabled with a "not available yet" label.
- Code, file names and commits in English. UI text only through i18n. The product name appears only in `src/config/product.ts`.
- Export: a ZIP with HTML plus a separate CSS file, BEM classes, no inline styles, standard HTML/CSS that works in any browser.
- The dev server port comes from the `PORT` environment variable.

## How every session works

1. Read `PROGRESS.md`, run `git log --oneline -15`, and read `features.json`.
2. Start the dev server. Open the app with the Playwright browser tools and check that the features already marked `"passes": true` still work. Fix any regression before anything else.
3. Take the first feature with `"passes": false`. Work on that one feature only.
4. Write or extend a Playwright test for it. The test uses the real mouse and keyboard and asserts on the result: the document JSON, measured geometry, computed style, or the content of the exported files. A test that only checks that an element exists does not count.
5. Implement the feature.
6. Run `npm run verify:fast` and the feature's test. Both must pass.
7. Call the `evaluator` subagent for this feature. If it answers NEEDS_WORK, fix every finding and call it again. Do not argue a finding away.
8. Only after the evaluator answers PASS: set `"passes": true` for that feature, update `PROGRESS.md` (what was done, what is next, anything fragile), commit with a message naming the feature id, and push to origin main.
9. Go back to step 3.

## Rules that are never broken

- In `features.json` you only change `passes`, and only after an evaluator PASS. Never delete, merge or reword a feature.
- Never edit, skip or loosen a test to make it pass. If you believe a test is wrong, stop and tell the user why.
- Never report something as working without showing the raw output of the command that proves it.
- Never force push.
