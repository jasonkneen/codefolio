import { test } from "node:test";
import assert from "node:assert/strict";
import { useFolioStore } from "./store";
import { parseFolioExport, serializeDesk } from "./io";

test("selected source files become stable notebooks and reimport keeps notes", () => {
  const store = useFolioStore.getState();
  store.replaceDesk([], []);
  assert.equal(store.addSourceFiles([{ path: "src/App.tsx", source: "export default () => null" }, { path: "src/lib/message.ts", source: 'export const message = "Hello"' }]), 2);
  const first = useFolioStore.getState().nodes.find(node => node.data.sourcePath === "src/App.tsx")!;
  const note = first.data.cells.find(cell => cell.kind === "markdown")!;
  useFolioStore.getState().setCellSource(first.id, note.id, "# Why this component exists");
  assert.equal(useFolioStore.getState().addSourceFiles([{ path: "src/App.tsx", source: "export default () => 1" }]), 0);
  const updated = useFolioStore.getState().nodes.find(node => node.id === first.id)!;
  assert.equal(updated.data.cells.find(cell => cell.kind === "markdown")?.source, "# Why this component exists");
  assert.equal(updated.data.cells.find(cell => cell.kind === "artifact")?.source, "export default () => 1");
  const parsed = parseFolioExport(serializeDesk(useFolioStore.getState().nodes, []));
  assert.equal(parsed?.nodes.find(node => node.id === first.id)?.data.sourcePath, "src/App.tsx");
});

test("source import rejects traversal and duplicate paths", () => {
  useFolioStore.getState().replaceDesk([], []);
  assert.throws(() => useFolioStore.getState().addSourceFiles([{ path: "../secret.ts", source: "" }]), /Unsupported file/);
  assert.throws(() => useFolioStore.getState().addSourceFiles([{ path: "src/a.ts", source: "" }, { path: "src/a.ts", source: "" }]), /Duplicate file/);
});
