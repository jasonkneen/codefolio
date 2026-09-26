import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import * as Y from "yjs";
import { persistDocument } from "./local-document";
async function settle() { await new Promise(resolve => setTimeout(resolve, 30)); }
test("offline CRDT updates survive reload and merge remote concurrent edits", async () => {
  const factory = new IDBFactory(); const original = new Y.Doc(); original.getText("source").insert(0, "hello world");
  const caret = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(original.getText("source"), 6));
  const server = new Y.Doc(); Y.applyUpdate(server, Y.encodeStateAsUpdate(original));
  const persistence = await persistDocument(original, "room", factory);
  original.getText("source").insert(0, "offline "); await settle(); persistence.stop(); original.destroy();
  server.getText("source").insert(server.getText("source").length, " online");
  const restored = new Y.Doc(); const restoredPersistence = await persistDocument(restored, "room", factory);
  assert.equal(restoredPersistence.loaded, true); assert.equal(restored.getText("source").toString(), "offline hello world");
  Y.applyUpdate(restored, Y.encodeStateAsUpdate(server)); Y.applyUpdate(server, Y.encodeStateAsUpdate(restored));
  assert.equal(server.getText("source").toString(), "offline hello world online");
  assert.equal(Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(caret), restored)?.index, 14);
  await settle(); restoredPersistence.stop(); restored.destroy(); server.destroy();
});
test("two local document writers preserve each other's pending updates", async () => {
  const factory = new IDBFactory(); const a = new Y.Doc(), b = new Y.Doc();
  const pa = await persistDocument(a, "same-room", factory), pb = await persistDocument(b, "same-room", factory);
  a.getMap("data").set("a", 1); b.getMap("data").set("b", 2); await settle(); pa.stop(); pb.stop();
  const restored = new Y.Doc(); const p = await persistDocument(restored, "same-room", factory);
  assert.equal(restored.getMap("data").get("a"), 1); assert.equal(restored.getMap("data").get("b"), 2);
  p.stop(); restored.destroy(); a.destroy(); b.destroy();
});
