import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { WebSocketServer } from "ws";
import { assistantRequestSchema, type AssistantEvent } from "../src/lib/ai/protocol.js";
import { runProvider } from "./providers.js";
import { RoomService } from "./rooms.js";

const MAX_BODY = 64 * 1024 * 1024;
async function jsonBody(request: IncomingMessage, max = MAX_BODY) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { size += chunk.length; if (size > max) throw Error("Request is too large."); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function json(response: ServerResponse, status: number, body: unknown) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); }
function authorized(request: IncomingMessage) {
  const secret = process.env.CODEFOLIO_AI_TOKEN;
  if (!secret) {
    const forwarded = request.headers["x-forwarded-for"];
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
    const peer = request.socket.remoteAddress ?? "";
    const address = typeof forwarded === "string" ? forwarded.split(",").at(-1)!.trim() : peer;
    return loopback.includes(peer) && loopback.includes(address);
  }
  const actual = Buffer.from(request.headers.authorization?.replace(/^Bearer /, "") ?? ""); const expected = Buffer.from(secret);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export async function startService(options: { port?: number; host?: string; directory?: string; provider?: typeof runProvider } = {}) {
  const rooms = new RoomService(options.directory ?? resolve(process.env.CODEFOLIO_DATA_DIR || ".codefolio-data"));
  const active = new Set<AbortController>(); let requests = 0;
  const allowed = (process.env.CODEFOLIO_ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173").split(",");
  const originAllowed = (request: IncomingMessage) => !request.headers.origin || allowed.includes(request.headers.origin);
  const server = createServer((request, response) => {
    void (async () => {
      if (!originAllowed(request)) { json(response, 403, { error: "This app origin is not allowed by the service." }); return; }
      if (request.headers.origin) { response.setHeader("Access-Control-Allow-Origin", request.headers.origin); response.setHeader("Vary", "Origin"); }
      response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization"); response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
      if (request.url === "/health") { json(response, 200, { ok: true }); return; }
      if (request.url === "/api/assistant/status" && request.method === "GET") {
        json(response, 200, { providers: ["claude", "codex", "gateway", "custom"], gatewayConfigured: Boolean(process.env.AI_GATEWAY_API_KEY), tokenRequired: Boolean(process.env.CODEFOLIO_AI_TOKEN) }); return;
      }
      if (request.url === "/api/rooms" && request.method === "POST") {
        if (++requests > 20) { requests--; json(response, 429, { error: "Service is busy. Try again shortly." }); return; }
        try { const body = await jsonBody(request); if (typeof body.state !== "string" || body.state.length > MAX_BODY) throw Error("Invalid initial document."); json(response, 201, await rooms.create(Buffer.from(body.state, "base64"))); }
        finally { requests--; }
        return;
      }
      if (request.url !== "/api/assistant" || request.method !== "POST") { json(response, 404, { error: "Route not found." }); return; }
      if (!authorized(request)) { json(response, 401, { error: "Enter the assistant service token. Remote AI requests require CODEFOLIO_AI_TOKEN on the service." }); return; }
      if (active.size >= 4) { json(response, 429, { error: "All assistant slots are busy. Try again shortly." }); return; }
      const data = assistantRequestSchema.parse(await jsonBody(request, 1_000_000));
      const controller = new AbortController(); active.add(controller);
      const timeout = setTimeout(() => controller.abort(Error("Assistant request timed out.")), 180_000);
      const close = () => { if (!response.writableEnded) controller.abort(Error("Client disconnected.")); }; response.on("close", close);
      response.writeHead(200, { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store", "X-Accel-Buffering": "no" }); response.flushHeaders();
      let size = 0;
      const emit = (event: AssistantEvent) => { if (!response.destroyed && !response.writableEnded) response.write(`${JSON.stringify(event)}\n`); };
      try {
        await (options.provider ?? runProvider)(data, controller.signal, delta => {
          size += delta.length; if (size > 200_000) { controller.abort(); throw Error("Assistant response exceeded its size limit."); }
          emit({ type: "text", delta });
        });
        if (controller.signal.aborted) throw controller.signal.reason;
        emit({ type: "done" });
      } catch (error) { emit({ type: "error", message: controller.signal.aborted ? "Assistant request stopped or timed out." : error instanceof Error ? error.message.slice(0, 2000) : "Assistant request failed." }); }
      finally { clearTimeout(timeout); active.delete(controller); response.off("close", close); response.end(); }
    })().catch(() => { if (!response.headersSent) json(response, 400, { error: "The request was invalid or could not be saved." }); else response.end(); });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY });
  server.on("upgrade", (request, socket, head) => {
    void (async () => {
      if (!originAllowed(request)) throw Error("Origin rejected.");
      const url = new URL(request.url ?? "/", "http://service"); const id = /^\/sync\/([a-f0-9]{32})$/.exec(url.pathname)?.[1];
      if (!id) throw Error("Unknown room.");
      const room = await rooms.load(id, url.searchParams.get("token") ?? "");
      wss.handleUpgrade(request, socket, head, ws => { rooms.attach(room, ws); wss.emit("connection", ws, request); });
    })().catch(() => { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); });
  });
  const alive = new WeakSet();
  wss.on("connection", socket => { alive.add(socket); socket.on("pong", () => alive.add(socket)); });
  const heartbeat = setInterval(() => { for (const roomSocket of wss.clients) { if (!alive.has(roomSocket)) roomSocket.terminate(); else { alive.delete(roomSocket); roomSocket.ping(); } } }, 30_000).unref();
  await new Promise<void>((done, reject) => { server.once("error", reject); server.listen(options.port ?? 1234, options.host ?? "127.0.0.1", done); });
  const address = server.address(); const port = typeof address === "object" && address ? address.port : 1234;
  return { port, async stop() { clearInterval(heartbeat); for (const controller of active) controller.abort(); await rooms.stop(); await new Promise<void>(done => wss.close(() => done())); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); } };
}
