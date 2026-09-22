import { test } from "node:test";
import assert from "node:assert/strict";
import { compileArtifact } from "./compiler";
import { ARTIFACT_TEMPLATES } from "./templates";
import { artifactDocument, validateManifest, BOOTSTRAP } from "./frame";

test("all supplied examples compile and load only required library groups", () => {
  for (const example of Object.values(ARTIFACT_TEMPLATES)) assert.ok(compileArtifact(example.source).code);
  assert.deepEqual(compileArtifact(ARTIFACT_TEMPLATES.fiber.source).groups, ["core", "three", "fiber"]);
  assert.deepEqual(compileArtifact('export default function App() { const x: number = 1; return <p>{x}</p> }').groups, ["core"]);
});
test("imports are allowlisted and cannot request remote modules", () => {
  for (const source of ['import x from "https://example.com/x.js"', 'import("react")', 'require(location.hash)', 'import x from "../store"']) assert.throws(() => compileArtifact(source));
  assert.deepEqual(compileArtifact('import type { Missing } from "uninstalled"; const text = "import(hello)";').groups, ["core"]);
});
test("frame has hashed bootstrap, bounded script paths and no interpolated user code", async () => {
  const compiled = compileArtifact('mount.textContent = "</script><script>alert(1)</script>"');
  const manifest = validateManifest({ groups: { core: "core-0123456789abcdef.js" }, versions: {} });
  const html = await artifactDocument(compiled, false, manifest, "https://folio.example");
  assert.ok(html.includes("connect-src 'none'"));
  assert.ok(html.includes("'sha256-"));
  assert.ok(html.includes(BOOTSTRAP));
  assert.ok(!html.includes("alert(1)"));
  assert.throws(() => validateManifest({ groups: { core: "../evil.js" }, versions: {} }));
});

test("artifact source and network preference roundtrip without a running state", async () => {
  const { parseFolioExport, serializeDesk } = await import("../notebook/io");
  const desk = parseFolioExport({ folio: 3, nodes: [{ id: "n", data: { title: "Artifact", ref: "artifact", cells: [{ id: "a", kind: "artifact", source: ARTIFACT_TEMPLATES.react.source, artifactNetwork: true, status: "running" }] } }], edges: [] });
  assert.ok(desk);
  assert.equal(desk.nodes[0].data.cells[0].status, "idle");
  const restored = parseFolioExport(serializeDesk(desk.nodes, desk.edges));
  assert.ok(restored);
  assert.equal(restored.nodes[0].data.cells[0].artifactNetwork, true);
  assert.equal(restored.nodes[0].data.cells[0].source, ARTIFACT_TEMPLATES.react.source);
});
