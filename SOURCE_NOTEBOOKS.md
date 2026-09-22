# Source notebooks

The desk menu can import selected JavaScript and TypeScript files, or a source folder. Each file becomes a notebook with its relative path, one editable source cell, and a note cell. Reimporting the same path updates the source cell while keeping the notes. Desk export/import preserves the path.

Canvas preview chooses one source file as its entry. It follows static `import`, `export from`, and literal `require` paths through the source notebooks, compiles the reachable files, and runs the assembled bundle in the existing sandboxed artifact frame. The **Show build** control exposes the generated code. Individual source cells use the same module compiler when run. The walkthrough steps through the reachable files and their notes; its play control advances those steps.

**Build project** downloads a reproducible ZIP containing the original source files, a generated React entrypoint, Vite configuration, `package.json`, `codefolio.build.json` with the selected module graph, and a build smoke test. Extract it and run `bun install`, `bun run dev`, `bun run build`, `bun run preview`, or `bun run test`. The Codefolio app uses port 8282; exported projects use 8284 for development and 8285 for built preview. The production output is `dist/`. Package versions are pinned from the installed preview libraries. The same source and library versions produce the same archive bytes.

This is a browser import snapshot. It does not watch a repository or write edited files back to disk. The compiler currently supports `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`, relative paths and catalogued preview packages. It reports missing files, unsupported packages, dynamic imports, and nonliteral `require` calls. It does not yet reproduce Node resolution, package configuration, CSS loaders, assets, backend APIs, or a repository test runner. A preview shows one entry's reachable graph, not every notebook on the desk.

The downloadable Vite project requires ES modules in its reachable graph. The in-app preview can run literal CommonJS `require`, but export reports those files as a build error because Vite would not reproduce that behavior reliably. Existing source test files are preserved in the ZIP, and `bun run test` discovers them alongside the generated browser-bundle smoke test. Tests that require another runner may need their own dependencies or configuration. Server routes are not synthesized.

## AI assistance

The server handler uses `libfx/node`. Set `AI_GATEWAY_API_KEY` in the server environment for AI Gateway. For a local **fx Gateway-compatible chat endpoint**, set `FX_GATEWAY_CHAT_URL` to an HTTP loopback URL with a port, `FX_LOCAL_API_KEY`, and optionally `FX_LOCAL_MODEL`. The key stays server side. Source and error text are bounded; the agent has no tools; requests time out after 30 seconds.

When deterministic compilation fails, the handler asks for one replacement file. The replacement is compiled again and presented for review before it can be applied. This is a proposal, not an automatic change. The app does not yet persist learned resolver rules or generate new UI. The walkthrough still operates from the static import graph when no AI key is configured.
