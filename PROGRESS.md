# Progress

Handoff notes between sessions. Newest entry first.

## 2026-09-24 — Project initialized

Done:
- npm project with Vite 8, React 19, TypeScript 6 (strict), Vitest 5, Playwright 1.63 (`channel: 'chrome'`), ESLint 10.
- Scripts: `dev`, `build`, `typecheck`, `lint`, `unit`, `e2e`, `verify:fast` (typecheck + lint + unit).
- `src/config/product.ts` holds the product name. `index.html` has an empty `<title>`; a Vite plugin in `vite.config.ts` fills it from `product.ts`.
- `src/i18n/` has `t(key, params)` and `formatMessage`. All UI text goes through `t`.
- ESLint forbids React imports inside `src/core/**`.
- `tests/e2e/smoke.spec.ts` opens the app in Chrome and checks the page title and the heading.

How to run:
- Dev server: `PORT` is required (`$env:PORT=5300; npm run dev` in PowerShell). Without it Vite exits with an error. 5173 is used by another app on this machine.
- `npm run e2e` starts its own dev server on `E2E_PORT` (default 5310) and never reuses a running server.

Fragile / worth knowing:
- `reference/` has its own HTML entries. `vite.config.ts` restricts `optimizeDeps.entries` to `index.html` and does not watch `reference/`. Without that, Vite's dependency scan crawls Brickflow and complains about missing packages.
- `features.json` does not exist yet. The session workflow in CLAUDE.md needs it before feature work can start.

Next:
- Add `features.json` (from the user), then take the first feature with `"passes": false`.
