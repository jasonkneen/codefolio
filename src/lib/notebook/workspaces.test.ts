import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWorkspaceIndex } from "./workspaces";

test("workspace index keeps the legacy canvas and validates saved names", () => {
  assert.deepEqual(parseWorkspaceIndex(null), { activeId: "current", workspaces: [{ id: "current", name: "My workspace" }] });
  const saved = { activeId: "12345678-1234-1234-1234-123456789abc", workspaces: [{ id: "current", name: "Main" }, { id: "12345678-1234-1234-1234-123456789abc", name: "Prototype" }] };
  assert.deepEqual(parseWorkspaceIndex(saved), saved);
  assert.equal(parseWorkspaceIndex({ ...saved, workspaces: [saved.workspaces[0], saved.workspaces[0]] }).workspaces.length, 1);
});
