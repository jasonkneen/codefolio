# Codefolio — agent / contributor notes

This file is read by coding agents (Codex, Claude Code, Cursor, OpenCode, …) and human contributors working on Codefolio. It is **not** a sandbox contract — it documents the project.

## What this is

Codefolio is a single-page TanStack Start app. The product is a freeform canvas of "notebook" nodes, each containing Markdown and JavaScript cells. The interesting work is in `src/lib/notebook/` (kernel + persistence) and `src/lib/artifacts/` (in-browser source bundler for the import/export flow).

There is **no auth, no database, no backend**. Everything user-visible is in `src/`. Persistence is `localStorage` via the Zustand store in `src/lib/notebook/store.ts`.

## Repo layout

```
src/
  routes/                  TanStack Start file routes. __root.tsx mounts <FolioCanvas/>.
  components/
    canvas/                React Flow canvas + notebook nodes.
    folio/                 Welcome dialog, appearance panel, toaster, save status.
    notebook/              Cell renderers — code (CodeMirror), markdown, image, video, artifact.
    ui/                    Radix + Tailwind primitives.
  lib/
    artifacts/             Source-graph compiler, project export, project assistant.
    notebook/              Notebook runtime — store, kernel, sandbox, helpers, themes.
    error-component.tsx    Root error boundary (mounted via src/router.tsx).
scripts/
  build-artifacts.mjs      Rebuilds public/folio-runtime/ — the kernel + per-library bundles.
public/
  folio-runtime/           Built bundles, regenerated on dev/build.
  favicon.svg
```

## Conventions

- **Strict TS** — `tsc --noEmit` must pass. ES modules, `~19.2.8` React, Vite 8, TanStack Start 1.168.
- **Tailwind v4** — entry is `src/styles.css` (`@import "tailwindcss";`).
- **State** — Zustand for cross-cutting notebook state. React Query / Router client APIs are imported per feature.
- **Cells** — anything user-facing a notebook cell can call (helpers like `html()`, `table()`, `chart()`, `sketch()`, `md()`) lives in `src/lib/notebook/inspect.ts`. New helpers go there, with a test next door.
- **No server-only code in client bundles** — `src/router.tsx` and route loaders are fine for server logic; pure browser code stays in components.

## Build & test

```bash
npm install
npm run dev          # http://localhost:5173
npm run typecheck    # tsc --noEmit
npm run test         # node --test, plus the .test.ts under src/
npm run lint         # eslint
```

`predev` / `prebuild` run `artifacts:build`, which produces `public/folio-runtime/`. The kernel iframe imports from there at runtime — never serve a build without it.

## Adding a runtime helper

1. Implement in `src/lib/notebook/inspect.ts` (typed + documented).
2. Add a focused test in `src/lib/notebook/*.test.ts`.
3. If the helper needs a third-party lib, add an entry to `src/lib/artifacts/catalog.json` and rebuild via `npm run artifacts:build`.

## Adding a cell kind

1. New renderer in `src/components/notebook/<kind>-cell.tsx`.
2. Add the kind to `Cell` (`src/lib/notebook/types.ts`) and the store's persist/load paths.
3. Cover render + persistence in `src/lib/notebook/store.test.ts`.

## Don't

- Don't commit `node_modules/`, `dist/`, or anything under `public/folio-runtime/`.
- Don't bring in a state library; the kernel is single-threaded JavaScript in a sandbox frame.
- Don't add a build step to the kernel's runtime path — it runs in the browser, so esbuild/Vite helpers are out.
