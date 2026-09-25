# Builder

A desktop pagebuilder that runs in recent Chrome only, for professionals who build websites.

Files that drive the work:
- `manifest/`: the single contract. It declares the test environment, every element type, every edited CSS property, every interaction constant, every command with its doors (entry points), and every feature in dependency order with its scenarios. The schema is `src/manifest/schema.ts`; `npm run manifest:check` validates it. A feature may point to a behavior spec in `spec/behavior/`.
- `DESIGN.md`: the interface. Layout, panels, where every door is placed, design tokens.
- `ARCHITECTURE.md`: the modules and the single owner of every concept. It confirms the `owner` of each command.
- `PROGRESS.md`: at most 60 lines: the current state, the user's pending decisions and the open findings. Everything past goes to `docs/history.md`, which is not read at the start of a conversation.

Reference material in `reference/` is read-only. Never write anything inside it.
- `reference/Pager` shows what the app must be able to do. It is not a model for layout or code. To run it, copy it to `.cache/pager-run` and run the copy.
- `reference/Brickflow` and `reference/report.txt` show a previous attempt and the audit of why it failed. Do not copy from them.
- `reference/EXECUTION-DOCUMENT.md` is the plan of the previous attempt. Do not follow it.

When the user writes to you, do what the message says. The user outranks this file. If you are blocked, ask the user in the chat.

Do the work yourself. Do not delegate code or reviews to other models or external workers (for example deepseek-worker). Helper agents only when the user asks for them in the conversation.

## One conversation per slice of work

The project is built one slice of work per conversation. At its start, read only this file, `PROGRESS.md` and what the slice's feature uses (its entry in the manifest, its scenarios, its spec), and of `DESIGN.md` and `ARCHITECTURE.md` only the sections it touches. Each conversation starts from `PROGRESS.md` and ends with its slice committed and pushed, or with the unfinished part on a `wip/` branch so that main stays green. The open findings in `PROGRESS.md` are fixed or kept there; a finding is never argued away.

## Memory

The memory lives in `.memory/` (ignored by git, so it never enters a commit) and is imported here, so it comes back with this file after every compaction: `builder-brief.md` holds the brief and the /goal in force, word for word; `builder.md` (at most 60 lines, rewritten whole after every commit) holds the current item and the next concrete step, the last commit and what it proved, the decisions taken on small ambiguities, the approaches that failed and why, the contested scenarios and the open findings. If the memory contradicts what you remember, the memory wins.

@.memory/builder-brief.md
@.memory/builder.md

## Compact Instructions

When the conversation is compacted, the summary preserves: the current item of the brief, the last commit and what it proved, the decisions taken, the approaches that failed, and the verification commands still pending.

## The manifest is the contract

- A change of behaviour starts in the manifest, in the same commit as the code, and `npm run manifest:check` stays green.
- The UI registers doors only from the manifest. Every button, menu item, context-menu item, shortcut, field, handle and drag target is generated from a door in `manifest/commands/*.json`; there is no other keymap, menu table or button list. A door whose feature is not built yet is shown disabled with "not available yet", except in the context menu, which shows only the commands that apply to the selection (DESIGN.md).
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
- Code, file names and commits in English. UI text only through i18n (`src/i18n/locales/en.json` and `pt-BR.json`); English is the source catalogue and the default UI language, and Brazilian Portuguese is available through the language switch. One term per concept in each language (`src/i18n/glossary.json`). The product name appears only in `src/config/product.ts`.
- Export: a ZIP with HTML plus a separate CSS file, BEM classes, no inline styles, standard HTML/CSS that works in any browser.
- The dev server port comes from the `PORT` environment variable.

## How work happens, one group at a time

Features are grouped in `manifest/features/NN-group.json` and built in that order. Each group takes two sessions.

1. **Scenario session.** Write the scenarios of every feature in the group, from its intent and its spec (the spec's "Problems in Pager" corrections are requirements). Each scenario names its setup, the doors it runs through, the expected document diff, selection and history, at least one end terminal (render, persistence after an immediate reload, or export) and its refusals. Write no app code. `npm run manifest:check` passes; commit and push.
2. **Build session.** Start by reading `PROGRESS.md`, `git log --oneline -15`, the feature's manifest entry, scenarios and spec, and the sections of `DESIGN.md` and `ARCHITECTURE.md` it touches, and by running `npm run verify:fast` and `npm run e2e`; fix any failure first. Build the group's commands and doors until the runner passes every scenario of the group through every door. The build session never edits scenarios; if one looks wrong, stop and tell the user.
3. **Tooth proof.** For each feature, make its command handler return without changing anything, run its scenarios and show they FAIL, then undo that single edit and show they pass. Show both raw outputs.
4. **Handoff.** Update `PROGRESS.md`, commit naming the group and feature ids, and push to origin main.

## Tests

- Tests enter only through doors, with the real mouse and keyboard, on the installed Chrome (`channel: 'chrome'`).
- They assert on end artifacts: the document JSON diff, computed style or geometry inside the frame, storage after an immediate reload, the files inside the exported ZIP. Never on a proxy such as a Layers row, a readout or a "saved" label, and never only that something exists or is visible.
- The test port is read-only. It reads the document, the selection, the history and the export; it never writes, loads or creates anything.

## Rules that are never broken

- Never edit, skip or loosen a test or a scenario to make it pass. If you believe one is wrong, stop and tell the user why.
- Never report something as working without showing the raw output of the command that proves it.
- Tooth proof before every commit: for each behaviour the commit turns on or changes, turn it off, run the tests and show one FAIL, then turn it back on and show them pass, both as raw output. A behaviour with no test that fails when it is off is not delivered; write that browser test first, even when no scenario covers it.
- Command output: the complete output of every command you claim goes to a file in `.cache/logs/` named after the command and the time; in the chat, only the exit code, the names of the tests that failed and the last 10 lines. The final report gives the path of each log. The proof stays complete, in the file; never a summary in its place.
- Never run two suites at the same time, nor the e2e in the background while `npm run verify:fast` runs.
- No change to a project file by regex or mass text replacement. Change a file with a point edit; change many JSON entries by parsing the JSON, changing fields by name and writing it back whole, after showing the count and two before/after samples, and check that `git diff --stat` matches.
- Scripts that help the work only read and print, live in `.cache/scratch/`, are never committed, and are deleted when the item ends.
- Never edit a scenario or a fixture.
- The door census (`tests/e2e/census.spec.ts`) stays green: no door looks usable without a built command, and no built command or usable door is left without a browser test that runs it.
- Never force push.
