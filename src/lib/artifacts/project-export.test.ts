import { test } from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { exportProject } from "./project-export";

const runtime = { groups: { core: "core-0000000000000000.js" }, versions: { react: "19.2.8", "react-dom": "19.2.8" } };
const files = [
  { path: "src/App.tsx", source: 'import { label } from "./label"; export default function App() { return <h1>{label}</h1> }' },
  { path: "src/label.ts", source: 'export const label = "Hello";' },
  { path: "src/unused.ts", source: "export const unused = true;" },
];

test("project export contains runnable scripts, exact source, and a build manifest", () => {
  const project = exportProject(files, "src/App.tsx", runtime, { "src/App.tsx": "# App\nA living note." });
  const archive = unzipSync(project.bytes);
  const read = (path: string) => strFromU8(archive[path]);
  assert.equal(read("src/App.tsx"), files[0].source);
  assert.equal(read("src/unused.ts"), files[2].source);
  const pkg = JSON.parse(read("package.json"));
  assert.match(pkg.scripts.dev, /^vite /);
  assert.match(pkg.scripts.build, /^vite build /);
  assert.equal(pkg.scripts.test, "bun test");
  assert.equal(pkg.dependencies.react, "19.2.8");
  assert.deepEqual(JSON.parse(read("codefolio.build.json")).modules, ["src/App.tsx", "src/label.ts"]);
  assert.match(read("codefolio.generated/entry.tsx"), /\.\.\/src\/App\.tsx/);
  assert.match(read("codefolio.generated/vite.config.mjs"), /server: \{ port: 8284, strictPort: true \}/);
  assert.match(read("codefolio.generated/vite.config.mjs"), /preview: \{ port: 8285, strictPort: true \}/);
  assert.equal(read("docs/source/src/App.tsx.md"), "# App\nA living note.\n");
});

test("the same sources and versions produce identical archives", () => {
  assert.deepEqual(exportProject(files, "src/App.tsx", runtime).bytes, exportProject(files, "src/App.tsx", runtime).bytes);
});

test("repository export fails clearly for CommonJS modules", () => {
  assert.throws(() => exportProject([{ path: "src/app.js", source: 'const x = require("./x"); module.exports = x;' }, { path: "src/x.js", source: "module.exports = 1" }], "src/app.js", runtime), /needs ES modules/);
});
