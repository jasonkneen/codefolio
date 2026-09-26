


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
- **Fly-first persistence** — Configured workspaces save remotely and retain an IndexedDB copy for offline editing. Without remote configuration, storage is local.

- **Notebook assistant** — Claude Agent SDK and Codex App Server, plus Gateway and custom endpoints. Streamdown and AI Elements render responses and reviewable cell changes.
- **Multiplayer** — Shared desks with invitation links, concurrent cell editing, live presence, reconnect and durable room state.

See [service setup](server/README.md) for credentials, custom endpoints, remote hosting and Fly.io configuration.

## Quick start

Requires Node 22.10+ or Node 24+.

```bash
cd /path/to/notebook
npm ci
cp .env.example .env
npm run dev
```

Open <http://localhost:5173>. `npm run dev` starts both Vite and the optional assistant/sharing service. Notes, execution and local saving work without AI credentials. Use npm and the committed `package-lock.json` for the setup documented here.

### Assistant from notes and code

In a Markdown, JavaScript or artifact source editor, start a new line with `@` or `/`. Choose a suggestion with the arrow keys and Enter or Tab. `@claude` and `@codex` select that provider; `@agent` keeps the current provider. `/ask`, `/explain`, `/repair` and `/generate` prepare a prompt about the current cell. Selecting the shortcut removes its typed prefix and opens the assistant with that notebook and cell as context. Edit the draft, then press Send. Proposed edits require Apply cell changes; run code separately.

Agent shortcuts must start on their own line. JavaScript `@name` and `@notebook.cell` value references still work, including their existing completion menu. Division and regex literals do not open slash commands. If the editor falls back to a plain textarea, use the header Assistant button.

### Configure AI and sharing

Read [service setup](server/README.md) for provider credentials and deployment commands. For Codex, install the CLI and run `codex login` on the service machine. For Claude, configure `ANTHROPIC_API_KEY` in `.env`, or use a supported Claude login on that machine. Gateway and custom providers need their model identifier and credentials. Open Assistant settings to select the provider and enter these values. A model identifier is optional for Claude and Codex.

Share creates an invitation for the current remotely saved desk. With local-only storage, it creates a separate remote copy. Send its invitation link to a browser that can reach both the frontend and service. A `localhost` link works only on the same computer. For other computers, host the frontend and service at reachable addresses and configure the allowed frontend origin. Room state saves under `.codefolio-data`; preserve that directory to keep invitations usable after a restart.

### Check a production build locally

```sh
npm run build
npm run service
# In a second terminal:
npm run preview
```

Open <http://localhost:4173>. Preview is a local verification server. For hosted use, configure the frontend host for TanStack Start and set `VITE_CODEFOLIO_SERVICE_URL` before building. Deploy the service separately as described in its README. Never put provider keys in `VITE_` variables, which are exposed to the browser.

### Other scripts

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | App on port `5173` and service on port `1234`                      |
| `npm run build`     | Production build to `dist/`                         |
| `npm run preview`   | Serve the built output                              |
| `npm run typecheck` | Strict frontend and service TypeScript checks          |
| `npm run test`      | Notebook, artifact, assistant, collaboration and service tests |
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

## Storage and offline edits

The supplied `.env.example` defaults to local storage. Configure your own Fly service in the ignored `.env` file to enable remote storage. Each workspace gets a remote room even when you never share it. Its capability stays in this browser until you create an invitation. Clear `VITE_CODEFOLIO_SERVICE_URL` to use local-only storage. A failed connection keeps the local desk available; reconnect merges pending updates.

The browser stores both its notebook copy and the Yjs document in IndexedDB. The Yjs copy retains offline changes across reloads and merges them with the remote document. Remote room capabilities are stored per workspace and service URL. There is no account-based workspace discovery yet, so another device needs an invitation; clearing browser storage also removes those capabilities. Offline data recovery does not itself cache the frontend for offline boot.

Multiplayer shows names, notebook-relative pointers, text carets and selections in source editors. Agent activity appears beside the cell it is working on and is broadcast to the room. Presence is temporary and is not stored as notebook content.
