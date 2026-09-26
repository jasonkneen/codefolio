import { startService } from "./service.js";
const service = await startService({ port: Number(process.env.PORT || 1234), host: process.env.HOST || "127.0.0.1" });
console.log(`Codefolio service listening on port ${service.port}`);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void service.stop().then(() => process.exit(0)); });
