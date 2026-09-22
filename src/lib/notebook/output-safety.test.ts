import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { createOutputSanitizer, isImageSource } from "./output-safety";
import { parseFolioExport, serializeDesk } from "./io";
import { inspect, md } from "./inspect";

const dom = new JSDOM("");
const sanitize = createOutputSanitizer(dom.window as unknown as Window);
const parse = (html: string) => new JSDOM(sanitize(html)).window.document;
const desk = () => ({ folio: 1, nodes: [{ id: "card", position: { x: 20, y: 40 }, data: {
  title: "A notebook", ref: "example", cells: [{ id: "cell", kind: "code", source: "1+1", output: null, status: "idle" }],
} }], edges: [] });

test("HTML parser removes unquoted, entity encoded and nested execution payloads", () => {
  const doc = parse(`<img src="https://example.com/image.png" onerror=alert(1)><svg onload=alert(2)></svg><iframe srcdoc="<script>alert(3)</script>"></iframe><a href="java&#x73;cript:alert(4)">click</a><math><mtext><img src=x onerror=alert(5)></mtext></math>`);
  assert.equal(doc.querySelector("script,iframe,svg,math,[onerror],[onload]"), null);
  assert.equal(doc.querySelector("a")?.hasAttribute("href"), false);
});

test("output cannot overlay chrome, load CSS resources, or clobber named properties", () => {
  const doc = parse(`<style>body{display:none}</style><form id=location><input name=href></form><div id=app style="position:fixed;inset:0;z-index:99999;background:url(https://example.com/leak);color:red">text</div>`);
  assert.equal(doc.querySelector("style,form,input,[id],[name]"), null);
  const style = doc.querySelector("div")!.style;
  assert.equal(style.position, "");
  assert.equal(style.background, "");
  assert.equal(style.color, "red");
});

test("starter inline progress bars retain their formatting", () => {
  const doc = parse('<div class="folio-callout" style="margin-top:8px;height:10px;border-radius:999px;background:rgba(63,93,81,0.18);overflow:hidden"><div style="width:82%;height:100%;background:#3f5d51"></div></div>');
  assert.equal(doc.querySelector(".folio-callout")!.getAttribute("style")!.includes("height: 10px"), true);
  assert.equal(doc.querySelector("div div")!.getAttribute("style")!.includes("width: 82%"), true);
});

test("raster image URLs are allowed while executable and local schemes are rejected", () => {
  for (const url of ["https://example.com/a.png", "data:image/png;base64,aGVsbG8="]) assert.equal(isImageSource(url), true);
  for (const url of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html;base64,aGVsbG8=", "data:image/svg+xml,<svg/>"]) assert.equal(isImageSource(url), false);
});

test("Markdown helper escapes raw HTML before formatting", () => {
  const value = inspect(md('<img src=x onerror=alert(1)> **safe** & text'));
  assert.equal(value.kind, "html");
  if (value.kind === "html") {
    assert.match(value.html, /&lt;img/);
    assert.match(value.html, /<strong>safe<\/strong>/);
    assert.match(value.html, /&amp; text/);
  }
});

test("import strips arbitrary CSS and roundtrips the desk", () => {
  const data = desk();
  Object.assign(data.nodes[0], { style: { width: 600, height: 500, position: "fixed", zIndex: 99999, backgroundImage: "url(https://example.com/leak)" } });
  const parsed = parseFolioExport(data)!;
  assert.deepEqual(parsed.nodes[0].style, { width: 600, height: 500 });
  assert.deepEqual(parseFolioExport(serializeDesk(parsed.nodes, parsed.edges)), parsed);
});

test("malformed outputs, duplicate IDs, dangling edges and future formats are rejected", () => {
  const malformed = desk();
  Object.assign(malformed.nodes[0].data.cells[0], { output: { logs: [], displays: [{ kind: "table", rows: 123, columns: null }] } });
  assert.equal(parseFolioExport(malformed), null);
  assert.equal(parseFolioExport({ ...desk(), folio: 999 }), null);
  assert.equal(parseFolioExport({ ...desk(), nodes: [...desk().nodes, ...desk().nodes] }), null);
  assert.equal(parseFolioExport({ ...desk(), edges: [{ source: "card", target: "missing" }] }), null);
  assert.equal(parseFolioExport({ nodes: "not an array" }), null);
  const duplicateCells = desk();
  duplicateCells.nodes[0].data.cells.push(duplicateCells.nodes[0].data.cells[0]);
  assert.equal(parseFolioExport(duplicateCells), null);
});

test("legacy storage is accepted, stale running states reset, excessive sizes rejected", () => {
  const legacy = desk();
  legacy.nodes[0].data.cells[0].status = "running";
  assert.equal(parseFolioExport({ nodes: legacy.nodes })!.nodes[0].data.cells[0].status, "idle");
  assert.equal(parseFolioExport({ ...desk(), nodes: Array(201).fill(desk().nodes[0]) }), null);
  const oversized = desk();
  oversized.nodes[0].data.cells[0].source = "x".repeat(200_001);
  assert.equal(parseFolioExport(oversized), null);
});
