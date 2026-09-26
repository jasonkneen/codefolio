


# Codefolio

> Executable JavaScript notebooks on a canvas. Notes, code, and results — one continuous document.

[<img width="50%" height="50%" alt="Screenshot 2026-09-25 at 18 43 07" src="https://github.com/user-attachments/assets/789d808d-a05b-4a53-b239-0bb95d2418cd" />](https://github.com/user-attachments/assets/aefe8073-44c0-49e1-80ae-a5b4bfd537a2
)


![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

Codefolio is a web app where each "page" is a notebook of **markdown cells** interleaved with **runnable JavaScript cells**. Notebooks live on a freeform canvas — drag them around, attach notes, build up a desk of work. The kernel evaluates cells top-to-bottom, persists variables between cells, supports `@-references` between cells, and renders rich return values (HTML, tables, charts, three.js scenes) inline.

## Features

- **Notebook cells** — Markdown notes and JavaScript code in one document. Shift+Enter runs a cell, Cmd/Ctrl+Enter inserts a new one.
- **Persistent kernel** — Variables carry between cells; reference earlier values with `@name`.
- **Rich outputs** — Return a string, an HTML template, a `table(...)`, or a chart and it renders inline.
- **Canvas layout** — Notebooks are draggable nodes on an infinite canvas (powered by React Flow).
- **Library catalogs** — Use pre-bundled libraries (React, three.js, recharts, mathjs, katex, …) inside cells without an import map.
- **Source import** — Import `.js`/`.jsx`/`.ts`/`.tsx` source files as notebooks; the compiler traces `import` / `require` paths through your graph and runs the reachable bundle in a sandboxed frame.
- **Project export** — Bundle the desk into a reproducible ZIP with a Vite project, walkthrough, and smoke test.
- **Local-first persistence** — Notebooks save to `localStorage`; clearing site data resets to the starter desk.

## Quick start

Requires Node 22+.

```bash
git clone https://github.com/<your-username>/codefolio.git
cd codefolio
npm install
npm run dev
```

Open <http://localhost:5173>.

### Other scripts

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Vite dev server on port `5173`                      |
| `npm run build`     | Production build to `dist/`                         |
| `npm run preview`   | Serve the built output                              |
| `npm run typecheck` | `tsc --noEmit`                                      |
| `npm run test`      | Node test runner over `scripts/*.test.mjs` + `src/**/*.test.ts` |
| `npm run lint`      | ESLint                                              |
| `npm run format`    | Prettier                                            |
| `npm run artifacts:build` | Re-bundle the notebook kernel + library bundles  |

`predev` and `prebuild` automatically run `artifacts:build`, which produces `public/folio-runtime/` (the kernel + per-library bundles the cells run inside).

## How it works

```
src/
├── routes/                 # TanStack Start file routes
│   ├── __root.tsx          # Document shell — mounts FolioCanvas
│   └── index.tsx           # Home page
├── components/
│   ├── canvas/             # React Flow canvas, notebook nodes, fallback desks
│   ├── folio/              # Welcome, toaster, appearance panel, …
│   ├── notebook/           # Cell renderers — code, markdown, image, video, artifact
│   └── ui/                 # Generic primitives (Radix + shadcn-style)
├── lib/
│   ├── artifacts/          # Compiler, catalog, project export, project assistant
│   ├── notebook/           # The actual notebook runtime
│   │   ├── store.ts        # Zustand store (cells, kernels, autosave)
│   │   ├── sandbox-kernel.ts  # In-browser JS evaluator
│   │   ├── inspect.ts      # `html()`, `md()`, `table()`, `chart()`, `sketch()` helpers
│   │   ├── appearance.ts   # Themes (light / midnight / paper / solarized)
│   │   ├── appearances.ts  # Theme tokens
│   │   └── starters.ts     # The starter notebooks the user opens into
│   ├── canvas/             # Workspace + node plumbing
│   └── error-component.tsx # Root error boundary
└── styles.css              # Tailwind v4 entry
```

The cells run in an `iframe`-style sandboxed frame defined in `src/lib/notebook/sandbox-kernel.ts`. The frame is pre-loaded with `libfx/node` (a JS library registry exposed inside cells as `chart()`, `html()`, etc.) — see `scripts/build-artifacts.mjs` for how those bundles are produced.

## Contributing

1. Fork and branch off `main`.
2. Make your change. Keep types strict (`npm run typecheck` clean) and tests passing (`npm run test`).
3. Open a PR. New runtime helpers should ship with a test under `src/lib/notebook/*.test.ts` or `src/lib/artifacts/*.test.ts`.

## License

[MIT](./LICENSE) — Copyright © 2026 Jason Kneen.
