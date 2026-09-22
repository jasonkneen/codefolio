import assert from "node:assert/strict";
import { test } from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createDeskStorage, type SaveStatus } from "./persistence";
import { parseFolioExport } from "./io";

const desk = () => parseFolioExport({ nodes: [{ id: "n", data: { cells: [{ id: "c", kind: "markdown", source: "Saved note" }] } }], edges: [] })!;
function setup(legacy: string | null = null, factory = new IDBFactory()) {
  let status: SaveStatus;
  const driver = createDeskStorage({ indexedDB: () => factory, legacy: () => legacy, status: (value) => { status = value; }, delay: 10000 });
  return { driver, factory, status: () => status };
}
test("legacy local saves load and edits persist through IndexedDB", async () => {
  const { driver, factory, status } = setup(JSON.stringify({ state: desk(), version: 0 }));
  const loaded = await driver.storage.getItem("desk");
  assert.equal(loaded?.state.nodes[0].data.cells[0].source, "Saved note");
  const changed = desk(); changed.nodes[0].data.title = "Changed";
  await driver.storage.setItem("desk", { state: changed, version: 0 });
  assert.equal(status().state, "saving");
  await driver.flush();
  assert.equal(status().state, "saved");
  const next = setup(null, factory);
  assert.equal((await next.driver.storage.getItem("desk"))?.state.nodes[0].data.title, "Changed");
  await driver.close(); await next.driver.close();
});
test("rapid edits coalesce to the last state and UI-only state does not rewrite a desk", async () => {
  const { driver, factory, status } = setup();
  await driver.storage.getItem("desk");
  const initial = desk();
  for (let i = 0; i < 50; i++) await driver.storage.setItem("desk", { state: { nodes: initial.nodes.map((n) => ({ ...n, data: { ...n.data, title: String(i) } })), edges: [] }, version: 0 });
  await driver.flush();
  const latest = await driver.storage.getItem("desk");
  assert.equal(latest!.state.nodes[0].data.title, "49");
  await driver.storage.setItem("desk", latest!);
  assert.equal(status().state, "saved");
  assert.equal(driver.hasUnsavedChanges(), false);
  const next = setup(null, factory);
  assert.equal((await next.driver.storage.getItem("desk"))!.state.nodes[0].data.title, "49");
  await driver.close(); await next.driver.close();
});
test("corrupt saves remain recoverable and cannot be overwritten by hydration", async () => {
  const raw = '{"broken":';
  const { driver, status } = setup(raw);
  assert.equal(await driver.storage.getItem("desk"), null);
  assert.equal(status().state, "error");
  assert.equal(driver.recoveryText(), raw);
  await driver.storage.setItem("desk", { state: desk(), version: 0 });
  assert.equal(driver.hasUnsavedChanges(), false);
  driver.allowReplacement();
  await driver.storage.setItem("desk", { state: desk(), version: 0 });
  await driver.flush();
  assert.equal(status().state, "saved");
  await driver.close();
});
test("unavailable storage fails visibly and leaves writes blocked", async () => {
  let status: SaveStatus | undefined;
  const driver = createDeskStorage({ indexedDB: () => { throw new Error("Denied"); }, legacy: () => null, status: (s) => { status = s; } });
  assert.equal(await driver.storage.getItem("desk"), null);
  assert.equal(status?.state, "error");
  await driver.storage.setItem("desk", { state: desk(), version: 0 });
  assert.equal(driver.hasUnsavedChanges(), false);
});


test("quota failures retain unsaved data for a successful retry", async () => {
  const { driver, status } = setup();
  await driver.storage.getItem("desk");
  await driver.storage.setItem("desk", { state: desk(), version: 0 });
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = () => { throw new DOMException("Full", "QuotaExceededError"); };
  try {
    await driver.flush();
    assert.equal(status().state, "error");
    assert.equal(driver.hasUnsavedChanges(), true);
  } finally { IDBObjectStore.prototype.put = put; }
  await driver.flush();
  assert.equal(status().state, "saved");
  assert.equal(driver.hasUnsavedChanges(), false);
  await driver.close();
});

test("stale tabs cannot overwrite a newer saved desk, including concurrent saves", async () => {
  const factory = new IDBFactory();
  const a = setup(null, factory), b = setup(null, factory);
  await Promise.all([a.driver.storage.getItem("desk"), b.driver.storage.getItem("desk")]);
  const first = desk(); first.nodes[0].data.title = "First tab";
  const second = desk(); second.nodes[0].data.title = "Second tab";
  await a.driver.storage.setItem("desk", { state: first, version: 0 });
  await b.driver.storage.setItem("desk", { state: second, version: 0 });
  await Promise.all([a.driver.flush(), b.driver.flush()]);
  assert.equal(a.status().state, "saved");
  assert.equal(b.status().conflict, true);
  assert.equal(b.driver.hasUnsavedChanges(), true);
  await b.driver.flush(); // Retry must not implicitly authorize overwrite.
  const reader = setup(null, factory);
  assert.equal((await reader.driver.storage.getItem("desk"))!.state.nodes[0].data.title, "First tab");
  b.driver.allowReplacement();
  await b.driver.flush();
  assert.equal(b.status().state, "saved");
  assert.equal((await reader.driver.storage.getItem("desk"))!.state.nodes[0].data.title, "Second tab");
  await a.driver.close(); await b.driver.close(); await reader.driver.close();
});

test("discarding a conflicted edit reloads the saved version without later stale writes", async () => {
  const factory = new IDBFactory();
  const a = setup(null, factory), b = setup(null, factory);
  await a.driver.storage.getItem("desk"); await b.driver.storage.getItem("desk");
  await a.driver.storage.setItem("desk", { state: desk(), version: 0 }); await a.driver.flush();
  await b.driver.storage.setItem("desk", { state: desk(), version: 0 }); await b.driver.flush();
  b.driver.discardChanges();
  await b.driver.storage.getItem("desk");
  assert.equal(b.driver.hasUnsavedChanges(), false);
  assert.equal(b.status().conflict, false);
  await a.driver.close(); await b.driver.close();
});

test("continuous typing reaches the maximum save delay", async () => {
  const factory = new IDBFactory();
  let saved = false;
  const writer = createDeskStorage({ indexedDB: () => factory, legacy: () => null, delay: 1000, maxDelay: 20, status: s => { if (s.state === "saved") saved = true; } });
  await writer.storage.getItem("desk"); saved = false;
  for (let i = 0; i < 12; i++) {
    const changed = desk(); changed.nodes[0].data.title = String(i);
    await writer.storage.setItem("desk", { state: changed, version: 0 });
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(saved, true);
  await writer.close();
});

test("workspace keys keep canvases separate and flush before switching", async () => {
  const { driver } = setup();
  await driver.storage.getItem("desk");
  const first = desk(); first.nodes[0].data.title = "First canvas";
  await driver.storage.setItem("desk", { state: first, version: 0 });
  await driver.selectKey("workspace-2");
  assert.equal(await driver.storage.getItem("desk"), null);
  const second = desk(); second.nodes[0].data.title = "Second canvas";
  await driver.storage.setItem("desk", { state: second, version: 0 });
  await driver.selectKey("current");
  assert.equal((await driver.storage.getItem("desk"))?.state.nodes[0].data.title, "First canvas");
  await driver.selectKey("workspace-2");
  assert.equal((await driver.storage.getItem("desk"))?.state.nodes[0].data.title, "Second canvas");
  await driver.selectKey("current");
  await driver.deleteKey("workspace-2");
  await driver.selectKey("workspace-2");
  assert.equal(await driver.storage.getItem("desk"), null);
  await driver.close();
});

test("new workspace does not import the old localStorage desk", async () => {
  const { driver } = setup(JSON.stringify({ state: desk(), version: 0 }));
  driver.setInitialKey("new-workspace");
  assert.equal(await driver.storage.getItem("desk"), null);
  await driver.close();
});
