import { test } from "node:test";
import assert from "node:assert/strict";
import { NotebookKernel } from "./runtime";

test("reset prevents an awaiting cell from publishing into a fresh kernel", async () => {
  const kernel = new NotebookKernel();
  let release!: (value: Record<string, unknown>) => void;
  const pending = kernel.run('import @other\nconst stale = 42\nstale', () => new Promise(resolve => { release = resolve; }));
  kernel.reset();
  release({});
  await pending;
  assert.deepEqual(kernel.names(), []);
  assert.equal(kernel.hasRun(), false);
});

test("multiline expressions and trailing comments return their value", async () => {
  const kernel = new NotebookKernel();
  const output = await kernel.run('const value = 4;\n({\n answer: value * 2\n}); // result');
  assert.equal(output.displays[0]?.kind, "json");
  assert.ok(JSON.stringify(output).includes("8"));
});

test("destructured aliases persist, nested declarations do not", async () => {
  const kernel = new NotebookKernel();
  await kernel.run('const { value: renamed, nested: { answer } } = { value: 4, nested: { answer: 8 } };\nfunction helper() {\n const hidden = 2;\n return hidden;\n}\nrenamed + answer');
  assert.deepEqual(kernel.names().sort(), ["answer", "helper", "renamed"]);
  assert.equal((await kernel.run('renamed + answer')).displays[0]?.kind, "text");
});

test("template contents remain intact and classes can be redefined", async () => {
  const kernel = new NotebookKernel();
  const output = await kernel.run('const text = `first\nconst fake = 2\nlast`;\ntext');
  assert.deepEqual(output.displays[0], { kind: "text", text: 'first\nconst fake = 2\nlast' });
  await kernel.run('class Example {}');
  const rerun = await kernel.run('class Example { static value = 7 }\nExample.value');
  assert.deepEqual(rerun.displays[0], { kind: "text", text: "7" });
});

test("re-running a variable update retains the previous binding", async () => {
  const kernel = new NotebookKernel();
  await kernel.run('let count = 1');
  assert.deepEqual((await kernel.run('let count = count + 1; count')).displays[0], { kind: "text", text: "2" });
});

test("block scope is preserved and multiple declarations are harvested", async () => {
  const kernel = new NotebookKernel();
  const output = await kernel.run('const a = 1, b = 2;\n{ const a = 99; }\na + b');
  assert.deepEqual(output.displays[0], { kind: "text", text: "3" });
  assert.deepEqual(kernel.names().sort(), ["a", "b"]);
});

test("kernel-reserved declarations produce a clear error", async () => {
  const output = await new NotebookKernel().run('const __cards = {}; __cards');
  assert.equal(output.displays[0]?.kind, "error");
  assert.match(JSON.stringify(output), /reserved by the kernel/);
});

test("runtime helper arguments and imported functions retain their positions", async () => {
  const kernel = new NotebookKernel();
  const output = await kernel.run('import @other\nconsole.log("logged")\ndisplay(other.double(3))\nhtml`<b>markup</b>`', async () => ({ double: (value: number) => value * 2 }));
  assert.deepEqual(output.logs, [{ level: "log", text: "logged" }]);
  assert.deepEqual(output.displays, [{ kind: "text", text: "6" }, { kind: "html", html: "<b>markup</b>" }]);
});
