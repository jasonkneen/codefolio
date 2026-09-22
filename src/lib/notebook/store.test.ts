import { test } from "node:test";
import assert from "node:assert/strict";
import { useFolioStore, kernelFor } from "./store";
import type { FolioNode } from "./types";

function node(id: string, sources: string[]): FolioNode {
  return { id, type: "notebook", position: { x: 0, y: 0 }, data: { title: id, ref: id, cells: sources.map((source, i) => ({ id: `${id}${i}`, kind: "code", source, status: "idle", output: null })) } };
}
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  const events: string[] = [];
  (globalThis as any).__folioTest = { promise, events };
  return { release, events };
}
const delayed = 'globalThis.__folioTest.events.push("start")\nawait globalThis.__folioTest.promise\nconst answer = 42\nanswer';

test("single-cell and whole-notebook runs serialize on one kernel", async () => {
  const g = gate();
  useFolioStore.getState().replaceDesk([node("a", [delayed])], []);
  const first = useFolioStore.getState().runCell("a", "a0");
  const second = useFolioStore.getState().runAll("a");
  await tick();
  assert.deepEqual(g.events, ["start"]);
  g.release(); await Promise.all([first, second]);
  assert.deepEqual(g.events, ["start", "start"]);
  assert.equal(useFolioStore.getState().nodes[0].data.cells[0].status, "ok");
});

test("replacement with reused IDs rejects both active and queued old work", async () => {
  const g = gate();
  useFolioStore.getState().replaceDesk([node("a", [delayed])], []);
  const first = useFolioStore.getState().runCell("a", "a0");
  const queued = useFolioStore.getState().runAll("a");
  await tick();
  useFolioStore.getState().replaceDesk([node("a", ['"fresh"'])], []);
  g.release(); await Promise.all([first, queued]);
  assert.deepEqual(g.events, ["start"]);
  assert.equal(useFolioStore.getState().nodes[0].data.cells[0].output, null);
  assert.deepEqual(kernelFor("a").names(), []);
});

test("restart settles a waiting run promptly without waiting for user code", async () => {
  const g = gate();
  useFolioStore.getState().replaceDesk([node("a", [delayed])], []);
  const pending = useFolioStore.getState().runAll("a");
  await tick();
  useFolioStore.getState().restart("a");
  await pending;
  assert.equal(useFolioStore.getState().nodes[0].data.cells[0].status, "idle");
  g.release(); await tick();
  assert.deepEqual(kernelFor("a").names(), []);
});

test("simultaneous cyclic imports fail without deadlock", async () => {
  useFolioStore.getState().replaceDesk([node("a", ['import @b\nb']), node("b", ['import @a\na'])], []);
  await Promise.all([useFolioStore.getState().runAll("a"), useFolioStore.getState().runAll("b")]);
  assert.ok(useFolioStore.getState().nodes.every(n => n.data.cells[0].status === "error"));
});

test("editing active source discards its late output and cancels downstream cells", async () => {
  const g = gate();
  useFolioStore.getState().replaceDesk([node("a", [delayed, 'globalThis.__folioTest.events.push("downstream")'])], []);
  const pending = useFolioStore.getState().runAll("a");
  await tick();
  useFolioStore.getState().setCellSource("a", "a0", '"edited"');
  g.release(); await pending;
  assert.deepEqual(g.events, ["start"]);
  assert.equal(useFolioStore.getState().nodes[0].data.cells[0].output, null);
});

test("a partially failed notebook is not published to importing cards", async () => {
  useFolioStore.getState().replaceDesk([node("a", ['const early = 1\nearly', 'throw new Error("failed")']), node("b", ['import @a\na'])], []);
  await useFolioStore.getState().runAll("a");
  assert.equal(kernelFor("a").hasRun(), false);
  await useFolioStore.getState().runAll("b");
  assert.equal(useFolioStore.getState().nodes[1].data.cells[0].status, "error");
});

test("canvas measurements and selection do not create persisted desk edits", () => {
  useFolioStore.getState().replaceDesk([node("a", ['1'])], []);
  const partialize = useFolioStore.persist.getOptions().partialize!;
  const before = partialize(useFolioStore.getState());
  useFolioStore.getState().onNodesChange([{ id: "a", type: "dimensions", dimensions: { width: 480, height: 500 } }, { id: "a", type: "select", selected: true }]);
  const after = partialize(useFolioStore.getState());
  assert.equal(after.nodes, before.nodes);
  useFolioStore.getState().setTitle("a", "A real edit");
  assert.notEqual(partialize(useFolioStore.getState()).nodes, before.nodes);
});
