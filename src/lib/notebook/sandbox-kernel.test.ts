import { test } from "node:test";
import assert from "node:assert/strict";
import { readKernelResult } from "./sandbox-kernel";

test("only bounded display data is accepted from the isolated runtime", () => {
  const output = { logs: [], displays: [{ kind: "text", text: "8" }] };
  assert.deepEqual(readKernelResult({ output, previews: { result: { kind: "text", text: "8" } } }).output, output);
  assert.throws(() => readKernelResult({ output: { logs: [], displays: [{ kind: "image", src: "javascript:alert(1)" }] }, previews: {} }));
  assert.throws(() => readKernelResult({ output, previews: { result: { kind: "function", source: "evil" } } }));
  assert.throws(() => readKernelResult({ output, previews: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [String(i), { kind: "text", text: "x" }])) }));
});
