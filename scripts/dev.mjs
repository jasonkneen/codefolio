import { spawn } from "node:child_process";
const children = [spawn(process.execPath, ["--watch", "--watch-preserve-output", "--env-file-if-exists=.env", "--import", "tsx", "server/cli.ts"], { stdio: "inherit" }), spawn(process.execPath, ["node_modules/vite/bin/vite.js", "dev", "--host", "0.0.0.0", "--port", "5173"], { stdio: "inherit" })];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill("SIGTERM"); setTimeout(() => process.exit(code), 1500).unref(); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
for (const child of children) { child.on("error", () => stop(1)); child.on("exit", code => stop(code ?? 1)); }
