import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { WebSocket } from "ws";
import { startService } from "./service";
import { deskDocument, readDesk, writeDesk } from "../src/lib/collaboration/document";
import { readAssistantStream } from "../src/lib/ai/client";
import type { FolioNode } from "../src/lib/notebook/types";
const nodes: FolioNode[] = [{ id: "n", type: "notebook", position: { x: 0, y: 0 }, data: { title: "Test", ref: "test", cells: [{ id: "c", kind: "code", source: "1", status: "idle", output: null }] } }];
async function waitFor(check: () => boolean) { const deadline = Date.now() + 5000; while (!check()) { if (Date.now() > deadline) throw Error("Timed out waiting for collaboration"); await new Promise(resolve => setTimeout(resolve, 10)); } }
test("room protocol synchronizes real clients, cleans presence, rejects bad tokens and persists across restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codefolio-room-test-"));
  let service = await startService({ port: 0, directory });
  const initial = deskDocument({ nodes, edges: [] }); let a: WebsocketProvider | undefined; let b: WebsocketProvider | undefined;
  const docA = new Y.Doc(); const docB = new Y.Doc();
  try {
    const response = await fetch(`http://127.0.0.1:${service.port}/api/rooms`, { method: "POST", body: JSON.stringify({ state: Buffer.from(Y.encodeStateAsUpdate(initial)).toString("base64") }) });
    assert.equal(response.status, 201); const link = await response.json() as { room: string; token: string };
    const provider = (doc: Y.Doc) => new WebsocketProvider(`ws://127.0.0.1:${service.port}/sync`, link.room, doc, { params: { token: link.token }, WebSocketPolyfill: WebSocket as any, disableBc: true });
    a = provider(docA); b = provider(docB); await waitFor(() => Boolean(a?.synced && b?.synced));
    assert.equal(readDesk(docB).nodes[0].data.cells[0].source, "1");
    const base = readDesk(docA); const edit = structuredClone(base); edit.nodes[0].data.cells[0].source = "2"; writeDesk(docA, edit, base);
    await waitFor(() => readDesk(docB).nodes[0].data.cells[0].source === "2");
    b.disconnect();
    const offlineBase = readDesk(docB); const offlineEdit = structuredClone(offlineBase); offlineEdit.nodes[0].data.title = "Offline edit";
    writeDesk(docB, offlineEdit, offlineBase); b.connect();
    await waitFor(() => Boolean(b?.synced) && readDesk(docA).nodes[0].data.title === "Offline edit");
    a.awareness.setLocalState({ user: { name: "A" } }); await waitFor(() => Boolean(b?.awareness.getStates().get(docA.clientID)?.user));
    a.destroy(); a = undefined; await waitFor(() => !b?.awareness.getStates().has(docA.clientID));
    const invalid = new WebSocket(`ws://127.0.0.1:${service.port}/sync/${link.room}?token=${"0".repeat(64)}`);
    const status = await new Promise<number>(resolve => { invalid.on("unexpected-response", (_request, response) => { resolve(response.statusCode!); invalid.terminate(); }); invalid.on("error", () => {}); });
    assert.equal(status, 403);
    await service.stop(); b.destroy(); b = undefined; service = await startService({ port: 0, directory });
    const restored = new Y.Doc(); b = provider(restored); await waitFor(() => Boolean(b?.synced));
    assert.equal(readDesk(restored).nodes[0].data.cells[0].source, "2"); b.destroy(); b = undefined; restored.destroy();
  } finally { a?.destroy(); b?.destroy(); initial.destroy(); docA.destroy(); docB.destroy(); await service.stop(); await rm(directory, { recursive: true, force: true }); }
});
test("assistant route streams explicit completion and aborts disconnected clients", async () => {
  const directory = await mkdtemp(join(tmpdir(), "codefolio-ai-test-")); let aborted = false;
  const service = await startService({ port: 0, directory, provider: async (request, signal, emit) => {
    emit("Hello");
    if (request.model === "wait") await new Promise<void>(resolve => signal.addEventListener("abort", () => { aborted = true; resolve(); }, { once: true }));
  } });
  try {
    const rejected = await fetch(`http://127.0.0.1:${service.port}/api/assistant`, { method: "POST", headers: { "X-Forwarded-For": "127.0.0.1, 192.0.2.10" }, body: "{}" });
    assert.equal(rejected.status, 401);
    const body = (model?: string) => JSON.stringify({ provider: "codex", model, notebooks: [], messages: [{ role: "user", content: "Hello" }] });
    const response = await fetch(`http://127.0.0.1:${service.port}/api/assistant`, { method: "POST", body: body() });
    const events = []; for await (const event of readAssistantStream(response.body!)) events.push(event);
    assert.deepEqual(events, [{ type: "text", delta: "Hello" }, { type: "done" }]);
    const controller = new AbortController(); const waiting = await fetch(`http://127.0.0.1:${service.port}/api/assistant`, { method: "POST", body: body("wait"), signal: controller.signal });
    await waiting.body!.getReader().read(); controller.abort(); await waitFor(() => aborted);
  } finally { await service.stop(); await rm(directory, { recursive: true, force: true }); }
});
