import { test } from "node:test";
import assert from "node:assert/strict";
import { readProposal } from "./protocol";
import { applyProposal } from "./proposals";
import { readAssistantStream } from "./client";
import type { FolioNode } from "../notebook/types";
const nodes = (): FolioNode[] => [{ id: "n", type: "notebook", position: { x: 0, y: 0 }, data: { title: "Test", ref: "test", cells: [{ id: "c", kind: "code", source: "1", output: null, status: "idle" }] } }];
test("proposal application rejects stale edits atomically", () => {
  const original = nodes(); const current = nodes(); current[0].data.cells[0].source = "newer edit";
  assert.throws(() => applyProposal(current, { changes: [{ action: "insert", nodeId: "n", afterCellId: null, kind: "markdown", source: "Must not insert" }, { action: "replace", nodeId: "n", cellId: "c", source: "2" }] }, original));
  assert.equal(current[0].data.cells.length, 1); assert.equal(current[0].data.cells[0].source, "newer edit");
});
test("valid proposals replace and insert cells without running code", () => {
  const baseline = nodes(); const next = applyProposal(baseline, { changes: [{ action: "replace", nodeId: "n", cellId: "c", source: "2" }, { action: "insert", nodeId: "n", afterCellId: "c", kind: "markdown", source: "Explanation" }] }, baseline, () => "new");
  assert.equal(next[0].data.cells[0].source, "2"); assert.equal(next[0].data.cells[0].status, "idle"); assert.equal(next[0].data.cells[1].source, "Explanation"); assert.equal(baseline[0].data.cells[0].source, "1");
  assert.equal(readProposal('```codefolio\n{"changes":[{"action":"delete"}]}\n```'), undefined);
});
test("assistant stream retains split records and requires explicit completion", async () => {
  const encoder = new TextEncoder(); const stream = new ReadableStream<Uint8Array>({ start(c) { for (const part of ['{"type":"text","del', 'ta":"Hello"}\n{"type":"done"}\n']) c.enqueue(encoder.encode(part)); c.close(); } });
  const events = []; for await (const event of readAssistantStream(stream)) events.push(event);
  assert.deepEqual(events, [{ type: "text", delta: "Hello" }, { type: "done" }]);
  const incomplete = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(encoder.encode('{"type":"text","delta":"partial"}\n')); c.close(); } });
  await assert.rejects(async () => { for await (const _event of readAssistantStream(incomplete)) { /* consume */ } }, /before the response finished/);
});
