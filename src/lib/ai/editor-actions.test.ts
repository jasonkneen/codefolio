import test from "node:test";
import assert from "node:assert/strict";
import { actionPrefix, editorActions } from "./editor-actions";
import { useProductPanels } from "./ui";
test("editor commands require a standalone line prefix", () => {
  for (const line of ["/", "  /ex", "@cod", "\t@agent"]) assert.ok(actionPrefix(line));
  for (const line of ["x /", "https://", "const pattern = /ex", '"@cod', "@desk.value", "// comment"]) assert.equal(actionPrefix(line), null);
});
test("agent actions carry cell context into a reviewable draft", () => {
  const action = editorActions.find(a => a.label === "@codex")!;
  useProductPanels.getState().compose({ nodeId: "notebook", cellId: "cell", prompt: action.prompt, provider: action.provider });
  assert.equal(useProductPanels.getState().assistant, true);
  assert.equal(useProductPanels.getState().sharing, false);
  assert.deepEqual(useProductPanels.getState().draft, { nodeId: "notebook", cellId: "cell", prompt: "Help me with this cell.", provider: "codex" });
});
