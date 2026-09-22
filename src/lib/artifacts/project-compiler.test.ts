import { test } from "node:test";
import assert from "node:assert/strict";
import { compileProject, resolveProjectImport } from "./project-compiler";

test("resolves relative source files and compiles only the reachable graph", () => {
  const files = [
    { path: "src/App.tsx", source: 'import { label } from "./labels"; export default function App() { return <p>{label}</p> }' },
    { path: "src/labels.ts", source: 'export const label: string = "Hello";' },
    { path: "src/unused.ts", source: "export const unused = true" },
  ];
  const built = compileProject(files, "src/App.tsx");
  assert.deepEqual(built.paths, ["src/App.tsx", "src/labels.ts"]);
  assert.deepEqual(built.imports["src/App.tsx"], ["src/labels.ts"]);
  assert.ok(built.code.includes("Hello"));
  assert.ok(!built.code.includes("unused"));
  assert.deepEqual(built.groups, ["core"]);
});

test("reports missing files and disallows browser-incompatible packages", () => {
  assert.equal(resolveProjectImport("src/App.tsx", "./item", new Set(["src/item/index.tsx"])), "src/item/index.tsx");
  assert.throws(() => compileProject([{ path: "src/App.tsx", source: 'import "./missing"' }], "src/App.tsx"), /cannot resolve/);
  assert.throws(() => compileProject([{ path: "src/App.tsx", source: 'import fs from "node:fs"' }], "src/App.tsx"), /not available/);
  assert.throws(() => compileProject([{ path: "src/App.tsx", source: 'import("./other")' }], "src/App.tsx"), /dynamic import/);
});

test("compiled entry executes with exports from a relative module", () => {
  const built = compileProject([
    { path: "src/main.js", source: 'import { twice } from "./math.js"; export default function result() { return twice(5) }' },
    { path: "src/math.js", source: "export function twice(value) { return value * 2 }" },
  ], "src/main.js");
  const module = { exports: {} as { default?: () => number } };
  new Function("require", "module", "exports", "React", "mount", "render", "onCleanup", "inputs", built.code)(() => { throw Error("Unexpected package"); }, module, module.exports, {}, {}, () => {}, () => {}, {});
  assert.equal(module.exports.default?.(), 10);
});
