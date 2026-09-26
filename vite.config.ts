import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Dev-only: write the canonical Vite environment file so client/server modules
 * pick the same `import.meta.env` keys. The app has no auth and no DB to wire
 * up, so this is just here to keep the `with-app-env` slot vacated.
 */
const appEnvPlugin = (): Plugin => ({
  name: "codefolio:app-env",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__app-env", (_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({}));
    });
  },
});

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: { "/api/assistant": { target: "http://127.0.0.1:1234", xfwd: true }, "/api/rooms": "http://127.0.0.1:1234", "/sync": { target: "ws://127.0.0.1:1234", ws: true } },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/api/assistant": { target: "http://127.0.0.1:1234", xfwd: true }, "/api/rooms": "http://127.0.0.1:1234", "/sync": { target: "ws://127.0.0.1:1234", ws: true } },
  },
  resolve: { tsconfigPaths: true },
  // Vite's dep-optimizer tree-shakes `@tanstack/router-core/ssr/client` down
  // to the exports that are statically referenced from the bundled graph at
  // cache-build time. The TanStack Start dev server then lazily imports
  // `createDefaultSerovalPlugins` from a separately-loaded chunk that isn't
  // visible to the optimizer, so the export gets stripped and the browser
  // fails with `does not provide an export named 'createDefaultSerovalPlugins'`.
  // Exclude the package so its full export surface is preserved as-is.
  optimizeDeps: {
    exclude: ["@tanstack/router-core", "seroval", "seroval-plugins"],
  },
  plugins: [appEnvPlugin(), tailwindcss(), tanstackStart(), viteReact()],
});
