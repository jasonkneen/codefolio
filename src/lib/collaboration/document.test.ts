import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";
import { deskDocument, readDesk, writeDesk, type SharedDesk } from "./document";
import type { FolioNode } from "../notebook/types";
const notebook = (): FolioNode => ({ id: "n1", type: "notebook", position: { x: 10, y: 20 }, data: { title: "One", ref: "one", cells: [{ id: "a", kind: "code", source: "const a = 1", status: "ok", output: { logs: [], displays: [{ kind: "text", text: "local result" }] } }, { id: "b", kind: "markdown", source: "Hello world", output: null, status: "idle" }] } });
const desk = (): SharedDesk => ({ nodes: [notebook()], edges: [] });
const clone = (doc: Y.Doc) => { const next = new Y.Doc(); Y.applyUpdate(next, Y.encodeStateAsUpdate(doc)); return next; };
function exchange(a: Y.Doc, b: Y.Doc) { const first = Y.encodeStateAsUpdate(a); const second = Y.encodeStateAsUpdate(b); Y.applyUpdate(a, second); Y.applyUpdate(b, first); }
test("concurrent edits in different cells and fields survive in both documents", () => {
  const a = deskDocument(desk()); const b = clone(a); const base = readDesk(a);
  const left = structuredClone(base); left.nodes[0].data.cells[0].source = "const a = 2"; left.nodes[0].position.x = 99;
  const right = structuredClone(base); right.nodes[0].data.cells[1].source = "Hello everyone"; right.nodes[0].data.title = "Renamed";
  writeDesk(a, left, base); writeDesk(b, right, base); exchange(a, b);
  assert.deepEqual(readDesk(a), readDesk(b)); const node = readDesk(a).nodes[0];
  assert.equal(node.data.cells[0].source, "const a = 2"); assert.equal(node.data.cells[1].source, "Hello everyone"); assert.equal(node.data.title, "Renamed"); assert.equal(node.position.x, 99);
  a.destroy(); b.destroy();
});
test("concurrent edits at separate positions of the same source merge", () => {
  const a = deskDocument(desk()); const b = clone(a); const base = readDesk(a);
  const left = structuredClone(base); left.nodes[0].data.cells[1].source = "Dear Hello world";
  const right = structuredClone(base); right.nodes[0].data.cells[1].source = "Hello world!";
  writeDesk(a, left, base); writeDesk(b, right, base); exchange(a, b);
  assert.equal(readDesk(a).nodes[0].data.cells[1].source, "Dear Hello world!"); assert.deepEqual(readDesk(a), readDesk(b)); a.destroy(); b.destroy();
});
test("concurrent cell insertions survive and runtime output is never shared", () => {
  const a = deskDocument(desk()); const b = clone(a); const base = readDesk(a);
  const left = structuredClone(base); left.nodes[0].data.cells.splice(1, 0, { id: "left", kind: "code", source: "2", output: null, status: "idle" });
  const right = structuredClone(base); right.nodes[0].data.cells.splice(1, 0, { id: "right", kind: "code", source: "3", output: null, status: "idle" });
  writeDesk(a, left, base); writeDesk(b, right, base); exchange(a, b);
  assert.deepEqual(readDesk(a), readDesk(b)); assert.equal(readDesk(a).nodes[0].data.cells.length, 4);
  assert.equal(readDesk(a).nodes[0].data.cells[0].output, null);
  a.destroy(); b.destroy();
});
test("view and execution changes generate no shared update", () => {
  const doc = deskDocument(desk()); const base = readDesk(doc); const next = structuredClone(base); let count = 0;
  doc.on("update", () => count++); next.nodes[0].selected = true; next.nodes[0].measured = { width: 400, height: 600 }; next.nodes[0].data.cells[0].status = "running";
  writeDesk(doc, next, base); assert.equal(count, 0); doc.destroy();
});
test("concurrent notebook creation converges with stable reference collision handling", () => {
  const a = deskDocument(desk()); const b = clone(a); const base = readDesk(a);
  const left = structuredClone(base); left.nodes.push({ ...notebook(), id: "left", data: { ...notebook().data, ref: "newNotebook" } });
  const right = structuredClone(base); right.nodes.push({ ...notebook(), id: "right", data: { ...notebook().data, ref: "newNotebook" } });
  writeDesk(a, left, base); writeDesk(b, right, base); exchange(a, b);
  assert.deepEqual(readDesk(a), readDesk(b)); assert.equal(readDesk(a).nodes.length, 3); a.destroy(); b.destroy();
});
