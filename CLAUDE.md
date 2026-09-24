# Builder

A desktop pagebuilder that runs in recent Chrome only, for professionals who build websites.

Files that drive the work:
- `manifest/`: the single contract. It declares the test environment, every element type, every edited CSS property, every interaction constant, every command with its doors (entry points), and every feature in dependency order with its scenarios. The schema is `src/manifest/schema.ts`; `npm run manifest:check` validates it. A feature may point to a behavior spec in `spec/behavior/`.
- `DESIGN.md`: the interface. Layout, panels, where every door is placed, design tokens.
- `ARCHITECTURE.md`: the modules and the single owner of every concept. It confirms the `owner` of each command.
- `PROGRESS.md`: your handoff notes between sessions.

Reference material in `reference/` is read-only. Never write anything inside it.
- `reference/Pager` shows what the app must be able to do. It is not a model for layout or code. To run it, copy it to `.cache/pager-run` and run the copy.
- `reference/Brickflow` and `reference/report.txt` show a previous attempt and the audit of why it failed. Do not copy from them.
- `reference/EXECUTION-DOCUMENT.md` is the plan of the previous attempt. Do not follow it.

When the user writes to you, do what the message says. The user outranks this file. If you are blocked, ask the user in the chat.

Do the work yourself. Do not delegate code or reviews to other models or external workers (for example deepseek-worker). The only reviewer is the `evaluator` subagent.

## The manifest is the contract

- A change of behaviour starts in the manifest, in the same commit as the code, and `npm run manifest:check` stays green.
- The UI registers doors only from the manifest. Every button, menu item, context-menu item, shortcut, field, handle and drag target is generated from a door in `manifest/commands/*.json`; there is no other keymap, menu table or button list. A door whose feature is not built yet is shown disabled with "not available yet".
- A door's adapter data (the values it offers, the selection it acts on, the properties it writes) is read from the manifest, never re-listed in code.
- A feature's `intent` is guidance for scenario authors only. No test reads it.
- Status comes only from the runner: a feature passes when every scenario passes through every door it names and every terminal it expects, at the current commit, on a clean tree. Never write a status or `passes` field anywhere.

## Stack and architecture

- npm (never pnpm), TypeScript strict, Vite, React for the editor UI, the document core in plain TypeScript with no React.
- Vitest for unit tests, Playwright with `channel: 'chrome'` for end-to-end tests.
- The document JSON is the source of truth, never the DOM. The edited page renders inside an iframe scaled with CSS `zoom`.
- One store. State changes only through `dispatch(command)`. No document or selection state in `useState` or `useRef`.
- Follow `ARCHITECTURE.md`: every concept has one owner module. A new concept gets its owner in `ARCHITECTURE.md` and its data in the manifest, in the same commit.
- Follow `DESIGN.md`. Colors, spacing, fonts, radii and shadows come only from the design tokens.
- Code, file names and commits in English. UI text only through i18n (`src/i18n/locales/pt-BR.json` and `en.json`); the default UI language is Brazilian Portuguese. The product name appears only in `src/config/product.ts`.
- Export: a ZIP with HTML plus a separate CSS file, BEM classes, no inline styles, standard HTML/CSS that works in any browser.
- The dev server port comes from the `PORT` environment variable.

## How work happens, one group at a time

Features are grouped in `manifest/features/NN-group.json` and built in that order. Each group takes two sessions.

1. **Scenario session.** Write the scenarios of every feature in the group, from its intent and its spec (the spec's "Problems in Pager" corrections are requirements). Each scenario names its setup, the doors it runs through, the expected document diff, selection and history, at least one end terminal (render, persistence after an immediate reload, or export) and its refusals. Write no app code. `npm run manifest:check` passes; commit and push.
2. **Build session.** Start by reading `PROGRESS.md`, `git log --oneline -15`, the group's features and specs, `DESIGN.md` and `ARCHITECTURE.md`, and by running `npm run verify:fast` and `npm run e2e`; fix any failure first. Build the group's commands and doors until the runner passes every scenario of the group through every door. The build session never edits scenarios; if one looks wrong, stop and tell the user.
3. **Tooth proof.** For each feature, make its command handler return without changing anything, run its scenarios and show they FAIL, then undo that single edit and show they pass. Show both raw outputs.
4. **Review.** Call the `evaluator` subagent. On NEEDS_WORK fix every finding and call it again; do not argue a finding away. After PASS update `PROGRESS.md`, commit naming the group and feature ids, and push to origin main.

## Tests

- Tests enter only through doors, with the real mouse and keyboard, on the installed Chrome (`channel: 'chrome'`).
- They assert on end artifacts: the document JSON diff, computed style or geometry inside the frame, storage after an immediate reload, the files inside the exported ZIP. Never on a proxy such as a Layers row, a readout or a "saved" label, and never only that something exists or is visible.
- The test port is read-only. It reads the document, the selection, the history and the export; it never writes, loads or creates anything.

## Rules that are never broken

- Never edit, skip or loosen a test or a scenario to make it pass. If you believe one is wrong, stop and tell the user why.
- Never report something as working without showing the raw output of the command that proves it.
- Never force push.
