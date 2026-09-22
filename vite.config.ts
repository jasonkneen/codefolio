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
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [appEnvPlugin(), tailwindcss(), tanstackStart(), viteReact()],
});
